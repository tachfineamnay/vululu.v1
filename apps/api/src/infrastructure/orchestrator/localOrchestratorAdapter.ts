import type { PrismaClient } from '@prisma/client';
import { prisma } from '@vululu/db';
import type { JobRunRecord, OrchestratorPort } from '@vululu/application';
import { toJobRunRecord, toJsonInput } from '../prisma/mappers';

/**
 * Etapes par defaut creees avec chaque run.
 *
 * Le port OrchestratorPort ne definit pas encore de catalogue d'etapes ;
 * cet adaptateur cree un ledger minimal, remplacable par le catalogue
 * applicatif/ Hatchet lors de V1-02.
 */
export const LOCAL_ORCHESTRATOR_DEFAULT_STEPS = [
  'prepare',
  'render-scenes',
  'assemble-master',
  'run-qa'
] as const;

export type LocalOrchestratorOptions = {
  /** Client Prisma injecte (tests sur base isolee). Par defaut : client @vululu/db. */
  database?: PrismaClient;
  /** Etapes du ledger JobRun/StepRun. Par defaut : pipeline de production locale. */
  steps?: readonly string[];
};

/**
 * Orchestrateur LOCAL, EXPLICITEMENT IN-PROCESS ET NON DURABLE.
 *
 * - enqueue cree un JobRun (status queued) et ses StepRun (status pending) ;
 * - markRunning / markSucceeded / markFailed mettent a jour JobRun et closent
 *   les StepRun a l'etat terminal ;
 * - aucune reprise apres crash, aucun retry, aucune file externe : ce n'est PAS
 *   Hatchet et cela ne doit pas etre presente comme une orchestration durable.
 *
 * Objectif : etape intermediaire de V1-00 derriere OrchestratorPort, en
 * attendant l'adaptateur Hatchet (ADR-0003).
 */
export class LocalOrchestratorAdapter implements OrchestratorPort {
  private readonly db: PrismaClient;
  private readonly steps: readonly string[];

  constructor(options: LocalOrchestratorOptions = {}) {
    this.db = options.database ?? prisma;
    this.steps =
      options.steps && options.steps.length > 0
        ? options.steps
        : LOCAL_ORCHESTRATOR_DEFAULT_STEPS;
  }

  async enqueue(input: {
    projectId: string;
    type: string;
    snapshot: Record<string, unknown>;
  }): Promise<JobRunRecord> {
    const row = await this.db.jobRun.create({
      data: {
        projectId: input.projectId,
        type: input.type,
        status: 'queued',
        snapshot: toJsonInput(input.snapshot),
        steps: {
          create: this.steps.map((name) => ({ name, status: 'pending' }))
        }
      }
    });
    return toJobRunRecord(row);
  }

  async markRunning(jobRunId: string): Promise<void> {
    await this.requireJobRun(jobRunId);
    await this.db.jobRun.update({ where: { id: jobRunId }, data: { status: 'running' } });
  }

  async markSucceeded(jobRunId: string): Promise<void> {
    await this.requireJobRun(jobRunId);
    await this.db.$transaction([
      this.db.jobRun.update({ where: { id: jobRunId }, data: { status: 'succeeded' } }),
      this.db.stepRun.updateMany({
        where: { jobRunId, status: { in: ['pending', 'running'] } },
        data: { status: 'succeeded', finishedAt: new Date() }
      })
    ]);
  }

  async markFailed(jobRunId: string, error: string): Promise<void> {
    await this.requireJobRun(jobRunId);
    await this.db.$transaction([
      this.db.jobRun.update({ where: { id: jobRunId }, data: { status: 'failed' } }),
      this.db.stepRun.updateMany({
        where: { jobRunId, status: { in: ['pending', 'running'] } },
        data: { status: 'failed', error, finishedAt: new Date() }
      })
    ]);
  }

  private async requireJobRun(jobRunId: string): Promise<void> {
    const existing = await this.db.jobRun.findUnique({
      where: { id: jobRunId },
      select: { id: true }
    });
    if (!existing) {
      throw new Error('job_run_introuvable: ' + jobRunId);
    }
  }
}
