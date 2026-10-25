import fs from 'node:fs';
import { Readable } from 'node:stream';
import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import type {
  ArtifactReadRange,
  ArtifactReadStream,
  ArtifactStorageMetadata,
  ArtifactStoragePort,
  StoredObjectInfo
} from '@vululu/application';

export type S3CompatibleOptions = {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
  tls?: boolean;
  timeoutMs?: number;
  maxAttempts?: number;
};

export class ArtifactStorageError extends Error {
  constructor(
    readonly code: string,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = 'ArtifactStorageError';
  }
}

function fromEnv(): S3CompatibleOptions {
  const endpoint = process.env.S3_ENDPOINT || undefined;
  const region = process.env.S3_REGION || 'us-east-1';
  const bucket = process.env.S3_BUCKET || '';
  const forcePathStyle = (process.env.S3_FORCE_PATH_STYLE || 'true') !== 'false';
  const timeoutMs = Number(process.env.S3_TIMEOUT_MS || '30000');
  const maxAttempts = Number(process.env.S3_MAX_ATTEMPTS || '3');
  return {
    endpoint,
    region,
    bucket,
    accessKeyId: process.env.S3_ACCESS_KEY_ID || undefined,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || undefined,
    forcePathStyle,
    tls: endpoint ? endpoint.startsWith('https://') : true,
    timeoutMs,
    maxAttempts
  };
}

/**
 * Adaptateur S3 standard (AWS SDK v3, compatible MinIO/Ceph/etc.).
 * - upload multipart via lib-storage pour les gros MP4 ;
 * - ne charge jamais un fichier complet en memoire ;
 * - stocke le SHA-256 dans les metadonnees d objet, sans confondre ETag et SHA ;
 * - erreurs structurees, timeouts et retries bornes.
 */
export class S3CompatibleArtifactStorage implements ArtifactStoragePort {
  readonly provider = 's3';
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly options: S3CompatibleOptions;

  constructor(options: Partial<S3CompatibleOptions> = {}) {
    const merged = { ...fromEnv(), ...options };
    if (!merged.bucket) throw new ArtifactStorageError('s3_bucket_absent', 'S3_BUCKET est obligatoire.');
    this.options = merged;
    this.bucket = merged.bucket;
    this.client = new S3Client({
      region: merged.region,
      endpoint: merged.endpoint,
      forcePathStyle: merged.forcePathStyle ?? true,
      credentials:
        merged.accessKeyId && merged.secretAccessKey
          ? { accessKeyId: merged.accessKeyId, secretAccessKey: merged.secretAccessKey }
          : undefined,
      maxAttempts: merged.maxAttempts ?? 3,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      requestHandler: new NodeHttpHandler({
        connectionTimeout: merged.timeoutMs ?? 30000,
        requestTimeout: merged.timeoutMs ?? 30000
      })
    });
  }

  private mapError(operation: string, error: unknown): ArtifactStorageError {
    if (error instanceof ArtifactStorageError) return error;
    const message = error instanceof Error ? error.message : 's3_error';
    return new ArtifactStorageError('s3_' + operation + '_failed', message, { cause: error });
  }

  async putObject(input: {
    key: string;
    body: Buffer | Readable;
    contentType: string;
    sha256: string;
    sizeBytes?: number;
  }): Promise<ArtifactStorageMetadata> {
    try {
      const upload = new Upload({
        client: this.client,
        params: {
          Bucket: this.bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
          Metadata: { sha256: input.sha256 },
          ...(input.sizeBytes !== undefined ? { ContentLength: input.sizeBytes } : {})
        },
        partSize: 8 * 1024 * 1024,
        queueSize: 4,
        leavePartsOnError: false
      });
      await upload.done();
      return await this.requireMetadata(input.key, input.contentType, input.sha256);
    } catch (error) {
      throw this.mapError('put', error);
    }
  }

