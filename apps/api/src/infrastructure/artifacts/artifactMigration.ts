import type { PrismaClient } from '@prisma/client';
import { prisma } from '@vululu/db';
import type { ArtifactPublisherPort, ArtifactStoragePort } from '@vululu/application';
import { LocalFilesystemArtifactStorage } from '../storage/localArtifactStorage';

export type LegacyArtifactCandidate = {
  kind: 'scene' | 'master';
  id: string;
  version: number;
  legacyPath: string;
  checksum: string;
  exists: boolean;
  checksumVerified: boolean;
};

/**
 * Migration progressive legacy -> stockage durable.
 * Dry-run par defaut. Aucune copie massive n est declenchee par le lot E.
 */
export class ArtifactMigrationService {
  constructor(
    private readonly storage: ArtifactStoragePort,
    private readonly publisher: ArtifactPublisherPort,
    private readonly db: PrismaClient = prisma,
    private readonly legacy = new LocalFilesystemArtifactStorage(process.env.ARTIFACT_DIR || 'data/artifacts')
  ) {}

  async plan(limit = 100): Promise<LegacyArtifactCandidate[]> {
    const scenes = await this.db.sceneVersion.findMany({
      where: { storageKey: null },
      orderBy: { createdAt: 'asc' },
      take: limit
    });
    const masters = await this.db.artifactVersion.findMany({
      where: { storageKey: null },
      orderBy: { createdAt: 'asc' },
      take: limit
    });
    const candidates: LegacyArtifactCandidate[] = [];
    for (const scene of scenes) {
      const file = this.legacy.resolveKeyForLegacy(scene.imagePath);
      const head = await this.legacy.head(scene.imagePath).catch(() => null);
      candidates.push({
        kind: 'scene',
        id: scene.id,
        version: scene.version,
        legacyPath: scene.imagePath,
        checksum: scene.checksum,
        exists: Boolean(head),
        checksumVerified: Boolean(head && head.sha256 === scene.checksum)
      });
      void file;
    }
    for (const master of masters) {
      const file = this.legacy.resolveKeyForLegacy(master.masterPath);
      const head = await this.legacy.head(master.masterPath).catch(() => null);
      candidates.push({
        kind: 'master',
        id: master.id,
        version: master.version,
        legacyPath: master.masterPath,
        checksum: master.checksum,
        exists: Boolean(head),
        checksumVerified: Boolean(head && head.sha256 === master.checksum)
      });
      void file;
    }
    return candidates;
  }

  async migrate(input: { apply?: boolean; limit?: number } = {}): Promise<{
    apply: boolean;
    migrated: Array<{ kind: string; id: string; storageKey: string }>;
    skipped: Array<{ kind: string; id: string; reason: string }>;
  }> {
    const apply = input.apply === true;
    const plan = await this.plan(input.limit ?? 50);
    const migrated: Array<{ kind: string; id: string; storageKey: string }> = [];
    const skipped: Array<{ kind: string; id: string; reason: string }> = [];
    for (const item of plan) {
      if (!item.exists) {
        skipped.push({ kind: item.kind, id: item.id, reason: 'legacy_file_missing' });
        continue;
      }
      if (!item.checksumVerified) {
        skipped.push({ kind: item.kind, id: item.id, reason: 'legacy_checksum_mismatch' });
        continue;
      }
      if (!apply) {
        migrated.push({ kind: item.kind, id: item.id, storageKey: '(dry-run)' });
        continue;
      }
      const filePath = this.legacy.resolveKeyForLegacy(item.legacyPath);
      const published = await this.publisher.publish({
        kind: item.kind,
        jobRunId: 'legacy-migration',
        projectId: 'legacy',
        sceneId: item.kind === 'scene' ? item.id : undefined,
        version: item.version,
        filePath,
        contentType: item.kind === 'scene' ? 'image/png' : 'video/mp4',
        checksum: item.checksum,
        manifest: { migration: 'legacy', sourcePath: item.legacyPath, sourceChecksum: item.checksum }
      });
      await this.db.$transaction(async (tx) => {
        if (item.kind === 'scene') {
          await tx.sceneVersion.update({
            where: { id: item.id },
            data: {
              storageKey: published.key,
              storageProvider: this.storage.provider,
              mimeType: published.contentType,
              sizeBytes: BigInt(published.sizeBytes),
              sha256: published.sha256,
              finalizationState: 'ready',
              manifest: { migration: 'legacy', sourcePath: item.legacyPath }
            }
          });
          await tx.artifactObject.updateMany({
            where: { provider: this.storage.provider, key: published.key },
            data: { state: 'ready', sceneVersionId: item.id, finalizedAt: new Date() }
          });
        } else {
          await tx.artifactVersion.update({
            where: { id: item.id },
            data: {
              storageKey: published.key,
              storageProvider: this.storage.provider,
              mimeType: published.contentType,
              sizeBytes: BigInt(published.sizeBytes),
              sha256: published.sha256,
              finalizationState: 'ready',
              manifest: { migration: 'legacy', sourcePath: item.legacyPath }
            }
          });
          await tx.artifactObject.updateMany({
            where: { provider: this.storage.provider, key: published.key },
            data: { state: 'ready', artifactVersionId: item.id, finalizedAt: new Date() }
          });
        }
      });
      migrated.push({ kind: item.kind, id: item.id, storageKey: published.key });
    }
    return { apply, migrated, skipped };
  }
}