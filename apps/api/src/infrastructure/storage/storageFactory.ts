import type { ArtifactStoragePort } from '@vululu/application';
import { env } from '../../env';
import { LocalFilesystemArtifactStorage } from './localArtifactStorage';
import { S3CompatibleArtifactStorage } from './s3ArtifactStorage';

export type ArtifactStorageBackend = 'local' | 's3';

export function artifactStorageBackend(): ArtifactStorageBackend {
  return process.env.ARTIFACT_STORAGE_BACKEND === 's3' ? 's3' : 'local';
}

export function createArtifactStorage(): ArtifactStoragePort {
  if (artifactStorageBackend() === 's3') {
    return new S3CompatibleArtifactStorage({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION || 'us-east-1',
      bucket: process.env.S3_BUCKET || '',
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      forcePathStyle: (process.env.S3_FORCE_PATH_STYLE || 'true') !== 'false',
      timeoutMs: Number(process.env.S3_TIMEOUT_MS || '30000'),
      maxAttempts: Number(process.env.S3_MAX_ATTEMPTS || '3')
    });
  }
  return new LocalFilesystemArtifactStorage(env.artifactRoot);
}
