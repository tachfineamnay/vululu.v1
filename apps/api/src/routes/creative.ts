import {markExport} from '../infrastructure/results/exports';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@vululu/db';
import { Prisma } from '@prisma/client';
import { zipSync, strToU8 } from 'fflate';
import { buffer } from 'node:stream/consumers';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { editScene, previewOf, localTranslator } from '../application/creativeActions';
import {
  actionScope,
  creativeAction,
  creativeApproval,
  creativeAssetApply,
  creativeDirectionInput,
  creativeSpec,
  creativeWrite,
  directionDecisionInput,
  isVideoOutput,
  studioExportExtension,
} from '@vululu/contracts';
import { creativeDirections, creativeStudio as service } from '../application/container';
import {draftThumbnail} from '@vululu/media';
import { sendArtifact } from './production';
import { rateLimitPreHandler, RATE_LIMITS } from '../infrastructure/security/rateLimiter';
import { HttpError } from '../errors';
import { cancelRender, queueRender, renderStatus } from '../infrastructure/creative/renderJobs';

export async function creativeRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] };
  const base = '/api/projects/:id/creative',
    id = z.object({ id: z.string() }),
    revision = id.extend({ version: z.coerce.number().int().positive() });
  const intent = actionScope.extend({ prompt: z.string().trim().min(1).max(2048) });
  const scoped = async (user: string, project: string, scope: z.infer<typeof actionScope>) => {
    if (scope.target.projectId !== project)
      throw new HttpError(404, 'creative_not_found', 'Projet introuvable.');
    const row = await service.get(user, project, scope.expectedRevision);
    if ((await service.history(user, project))[0]?.version !== scope.expectedRevision)
      throw new HttpError(409, 'creative_conflict', 'Rechargez la dernière révision.');
    return row;
  };
  app.post(base + '/actions/translate', auth, async (r) => {
    const b = intent.parse(r.body),
      row = await scoped(r.currentUser!.id, id.parse(r.params).id, b);
    const incomplete =
      /^(?:change the CTA and colou?r of scene|modifier le CTA et la couleur de la scène) (two|deux|\d+)(?: without modifying the other scenes| sans modifier les autres scènes)?[.!]?$/i.exec(
        b.prompt,
      );
    if (incomplete) {
      const scene = row.spec.scenes[(/^two$|^deux$/i.test(incomplete[1]) ? 2 : Number(incomplete[1])) - 1];
      if (!scene) throw new HttpError(422, 'creative_action_invalid', 'Scène introuvable.');
      return { needs: 'cta-and-color', sceneKey: scene.key };
    }
    const proposal = z
      .strictObject({
        sceneKey: actionScope.shape.target.shape.sceneKey,
        changes: creativeAction.shape.changes,
      })
      .parse(
        await localTranslator.generate(
          { prompt: b.prompt, keys: row.spec.scenes.map((s) => s.key), selected: b.target.sceneKey },
          { signal: AbortSignal.timeout(1000), maxCostCents: 0, idempotencyKey: r.id },
        ),
      );
    return previewOf(row.spec, {
      schemaVersion: 1,
      target: { ...b.target, sceneKey: proposal.sceneKey },
      expectedRevision: b.expectedRevision,
      changes: proposal.changes,
      authorization: 'project-owner:confirm',
      estimatedCostCents: 0,
    });
  });
  app.post(base + '/actions/preview', auth, async (r) => {
    const a = creativeAction.parse(r.body),
      row = await scoped(r.currentUser!.id, id.parse(r.params).id, a);
    return previewOf(row.spec, a);
  });
  app.post(base + '/actions/apply', auth, async (r) => {
    const b = creativeApproval.parse(r.body),
      a = b.action,
      user = r.currentUser!.id,
      project = id.parse(r.params).id,
      row = await scoped(user, project, a);
    if (previewOf(row.spec, a).digest !== b.digest)
      throw new HttpError(409, 'creative_action_changed', 'Prévisualisez à nouveau.');
    return service.save(user, project, a.expectedRevision, editScene(row.spec, a));
  });
  app.get(base, auth, (r) => service.history(r.currentUser!.id, id.parse(r.params).id));
  // Directions artistiques = brouillons CreativeRevision enrichis (ADR-0035), jamais une approbation.
  app.get(base + '/directions', auth, (r) =>
    creativeDirections.list(r.currentUser!.id, id.parse(r.params).id));
  app.post(base + '/directions', auth, (r) =>
    creativeDirections.create(r.currentUser!.id, id.parse(r.params).id, creativeDirectionInput.parse(r.body)));
  app.post(base + '/:version/direction', auth, (r) => {
    const p = revision.parse(r.params);
    const { decision } = directionDecisionInput.parse(r.body);
    return creativeDirections.decide(r.currentUser!.id, p.id, p.version, decision);
  });
  app.post(base, auth, (r) => {
    const b = creativeWrite.parse(r.body);
    return service.save(r.currentUser!.id, id.parse(r.params).id, b.expectedVersion, b.spec);
  });
  // Applique une ressource de marque existante à un calque image (nouvelle révision, jamais d'écrasement).
  app.post(base + '/asset', auth, (r) => {
    const b = creativeAssetApply.parse(r.body);
    return service.applyAsset(r.currentUser!.id, id.parse(r.params).id, b);
  });
  app.get(base + '/:version', auth, (r) => {
    const p = revision.parse(r.params);
    return service.get(r.currentUser!.id, p.id, p.version);
  });
  app.post(base + '/:version/restore', auth, (r) => {
    const p = revision.parse(r.params);
    return service.restore(
      r.currentUser!.id,
      p.id,
      p.version,
      z.object({ expectedVersion: z.int().nonnegative() }).parse(r.body).expectedVersion,
    );
  });
  app.post(base + '/:version/approve', auth, (r) => {
    const p = revision.parse(r.params);
    return service.approve(
      r.currentUser!.id,
      p.id,
      p.version,
      z.object({ checksum: z.string().regex(/^[0-9a-f]{64}$/) }).parse(r.body).checksum,
    );
  });
  // Bound native render work across preview and export, not just per account.
  let active = 0;
  const renderAuth = {
    preHandler: [
      app.authenticate,
      rateLimitPreHandler(RATE_LIMITS.productionStart, (r) => 'creative:' + r.currentUser!.id),
    ],
  };
  async function withSlot<T>(fn: () => Promise<T>) {
    if (active >= 2) throw new HttpError(429, 'creative_busy', 'Rendu en cours, réessayez.');
    active++;
    try {
      return await fn();
    } catch (e) {
      if (e instanceof Error && 'code' in e && e.code === 'media_text_overflow')
        throw new HttpError(422, 'creative_text_overflow', e.message);
      throw e;
    } finally {
      active--;
    }
  }
  app.get(base + '/destinations', auth, async (r) =>
    prisma.contentItem.findMany({
      where: { projectId: id.parse(r.params).id, userId: r.currentUser!.id, archived: false },
      select: { id: true, version: true, title: true, objective: true, audience: true, offerId: true, variants: true, offer: { select: { name: true } } },
      orderBy: { plannedAt: 'asc' },
    }),
  );
  app.get('/api/campaigns/:id/creative-package', renderAuth, async (r, reply) => {
    const campaignId = id.parse(r.params).id,
      userId = r.currentUser!.id;
    const data = await withSlot(async () => {
      const rows = await prisma.creativeRevision.findMany({
        where: { project: { userId, campaignId, campaign: { userId } }, manifest: { not: Prisma.DbNull } },
        select: { projectId: true, version: true, spec: true },
        orderBy: { version: 'desc' },
      });
      const files: Record<string, Uint8Array> = {},
        seen = new Set<string>(),
        index: unknown[] = [];
      let total = 0;
      for (const row of rows) {
        const spec = creativeSpec.parse(row.spec),
          d = spec.delivery;
        if (!d) continue;
        const folder = [row.projectId, d.calendar?.itemId ?? 'project', d.platform, d.kind].join('/');
        if (seen.has(folder)) continue;
        seen.add(folder);
        const names = d.kind === 'carousel' ? spec.scenes.map((s) => s.key) : [undefined];
        for (const scene of names) {
          const f = await service.file(userId, row.projectId, row.version, scene);
          total += f.size;
          if (total > 100 * 1024 * 1024) throw new HttpError(413, 'package_limit', 'Le lot dépasse 100 Mio.');
          const bytes = await buffer(await f.openRead());
          if (createHash('sha256').update(bytes).digest('hex') !== f.sha256)
            throw new Error('creative_package_integrity');
          const name = `${folder}/v${row.version}-${scene ?? 'master'}.${f.contentType === 'image/png' ? 'png' : 'mp4'}`;
          files[name] = bytes;
          index.push({
            name,
            version: row.version,
            delivery: d,
            width: spec.width,
            height: spec.height,
            sha256: f.sha256,
          });
        }
      }
      if (!index.length) throw new HttpError(404, 'empty_package', 'Aucune création rendue.');
      files['manifest.json'] = strToU8(JSON.stringify(index, null, 2));
      return Buffer.from(zipSync(files, { level: 0 }));
    });
    markExport(r,reply,campaignId,null,'Lot campagne');
    return reply
      .type('application/zip')
      .header('Content-Disposition', 'attachment; filename="campagne.zip"')
      .send(data);
  });
  app.post(base + '/preview', renderAuth, async (r, reply) => {
    const spec = creativeSpec.refine((s) => s.scenes.length === 1).parse(r.body);
    return reply
      .header('Cache-Control', 'private, no-store')
      .type('image/png')
      .send(await withSlot(async () => {
        const frame = await service.preview(r.currentUser!.id, id.parse(r.params).id, spec);
        return (await prisma.billingControl.findUniqueOrThrow({where:{id:'commercial'}})).enabled ? draftThumbnail(frame) : frame;
      }));
  });
  // Aperçu vidéo borné (20 s) : même compositeur que le master, aucune révision créée.
  app.post(base + '/preview/video', renderAuth, async (r, reply) => {
    const spec = creativeSpec.refine((s) => !s.delivery || isVideoOutput(s.delivery.kind)).parse(r.body);
    const out = await withSlot(() => service.previewVideo(r.currentUser!.id, id.parse(r.params).id, spec));
    return reply
      .header('Cache-Control', 'private, no-store')
      .header('X-Preview-Seconds', out.seconds.toFixed(2))
      .header('X-Preview-Bounded', out.bounded ? '1' : '0')
      .type('video/mp4')
      .send(out.bytes);
  });
  app.post(base + '/:version/render', renderAuth, async (r, reply) => {
    const p = revision.parse(r.params);
    const job = await queueRender(r.currentUser!.id, p.id, p.version);
    return reply.code(job.state === 'succeeded' ? 200 : 202).send(job);
  });
  // Annulation : immédiate si le job est en file, coopérative (fin de scène) s'il est en cours.
  app.post(base + '/:version/render/cancel', renderAuth, async (r) => {
    const p = revision.parse(r.params);
    return cancelRender(r.currentUser!.id, p.id, p.version);
  });
  app.get(base + '/:version/render', auth, async (r, reply) => {
    const p = revision.parse(r.params);
    reply.header('Cache-Control', 'private, no-store');
    return renderStatus(r.currentUser!.id, p.id, p.version);
  });
  app.get(base + '/:version/export', auth, async (r, reply) => {
    const p = revision.parse(r.params), user = r.currentUser!.id;
    const row = await service.get(user, p.id, p.version);
    if (!row.approvedAt || !row.manifest)
      throw new HttpError(409, 'creative_unapproved', 'Approuvez cette révision avant de la télécharger.');
    const ext = studioExportExtension(row.spec.delivery?.kind);
    reply.header('Cache-Control', 'private, no-store');
    if (ext !== 'zip') {
      const file = await service.file(user, p.id, p.version);
      markExport(r, reply, p.id, p.version, 'Master créatif approuvé');
      reply.header('Content-Disposition', `attachment; filename="creation-v${p.version}.${ext}"`);
      return sendArtifact(r, reply, file);
    }
    const data = await withSlot(async () => {
      const files: Record<string, Uint8Array> = {};
      const slides = [];
      let size = 0;
      for (const [i, frame] of row.manifest!.frames.entries()) {
        const f = await service.file(user, p.id, p.version, frame.sceneKey);
        size += f.size;
        if (size > 100 * 1024 * 1024) throw new HttpError(413, 'package_limit', 'Le lot dépasse 100 Mio.');
        const bytes = await buffer(await f.openRead());
        if (bytes.length !== f.size || createHash('sha256').update(bytes).digest('hex') !== f.sha256)
          throw new HttpError(409, 'creative_integrity', 'Le fichier enregistré ne correspond pas à la version approuvée.');
        const name = `${String(i + 1).padStart(3, '0')}-${frame.sceneKey}.png`;
        files[name] = bytes;
        slides.push({ name, sha256: f.sha256 });
      }
      files['manifest.json'] = strToU8(JSON.stringify({ revision: p.version, slides }, null, 2));
      return Buffer.from(zipSync(files, { level: 0 }));
    });
    markExport(r, reply, p.id, p.version, 'Carrousel approuvé');
    return reply.header('Content-Disposition', `attachment; filename="creation-v${p.version}.zip"`)
      .type('application/zip').send(data);
  });
  app.get(base + '/:version/master', auth, async (r, reply) => {
    const p = revision.parse(r.params);
    if((r.query as {export?:string}).export==='1')markExport(r,reply,p.id,p.version,'Master créatif');
    return sendArtifact(r, reply, await service.file(r.currentUser!.id, p.id, p.version));
  });
  app.get(base + '/:version/scenes/:key', auth, async (r, reply) => {
    const p = revision.extend({ key: z.string() }).parse(r.params);
    const f = await service.file(r.currentUser!.id, p.id, p.version, p.key);
    return reply.type('image/png').send(await f.openRead());
  });
}
