import type { ArtifactStoragePort } from '@vululu/application';
import { env } from '../../env';
import { LocalFilesystemArtifactStorage } from './localArtifactStorage';
import { S3CompatibleArtifactStorage } from './s3ArtifactStorage';

export type ArtifactStorageBackend = 'local' | 's3';

export function artifactStorageBackend(): ArtifactStorageBackend {
  const backend = process.env.ARTIFACT_STORAGE_BACKEND || 'local';
  if (backend !== 'local' && backend !== 's3') {
    throw new Error('ARTIFACT_STORAGE_BACKEND invalide: ' + backend);
  }
  return backend;
}

function createS3Storage(): ArtifactStoragePort {
  if (process.env.S3_REQUIRE_TLS === '1' && !String(process.env.S3_ENDPOINT || '').startsWith('https://')) {
    throw new Error('S3_REQUIRE_TLS=1 exige un endpoint https.');
  }
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

export function createArtifactStorage(): ArtifactStoragePort {
  return artifactStorageBackend() === 's3'
    ? createS3Storage()
    : new LocalFilesystemArtifactStorage(env.artifactRoot);
}

/**
 * Registre de lecture : permet de relire une version historique selon son
 * storageProvider, meme si le backend d ecriture courant a change.
 */
export function createArtifactStorageRegistry(): Record<string, ArtifactStoragePort> {
  const registry: Record<string, ArtifactStoragePort> = {
    local: new LocalFilesystemArtifactStorage(env.artifactRoot)
  };
  if (artifactStorageBackend() === 's3' || process.env.S3_BUCKET) {
    registry.s3 = createS3Storage();
  }
  return registry;
}