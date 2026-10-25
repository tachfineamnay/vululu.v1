import crypto from 'node:crypto';
import fs from 'node:fs';
import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from '@vululu/db';
import type {
  ArtifactPublisherPort,
  ArtifactPublishRequest,
  ArtifactStorageMetadata,
  ArtifactStoragePort
} from '@vululu/application';

function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function extensionFor(contentType: string): string {
  if (contentType === 'image/png') return 'png';
  if (contentType === 'video/mp4') return 'mp4';
  return 'bin';
}

/**
 * Publication d un fichier temporaire vers le stockage durable.
 *
 * Sequence : reservation ArtifactObject -> upload -> head/verify -> staged.
 * La version metier n est creee qu a la finalisation DB, qui passe l objet
 * a ready. Un crash laisse un objet staged/orphelin visible par l inventaire,
 * jamais une version metier annoncee prete sans octets verifies.
 */
export class PrismaArtifactPublisher implements ArtifactPublisherPort {
  constructor(
    private readonly storage: ArtifactStoragePort,
    private readonly db: PrismaClient = prisma
  ) {}

  private keyFor(input: ArtifactPublishRequest, sha256: string): string {
    const ext = extensionFor(input.contentType);
    if (input.kind === 'scene') {
      const sceneId = input.sceneId ?? input.sceneKey;
      if (!sceneId) throw new Error('scene_id_absent');
      return 'artifacts/' + input.projectId + '/scenes/' + sceneId + '/v' + input.version + '/' + sha256 + '.' + ext;
    }
    return 'artifacts/' + input.projectId + '/master/v' + input.version + '/' + sha256 + '.' + ext;
  }

  async publish(input: ArtifactPublishRequest): Promise<ArtifactStorageMetadata> {
    if (!fs.existsSync(input.filePath)) {
      throw new Error('artifact_source_missing');
    }
    const stat = fs.statSync(input.filePath);
    const sha256 = await sha256File(input.filePath);
    if (sha256 !== input.checksum) {
      throw new Error('artifact_checksum_mismatch');
    }
    const key = this.keyFor(input, sha256);
    const existing = await this.db.artifactObject.findUnique({
      where: { provider_key: { provider: this.storage.provider, key } }
    });
    if (existing && existing.sha256 !== sha256) {
      throw new Error('artifact_object_conflict');
    }
    if (existing && (existing.state === 'staged' || existing.state === 'ready')) {
      const head = await this.storage.head(key);
      if (head && head.sha256 === sha256) {
        return {
          provider: this.storage.provider,
          key,
          contentType: input.contentType,
          sizeBytes: Number(existing.sizeBytes),
          sha256,
          etag: existing.etag ?? undefined
        };
      }
    }
    if (!existing) {
      try {
        await this.db.artifactObject.create({
          data: {
            provider: this.storage.provider,
            key,
            contentType: input.contentType,
            sizeBytes: stat.size,
            sha256,
            state: 'uploading',
            jobRunId: input.jobRunId,
            sceneId: input.sceneId ?? null,
            manifest: (input.manifest ?? {}) as Prisma.InputJsonValue
          }
        });
      } catch (error) {
        const code = typeof error === 'object' && error !== null && 'code' in error ? (error as { code?: string }).code : undefined;
        if (code !== 'P2002') throw error;
      }
    }
    let metadata: ArtifactStorageMetadata;
    try {
      metadata = await this.storage.putFile({
        key,
        filePath: input.filePath,
        contentType: input.contentType,
        sha256,
        sizeBytes: stat.size
      });
      const head = await this.storage.head(key);
      if (!head || head.sha256 !== sha256 || head.sizeBytes !== stat.size) {
        throw new Error('artifact_upload_verification_failed');
      }
      await this.db.artifactObject.update({
        where: { provider_key: { provider: this.storage.provider, key } },
        data: { state: 'staged', etag: head.etag ?? null, sizeBytes: BigInt(head.sizeBytes) }
      });
      return metadata;
    } catch (error) {
      await this.db.artifactObject.updateMany({
        where: { provider: this.storage.provider, key },
        data: { state: 'failed', metadata: { error: error instanceof Error ? error.message : 'upload_failed' } as Prisma.InputJsonValue }
      }).catch(() => undefined);
      throw error;
    }
  }

  async verifyPublished(input: ArtifactStorageMetadata): Promise<boolean> {
    return this.storage.verify(input.key, input.sha256);
  }
}
