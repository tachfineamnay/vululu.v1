import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '@vululu/db';
import { normalizeProductionSettings, plannedSceneCount, type Platform, type ProjectFormat, type ProductionSettings } from '@vululu/domain';
import { ApplicationError, createProductionPlan, DURABLE_PRODUCTION_STEPS, type ProductionPlanningPort } from '@vululu/application';
import { env } from '../../env';
import { captureRunPolicy } from './captureRunPolicy';

export class PrismaProductionPlanning implements ProductionPlanningPort {
  constructor(private readonly db: PrismaClient = prisma) {}
  async previewOwned(userId: string, projectId: string) {
    return this.db.$transaction(async (tx) => {
      const project = await tx.project.findFirst({ where: { id: projectId, userId }, include: { brief: { include: { revisions: { orderBy: { version: 'desc' }, take: 1 } } }, scenes: { orderBy: { position: 'asc' } } } });
      if (!project) throw new ApplicationError('project_not_found', 'Projet introuvable.', 404);
      const brief = project.brief; const revision = brief?.revisions[0];
      if (!brief || !revision) throw new ApplicationError('brief_required', 'Enregistrez le brief avant de consulter le plan.', 409);
      const settings = normalizeProductionSettings(project.platform as Platform, project.format as ProjectFormat, (brief.settings as unknown as ProductionSettings | null) ?? { defaultSceneDurationSeconds: project.sceneDurationSeconds, maxMockCents: 100 });
      const durable = env.orchestratorMode === 'hatchet';
      const policy = await captureRunPolicy(tx, { steps: durable ? [...DURABLE_PRODUCTION_STEPS] : ['snapshot', 'render-scenes', 'assemble-master', 'qa'], durable, usage: project.usage, maxMockCents: settings.maxMockCents });
      const sceneDurationsSeconds = Array.from({ length: plannedSceneCount(project.format as ProjectFormat) }, (_, index) => {
        const scene = project.scenes.find((value) => value.sceneKey === 'SCENE-' + String(index + 1).padStart(3, '0'));
        return scene && (project.storyboardBriefVersion === brief.version || scene.usesBriefDuration !== true) ? scene.durationSeconds : settings.defaultSceneDurationSeconds;
      });
      return createProductionPlan({ settings, format: project.format as ProjectFormat, briefVersion: brief.version, briefChecksum: revision.checksum, policy, sceneDurationsSeconds });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
}
