import type { Actor, ArtifactAccessPort, ArtifactFile } from '../ports';

/** Use case d acces aux binaires : la route ne connait ni Prisma ni la DB. */
export class ArtifactAccessUseCases {
  constructor(private readonly access: ArtifactAccessPort) {}

  getSceneImage(actor: Actor, projectId: string, sceneKey: string, requested?: number): Promise<ArtifactFile> {
    return this.access.getSceneImage(actor.id, projectId, sceneKey, requested);
  }

  getMaster(actor: Actor, projectId: string, version?: number): Promise<ArtifactFile> {
    return this.access.getMaster(actor.id, projectId, version);
  }
}
