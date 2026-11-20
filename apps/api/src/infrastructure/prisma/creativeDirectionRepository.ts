import { prisma } from '@vululu/db';
import { Prisma } from '@prisma/client';
import { assertAssetUsage, type AssetLicense, type PublicationUsage } from '@vululu/domain';
import { creativeSpec, type CreativeSpec } from '@vululu/contracts';
import { HttpError } from '../../errors';
import type {
  CreativeDirectionRepository, DirectionDecision, DirectionDraft, DirectionInputs, DirectionRevision
} from '../../application/creativeDirections';

const missing = () => new HttpError(404, 'creative_not_found', 'Projet, révision ou ressource introuvable.');
const conflict = () => new HttpError(409, 'creative_conflict', 'Révision dépassée. Rechargez avant de créer une direction.');
const revisionSelect = { version: true, spec: true, label: true, origin: true, provenance: true, createdAt: true, approvedAt: true } as const;
type RevisionRow = Prisma.CreativeRevisionGetPayload<{ select: typeof revisionSelect }>;

function parseRevision(row: RevisionRow): DirectionRevision {
  return {
    version: row.version, label: row.label, origin: row.origin, provenance: row.provenance as unknown,
    spec: creativeSpec.parse(row.spec), createdAt: row.createdAt.toISOString(),
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null
  };
}
function sourceIds(spec: CreativeSpec) {
  return [...new Set([
    ...spec.scenes.flatMap((scene) => [
      ...scene.layers.flatMap((layer) => (layer.type === 'image' ? [layer.versionId] : [])),
      ...(scene.clip ? [scene.clip.versionId] : [])
    ]),
    ...(spec.delivery?.audio ? [spec.delivery.audio.versionId] : [])
  ])];
}
function anglesOf(result: unknown): Array<{ title: string; reasoning: string; premise: string }> {
  if (!result || typeof result !== 'object') return [];
  const angles = (result as { angles?: unknown }).angles;
  if (!Array.isArray(angles)) return [];
  return angles.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const angle = raw as Record<string, unknown>;
    if (typeof angle.title !== 'string' || typeof angle.reasoning !== 'string' || typeof angle.premise !== 'string') return [];
    return [{ title: angle.title.slice(0, 120), reasoning: angle.reasoning.slice(0, 450), premise: angle.premise.slice(0, 450) }];
  }).slice(0, 4);
}

