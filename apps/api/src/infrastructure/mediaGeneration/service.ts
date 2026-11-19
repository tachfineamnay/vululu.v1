import { buffer } from 'node:stream/consumers';
import { createHash } from 'node:crypto';
import { prisma } from '@vululu/db';
import { mediaApprovalDigest } from './approval';
import { verifyOutput } from './verify';
import { creativeSpec, mediaRequest, type CreativeLayer, type MediaRequest } from '@vululu/contracts';
import { HttpError } from '../../errors';
import { assets, creativeStudio } from '../../application/container';
import { cancel, proposeTx } from '../execution/broker';
import { ProviderHttpError, caps, capability, mediaRouter, type MediaProvider } from './providers';
const fail = (code: string, status = 422): never => {
  throw new HttpError(status, code, code);
};
const actor = (id: string) => ({ id, role: 'user' as const });
const tool = (r: MediaRequest) => (r.kind === 'image' ? 'media.image@1' : 'media.video@1');
async function context(user: string, projectId: string, r: MediaRequest) {
  const rev = await prisma.creativeRevision.findFirst({
    where: { projectId, version: r.revision, project: { userId: user } },
    select: { spec: true, project: { select: { contextId: true, usage: true } } }
  });
  if (!rev) return fail('media_source_missing', 404);
  const spec = creativeSpec.parse(rev.spec),
    scene = spec.scenes.find((v) => v.key === r.sceneKey);
  if (!scene) return fail('media_scene_missing', 404);
  if (r.kind === 'video' && (spec.delivery?.kind !== 'short' || scene.seconds > r.seconds))
    return fail('media_short_scene_required');
  if (rev.project.usage !== 'organic') return fail('media_rights_review_required');
  return rev.project.contextId;
}
async function currentRevision(user: string, project: string, revision: number) {
  if (
    (
      await prisma.creativeRevision.findFirst({
        where: { projectId: project, project: { userId: user } },
        select: { version: true },
        orderBy: { version: 'desc' }
      })
    )?.version !== revision
  )
    return fail('media_stale_source', 409);
}
async function reference(user: string, contextId: string, r: MediaRequest) {
  if (r.kind === 'image') return;
  const v = await prisma.brandAssetVersion.findFirst({
    where: {
      id: r.referenceVersion,
      state: 'ready',
      asset: { userId: user, contextId },
      mimeType: { in: ['image/png', 'image/jpeg'] },
      license: { in: ['internal', 'commercial'] }
    },
    select: { id: true, assetId: true, sha256: true, sizeBytes: true, mimeType: true, metadata: true }
  });
  if (!v) return fail('media_reference_not_found', 404);
  const { width, height } = v.metadata as { width: number; height: number };
  if (
    v.sizeBytes > 3 * 1024 * 1024 ||
    !(width >= 320 && height >= 320 && width / height >= 0.5 && width / height <= 2)
  )
    return fail('media_reference_dimensions');
  return v;
}
export async function prepareMedia(user: string, project: string, raw: unknown) {
  const r = mediaRequest.parse(raw),
    ctx = await context(user, project, r),
    ref = await reference(user, ctx, r),
    cap = capability(r.kind);
  await currentRevision(user, project, r.revision);
  if (cap.availability !== 'configured') return fail('media_' + cap.availability, 503);
  return prisma.$transaction(async (tx) => {
    const g = await tx.mediaGeneration.upsert({
      where: { id: r.requestId },
      update: {},
      create: {
        id: r.requestId,
        projectId: project,
        revision: r.revision,
        sceneKey: r.sceneKey,
        tool: tool(r),
        provider: cap.provider,
        model: cap.model,
        referenceSha: ref?.sha256,
        parameters: r,
        state: 'DRAFT'
      }
    });
    if (g.projectId !== project || JSON.stringify(mediaRequest.parse(g.parameters)) !== JSON.stringify(r))
      return fail('media_request_conflict', 409);
    return proposeTx(tx, user, project, { key: g.id, revision: r.revision, tool: g.tool });
  });
}
export async function mediaHistory(user: string, project: string) {
  const rows = await prisma.mediaGeneration.findMany({
    where: { projectId: project, source: { project: { userId: user } } },
    orderBy: { createdAt: 'desc' },
    take: 100
  });
  const ops = await prisma.executionOperation.findMany({
    where: { accountId: user, projectId: project, key: { in: rows.map((x) => x.id) } },
    select: {
      id: true,
      key: true,
      state: true,
      costState: true,
      digest: true,
      maxCents: true,
      reportedCents: true
    }
  });
  return rows.map((r) => ({ ...r, operation: ops.find((o) => o.key === r.id) }));
}
export async function cancelMedia(user: string, project: string, id: string) {
  const op = await prisma.executionOperation.findFirst({
    where: {
      accountId: user,
      projectId: project,
      key: id,
      tool: { in: ['media.image@1', 'media.video@1'] },
      project: { userId: user }
    }
  });
  if (!op) return fail('media_missing', 404);
  if (['PROPOSED', 'QUEUED', 'CANCELLED'].includes(op.state)) return cancel(user, op.id);
  if (!['CLAIMED', 'POLLING'].includes(op.state)) return fail('media_terminal', 409);
  await prisma.mediaGeneration.updateMany({
    where: { id, projectId: project, state: { in: ['DRAFT', 'SUBMITTING', 'PENDING'] } },
    data: { cancelRequested: true }
  });
  return { requested: true };
}
type Job = {
  id: string;
  projectId: string;
  accountId: string;
  revision: number;
  tool: string;
  maxCents: number;
};
export async function dispatchMedia(
  job: Job,
  signal: AbortSignal,
  router: (k: MediaRequest['kind']) => MediaProvider | null = mediaRouter
) {
  const op = await prisma.executionOperation.findFirst({
    where: {
      id: job.id,
      accountId: job.accountId,
      approvedBy: job.accountId,
      projectId: job.projectId,
      revision: job.revision,
      tool: job.tool,
      state: 'CLAIMED',
      costState: 'RESERVED',
      project: { userId: job.accountId }
    }
  });
  if (!op) return fail('media_claim_required', 403);
  const g = await prisma.mediaGeneration.findFirstOrThrow({
      where: { id: op.key, projectId: op.projectId, revision: op.revision, tool: op.tool }
    }),
    r = mediaRequest.parse(g.parameters),
    cap = caps[r.kind];
  if (
    mediaApprovalDigest(g, op.maxCents) !== op.digest ||
    r.requestId !== g.id ||
    r.sceneKey !== g.sceneKey ||
    r.revision !== g.revision ||
    tool(r) !== op.tool ||
    cap.model !== g.model ||
    cap.provider !== g.provider ||
    cap.maxCents !== op.maxCents
  )
    throw Error('media_policy_changed');
  const update = (state: string) => prisma.mediaGeneration.update({ where: { id: g.id }, data: { state } });
  const p = router(r.kind);
  if (!p) {
    await update('UNAVAILABLE');
    if (g.remoteId) throw Error('media_cost_unknown');
    return { costCents: 0 };
  }
  if (!g.remoteId) {
    if (g.state !== 'DRAFT') throw Error('media_submit_not_replayable');
    let ref;
    try {
      await currentRevision(job.accountId, job.projectId, r.revision);
      const ctx = await context(job.accountId, job.projectId, r),
        v = await reference(job.accountId, ctx, r);
      if (v) {
        const f = await assets.content(actor(job.accountId), v.assetId, v.id),
          bytes = await buffer(await f.openRead());
        if (createHash('sha256').update(bytes).digest('hex') !== g.referenceSha)
          throw Error('reference_changed');
        ref = { mime: v.mimeType, bytes };
      }
      signal.throwIfAborted();
    } catch {
      await update('INVALID_INPUT');
      return { costCents: 0 };
    }
    const claimed = await prisma.mediaGeneration.updateMany({
      where: { id: g.id, state: 'DRAFT', cancelRequested: false },
      data: { state: 'SUBMITTING', submittedAt: new Date() }
    });
    if (!claimed.count) {
      if ((await prisma.mediaGeneration.findUniqueOrThrow({ where: { id: g.id } })).cancelRequested) {
        await update('CANCELLED');
        return { costCents: 0 };
      }
      throw Error('media_already_submitted');
    }
    try {
      signal.throwIfAborted();
      const remoteId = await p.start(r, ref, signal);
      await prisma.mediaGeneration.update({ where: { id: g.id }, data: { state: 'PENDING', remoteId } });
      return { pendingMedia: true as const };
    } catch (error) {
      if (error instanceof ProviderHttpError && [401, 403].includes(error.status)) {
        await update('CREDENTIAL_REJECTED');
        return { costCents: 0 };
      }
      await update('SUBMISSION_UNKNOWN');
      throw Error('media_submission_unknown', { cause: error });
    }
  }
  if (g.state !== 'PENDING' || !g.submittedAt || Date.now() - g.submittedAt.getTime() > 30 * 60 * 1000) {
    await update('OUTCOME_UNKNOWN');
    throw Error('media_poll_expired');
  }
  if (g.cancelRequested && !g.cancelSent) {
    await prisma.mediaGeneration.update({ where: { id: g.id }, data: { cancelSent: true } });
    try {
      await p.cancel(g.remoteId, signal);
      return { pendingMedia: true as const };
    } catch {
      await update('CANCEL_UNKNOWN');
      throw Error('media_cancel_cost_unknown');
    }
  }
  let receipt: number | undefined;
  try {
    const result = await p.poll(g.remoteId, signal).catch((e) => {
      if (e instanceof ProviderHttpError && [429, 502, 503, 504].includes(e.status))
        return { state: 'pending' as const, costCents: undefined };
      throw e;
    });
    if (result.state === 'pending') return { pendingMedia: true as const };
    receipt = result.costCents;
    if (receipt !== undefined)
      await prisma.mediaGeneration.update({ where: { id: g.id }, data: { reportedCents: receipt } });
    if (receipt !== undefined && receipt > op.maxCents) {
      await update('COST_INCIDENT');
      return { costCents: receipt };
    }
    if (result.state === 'ready') {
      const bytes = await p.download(result.url, signal),
        mime = await verifyOutput(bytes, r);
      signal.throwIfAborted();
      const ctx = await context(job.accountId, job.projectId, r);
      const asset = await assets.upload(
        actor(job.accountId),
        ctx,
        {
          kind: r.kind,
          mimeType: mime,
          name: `Génération ${g.sceneKey}`,
          license: 'internal',
          provenance: `${g.provider} · ${g.model} · ${g.remoteId} · ${g.id} · source v${g.revision}`
        },
        bytes
      );
      await prisma.mediaGeneration.update({
        where: { id: g.id },
        data: {
          state: 'READY',
          outputVersion: asset.id,
          modelVersion: result.modelVersion,
          reportedCents: result.costCents
        }
      });
    } else
      await prisma.mediaGeneration.update({
        where: { id: g.id },
        data: { state: result.state.toUpperCase(), reportedCents: result.costCents }
      });
    if (result.costCents === undefined) throw Error('media_cost_unknown');
    return { costCents: result.costCents };
  } catch {
    await prisma.mediaGeneration.updateMany({
      where: { id: g.id, state: 'PENDING' },
      data: { state: receipt === undefined ? 'OUTCOME_UNKNOWN' : 'INVALID_OUTPUT' }
    });
    if (receipt !== undefined) return { costCents: receipt };
    throw Error('media_outcome_or_cost_unknown');
  }
}
// Placement is a separate owner decision. Never edit the project from a worker callback.
export async function placeMedia(user: string, project: string, id: string, expected: number) {
  const g = await prisma.mediaGeneration.findFirst({
    where: { id, projectId: project, state: 'READY', source: { project: { userId: user } } }
  });
  if (!g?.outputVersion) return fail('media_output_missing', 404);
  if (expected !== g.revision) return fail('media_stale_source', 409);
  const row = await creativeStudio.get(user, project, expected),
    spec = creativeSpec.parse(row.spec),
    scene = spec.scenes.find((s) => s.key === g.sceneKey)!;
  const hero = scene.layers.findIndex((l) => l.type === 'image' && l.x === 0 && l.y === 0 && l.w === 1);
  if (g.tool === 'media.video@1') {
    if (hero >= 0) {
      if (scene.layers.length === 1) scene.layers[hero].opacity = 0;
      else scene.layers.splice(hero, 1);
    }
    scene.clip = { versionId: g.outputVersion, start: 0, height: scene.clip?.height ?? 0.65 };
  } else {
    delete scene.clip;
    const idx = hero;
    if (idx >= 0) {
      const l = scene.layers[idx] as Extract<CreativeLayer, { type: 'image' }>;
      l.versionId = g.outputVersion;
      l.opacity = 1;
    } else
      scene.layers.unshift({
        type: 'image',
        versionId: g.outputVersion,
        x: 0,
        y: 0,
        w: 1,
        h: 0.65,
        fit: 'cover',
        gravity: 'centre',
        opacity: 1
      });
  }
  return creativeStudio.save(user, project, expected, spec);
}
