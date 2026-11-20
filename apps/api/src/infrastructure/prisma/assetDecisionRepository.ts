import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '@vululu/db';
import {
  ApplicationError, type AssetDecisionRepository, type AssetDecisionRow, type AssetDecisionSnapshot, type PublicationUsage
} from '@vululu/application';

type Db = Prisma.TransactionClient;

/** Lecture unique partagée par l'API et par le snapshot de l'assistant (mêmes règles, même digest). */
export async function readAssetDecisionRow(db: Db, projectId: string, userId: string): Promise<AssetDecisionRow | null> {
  const row = await db.project.findFirst({
    where: { id: projectId, userId },
    select: {
      id: true, contextId: true, format: true, usage: true,
      assetsConfirmedAt: true, assetsConfirmationDigest: true, assetsConfirmation: true,
      assetSelections: {
        select: {
          assetId: true, assetVersionId: true,
          version: {
            select: {
              version: true, name: true, mimeType: true, sha256: true, license: true, provenance: true, state: true,
              asset: { select: { kind: true, userId: true, contextId: true } }
            }
          }
        }
      }
    }
  });
  if (!row) return null;
  return {
    projectId: row.id, contextId: row.contextId, format: row.format, usage: row.usage as PublicationUsage,
    confirmedAt: row.assetsConfirmedAt, digest: row.assetsConfirmationDigest, snapshot: row.assetsConfirmation as unknown,
    selected: row.assetSelections.map((selection) => ({
      assetId: selection.assetId, versionId: selection.assetVersionId, version: selection.version.version,
      name: selection.version.name, kind: selection.version.asset.kind, mimeType: selection.version.mimeType,
      sha256: selection.version.sha256, license: selection.version.license, provenance: selection.version.provenance,
      state: selection.version.state,
      ownerValid: selection.version.asset.userId === userId && selection.version.asset.contextId === row.contextId
    }))
  };
}

export class PrismaAssetDecisionRepository implements AssetDecisionRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  readOwned(projectId: string, userId: string): Promise<AssetDecisionRow | null> {
    return readAssetDecisionRow(this.db, projectId, userId);
  }

  async confirmOwned(projectId: string, userId: string, input: {
    usage: PublicationUsage; versionIds: string[]; clearSelection: boolean;
    digest: string; snapshot: AssetDecisionSnapshot;
  }): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Project" WHERE "id" = ${projectId} AND "userId" = ${userId} FOR UPDATE`;
      if (!locked.length) throw new ApplicationError('project_not_found', 'Projet introuvable.', 404);
      const project = await tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { contextId: true } });
      const current = (await tx.projectAssetSelection.findMany({ where: { projectId }, select: { assetVersionId: true } }))
        .map((selection) => selection.assetVersionId).sort();
      const expected = [...input.versionIds].sort();
      if (!input.clearSelection && (current.length !== expected.length || current.some((id, index) => id !== expected[index]))) {
        throw new ApplicationError('asset_selection_changed', 'La sélection a changé. Enregistrez-la puis confirmez-la à nouveau.', 409);
      }
      if (input.versionIds.length) {
        const versions = await tx.brandAssetVersion.findMany({
          where: { id: { in: input.versionIds }, state: 'ready', asset: { userId, contextId: project.contextId } },
          select: { id: true }
        });
        if (versions.length !== input.versionIds.length) {
          throw new ApplicationError('asset_version_unavailable', 'Une ressource confirmée n’est plus disponible.', 409);
        }
      }
      if (input.clearSelection) await tx.projectAssetSelection.deleteMany({ where: { projectId } });
      await tx.project.update({
        where: { id: projectId },
        data: {
          usage: input.usage,
          assetsConfirmedAt: new Date(input.snapshot.confirmedAt),
          assetsConfirmationDigest: input.digest,
          assetsConfirmation: input.snapshot as unknown as Prisma.InputJsonValue
        }
      });
    });
  }
}
