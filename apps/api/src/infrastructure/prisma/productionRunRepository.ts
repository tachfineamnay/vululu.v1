import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '@vululu/db';
import { contentChecksum, assertAssetUsage, normalizeProductionSettings, profileDimensions, type ProductionSettings, type Platform, type ProjectFormat, type AssetLicense, type PublicationUsage } from '@vululu/domain';
import { ApplicationError, productionSourceChecksum, createProductionPlan } from '@vululu/application';
import type {
  JobRunRecord,
  ProductionJobRecord,
  ProductionRunRepository,
  ReproducibilitySnapshot
} from '@vululu/application';
import { captureRunPolicy } from './captureRunPolicy';
import { COMPOSITION_VERSION } from '@vululu/media';

function snapshotChecksum(snapshot: ReproducibilitySnapshot): string {
  return contentChecksum(snapshot);
}

function isUniqueOrWriteConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    ((error as { code?: unknown }).code === 'P2002' ||
      (error as { code?: unknown }).code === 'P2034')
  );
}

function mapJob(row: {
  id: string;
  projectId: string;
  type: string;
  status: string;
  step: string;
  progress: number;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ProductionJobRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    type: row.type,
    status: row.status,
    step: row.step,
    progress: row.progress,
    error: row.error,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function mapJobRun(row: {
  id: string;
  projectId: string;
  type: string;
  status: string;
  snapshot: unknown;
  snapshotVersion: number;
  snapshotChecksum: string | null;
  outputs: unknown;
  outputsChecksum: string | null;
  traceId?: string | null;
  requestId?: string | null;
}): JobRunRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    type: row.type,
    status: row.status,
    snapshot: (row.snapshot as Record<string, unknown> | null) ?? null,
    snapshotVersion: row.snapshotVersion,
    snapshotChecksum: row.snapshotChecksum,
    outputs: (row.outputs as Record<string, unknown> | null) ?? null,
    outputsChecksum: row.outputsChecksum,
    traceId: row.traceId ?? null,
    requestId: row.requestId ?? null
  };
}

/**
 * Demarrage transactionnel d un run.
 *
 * La transaction :
 * 1. verrouille le projet par un update de statut ;
 * 2. lit revisions, versions et personnages dans la meme transaction ;
 * 3. cree le snapshot, le JobRun, les StepRun et le ProductionJob.
 *
 * Un index unique partiel interdit deux JobRun actifs sur un meme projet.
 * Les lectures de references sont donc coherentes avec l ecriture du run.
 */
