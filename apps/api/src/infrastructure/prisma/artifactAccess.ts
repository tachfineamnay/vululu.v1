import fs from 'node:fs';
import { prisma } from '@vululu/db';
import { ApplicationError } from '@vululu/application';
import type {
  ArtifactAccessPort,
  ArtifactFile,
  ArtifactStoragePort
} from '@vululu/application';
import { LocalFilesystemArtifactStorage } from '../storage/localArtifactStorage';
import { env } from '../../env';

/**
 * Acces aux binaires derriere ArtifactAccessPort.
 *
 * Les nouvelles versions portent storageKey/storageProvider et sont lues via
 * ArtifactStoragePort (local ou S3). Les versions historiques sans storageKey
 * restent lues depuis le chemin local existant : aucune migration destructive.
 */
export class PrismaArtifactAccess implements ArtifactAccessPort {
  private readonly legacy: LocalFilesystemArtifactStorage;

  constructor(
    private readonly storage: ArtifactStoragePort = new LocalFilesystemArtifactStorage(env.artifactRoot),
    private readonly db = prisma
  ) {
    this.legacy = new LocalFilesystemArtifactStorage(env.artifactRoot);
  }

  private async fromStorage(
    storageKey: string,
    storageProvider: string,
    contentType: 'image/png' | 'video/mp4',
    sha256?: string | null
  ): Promise<ArtifactFile> {
    const head = await this.storage.head(storageKey);
    if (!head) {
      throw new ApplicationError('artifact_missing', 'Objet de stockage introuvable.', 404);
    }
    return {
      storageKey,
      storageProvider,
      sha256: sha256 ?? head.sha256,
      contentType,
      size: head.sizeBytes,
      openRead: async (range) => (await this.storage.get(storageKey, range)).stream
    };
  }

  async getSceneImage(userId: string, projectId: string, sceneKey: string): Promise<ArtifactFile> {
    const scene = await this.db.scene.findFirst({
      where: { projectId, sceneKey, project: { is: { userId } } },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } }
    });
    const version = scene?.versions[0];
    if (!version) {
      throw new ApplicationError('image_not_found', 'Image de scene introuvable.', 404);
    }
    if (version.storageKey && version.storageProvider) {
      return this.fromStorage(version.storageKey, version.storageProvider, 'image/png', version.sha256);
    }
    const absolutePath = this.legacy.resolveKeyForLegacy(version.imagePath);
    if (!fs.existsSync(absolutePath)) {
      throw new ApplicationError('image_not_found', 'Fichier image introuvable.', 404);
    }
    return { absolutePath, contentType: 'image/png', size: fs.statSync(absolutePath).size };
  }

  async getMaster(userId: string, projectId: string, version?: number): Promise<ArtifactFile> {
    const artifact = await this.db.artifact.findFirst({
      where: { projectId, kind: 'master', project: { is: { userId } } },
      include: {
        versions: version === undefined
          ? { orderBy: { version: 'desc' }, take: 1 }
          : { where: { version }, take: 1 }
      }
    });
    const artifactVersion = artifact?.versions[0];
    if (!artifactVersion) {
      throw new ApplicationError('master_not_found', 'Master introuvable.', 404);
    }
    if (artifactVersion.storageKey && artifactVersion.storageProvider) {
      return this.fromStorage(
        artifactVersion.storageKey,
        artifactVersion.storageProvider,
        'video/mp4',
        artifactVersion.sha256
      );
    }
    const absolutePath = this.legacy.resolveKeyForLegacy(artifactVersion.masterPath);
    if (!fs.existsSync(absolutePath)) {
      throw new ApplicationError('master_not_found', 'Fichier master introuvable.', 404);
    }
    return { absolutePath, contentType: 'video/mp4', size: fs.statSync(absolutePath).size };
  }
}
