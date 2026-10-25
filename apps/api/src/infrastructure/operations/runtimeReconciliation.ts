import type { PrismaClient } from '@prisma/client';
import { prisma } from '@vululu/db';
import type { OutboxDispatcher } from '../durable/outboxDispatcher';

export type RuntimeReconciliationReport = {
  generatedAt: string;
  dryRun: boolean;
  workers: { active: number; stale: number; staleThresholdSeconds: number };
  outbox: { pending: number; dispatching: number; failed: number; stalePending: number; staleDispatching: number };
  jobRuns: { queuedWithoutWorkflow: number; runningStale: number; waitingApproval: number; terminalMismatch: number };
  steps: { runningOverdue: number };
  artifacts: { stagedOverdue: number };
  actions: Array<{ kind: string; id: string; applied: boolean; detail: string }>;
  incidents: Array<{ classification: string; id: string; detail: string; requiresHuman: boolean }>;
  note: string;
  dispatcherAttached: boolean;
};

/**
 * Reconciliation read-only par defaut. Les seules actions automatiques sont
 * la recuperation de claims outbox orphelins et la reconciliation des signaux
 * d approbation. Aucune seconde production n est creee.
 */
export class RuntimeReconciliationService {
  constructor(
    private readonly db: PrismaClient = prisma,
    private readonly dispatcher?: Pick<OutboxDispatcher, 'recoverStaleClaims' | 'reconcileApprovals'>
  ) {}

  async report(input: { dryRun?: boolean; staleSeconds?: number; stagedGraceHours?: number } = {}): Promise<RuntimeReconciliationReport> {
    const dryRun = input.dryRun !== false;
    const staleSeconds = input.staleSeconds ?? 300;
    const now = Date.now();
    const staleBefore = new Date(now - staleSeconds * 1000);
    const workerBefore = new Date(now - 30_000);
    const stepBefore = new Date(now - 30 * 60_000);
    const stagedBefore = new Date(now - (input.stagedGraceHours ?? 24) * 3600_000);

    const workers = await this.db.workerHeartbeat.findMany({ orderBy: { lastSeenAt: 'desc' } });
    const activeWorkers = workers.filter((worker) => worker.lastSeenAt >= workerBefore).length;
    const outbox = await this.db.orchestrationOutbox.groupBy({ by: ['status'], _count: { _all: true } });
    const byStatus = (status: string) => outbox.find((row) => row.status === status)?._count._all ?? 0;
    const stalePending = await this.db.orchestrationOutbox.count({
      where: { status: { in: ['pending', 'failed'] }, updatedAt: { lt: staleBefore } }
    });
    const staleDispatching = await this.db.orchestrationOutbox.count({
      where: { status: 'dispatching', updatedAt: { lt: staleBefore } }
    });
    const queuedWithoutWorkflow = await this.db.jobRun.count({
      where: { status: 'queued', workflowRunId: null, createdAt: { lt: staleBefore } }
    });
    const runningStale = await this.db.jobRun.count({
      where: { status: 'running', updatedAt: { lt: staleBefore } }
    });
    const waitingApproval = await this.db.jobRun.count({ where: { status: 'waiting_approval' } });
    const terminalMismatch = await this.db.jobRun.count({
      where: { status: { in: ['succeeded', 'failed', 'cancelled', 'timed_out'] }, workflowRunId: null }
    });
    const runningOverdue = await this.db.stepRun.count({
      where: { status: 'running', startedAt: { lt: stepBefore } }
    });
    const stagedOverdue = await this.db.artifactObject.count({
      where: { state: 'staged', updatedAt: { lt: stagedBefore } }
    });
    const actions: RuntimeReconciliationReport['actions'] = [];
    if (!dryRun && this.dispatcher) {
      const recovered = await this.dispatcher.recoverStaleClaims(0);
      actions.push({ kind: 'outbox_recover_claims', id: 'global', applied: true, detail: 'recovered=' + recovered });
      const approvals = await this.dispatcher.reconcileApprovals();
      actions.push({ kind: 'outbox_reconcile_approvals', id: 'global', applied: true, detail: 'created=' + approvals });
    }
    const incidents: RuntimeReconciliationReport['incidents'] = [];
    for (const worker of workers) {
      if (worker.lastSeenAt < workerBefore) {
        incidents.push({ classification: 'worker_absent', id: worker.id, detail: 'lastSeen=' + worker.lastSeenAt.toISOString(), requiresHuman: true });
      }
    }
    if (stalePending > 0) incidents.push({ classification: 'outbox_stale_pending', id: 'global', detail: String(stalePending), requiresHuman: true });
    if (staleDispatching > 0) incidents.push({ classification: 'outbox_stale_dispatching', id: 'global', detail: String(staleDispatching), requiresHuman: false });
    if (queuedWithoutWorkflow > 0) incidents.push({ classification: 'job_queued_without_workflow', id: 'global', detail: String(queuedWithoutWorkflow), requiresHuman: true });
    if (runningStale > 0) incidents.push({ classification: 'job_running_stale', id: 'global', detail: String(runningStale), requiresHuman: true });
    if (runningOverdue > 0) incidents.push({ classification: 'step_running_overdue', id: 'global', detail: String(runningOverdue), requiresHuman: true });
    if (stagedOverdue > 0) incidents.push({ classification: 'artifact_staged_overdue', id: 'global', detail: String(stagedOverdue), requiresHuman: true });
    return {
      generatedAt: new Date().toISOString(),
      dryRun,
      workers: { active: activeWorkers, stale: workers.length - activeWorkers, staleThresholdSeconds: 30 },
      outbox: { pending: byStatus('pending'), dispatching: byStatus('dispatching'), failed: byStatus('failed'), stalePending, staleDispatching },
      jobRuns: { queuedWithoutWorkflow, runningStale, waitingApproval, terminalMismatch },
      steps: { runningOverdue },
      artifacts: { stagedOverdue },
      actions,
      incidents,
      note: 'Une approbation en attente n est pas un run bloque. Aucune production n est relancee automatiquement.',
      dispatcherAttached: Boolean(this.dispatcher)
    };
  }
}