export class PrismaProductionRunRepository implements ProductionRunRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async startRun(input: {
    userId: string;
    projectId: string;
    type: 'produce' | 'correction';
    targetSceneKey: string | null;
    instruction: string | null;
    steps: string[];
    outbox?: { kind: string; payload: Record<string, unknown> };
    traceId?: string | null;
    requestId?: string | null;
  }): Promise<{ job: ProductionJobRecord; jobRun: JobRunRecord }> {
    try {
      return await this.db.$transaction(
        async (tx) => {
          const updated = await tx.project.updateMany({
            where: { id: input.projectId, userId: input.userId },
            data: { status: 'producing' }
          });
          if (updated.count === 0) {
            throw new ApplicationError('project_not_found', 'Projet introuvable.', 404);
          }
          const project = await tx.project.findUniqueOrThrow({
            where: { id: input.projectId },
            include: {
              context: { include: { revisions: { orderBy: { version: 'desc' }, take: 1 } } },
              brief: { include: { revisions: { orderBy: { version: 'desc' }, take: 1 } } },
              assetSelections: { include: { version: { include: { asset: true } } }, orderBy: { assetId: 'asc' } },
              scenes: {
                orderBy: { position: 'asc' },
                include: { versions: { orderBy: { version: 'desc' }, take: 1 } }
              },
              characters: { include: { versions: { orderBy: { version: 'desc' }, take: 1 } } }
            }
          });
          const running = await tx.jobRun.findFirst({
            where: {
              projectId: input.projectId,
              status: { in: ['queued', 'running', 'waiting_approval', 'recovery_pending'] }
            },
            select: { id: true }
          });
          if (running) {
            throw new ApplicationError('job_running', 'Une production est deja en cours.', 409);
          }
          if (!project.context) {
            throw new ApplicationError('context_not_found', 'Contexte introuvable.', 404);
          }
          let masterSourceInputChecksum: string | undefined;
          if (input.type === 'produce') {
            if (!project.brief) {
              throw new ApplicationError('brief_required', 'Le brief est requis.', 400);
            }
            if (project.scenes.length !== 5) {
              throw new ApplicationError('storyboard_required', 'Le storyboard de cinq scenes est requis.', 400);
            }
          } else {
            const target = project.scenes.find((scene) => scene.sceneKey === input.targetSceneKey);
            if (!target) {
              throw new ApplicationError('scene_not_found', 'Scene introuvable: ' + input.targetSceneKey, 404);
            }
            if (!target.versions[0]) {
              throw new ApplicationError('scene_version_required', 'La scene cible doit avoir une version.', 400);
            }
            const master = await tx.artifact.findUnique({
              where: { projectId_kind: { projectId: input.projectId, kind: 'master' } },
              include: { versions: { orderBy: { version: 'desc' }, take: 1 } }
            });
            if (!master || !master.versions[0]) {
              throw new ApplicationError('master_required', 'Un master doit exister avant correction.', 400);
            }
            const manifest = master.versions[0].manifest as { sourceBriefVersion?: number; sourceInputChecksum?: string } | null;
            if (!project.brief || manifest?.sourceBriefVersion !== project.brief.version) throw new ApplicationError('brief_changed_full_production_required', 'Une production complète est requise avant une correction avec ce brief.', 409);
            masterSourceInputChecksum = manifest.sourceInputChecksum;
          }

          const contextRevision = project.context.revisions[0] ?? null;
          const currentBriefRevision = project.brief?.revisions[0];
          if (!project.brief || !currentBriefRevision || project.brief.confirmedVersion !== project.brief.version || currentBriefRevision.version !== project.brief.version || project.brief.confirmedChecksum !== currentBriefRevision.checksum || project.brief.confirmedBy !== input.userId) throw new ApplicationError('brief_confirmation_required', 'Confirmez la version exacte du brief avant le lancement.', 409);
          if (input.type === 'produce' && project.storyboardBriefVersion !== project.brief.version) throw new ApplicationError('storyboard_stale', 'Régénérez le storyboard pour cette version du brief.', 409);
          for (const { version } of project.assetSelections) {
            if (version.state !== 'ready' || version.asset.userId !== input.userId || version.asset.contextId !== project.contextId) throw new ApplicationError('asset_version_not_found', 'Actif indisponible dans ce contexte.', 400);
            assertAssetUsage(version.license as AssetLicense, project.usage as PublicationUsage);
          }
          const briefRevision = project.brief?.revisions[0] ?? null;
          const settings = normalizeProductionSettings(project.platform as Platform, project.format as ProjectFormat, (project.brief.settings as unknown as ProductionSettings | null) ?? { defaultSceneDurationSeconds: project.sceneDurationSeconds, maxMockCents: 100 });
          if (project.format !== 'Video') throw new ApplicationError('format_not_qualified', 'Ce format attend sa qualification média.', 409);
          if (settings?.audio.voiceVersionId || settings?.audio.musicVersionId) throw new ApplicationError('audio_not_qualified', 'Les fichiers et le mix audio attendent leur qualification média.', 409);
          const dimensions = profileDimensions(settings.ratio);
          const executionPolicy = await captureRunPolicy(tx, { steps: input.steps, durable: Boolean(input.outbox), usage: project.usage, maxMockCents: settings.maxMockCents });
          const plan = createProductionPlan({ settings, format: project.format as ProjectFormat, briefVersion: project.brief.version, briefChecksum: currentBriefRevision.checksum, policy: executionPolicy, sceneDurationsSeconds: project.scenes.map((scene) => scene.durationSeconds) });
          if (!plan.ready) throw new ApplicationError(plan.issues[0].code, plan.issues[0].message, 409);
          const snapshot: ReproducibilitySnapshot = {
            executionPolicy,
            plan,
            schemaVersion: 1,
            capturedAt: new Date().toISOString(),
            project: {
              id: project.id,
              platform: project.platform,
              format: project.format,
              sceneDurationSeconds: project.sceneDurationSeconds,
              usage: project.usage,
              status: project.status
            },
            context: {
              revisionId: contextRevision?.id ?? null,
              checksum: contextRevision?.checksum ?? null,
              data: {
                name: project.context.name,
                website: project.context.website,
                description: project.context.description,
                audience: project.context.audience,
                tone: project.context.tone,
                colorPrimary: project.context.colorPrimary,
                colorSecondary: project.context.colorSecondary
              }
            },
            assets: project.assetSelections.map(({ version: v }) => ({ assetId: v.assetId, versionId: v.id, version: v.version, kind: v.asset.kind, mimeType: v.mimeType, sha256: v.sha256, license: v.license, provenance: v.provenance, storageProvider: v.storageProvider, storageKey: v.storageKey })),
            brief: {
              revisionId: briefRevision?.id ?? null,
              version: briefRevision?.version ?? project.brief?.version ?? null,
              checksum: briefRevision?.checksum ?? null,
              data: project.brief
                ? {
                    objective: project.brief.objective,
                    audience: project.brief.audience,
                    tone: project.brief.tone,
                    cta: project.brief.cta,
                    platform: project.brief.platform,
                    format: project.brief.format,
                    ...(project.brief.settings ? { settings: project.brief.settings } : {})
                  }
                : {}
            },
            scenes: project.scenes.map((scene) => {
              const version = scene.versions[0] ?? null;
              return {
                sceneId: scene.id,
                sceneKey: scene.sceneKey,
                position: scene.position,
                durationSeconds: scene.durationSeconds,
                title: scene.title,
                description: scene.description,
                characterKey: scene.characterKey,
                version: version?.version ?? 0,
                checksum: version?.checksum ?? ''
              };
            }),
            characters: project.characters.map((character) => {
              const version = character.versions[0] ?? null;
              return {
                characterId: character.id,
                characterKey: character.characterKey,
                version: version?.version ?? null,
                checksum: version?.checksum ?? null,
                name: character.name,
                description: character.description
              };
            }),
            providerPolicy: {
              provider: 'local-deterministic',
              model: 'scene-svg-v1',
              deterministic: true
            },
            render: {
              compositionVersion: COMPOSITION_VERSION,
              width: dimensions.width,
              height: dimensions.height,
              fps: 30,
              imageFormat: 'png',
              videoCodec: 'h264',
              audioCodec: 'aac',
              audioSilent: true
            },
            ...(input.type === 'correction' && input.targetSceneKey && input.instruction
              ? { correction: { targetSceneKey: input.targetSceneKey, instruction: input.instruction } }
              : {})
          };
          if (input.type === 'correction' && masterSourceInputChecksum !== productionSourceChecksum(snapshot)) throw new ApplicationError('brief_changed_full_production_required', 'Les entrées communes ont changé : une production complète est requise avant une correction.', 409);
          const checksum = snapshotChecksum(snapshot);
          const jobRun = await tx.jobRun.create({
            data: {
              projectId: input.projectId,
              type: input.type,
              status: 'queued',
              snapshot: snapshot as unknown as Prisma.InputJsonValue,
              snapshotVersion: 1,
              snapshotChecksum: checksum,
              traceId: input.traceId ?? null,
              requestId: input.requestId ?? null
            }
          });
          for (const name of input.steps) {
            await tx.stepRun.create({ data: { jobRunId: jobRun.id, name, status: 'pending' } });
          }
          const job = await tx.productionJob.create({
            data: {
              jobRunId: jobRun.id,
              projectId: input.projectId,
              type: input.type,
              status: 'queued',
              step: 'queued',
              progress: 0
            }
          });
          if (input.outbox) {
            await tx.orchestrationOutbox.create({
              data: {
                idempotencyKey: 'start:' + jobRun.id,
                jobRunId: jobRun.id,
                kind: input.outbox.kind,
                payload: input.outbox.payload as Prisma.InputJsonValue,
                status: 'pending',
                traceId: input.traceId ?? null,
                requestId: input.requestId ?? null
              }
            });
          }
          return { job: mapJob(job), jobRun: mapJobRun(jobRun) };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    } catch (error) {
      if (isUniqueOrWriteConflict(error)) {
        throw new ApplicationError('job_running', 'Une production est deja en cours.', 409);
      }
      throw error;
    }
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

  async findActiveByProject(projectId: string): Promise<JobRunRecord | null> {
    const row = await this.db.jobRun.findFirst({
      where: { projectId, status: { in: ['queued', 'running', 'waiting_approval', 'recovery_pending'] } },
      orderBy: { createdAt: 'desc' }
    });
    return row ? mapJobRun(row) : null;
  }
}
