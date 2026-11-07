import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '@vululu/db';
import { assertAssetUsage, type AssetKind, type AssetLicense, type PublicationUsage } from '@vululu/domain';
import { ApplicationError, type AssetRepository, type StoredAssetVersion } from '@vululu/application';

const include = { versions: { orderBy: { version: 'desc' as const } } };
type AssetRow = Prisma.BrandAssetGetPayload<{ include: typeof include }>;
function map(row: AssetRow) {
  return { id: row.id, contextId: row.contextId, kind: row.kind as AssetKind, versions: row.versions.map((v): StoredAssetVersion => ({
    ...v, kind: row.kind as AssetKind, license: v.license as AssetLicense, userId: row.userId, contextId: row.contextId,
    createdAt: v.createdAt.toISOString(), metadata: v.metadata as Record<string, string | number>
  })) };
}
export class PrismaAssetRepository implements AssetRepository {
  constructor(private readonly db: PrismaClient = prisma) {}
  async listOwned(contextId: string, userId: string) {
    return (await this.db.brandAsset.findMany({ where: { contextId, userId }, include, orderBy: { createdAt: 'desc' } })).map(map);
  }
  async findOwned(id: string, userId: string) {
    const row = await this.db.brandAsset.findFirst({ where: { id, userId }, include });
    return row ? map(row) : null;
  }
  async reserve(input: Omit<StoredAssetVersion, 'version'>) {
    return this.db.$transaction(async (tx) => {
      if (!await tx.brandContext.findFirst({ where: { id: input.contextId, userId: input.userId } })) throw new ApplicationError('context_not_found', 'Contexte introuvable.', 404);
      const existing = await tx.brandAsset.findUnique({ where: { id: input.assetId } });
      if (existing && (existing.userId !== input.userId || existing.contextId !== input.contextId || existing.kind !== input.kind)) throw new ApplicationError('asset_not_found', 'Actif introuvable.', 404);
      if (!existing) await tx.brandAsset.create({ data: { id: input.assetId, userId: input.userId, contextId: input.contextId, kind: input.kind } });
      await tx.$queryRaw`SELECT "id" FROM "BrandAsset" WHERE "id" = ${input.assetId} FOR UPDATE`;
      const last = await tx.brandAssetVersion.aggregate({ where: { assetId: input.assetId }, _max: { version: true } });
      const { userId: _user, contextId: _context, kind: _kind, ...data } = input;
      const row = await tx.brandAssetVersion.create({ data: { ...data, state: 'staged', version: (last._max.version ?? 0) + 1, createdAt: new Date(input.createdAt) } });
      return { ...input, state: row.state, version: row.version };
    });
  }
  async finalize(id: string, userId: string, state: 'ready' | 'failed') {
    const result = await this.db.brandAssetVersion.updateMany({ where: { id, state: 'staged', asset: { userId } }, data: { state } });
    if (result.count !== 1) throw new ApplicationError('asset_finalization_conflict', 'Finalisation déjà effectuée ou indisponible.', 409);
  }
  async getSelection(projectId: string, userId: string) {
    const row = await this.db.project.findFirst({ where: { id: projectId, userId }, include: { assetSelections: { orderBy: { assetId: 'asc' } } } });
    if (!row) throw new ApplicationError('project_not_found', 'Projet introuvable.', 404);
    return { usage: row.usage as PublicationUsage, versionIds: row.assetSelections.map((s) => s.assetVersionId) };
  }
  async selectOwned(projectId: string, userId: string, usage: PublicationUsage, versionIds: string[]) {
    if (!['organic', 'sponsored'].includes(usage) || versionIds.length > 20 || new Set(versionIds).size !== versionIds.length) throw new ApplicationError('invalid_selection', 'Sélection invalide (20 actifs maximum).', 400);
    await this.db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Project" WHERE "id" = ${projectId} AND "userId" = ${userId} FOR UPDATE`;
      if (!locked.length) throw new ApplicationError('project_not_found', 'Projet introuvable.', 404);
      const project = await tx.project.findUniqueOrThrow({ where: { id: projectId } });
      if (project.status === 'producing' || await tx.jobRun.findFirst({ where: { projectId, status: { in: ['queued', 'running', 'waiting_approval', 'recovery_pending'] } } })) throw new ApplicationError('job_running', 'Modification impossible pendant une production.', 409);
      const versions = await tx.brandAssetVersion.findMany({ where: { id: { in: versionIds }, state: 'ready', asset: { userId, contextId: project.contextId } } });
      if (versions.length !== versionIds.length) throw new ApplicationError('asset_version_not_found', 'Actif introuvable dans ce contexte.', 404);
      if (new Set(versions.map((v) => v.assetId)).size !== versions.length) throw new ApplicationError('invalid_selection', 'Choisissez une seule version par actif.', 400);
      for (const version of versions) assertAssetUsage(version.license as AssetLicense, usage);
      await tx.projectAssetSelection.deleteMany({ where: { projectId } });
      await tx.projectAssetSelection.createMany({ data: versions.map((v) => ({ projectId, assetId: v.assetId, assetVersionId: v.id })) });
      await tx.project.update({ where: { id: projectId }, data: { usage } });
    });
  }
}
