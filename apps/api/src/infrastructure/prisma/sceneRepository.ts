import type { PrismaClient } from '@prisma/client';
import { prisma } from '@vululu/db';
import { normalizeProductionSettings, updateSceneDuration, type Platform, type ProjectFormat, type ProductionSettings } from '@vululu/domain';
import { ApplicationError } from '@vululu/application';
import type { SceneRecord, SceneRepository } from '@vululu/application';
import { toSceneRecord } from './mappers';

/** Adaptateur PostgreSQL du port SceneRepository (Scene ID stable, sceneKey unique par projet). */
export class PrismaSceneRepository implements SceneRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async listByProject(projectId: string): Promise<SceneRecord[]> {
    const rows = await this.db.scene.findMany({
      where: { projectId },
      orderBy: { position: 'asc' }
    });
    return rows.map(toSceneRecord);
  }

  async findOwned(projectId: string, sceneKey: string, userId: string): Promise<SceneRecord | null> {
    const row = await this.db.scene.findFirst({
      where: {
        projectId,
        sceneKey,
        project: { is: { userId } }
      }
    });
    return row ? toSceneRecord(row) : null;
  }

  async upsertMany(
    projectId: string,
    scenes: Array<Omit<SceneRecord, 'id' | 'projectId'>>
  ): Promise<SceneRecord[]> {
    await this.db.$transaction(
      scenes.map((scene) =>
        this.db.scene.upsert({
          where: { projectId_sceneKey: { projectId, sceneKey: scene.sceneKey } },
          update: {
            position: scene.position,
            title: scene.title,
            description: scene.description,
            durationSeconds: scene.durationSeconds,
            characterKey: scene.characterKey
          },
          create: {
            projectId,
            sceneKey: scene.sceneKey,
            position: scene.position,
            title: scene.title,
            description: scene.description,
            durationSeconds: scene.durationSeconds,
            characterKey: scene.characterKey
          }
        })
      )
    );
    const rows = await this.db.scene.findMany({
      where: { projectId },
      orderBy: { position: 'asc' }
    });
    return rows.map(toSceneRecord);
  }

  async updateDuration(
    projectId: string,
    sceneKey: string,
    durationSeconds: number | null,
    userId: string
  ): Promise<SceneRecord> {
    return this.db.$transaction(async (tx) => {
      // Même verrou que les lancements : pas d'édition après capture du snapshot.
      const locked = await tx.project.updateMany({ where: { id: projectId, userId, status: { not: 'producing' } }, data: { updatedAt: new Date() } });
      if (!locked.count) {
        const owned = await tx.project.findFirst({ where: { id: projectId, userId }, select: { id: true } });
        if (!owned) throw new ApplicationError('project_not_found', 'Projet introuvable.', 404);
        throw new ApplicationError('project_busy', 'La durée ne peut pas changer pendant une production.', 409);
      }
      const scene = await tx.scene.findUnique({ where: { projectId_sceneKey: { projectId, sceneKey } } });
      if (!scene) throw new ApplicationError('scene_not_found', 'scene_introuvable: ' + sceneKey, 404);
      let seconds = durationSeconds;
      if (seconds === null) {
        const project = await tx.project.findUniqueOrThrow({ where: { id: projectId }, include: { brief: true } });
        if (!project.brief) throw new ApplicationError('brief_required', 'Enregistrez le brief avant de reprendre sa durée.', 409);
        seconds = normalizeProductionSettings(project.platform as Platform, project.format as ProjectFormat, (project.brief.settings as unknown as ProductionSettings | null) ?? { defaultSceneDurationSeconds: project.sceneDurationSeconds }).defaultSceneDurationSeconds;
      }
      updateSceneDuration(toSceneRecord(scene), seconds);
      return toSceneRecord(await tx.scene.update({ where: { id: scene.id }, data: { durationSeconds: seconds, usesBriefDuration: durationSeconds === null } }));
    });
  }
}
