import fs from 'node:fs';
import { prisma } from '@vululu/db';
import { ApplicationError } from '@vululu/application';
import type { ArtifactAccessPort, ArtifactFile } from '@vululu/application';
import { LocalStoragePort } from '../storage/localStoragePort';

/**
 * Acces aux binaires d artefact derriere un port applicatif.
 * La route ne fait plus de selection DB ni de resolution de chemin.
 */
export class PrismaArtifactAccess implements ArtifactAccessPort {
  constructor(private readonly storage: LocalStoragePort = new LocalStoragePort()) {}

  async getSceneImage(userId: string, projectId: string, sceneKey: string): Promise<ArtifactFile> {
    const scene = await prisma.scene.findFirst({
      where: { projectId, sceneKey, project: { is: { userId } } },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } }
    });
    const version = scene?.versions[0];
    if (!version) {
      throw new ApplicationError('image_not_found', 'Image de scene introuvable.', 404);
    }
    const absolutePath = this.storage.resolve(version.imagePath);
    if (!fs.existsSync(absolutePath)) {
      throw new ApplicationError('image_not_found', 'Fichier image introuvable.', 404);
    }
    return { absolutePath, contentType: 'image/png', size: fs.statSync(absolutePath).size };
  }

  async getMaster(userId: string, projectId: string, version?: number): Promise<ArtifactFile> {
    const artifact = await prisma.artifact.findFirst({
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
    const absolutePath = this.storage.resolve(artifactVersion.masterPath);
    if (!fs.existsSync(absolutePath)) {
      throw new ApplicationError('master_not_found', 'Fichier master introuvable.', 404);
    }
    return { absolutePath, contentType: 'video/mp4', size: fs.statSync(absolutePath).size };
  }
}