export class PrismaCreativeDirectionRepository implements CreativeDirectionRepository {
  async inputs(userId: string, projectId: string, brainstormTurnId?: string): Promise<DirectionInputs> {
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId },
      select: {
        id: true, title: true, objective: true, platform: true, format: true, usage: true, contextId: true,
        assetsConfirmationDigest: true,
        brief: { select: { cta: true } },
        context: { select: { name: true, colorPrimary: true, colorSecondary: true } },
        assetSelections: { select: { assetVersionId: true, version: { select: { name: true, asset: { select: { kind: true } } } } } }
      }
    });
    if (!project) throw missing();
    const brainstorm = brainstormTurnId
      ? await prisma.assistantTurn.findFirst({
        where: { id: brainstormTurnId, projectId, kind: 'brainstorm', project: { userId } },
        select: { id: true, digest: true, result: true }
      })
      : await prisma.assistantTurn.findFirst({
        where: { projectId, kind: 'brainstorm', project: { userId }, result: { not: Prisma.DbNull } },
        orderBy: { createdAt: 'desc' }, select: { id: true, digest: true, result: true }
      });
    const head = await prisma.creativeRevision.findFirst({
      where: { projectId, project: { userId } },
      orderBy: { version: 'desc' }, select: { version: true, spec: true }
    });
    const angles = brainstorm ? anglesOf(brainstorm.result) : [];
    return {
      project: { id: project.id, title: project.title, objective: project.objective, platform: project.platform,
        format: project.format, usage: project.usage, contextId: project.contextId },
      brand: { name: project.context.name, colorPrimary: project.context.colorPrimary, colorSecondary: project.context.colorSecondary },
      brief: project.brief ? { cta: project.brief.cta } : null,
      assets: project.assetSelections.map((selection) => ({
        versionId: selection.assetVersionId, kind: selection.version.asset.kind, name: selection.version.name
      })),
      assetDecisionDigest: project.assetsConfirmationDigest ?? null,
      brainstorm: brainstorm && angles.length ? { turnId: brainstorm.id, resultDigest: brainstorm.digest ?? null, angles } : null,
      head: head ? { version: head.version, spec: creativeSpec.parse(head.spec) } : null
    };
  }

  async revision(userId: string, projectId: string, version: number): Promise<DirectionRevision | null> {
    const row = await prisma.creativeRevision.findFirst({
      where: { projectId, version, project: { userId } }, select: revisionSelect
    });
    return row ? parseRevision(row) : null;
  }

  async list(userId: string, projectId: string): Promise<DirectionRevision[]> {
    const rows = await prisma.creativeRevision.findMany({
      where: { projectId, project: { userId }, OR: [{ label: { not: null } }, { origin: { not: null } }] },
      orderBy: { version: 'desc' }, take: 100, select: revisionSelect
    });
    return rows.map(parseRevision);
  }

  async appendDirections(userId: string, projectId: string, expectedVersion: number, drafts: DirectionDraft[], requestId: string): Promise<DirectionRevision[]> {
    const versions = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string; contextId: string; usage: string }>>`
        SELECT "id", "contextId", "usage" FROM "Project" WHERE "id" = ${projectId} AND "userId" = ${userId} FOR UPDATE`;
      if (!locked.length) throw missing();
      if (requestId) {
        const existing = await tx.creativeRevision.findMany({
          where: { projectId, provenance: { path: ['requestId'], equals: requestId } },
          select: { version: true }
        });
        if (existing.length) return existing.map((row) => row.version);
      }
      const last = await tx.creativeRevision.findFirst({ where: { projectId }, orderBy: { version: 'desc' }, select: { version: true } });
      if ((last?.version ?? 0) !== expectedVersion) throw conflict();
      const { contextId, usage } = locked[0];
      for (const draft of drafts) {
        const ids = sourceIds(draft.spec);
        if (!ids.length) continue;
        const rows = await tx.brandAssetVersion.findMany({
          where: { id: { in: ids }, state: 'ready', asset: { userId, contextId } },
          select: { id: true, license: true }
        });
        if (rows.length !== ids.length) throw missing();
        for (const row of rows) assertAssetUsage(row.license as AssetLicense, usage as PublicationUsage);
      }
      const created: number[] = [];
      for (const [index, draft] of drafts.entries()) {
        const version = expectedVersion + index + 1;
        await tx.creativeRevision.create({
          data: { projectId, version, spec: draft.spec, label: draft.label, origin: draft.origin,
            provenance: draft.provenance as Prisma.InputJsonValue }
        });
        created.push(version);
      }
      return created;
    });
    if (!versions.length) return [];
    const rows = await prisma.creativeRevision.findMany({
      where: { projectId, project: { userId }, version: { in: versions } }, select: revisionSelect
    });
    return rows.sort((a, b) => a.version - b.version).map(parseRevision);
  }

  async decisions(userId: string, projectId: string): Promise<Record<string, DirectionDecision>> {
    const rows = await prisma.auditEvent.findMany({
      where: { action: 'creative.direction_decision', targetType: 'project', targetId: projectId, actorId: userId },
      orderBy: { createdAt: 'desc' }, take: 200, select: { metadata: true }
    });
    const decisions: Record<string, DirectionDecision> = {};
    for (const row of rows) {
      const metadata = row.metadata as { version?: unknown; decision?: unknown } | null;
      if (!metadata || typeof metadata.version !== 'number' || typeof metadata.decision !== 'string') continue;
      if (decisions[metadata.version]) continue;
      if (metadata.decision === 'retained' || metadata.decision === 'rejected') decisions[metadata.version] = metadata.decision;
    }
    return decisions;
  }

  async recordDecision(userId: string, projectId: string, version: number, decision: DirectionDecision): Promise<void> {
    await prisma.auditEvent.create({
      data: { actorId: userId, action: 'creative.direction_decision', targetType: 'project', targetId: projectId,
        metadata: { version, decision } }
    });
  }
}
