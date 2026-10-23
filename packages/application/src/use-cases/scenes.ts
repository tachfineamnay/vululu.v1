import { updateSceneDuration as applyDuration } from '@vululu/domain';
import { ApplicationError } from '../errors';
import type { Actor, AuditPort, ProjectRepository, SceneRecord, SceneRepository } from '../ports';

/** Use case de duree de scene : validation Domain puis ecriture ciblee. */
export class SceneUseCases {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly scenes: SceneRepository,
    private readonly audit: AuditPort
  ) {}

  async updateDuration(
    actor: Actor,
    projectId: string,
    sceneKey: string,
    durationSeconds: number
  ): Promise<SceneRecord> {
    const project = await this.projects.findOwned(projectId, actor.id);
    if (!project) {
      throw new ApplicationError('project_not_found', 'Projet introuvable.', 404);
    }
    const scene = await this.scenes.findOwned(projectId, sceneKey, actor.id);
    if (!scene) {
      throw new ApplicationError('scene_not_found', 'Scene introuvable: ' + sceneKey, 404);
    }
    applyDuration(
      {
        id: scene.id,
        projectId: scene.projectId,
        sceneKey: scene.sceneKey,
        position: scene.position,
        title: scene.title,
        description: scene.description,
        durationSeconds: scene.durationSeconds,
        characterKey: scene.characterKey
      },
      durationSeconds
    );
    const updated = await this.scenes.updateDuration(projectId, sceneKey, durationSeconds);
    await this.audit.record({
      actorId: actor.id,
      action: 'scene.duration_updated',
      targetType: 'scene',
      targetId: sceneKey,
      metadata: { projectId, durationSeconds }
    });
    return updated;
  }
}
