import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { StoragePort } from '@vululu/application';
import { env } from '../../env';

/**
 * Adaptateur local du port StoragePort (ADR-0002 : local en V1-00, S3 ensuite).
 *
 * - resout un chemin relatif d'artefact sous env.artifactRoot et refuse toute
 *   sortie de la racine (protection contre les traversals) ;
 * - expose exists / readBuffer / checksum SHA256, sans mise en cache ;
 * - ne gere ni URL signee, ni MIME, ni retention : limitations du stockage
 *   local, a lever par l'adaptateur S3 de V1-01+.
 */
export class LocalStoragePort implements StoragePort {
  private readonly root: string;

  constructor(artifactRoot: string = env.artifactRoot) {
    this.root = path.resolve(artifactRoot);
  }

  /** Racine absolue des artefacts (utile aux adaptateurs media). */
  get artifactRoot(): string {
    return this.root;
  }

  resolve(relativePath: string): string {
    const resolved = path.resolve(this.root, relativePath);
    return this.assertInsideRoot(resolved);
  }

  exists(absolutePath: string): boolean {
    return fs.existsSync(this.assertInsideRoot(path.resolve(absolutePath)));
  }

  readBuffer(absolutePath: string): Buffer {
    return fs.readFileSync(this.assertInsideRoot(path.resolve(absolutePath)));
  }

  checksum(absolutePath: string): string {
    const content = this.readBuffer(absolutePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private assertInsideRoot(absolutePath: string): string {
    if (absolutePath !== this.root && !absolutePath.startsWith(this.root + path.sep)) {
      throw new Error('chemin_hors_artefacts: ' + absolutePath);
    }
    return absolutePath;
  }
}
