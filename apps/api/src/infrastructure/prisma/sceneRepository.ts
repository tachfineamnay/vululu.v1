import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '@vululu/db';
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
    durationSeconds: number
  ): Promise<SceneRecord> {
    try {
      const row = await this.db.scene.update({
        where: { projectId_sceneKey: { projectId, sceneKey } },
        data: { durationSeconds }
      });
      return toSceneRecord(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new Error('scene_introuvable: ' + projectId + '/' + sceneKey, { cause: error });
      }
      throw error;
    }
  }
}