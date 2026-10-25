import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '@vululu/db';
import { contentChecksum } from '@vululu/domain';
import { ApplicationError } from '@vululu/application';
import type {
  DurableProductionStore,
  DurableRunRecord,
  DurableRunRoutingSnapshot,
  ExecutionProject,
  ProductionFinalization,
  RunEvidence
} from '@vululu/application';
import { assertJobRunTransition, assertStepRunTransition } from '@vululu/domain';
import { PrismaProductionExecutionStore } from '../production/productionExecutionStore';

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function parseOutput(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isUnique(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002';
}

/**
 * Persistance du pipeline durable : transitions metier, sorties d etapes,
 * artefact de run et preuves. Les transactions restent courtes : aucun rendu
 * media n est execute sous verrou PostgreSQL.
 */
export class PrismaDurableProductionStore implements DurableProductionStore {
  private readonly execution: PrismaProductionExecutionStore;

  constructor(private readonly db: PrismaClient = prisma) {
    this.execution = new PrismaProductionExecutionStore(db);
  }

  async loadRun(jobRunId: string): Promise<DurableRunRecord> {
    const row = await this.db.jobRun.findUnique({
      where: { id: jobRunId },
      include: { productionJob: { select: { id: true } } }
    });
    if (!row) {
      throw new ApplicationError('job_run_not_found', 'JobRun introuvable.', 404);
    }
    return {
      id: row.id,
      projectId: row.projectId,
      type: row.type,
      status: row.status,
      snapshot: (row.snapshot as DurableRunRecord['snapshot']) ?? null,
      snapshotChecksum: row.snapshotChecksum,
      outputs: parseOutput(row.outputs),
      workflowRunId: row.workflowRunId,
      jobId: row.productionJob?.id ?? null
    };
  }

  async loadExecutionProject(projectId: string): Promise<ExecutionProject> {
    return this.execution.loadExecutionProject(projectId);
  }

  async transitionJob(
    jobRunId: string,
    toState: string,
    source: string,
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    const row = await this.db.jobRun.findUnique({
      where: { id: jobRunId },
      select: { id: true, status: true }
    });
    if (!row) throw new ApplicationError('job_run_not_found', 'JobRun introuvable.', 404);
    const decision = assertJobRunTransition(row.status, toState);
    if (!decision.changed) return;
    await this.db.$transaction(async (tx) => {
      const updated = await tx.jobRun.updateMany({
        where: { id: jobRunId, status: row.status },
        data: { status: toState, lastTransitionAt: new Date() }
      });
      if (updated.count !== 1) {
        throw new ApplicationError('state_conflict', 'Transition concurrente detectee.', 409);
      }
      await tx.runStateEvent.create({
        data: {
          jobRunId,
          scope: 'job',
          fromState: row.status,
          toState,
          source,
          metadata: json(metadata)
        }
      });
    });
  }

  async transitionStep(
    jobRunId: string,
    name: string,
    toState: string,
    source: string,
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    const row = await this.db.stepRun.findUnique({
      where: { jobRunId_name: { jobRunId, name } }
    });
    if (!row) throw new ApplicationError('step_run_not_found', 'StepRun introuvable: ' + name, 404);
    const decision = assertStepRunTransition(row.status, toState);
    if (!decision.changed) {
      if (toState === 'running' && row.status === 'running') {
        await this.db.$transaction(async (tx) => {
          await tx.stepRun.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
          await tx.runStateEvent.create({
            data: {
              jobRunId,
              stepRunId: row.id,
              scope: 'step:' + name,
              fromState: 'running',
              toState: 'running',
              source,
              metadata: json({ ...metadata, retry: true })
            }
          });
        });
      }
      return;
    }
    await this.db.$transaction(async (tx) => {
      const updated = await tx.stepRun.updateMany({
        where: { id: row.id, status: row.status },
        data: {
          status: toState,
          error: toState === 'failed' ? String(metadata.error ?? row.error ?? '') : null,
          startedAt: toState === 'running' ? new Date() : row.startedAt,
          finishedAt:
            toState === 'succeeded' || toState === 'failed' || toState === 'cancelled' || toState === 'timed_out'
              ? new Date()
              : row.finishedAt,
          attempts: toState === 'running' ? { increment: 1 } : undefined
        }
      });
      if (updated.count !== 1) {
        throw new ApplicationError('state_conflict', 'Transition de step concurrente.', 409);
      }
      await tx.runStateEvent.create({
        data: {
          jobRunId,
          stepRunId: row.id,
          scope: 'step:' + name,
          fromState: row.status,
          toState,
          source,
          metadata: json(metadata)
        }
      });
    });
  }

  async updateJob(
    jobId: string,
    input: { status?: string; step?: string; progress?: number; error?: string | null }
  ): Promise<void> {
    if (!jobId) return;
    await this.db.productionJob.update({ where: { id: jobId }, data: input });
  }

  async saveStepOutput(jobRunId: string, name: string, output: Record<string, unknown>): Promise<void> {
    await this.db.stepRun.updateMany({
      where: { jobRunId, name },
      data: { output: json(output) }
    });
  }

  async getStepOutput<T = Record<string, unknown>>(jobRunId: string, name: string): Promise<T | null> {
    const row = await this.db.stepRun.findUnique({
      where: { jobRunId_name: { jobRunId, name } },
      select: { output: true }
    });
    return (row?.output as T | null) ?? null;
  }

  async nextMasterVersion(projectId: string): Promise<number> {
    return this.execution.nextMasterVersion(projectId);
  }

  async finalizeArtifacts(input: ProductionFinalization): Promise<{
    artifactVersionId: string;
    masterVersion: number;
    checksum: string;
  }> {
    try {
      return await this.db.$transaction(
        async (tx) => {
          const existing = await tx.runArtifact.findUnique({ where: { jobRunId: input.jobRunId } });
          if (existing) {
            return {
              artifactVersionId: existing.artifactVersionId,
              masterVersion: existing.masterVersion,
              checksum: existing.checksum
            };
          }
          const project = await tx.project.findUnique({
            where: { id: input.projectId },
            select: { id: true, status: true }
          });
          if (!project) throw new ApplicationError('project_not_found', 'Projet introuvable.', 404);
          if (project.status !== 'producing') {
            throw new ApplicationError('project_not_producing', 'Projet non en production.', 409);
          }
          for (const scene of input.scenes) {
            const sceneRow = await tx.scene.findUnique({ where: { id: scene.sceneId }, select: { id: true } });
            if (!sceneRow) throw new ApplicationError('scene_not_found', 'Scene introuvable: ' + scene.sceneKey, 404);
            let version = await tx.sceneVersion.findUnique({
              where: { sceneId_version: { sceneId: scene.sceneId, version: scene.version } }
            });
            if (!version) {
              version = await tx.sceneVersion.create({
                data: {
                  sceneId: scene.sceneId,
                  version: scene.version,
                  imagePath: scene.imagePath,
                  prompt: scene.prompt,
                  checksum: scene.checksum,
                  ...(scene.storage
                    ? {
                        storageKey: scene.storage.key,
                        storageProvider: scene.storage.provider,
                        mimeType: scene.storage.contentType,
                        sizeBytes: BigInt(scene.storage.sizeBytes),
                        sha256: scene.storage.sha256,
                        finalizationState: 'ready',
                        manifest: json(input.manifest ?? {})
                      }
                    : {})
                }
              });
            }
            if (scene.storage) {
              const objectUpdated = await tx.artifactObject.updateMany({
                where: { provider: scene.storage.provider, key: scene.storage.key },
                data: {
                  state: 'ready',
                  sceneVersionId: version.id,
                  finalizedAt: new Date()
                }
              });
              if (objectUpdated.count !== 1) {
                throw new ApplicationError(
                  'artifact_object_missing',
                  'Objet de scene absent pour la version finalisee.',
                  409
                );
              }
            }
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
              qaReport: json(input.qa),
              ...(input.master.storage
                ? {
                    storageKey: input.master.storage.key,
                    storageProvider: input.master.storage.provider,
                    mimeType: input.master.storage.contentType,
                    sizeBytes: BigInt(input.master.storage.sizeBytes),
                    sha256: input.master.storage.sha256,
                    finalizationState: 'ready',
                    manifest: json(input.manifest ?? {})
                  }
                : {})
            }
          });
          if (input.master.storage) {
            const objectUpdated = await tx.artifactObject.updateMany({
              where: { provider: input.master.storage.provider, key: input.master.storage.key },
              data: {
                state: 'ready',
                artifactVersionId: artifactVersion.id,
                finalizedAt: new Date()
              }
            });
            if (objectUpdated.count !== 1) {
              throw new ApplicationError(
                'artifact_object_missing',
                'Objet master absent pour la version finalisee.',
                409
              );
            }
          }
          await tx.approval.updateMany({
            where: { artifactVersion: { is: { artifact: { is: { projectId: input.projectId } } } }, invalidatedAt: null },
            data: { invalidatedAt: new Date() }
          });
          await tx.runArtifact.create({
            data: {
              jobRunId: input.jobRunId,
              artifactVersionId: artifactVersion.id,
              masterVersion: input.masterVersion,
              checksum: input.master.checksum,
              scenes: json(input.scenes),
              manifest: json(input.manifest ?? {}),
              storageProvider: input.master.storage?.provider ?? null
            }
          });
          await tx.productionJob.update({
            where: { id: input.jobId },
            data: { status: 'running', step: 'approval', progress: 90, error: null }
          });
          await tx.jobRun.update({
            where: { id: input.jobRunId },
            data: {
              status: 'waiting_approval',
              outputs: json(input.outputs),
              outputsChecksum: contentChecksum(input.outputs),
              lastTransitionAt: new Date()
            }
          });
          await tx.stepRun.updateMany({
            where: { jobRunId: input.jobRunId, name: 'qa' },
            data: { status: 'succeeded', finishedAt: new Date() }
          });
          await tx.project.update({ where: { id: input.projectId }, data: { status: 'review' } });
          await tx.runStateEvent.create({
            data: {
              jobRunId: input.jobRunId,
              scope: 'job',
              fromState: 'running',
              toState: 'waiting_approval',
              source: 'worker',
              metadata: json({
                artifactVersionId: artifactVersion.id,
                checksum: input.master.checksum
              })
            }
          });
          return {
            artifactVersionId: artifactVersion.id,
            masterVersion: input.masterVersion,
            checksum: input.master.checksum
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    } catch (error) {
      if (isUnique(error)) {
        const existing = await this.db.runArtifact.findUnique({ where: { jobRunId: input.jobRunId } });
        if (existing) {
          return {
            artifactVersionId: existing.artifactVersionId,
            masterVersion: existing.masterVersion,
            checksum: existing.checksum
          };
        }
        throw new ApplicationError('production_conflict', 'Version deja finalisee.', 409);
      }
      throw error;
    }
  }

  async completeRun(input: {
    jobRunId: string;
    projectId: string;
    outputs: Record<string, unknown>;
  }): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const run = await tx.jobRun.findUnique({ where: { id: input.jobRunId }, select: { status: true } });
      if (!run) throw new ApplicationError('job_run_not_found', 'JobRun introuvable.', 404);
      if (run.status === 'succeeded') return;
      const decision = assertJobRunTransition(run.status, 'succeeded');
      if (decision.changed) {
        await tx.jobRun.update({
          where: { id: input.jobRunId },
          data: {
            status: 'succeeded',
            outputs: json(input.outputs),
            outputsChecksum: contentChecksum(input.outputs),
            lastTransitionAt: new Date()
          }
        });
        await tx.runStateEvent.create({
          data: {
            jobRunId: input.jobRunId,
            scope: 'job',
            fromState: run.status,
            toState: 'succeeded',
            source: 'worker',
            metadata: json({ outputs: input.outputs })
          }
        });
      }
      await tx.productionJob.updateMany({
        where: { jobRunId: input.jobRunId },
        data: { status: 'succeeded', step: 'done', progress: 100, error: null }
      });
      await tx.stepRun.updateMany({
        where: { jobRunId: input.jobRunId, name: { in: ['approval', 'transfer'] }, status: { in: ['pending', 'running', 'waiting_approval'] } },
        data: { status: 'succeeded', finishedAt: new Date() }
      });
      await tx.project.update({ where: { id: input.projectId }, data: { status: 'transferred' } });
    });
  }

  async failRun(input: {
    jobRunId: string;
    jobId: string;
    projectId: string;
    error: string;
    state?: 'failed' | 'timed_out' | 'cancelled';
  }): Promise<void> {
    const state = input.state ?? 'failed';
    await this.db.$transaction(async (tx) => {
      const run = await tx.jobRun.findUnique({ where: { id: input.jobRunId }, select: { status: true } });
      if (!run) return;
      if (['succeeded', 'failed', 'cancelled', 'timed_out'].includes(run.status)) return;
      const decision = assertJobRunTransition(run.status, state);
      if (decision.changed) {
        await tx.jobRun.update({
          where: { id: input.jobRunId },
          data: { status: state, lastTransitionAt: new Date() }
        });
        await tx.runStateEvent.create({
          data: {
            jobRunId: input.jobRunId,
            scope: 'job',
            fromState: run.status,
            toState: state,
            source: 'worker',
            metadata: json({ error: input.error })
          }
        });
      }
      if (input.jobId) {
        await tx.productionJob.update({
          where: { id: input.jobId },
          data: { status: state === 'timed_out' ? 'failed' : state, step: 'failed', error: input.error }
        });
      }
      await tx.stepRun.updateMany({
        where: { jobRunId: input.jobRunId, status: { in: ['pending', 'running', 'waiting_approval'] } },
        data: { status: state === 'timed_out' ? 'timed_out' : 'failed', error: input.error, finishedAt: new Date() }
      });
      await tx.project.update({ where: { id: input.projectId }, data: { status: state === 'cancelled' ? 'cancelled' : 'failed' } });
    });
  }

  async recordRoutingSnapshot(jobRunId: string, snapshot: DurableRunRoutingSnapshot): Promise<void> {
    const existing = await this.db.runRoutingSnapshot.findUnique({ where: { jobRunId } });
    if (existing) return;
    try {
      await this.db.runRoutingSnapshot.create({
        data: {
          jobRunId,
          agentDefinitionId: snapshot.agentDefinitionId,
          agentConfigVersionId: snapshot.agentConfigVersionId,
          agentConfigChecksum: snapshot.agentConfigChecksum,
          capabilityKey: snapshot.capabilityKey,
          providerId: snapshot.providerId,
          modelId: snapshot.modelId,
          providerKey: snapshot.providerKey,
          modelKey: snapshot.modelKey,
          fallbackModelId: snapshot.fallbackModelId,
          policy: json(snapshot.policy),
          decisionId: snapshot.decisionId,
          estimatedCents: snapshot.estimatedCents,
          actualCents: snapshot.actualCents
        }
      });
    } catch (error) {
      if (!isUnique(error)) throw error;
    }
  }

  async recordCost(input: {
    idempotencyKey: string;
    jobRunId: string;
    projectId: string;
    provider: string;
    model: string | null;
    units: number;
    amountCents: number;
  }): Promise<void> {
    try {
      await this.db.costEvent.create({
        data: {
          idempotencyKey: input.idempotencyKey,
          jobRunId: input.jobRunId,
          projectId: input.projectId,
          provider: input.provider,
          model: input.model,
          units: input.units,
          amountCents: input.amountCents
        }
      });
    } catch (error) {
      if (!isUnique(error)) throw error;
    }
  }

  async getRunEvidence(jobRunId: string): Promise<RunEvidence> {
    const run = await this.loadRun(jobRunId);
    const transitions = await this.db.runStateEvent.findMany({
      where: { jobRunId },
      orderBy: { createdAt: 'asc' }
    });
    const routing = await this.db.runRoutingSnapshot.findUnique({ where: { jobRunId } });
    const steps = await this.db.stepRun.findMany({ where: { jobRunId }, orderBy: { name: 'asc' } });
    return {
      jobRunId,
      projectId: run.projectId,
      status: run.status,
      workflowRunId: run.workflowRunId,
      transitions: transitions.map((event) => ({
        fromState: event.fromState,
        toState: event.toState,
        source: event.source,
        scope: event.scope,
        createdAt: event.createdAt.toISOString()
      })),
      routing: routing
        ? {
            agentDefinitionId: routing.agentDefinitionId,
            agentConfigVersionId: routing.agentConfigVersionId,
            agentConfigChecksum: routing.agentConfigChecksum,
            capabilityKey: routing.capabilityKey,
            providerId: routing.providerId,
            modelId: routing.modelId,
            providerKey: routing.providerKey,
            modelKey: routing.modelKey,
            fallbackModelId: routing.fallbackModelId,
            policy: parseOutput(routing.policy) ?? {},
            decisionId: routing.decisionId,
            estimatedCents: routing.estimatedCents,
            actualCents: routing.actualCents,
            usedFallback: Boolean(routing.fallbackModelId)
          }
        : null,
      stepOutputs: Object.fromEntries(steps.map((step) => [step.name, parseOutput(step.output)]))
    };
  }
}