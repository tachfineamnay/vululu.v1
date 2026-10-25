import type { PrismaClient } from '@prisma/client';
import { prisma } from '@vululu/db';
import type { ArtifactStoragePort } from '@vululu/application';
import { LocalFilesystemArtifactStorage } from '../storage/localArtifactStorage';

export type ArtifactInventoryClass =
  | 'ready'
  | 'missing_object'
  | 'orphan_object'
  | 'checksum_mismatch'
  | 'legacy_present'
  | 'legacy_missing'
  | 'duplicate_sha';

export type ArtifactInventoryReport = {
  generatedAt: string;
  mode: 'audit';
  dryRun: true;
  counts: Record<ArtifactInventoryClass, number>;
  objects: Array<{
    classification: ArtifactInventoryClass;
    provider: string;
    key: string;
    jobRunId?: string | null;
    detail: string;
  }>;
  cleanupCandidates: Array<{ provider: string; key: string; reason: string }>;
  note: string;
};

/**
 * Inventaire read-only des artefacts.
 * Ne supprime jamais rien : produit des candidats et un journal de decision.
 * Seuls les objets sans reference DB et ages sont candidats ; les objets
 * approuves et leurs versions restent proteges.
 */
export class ArtifactInventoryService {
  constructor(
    private readonly storage: ArtifactStoragePort,
    private readonly db: PrismaClient = prisma,
    private readonly legacy = new LocalFilesystemArtifactStorage(process.env.ARTIFACT_DIR || 'data/artifacts')
  ) {}

  async report(options: { prefix?: string; graceHours?: number } = {}): Promise<ArtifactInventoryReport> {
    const prefix = options.prefix ?? '';
    const graceMs = (options.graceHours ?? 24) * 60 * 60 * 1000;
    const objects: ArtifactInventoryReport['objects'] = [];
    const counts: Record<ArtifactInventoryClass, number> = {
      ready: 0,
      missing_object: 0,
      orphan_object: 0,
      checksum_mismatch: 0,
      legacy_present: 0,
      legacy_missing: 0,
      duplicate_sha: 0
    };
    const reason = (classification: ArtifactInventoryClass, detail: string) => {
      counts[classification] += 1;
      objects.push({
        classification,
        provider: this.storage.provider,
        key: detail,
        detail
      });
    };

    const scenes = await this.db.sceneVersion.findMany({
      select: { id: true, imagePath: true, checksum: true, storageKey: true, storageProvider: true, sha256: true }
    });
    const masters = await this.db.artifactVersion.findMany({
      select: { id: true, masterPath: true, checksum: true, storageKey: true, storageProvider: true, sha256: true }
    });
    const storageRefs = new Map<string, { checksum: string; id: string; kind: string }>();
    for (const scene of scenes) {
      if (scene.storageKey && scene.storageProvider === this.storage.provider) {
        storageRefs.set(scene.storageKey, { checksum: scene.sha256 ?? scene.checksum, id: scene.id, kind: 'scene' });
      } else {
        const legacy = await this.legacy.head(scene.imagePath).catch(() => null);
        reason(legacy ? 'legacy_present' : 'legacy_missing', scene.imagePath);
      }
    }
    for (const master of masters) {
      if (master.storageKey && master.storageProvider === this.storage.provider) {
        storageRefs.set(master.storageKey, { checksum: master.sha256 ?? master.checksum, id: master.id, kind: 'master' });
      } else {
        const legacy = await this.legacy.head(master.masterPath).catch(() => null);
        reason(legacy ? 'legacy_present' : 'legacy_missing', master.masterPath);
      }
    }

    const storageObjects = await this.storage.list(prefix);
    const seenSha = new Map<string, number>();
    const cleanupCandidates: ArtifactInventoryReport['cleanupCandidates'] = [];
    for (const object of storageObjects) {
      const head = await this.storage.head(object.key);
      if (!head) {
        reason('missing_object', object.key);
        continue;
      }
      const ref = storageRefs.get(object.key);
      if (!ref) {
        reason('orphan_object', object.key);
        const aged = head.lastModified ? Date.now() - Date.parse(head.lastModified) > graceMs : true;
        if (aged) cleanupCandidates.push({ provider: object.provider, key: object.key, reason: 'no_db_reference' });
        continue;
      }
      if (head.sha256 && head.sha256 !== ref.checksum) {
        reason('checksum_mismatch', object.key);
        continue;
      }
      seenSha.set(head.sha256 || object.key, (seenSha.get(head.sha256 || object.key) ?? 0) + 1);
      counts.ready += 1;
      objects.push({ classification: 'ready', provider: object.provider, key: object.key, detail: ref.kind + ':' + ref.id });
    }
    for (const key of storageRefs.keys()) {
      if (!storageObjects.some((object) => object.key === key)) {
        reason('missing_object', key);
      }
    }
    for (const count of seenSha.values()) {
      if (count > 1) counts.duplicate_sha += count - 1;
    }
    return {
      generatedAt: new Date().toISOString(),
      mode: 'audit',
      dryRun: true,
      counts,
      objects,
      cleanupCandidates,
      note: 'Aucune suppression automatique. Les candidats exigent une decision explicite et la grace de 24 h.'
    };
  }
}
