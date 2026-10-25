import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import type {
  ArtifactReadRange,
  ArtifactReadStream,
  ArtifactStorageMetadata,
  ArtifactStoragePort,
  StoredObjectInfo
} from '@vululu/application';

const TMP_DIR = '.artifact-tmp';

function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function sha256Buffer(value: Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * Adaptateur local du port ArtifactStoragePort.
 *
 * Il respecte le meme contrat que S3 : cles opaques, ecriture atomique,
 * verification SHA-256, lecture par flux et ranges HTTP. Il est utilise pour
 * le developpement, les tests et la compatibilite historique.
 */
export class LocalFilesystemArtifactStorage implements ArtifactStoragePort {
  readonly provider = 'local';
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  /** Resolution d un ancien chemin local relatif (compatibilite). */
  resolveKeyForLegacy(relativePath: string): string {
    return this.resolveKey(relativePath.split(path.sep).join('/'));
  }

  private resolveKey(key: string): string {
    if (!key || key.includes('..') || path.isAbsolute(key) || key.includes('\\')) {
      throw new Error('storage_key_invalide');
    }
    const resolved = path.resolve(this.root, key);
    if (resolved !== this.root && !resolved.startsWith(this.root + path.sep)) {
      throw new Error('storage_key_hors_racine');
    }
    return resolved;
  }

  private contentTypeForKey(key: string): string {
    const ext = path.extname(key).toLowerCase();
    if (ext === '.png') return 'image/png';
    if (ext === '.mp4') return 'video/mp4';
    return 'application/octet-stream';
  }

  async putObject(input: {
    key: string;
    body: Buffer | Readable;
    contentType: string;
    sha256: string;
    sizeBytes?: number;
  }): Promise<ArtifactStorageMetadata> {
    const destination = this.resolveKey(input.key);
    await fsp.mkdir(path.dirname(destination), { recursive: true });
    const temp = path.join(path.dirname(destination), TMP_DIR + '-' + crypto.randomUUID());
    try {
      if (Buffer.isBuffer(input.body)) {
        await fsp.writeFile(temp, input.body);
      } else {
        const source = input.body as Readable;
        await new Promise<void>((resolve, reject) => {
          const output = fs.createWriteStream(temp);
          source.pipe(output);
          source.on('error', reject);
          output.on('error', reject);
          output.on('finish', () => resolve());
        });
      }
      const stat = await fsp.stat(temp);
      const hash = await sha256File(temp);
      if (hash !== input.sha256) throw new Error('storage_checksum_mismatch');
      await fsp.rename(temp, destination);
      return {
        provider: this.provider,
        key: input.key,
        contentType: input.contentType,
        sizeBytes: stat.size,
        sha256: hash,
        etag: hash
      };
    } catch (error) {
      await fsp.rm(temp, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async putFile(input: {
    key: string;
    filePath: string;
    contentType: string;
    sha256: string;
    sizeBytes: number;
  }): Promise<ArtifactStorageMetadata> {
    const hash = await sha256File(input.filePath);
    if (hash !== input.sha256) throw new Error('storage_source_checksum_mismatch');
    const destination = this.resolveKey(input.key);
    if (fs.existsSync(destination)) {
      const existing = await this.head(input.key);
      if (existing?.sha256 === hash) return existing;
      throw new Error('storage_object_conflict_existing_key');
    }
    await fsp.mkdir(path.dirname(destination), { recursive: true });
    const temp = path.join(path.dirname(destination), TMP_DIR + '-' + crypto.randomUUID());
    try {
      await fsp.copyFile(input.filePath, temp);
      await fsp.rename(temp, destination);
    } catch (error) {
      await fsp.rm(temp, { force: true }).catch(() => undefined);
      throw error;
    }
    const stat = await fsp.stat(destination);
    return {
      provider: this.provider,
      key: input.key,
      contentType: input.contentType,
      sizeBytes: stat.size,
      sha256: hash,
      etag: hash
    };
  }

  async head(key: string): Promise<StoredObjectInfo | null> {
    const file = this.resolveKey(key);
    if (!fs.existsSync(file)) return null;
    const stat = await fsp.stat(file);
    return {
      provider: this.provider,
      key,
      contentType: this.contentTypeForKey(key),
      sizeBytes: stat.size,
      sha256: await sha256File(file),
      etag: undefined,
      lastModified: stat.mtime.toISOString()
    } as StoredObjectInfo;
  }

  async get(key: string, range?: ArtifactReadRange): Promise<ArtifactReadStream> {
    const file = this.resolveKey(key);
    const stat = await fsp.stat(file);
    if (range) {
      const end = range.end === undefined ? stat.size - 1 : range.end;
      if (range.start < 0 || end >= stat.size || range.start > end) {
        throw new Error('storage_range_invalide');
      }
      return {
        stream: fs.createReadStream(file, { start: range.start, end }),
        size: stat.size,
        contentType: this.contentTypeForKey(key),
        range: { start: range.start, end }
      };
    }
    return {
      stream: fs.createReadStream(file),
      size: stat.size,
      contentType: this.contentTypeForKey(key)
    };
  }

  async verify(key: string, expectedSha256: string): Promise<boolean> {
    const info = await this.head(key);
    return info?.sha256 === expectedSha256;
  }

  async getSignedReadUrl(): Promise<string | null> {
    return null;
  }

  async list(prefix = ''): Promise<StoredObjectInfo[]> {
    const base = prefix ? this.resolveKey(prefix) : this.root;
    if (!fs.existsSync(base)) return [];
    const results: StoredObjectInfo[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith(TMP_DIR)) continue;
        const absolute = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(absolute);
        } else if (entry.isFile()) {
          const key = path.relative(this.root, absolute).split(path.sep).join('/');
          const stat = fs.statSync(absolute);
          results.push({
            provider: this.provider,
            key,
            contentType: this.contentTypeForKey(key),
            sizeBytes: stat.size,
            sha256: '',
            etag: undefined,
            lastModified: stat.mtime.toISOString()
          });
        }
      }
    };
    walk(base);
    return results;
  }
}