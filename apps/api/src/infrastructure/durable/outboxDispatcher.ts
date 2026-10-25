import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '@vululu/db';
import type { DurableOrchestratorPort } from '@vululu/application';
import { logEvent } from '../../observability/logger';

type OutboxRow = {
  id: string;
  idempotencyKey: string;
  jobRunId: string | null;
  kind: string;
  payload: unknown;
  status: string;
  attempts: number;
  nextAttemptAt: Date;
};

const MAX_ATTEMPTS = 10;

/**
 * Transactional Outbox -> dispatcher idempotent -> Hatchet.
 *
 * - le JobRun et l ordre de demarrage sont crees dans la meme transaction ;
 * - le dispatcher peut etre rejoue sans creer deux runs (cle stable outboxId) ;
 * - un echec Hatchet laisse le message pending avec backoff, jamais un run
 *   silencieusement abandonne.
 */
export class OutboxDispatcher {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly orchestrator: DurableOrchestratorPort,
    private readonly db: PrismaClient = prisma
  ) {}

  async dispatchRun(jobRunId: string): Promise<void> {
    const row = await this.db.orchestrationOutbox.findFirst({
      where: { jobRunId, kind: 'start_run', status: { in: ['pending', 'failed'] } },
      orderBy: { createdAt: 'asc' }
    });
    if (!row) return;
    const claimed = await this.claim(row.id);
    if (claimed) await this.dispatch(claimed);
  }

  async dispatchPending(limit = 20): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const rows = await this.db.orchestrationOutbox.findMany({
        where: { status: 'pending', nextAttemptAt: { lte: new Date() } },
        orderBy: { nextAttemptAt: 'asc' },
        take: limit
      });
      let handled = 0;
      for (const row of rows) {
        const claimed = await this.claim(row.id);
        if (!claimed) continue;
        await this.dispatch(claimed as OutboxRow);
        handled += 1;
      }
      return handled;
    } finally {
      this.running = false;
    }
  }

  private async claim(id: string): Promise<OutboxRow | null> {
    const updated = await this.db.orchestrationOutbox.updateMany({
      where: { id, status: 'pending' },
      data: { status: 'dispatching' }
    });
    if (updated.count !== 1) return null;
    return (await this.db.orchestrationOutbox.findUnique({ where: { id } })) as OutboxRow | null;
  }

  private async dispatch(row: OutboxRow): Promise<void> {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    try {
      if (row.kind === 'start_run') {
        if (!row.jobRunId) throw new Error('outbox_job_run_absent');
        const jobRun = await this.db.jobRun.findUnique({
          where: { id: row.jobRunId },
          select: { traceId: true, requestId: true }
        });
        const result = await this.orchestrator.submitStart({
          outboxId: row.id,
          jobRunId: row.jobRunId,
          projectId: String(payload.projectId ?? ''),
          type: String(payload.type ?? 'produce'),
          traceId: jobRun?.traceId ?? (payload.traceId as string | null | undefined) ?? null,
          requestId: jobRun?.requestId ?? (payload.requestId as string | null | undefined) ?? null
        });
        logEvent('info', 'outbox.dispatched', {
          outboxId: row.id,
          jobRunId: row.jobRunId,
          workflowRunId: result.workflowRunId,
          traceId: jobRun?.traceId ?? null,
          requestId: jobRun?.requestId ?? null
        });
        await this.db.$transaction([
          this.db.orchestrationOutbox.update({
            where: { id: row.id },
            data: {
              status: 'dispatched',
              workflowRunId: result.workflowRunId,
              dispatchedAt: new Date(),
              lastError: null,
              attempts: { increment: 1 }
            }
          }),
          this.db.jobRun.update({
            where: { id: row.jobRunId },
            data: { workflowRunId: result.workflowRunId, orchestrator: 'hatchet' }
          })
        ]);
        return;
      }
      if (row.kind === 'approval_signal') {
        const projectId = String(payload.projectId ?? '');
        const approvalStatuses = ['waiting_approval', 'running', 'queued', 'recovery_pending'];
        const jobRun = row.jobRunId
          ? await this.db.jobRun.findFirst({
              where: {
                id: row.jobRunId,
                projectId,
                status: { in: approvalStatuses }
              }
            })
          : await this.db.jobRun.findFirst({
              where: {
                projectId,
                status: { in: approvalStatuses }
              },
              orderBy: { createdAt: 'desc' }
            });
        if (!jobRun) throw new Error('approval_job_run_absent');
        await this.orchestrator.signalApproval({
          jobRunId: jobRun.id,
          projectId,
          artifactVersionId: String(payload.artifactVersionId ?? ''),
          checksum: String(payload.checksum ?? ''),
          approvedBy: String(payload.approvedBy ?? '')
        });
        await this.db.orchestrationOutbox.update({
          where: { id: row.id },
          data: {
            status: 'dispatched',
            workflowRunId: jobRun.workflowRunId,
            dispatchedAt: new Date(),
            lastError: null,
            attempts: { increment: 1 }
          }
        });
        return;
      }
      throw new Error('outbox_kind_inconnu:' + row.kind);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'dispatch_failed';
      logEvent('error', 'outbox.dispatch_failed', {
        outboxId: row.id,
        jobRunId: row.jobRunId,
        attempts: row.attempts + 1,
        error: message
      });
      const attempts = row.attempts + 1;
      const terminal = attempts >= MAX_ATTEMPTS;
      await this.db.orchestrationOutbox.update({
        where: { id: row.id },
        data: {
          status: terminal ? 'failed' : 'pending',
          attempts,
          lastError: message,
          nextAttemptAt: new Date(Date.now() + Math.min(60_000, 1000 * 2 ** Math.min(attempts, 6)))
        }
      });
      await this.db.auditEvent.create({
        data: {
          actorId: null,
          action: terminal ? 'orchestration.dispatch_failed' : 'orchestration.dispatch_retry',
          targetType: 'orchestration_outbox',
          targetId: row.id,
          metadata: { jobRunId: row.jobRunId, attempts, error: message }
        }
      });
    }
  }

  start(intervalMs = 2000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.dispatchPending().catch(() => undefined);
    }, intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Marque les claims orphelins apres un crash du processus API. */
  async recoverStaleClaims(olderThanMs = 5 * 60_000): Promise<number> {
    const result = await this.db.orchestrationOutbox.updateMany({
      where: { status: 'dispatching', updatedAt: { lt: new Date(Date.now() - olderThanMs) } },
      data: { status: 'pending' }
    });
    return result.count;
  }

  /**
   * Repare la fenetre crash entre l ecriture de l approbation metier et la
   * creation de son message outbox. Aucun signal n est perdu silencieusement.
   */
  async reconcileApprovals(limit = 20): Promise<number> {
    const runs = await this.db.jobRun.findMany({
      where: { status: 'waiting_approval' },
      orderBy: { createdAt: 'desc' },
      take: limit
    });
    let created = 0;
    for (const run of runs) {
      const finalize = await this.db.stepRun.findUnique({
        where: { jobRunId_name: { jobRunId: run.id, name: 'finalize' } }
      });
      const output = (finalize?.output ?? null) as { artifactVersionId?: string; checksum?: string } | null;
      if (!output?.artifactVersionId || !output?.checksum) continue;
      const approval = await this.db.approval.findUnique({
        where: { artifactVersionId: output.artifactVersionId }
      });
      if (!approval || approval.invalidatedAt) continue;
      try {
        await this.db.orchestrationOutbox.create({
          data: {
            idempotencyKey: 'approval:' + output.artifactVersionId + ':' + output.checksum,
            jobRunId: run.id,
            kind: 'approval_signal',
            payload: {
              projectId: run.projectId,
              artifactVersionId: output.artifactVersionId,
              checksum: output.checksum,
              approvedBy: approval.approvedBy
            },
            status: 'pending'
          }
        });
        created += 1;
      } catch (error) {
        const code = typeof error === 'object' && error !== null && 'code' in error ? (error as { code?: string }).code : undefined;
        if (code !== 'P2002') throw error;
      }
    }
    return created;
  }

  /** Diagnostic de reconciliation expose aux operations. */
  async pendingCount(): Promise<number> {
    return this.db.orchestrationOutbox.count({ where: { status: { in: ['pending', 'failed'] } } });
  }

  newTraceId(): string {
    return crypto.randomUUID();
  }
}