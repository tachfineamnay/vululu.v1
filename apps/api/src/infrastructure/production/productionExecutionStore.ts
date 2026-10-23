import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@vululu/db';
import { contentChecksum } from '@vululu/domain';
import { ApplicationError } from '@vululu/application';
import type {
  ExecutionProject,
  ExecutionScene,
  ProductionExecutionStore,
  ProductionFinalization,
  SceneVersionRecord
} from '@vululu/application';

function mapSceneSceneVersion(row: {
  id: string;
  sceneId: string;
  version: number;
  imagePath: string;
  prompt: string;
  checksum: string;
}): SceneVersionRecord {
  return {
    id: row.id,
    sceneId: row.sceneId,
    version: row.version,
    imagePath: row.imagePath,
    prompt: row.prompt,
    checksum: row.checksum
  };
}

/**
 * Lecture/ecriture d execution de production.
 *
 * La finalisation est une transaction unique : versions de scene, version de
 * master, QA, invalidation des approbations, outputs, statut du JobRun et du
 * projet sont committes ensemble. Les fichiers ont ete ecrits avant ; en cas
 * d echec DB ils restent orphelins et seront detectes par l audit d artefacts.
 */
export class PrismaProductionExecutionStore implements ProductionExecutionStore {
  constructor(private readonly db: PrismaClient = prisma) {}

  async markRunning(jobRunId: string): Promise<void> {
    await this.db.jobRun.update({ where: { id: jobRunId }, data: { status: 'running' } });
  }

  async updateJob(
    jobId: string,
    input: { status?: string; step?: string; progress?: number; error?: string | null }
  ): Promise<void> {
    await this.db.productionJob.update({ where: { id: jobId }, data: input });
  }

  async updateStep(jobRunId: string, name: string, status: string, error?: string): Promise<void> {
    await this.db.stepRun.updateMany({
      where: { jobRunId, name },
      data: {
        status,
        error: error ?? null,
        startedAt: status === 'running' ? new Date() : undefined,
        finishedAt: status === 'succeeded' || status === 'failed' ? new Date() : undefined,
        attempts: status === 'running' ? { increment: 1 } : undefined
      }
    });
  }

  async loadExecutionProject(projectId: string): Promise<ExecutionProject> {
    const project = await this.db.project.findUnique({
      where: { id: projectId },
      include: {
        context: true,
        scenes: {
          orderBy: { position: 'asc' },
          include: { versions: { orderBy: { version: 'desc' }, take: 1 } }
        }
      }
    });
    if (!project || !project.context) {
      throw new ApplicationError('project_not_found', 'Projet ou contexte introuvable.', 404);
    }
    const scenes: ExecutionScene[] = project.scenes.map((scene) => ({
      id: scene.id,
      projectId: scene.projectId,
      sceneKey: scene.sceneKey,
      position: scene.position,
      title: scene.title,
      description: scene.description,
      durationSeconds: scene.durationSeconds,
      characterKey: scene.characterKey,
      latestVersion: scene.versions[0] ? mapSceneSceneVersion(scene.versions[0]) : null
    }));
    return {
      id: project.id,
      status: project.status,
      sceneDurationSeconds: project.sceneDurationSeconds,
      context: {
        name: project.context.name,
        colorPrimary: project.context.colorPrimary,
        colorSecondary: project.context.colorSecondary
      },
      scenes
    };
  }

  async nextMasterVersion(projectId: string): Promise<number> {
    const artifact = await this.db.artifact.findUnique({
      where: { projectId_kind: { projectId, kind: 'master' } },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } }
    });
    return artifact?.versions[0] ? artifact.versions[0].version + 1 : 1;
  }

  async finalizeRun(input: ProductionFinalization): Promise<void> {
    try {
      await this.db.$transaction(async (tx) => {
        const project = await tx.project.findUnique({
          where: { id: input.projectId },
          select: { id: true, status: true }
        });
        if (!project) {
          throw new ApplicationError('project_not_found', 'Projet introuvable.', 404);
        }
        if (project.status !== 'producing') {
          throw new ApplicationError('project_not_producing', 'Le projet n est plus en production.', 409);
        }
        for (const scene of input.scenes) {
          const existing = await tx.scene.findUnique({
            where: { id: scene.sceneId },
            select: { id: true }
          });
          if (!existing) {
            throw new ApplicationError('scene_not_found', 'Scene introuvable: ' + scene.sceneKey, 404);
          }
          await tx.sceneVersion.create({
            data: {
              sceneId: scene.sceneId,
              version: scene.version,
              imagePath: scene.imagePath,
              prompt: scene.prompt,
              checksum: scene.checksum
            }
          });
        }
        const artifact = await tx.artifact.upsert({
          where: { projectId_kind: { projectId: input.projectId, kind: 'master' } },
          update: {},
          create: { projectId: input.projectId, kind: 'master' }
        });
        const artifactVersion = await tx.artifactVersion.create({
          data: {
            artifactId: artifact.id,
            version: input.masterVersion,
            masterPath: input.master.relativePath,
            checksum: input.master.checksum,
            qaStatus: input.qa.status,
            qaReport: input.qa as unknown as Prisma.InputJsonValue
          }
        });
        await tx.approval.updateMany({
          where: { artifactVersion: { is: { artifact: { is: { projectId: input.projectId } } } }, invalidatedAt: null },
          data: { invalidatedAt: new Date() }
        });
        await tx.artifactVersion.update({
          where: { id: artifactVersion.id },
          data: { qaReport: input.qa as unknown as Prisma.InputJsonValue }
        });
        await tx.productionJob.update({
          where: { id: input.jobId },
          data: { status: 'succeeded', step: 'done', progress: 100, error: null }
        });
        await tx.jobRun.update({
          where: { id: input.jobRunId },
          data: {
            status: 'succeeded',
            outputs: input.outputs as Prisma.InputJsonValue,
            outputsChecksum: contentChecksum(input.outputs)
          }
        });
        await tx.stepRun.updateMany({
          where: { jobRunId: input.jobRunId, name: 'qa' },
          data: { status: 'succeeded', finishedAt: new Date() }
        });
        await tx.stepRun.updateMany({
          where: {
            jobRunId: input.jobRunId,
            name: { in: ['snapshot', 'render-scenes', 'correct-scene', 'assemble-master'] },
            status: { in: ['pending', 'running'] }
          },
          data: { status: 'succeeded', finishedAt: new Date() }
        });
        await tx.project.update({ where: { id: input.projectId }, data: { status: 'review' } });
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'P2002') {
        throw new ApplicationError('production_conflict', 'Version de scene ou master deja creee.', 409);
      }
      throw error;
    }
  }

  async failRun(input: { jobRunId: string; jobId: string; projectId: string; error: string }): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await tx.productionJob.update({
        where: { id: input.jobId },
        data: { status: 'failed', step: 'failed', error: input.error }
      });
      await tx.jobRun.update({
        where: { id: input.jobRunId },
        data: { status: 'failed' }
      });
      await tx.stepRun.updateMany({
        where: { jobRunId: input.jobRunId, status: { in: ['pending', 'running'] } },
        data: { status: 'failed', error: input.error, finishedAt: new Date() }
      });
      await tx.project.update({ where: { id: input.projectId }, data: { status: 'failed' } });
    });
  }
}