  async putFile(input: {
    key: string;
    filePath: string;
    contentType: string;
    sha256: string;
    sizeBytes: number;
  }): Promise<ArtifactStorageMetadata> {
    try {
      const stat = fs.statSync(input.filePath);
      if (stat.size !== input.sizeBytes) throw new ArtifactStorageError('s3_size_mismatch', 'Taille locale divergente.');
      const body = fs.createReadStream(input.filePath);
      const upload = new Upload({
        client: this.client,
        params: {
          Bucket: this.bucket,
          Key: input.key,
          Body: body,
          ContentType: input.contentType,
          ContentLength: stat.size,
          Metadata: { sha256: input.sha256 }
        },
        partSize: 8 * 1024 * 1024,
        queueSize: 4,
        leavePartsOnError: false
      });
      await upload.done();
      return await this.requireMetadata(input.key, input.contentType, input.sha256);
    } catch (error) {
      throw this.mapError('put_file', error);
    }
  }

  private async requireMetadata(
    key: string,
    contentType: string,
    sha256: string
  ): Promise<ArtifactStorageMetadata> {
    const head = await this.head(key);
    if (!head) throw new ArtifactStorageError('s3_object_missing', 'Objet absent apres upload.');
    if (head.sha256 !== sha256) {
      throw new ArtifactStorageError('s3_checksum_mismatch', 'SHA-256 metadata divergent.');
    }
    return {
      provider: this.provider,
      key,
      contentType: head.contentType || contentType,
      sizeBytes: head.sizeBytes,
      sha256,
      etag: head.etag
    };
  }

  async head(key: string): Promise<StoredObjectInfo | null> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key })
      );
      return {
        provider: this.provider,
        key,
        contentType: response.ContentType || 'application/octet-stream',
        sizeBytes: Number(response.ContentLength ?? 0),
        sha256: response.Metadata?.sha256 ?? '',
        etag: response.ETag ?? null,
        lastModified: response.LastModified?.toISOString()
      } as StoredObjectInfo;
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      if (name === 'NotFound' || name === 'NoSuchKey' || name === '404') return null;
      throw this.mapError('head', error);
    }
  }

  async get(key: string, range?: ArtifactReadRange): Promise<ArtifactReadStream> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          ...(range
            ? { Range: 'bytes=' + range.start + '-' + (range.end === undefined ? '' : range.end) }
            : {})
        })
      );
      const body = response.Body as Readable;
      return {
        stream: body,
        size: Number(response.ContentLength ?? 0),
        contentType: response.ContentType || 'application/octet-stream',
        sha256: response.Metadata?.sha256,
        range
      };
    } catch (error) {
      throw this.mapError('get', error);
    }
  }

  async verify(key: string, expectedSha256: string): Promise<boolean> {
    const head = await this.head(key);
    return Boolean(head && head.sha256 === expectedSha256);
  }

  async getSignedReadUrl(key: string, expiresSeconds: number): Promise<string | null> {
    try {
      return await getSignedUrl(
        this.client,
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
        { expiresIn: Math.max(1, Math.min(expiresSeconds, 3600)) }
      );
    } catch (error) {
      throw this.mapError('sign', error);
    }
  }

  async list(prefix = ''): Promise<StoredObjectInfo[]> {
    try {
      const results: StoredObjectInfo[] = [];
      let continuationToken: string | undefined;
      do {
        const response = await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: prefix || undefined,
            ContinuationToken: continuationToken
          })
        );
        for (const item of response.Contents ?? []) {
          if (!item.Key) continue;
          results.push({
            provider: this.provider,
            key: item.Key,
            contentType: 'application/octet-stream',
            sizeBytes: Number(item.Size ?? 0),
            sha256: '',
            etag: item.ETag ?? null,
            lastModified: item.LastModified?.toISOString()
          } as StoredObjectInfo);
        }
        continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
      } while (continuationToken);
      return results;
    } catch (error) {
      throw this.mapError('list', error);
    }
  }

  close(): void {
    this.client.destroy();
  }
}