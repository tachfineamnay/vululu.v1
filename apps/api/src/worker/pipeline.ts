/* eslint-disable @typescript-eslint/no-explicit-any -- contexte SDK Hatchet confine au worker */
import { HatchetClient, NonRetryableError } from '@hatchet-dev/typescript-sdk/v1';
import { DurableProductionUseCases } from '@vululu/application';
import { logEvent } from '../observability/logger';
import {
  DurableRoutingService,
  LocalStoragePort,
  MediaRendererAdapter,
  PostizMockAdapter,
  PrismaAuditAdapter,
  PrismaDurableProductionStore,
  PrismaProductionRepository,
  PrismaArtifactPublisher,
  createArtifactStorage
} from '../infrastructure';

export type ProductionWorkflowInput = {
  outboxId: string;
  jobRunId: string;
  projectId: string;
  type: 'produce' | 'correction' | string;
  traceId?: string | null;
  requestId?: string | null;
};

const store = new PrismaDurableProductionStore();
const storage = new LocalStoragePort();
const media = new MediaRendererAdapter();
const master = new PrismaProductionRepository();
const audit = new PrismaAuditAdapter();
const clock = { now: () => new Date() };
const routing = new DurableRoutingService();
const artifactStorage = createArtifactStorage();
const publisher = new PrismaArtifactPublisher(artifactStorage);
const useCases = new DurableProductionUseCases(
  store,
  media,
  storage,
  routing,
  master,
  new PostizMockAdapter(),
  audit,
  clock,
  storage.artifactRoot,
  Number(process.env.DURABLE_SCENE_DELAY_MS ?? 0),
  Number(process.env.DURABLE_BUDGET_CENTS ?? 100),
  publisher
);

const hatchet: any = HatchetClient.init({
  token: process.env.HATCHET_CLIENT_TOKEN,
  host_port: process.env.HATCHET_CLIENT_HOST_PORT ?? '127.0.0.1:7077',
  api_url: process.env.HATCHET_CLIENT_API_URL ?? 'http://127.0.0.1:28243',
  tls_config: {
    tls_strategy:
      (process.env.HATCHET_CLIENT_TLS_STRATEGY as 'tls' | 'mtls' | 'none' | undefined) ?? 'none'
  },
  log_level: 'INFO'
});

export const productionWorkflow = hatchet.workflow({
  name: 'vululu-production-pipeline',
  idempotency: {
    expression: 'input.outboxId',
    strategy: 'status',
    fallbackTtlMs: 7 * 24 * 60 * 60 * 1000
  }
});

const validateSnapshot = productionWorkflow.task({
  name: 'validate-snapshot',
  retries: 2,
  backoff: { factor: 2, maxSeconds: 10 },
  fn: async (input: ProductionWorkflowInput) => {
    const startedAt = Date.now();
    logEvent('info', 'worker.step.started', { step: 'validate-snapshot', jobRunId: input.jobRunId, traceId: input.traceId ?? null });
    try {
      const result = await useCases.validateSnapshot(input.jobRunId);
      logEvent('info', 'worker.step.completed', { step: 'validate-snapshot', jobRunId: input.jobRunId, traceId: input.traceId ?? null, durationMs: Date.now() - startedAt });
      return result;
    } catch (error) {
      logEvent('error', 'worker.step.failed', { step: 'validate-snapshot', jobRunId: input.jobRunId, traceId: input.traceId ?? null, durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : 'unknown' });
      throw error;
    }
  }
});

const resolveCapabilities = productionWorkflow.task({
  name: 'resolve-capabilities',
  parents: [validateSnapshot],
  retries: 2,
  backoff: { factor: 2, maxSeconds: 10 },
  fn: async (input: ProductionWorkflowInput) => {
    const startedAt = Date.now();
    logEvent('info', 'worker.step.started', { step: 'resolve-capabilities', jobRunId: input.jobRunId, traceId: input.traceId ?? null });
    try {
      const result = await useCases.resolveCapabilities(input.jobRunId);
      logEvent('info', 'worker.step.completed', { step: 'resolve-capabilities', jobRunId: input.jobRunId, traceId: input.traceId ?? null, durationMs: Date.now() - startedAt });
      return result;
    } catch (error) {
      logEvent('error', 'worker.step.failed', { step: 'resolve-capabilities', jobRunId: input.jobRunId, traceId: input.traceId ?? null, durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : 'unknown' });
      throw error;
    }
  }
});

const renderScenes = productionWorkflow.task({
  name: 'render-scenes',
  parents: [resolveCapabilities],
  retries: 2,
  backoff: { factor: 2, maxSeconds: 10 },
  executionTimeout: process.env.DURABLE_RENDER_TIMEOUT ?? '20m',
  fn: async (input: ProductionWorkflowInput) => {
    const startedAt = Date.now();
    logEvent('info', 'worker.step.started', { step: 'render-scenes', jobRunId: input.jobRunId, traceId: input.traceId ?? null });
    try {
      const result = await useCases.renderScenes(input.jobRunId);
      logEvent('info', 'worker.step.completed', { step: 'render-scenes', jobRunId: input.jobRunId, traceId: input.traceId ?? null, durationMs: Date.now() - startedAt });
      return result;
    } catch (error) {
      logEvent('error', 'worker.step.failed', { step: 'render-scenes', jobRunId: input.jobRunId, traceId: input.traceId ?? null, durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : 'unknown' });
      throw error;
    }
  }
});

const assembleMaster = productionWorkflow.task({
  name: 'assemble-master',
  parents: [renderScenes],
  retries: 2,
  backoff: { factor: 2, maxSeconds: 10 },
  executionTimeout: '10m',
  fn: async (input: ProductionWorkflowInput) => {
    const startedAt = Date.now();
    logEvent('info', 'worker.step.started', { step: 'assemble-master', jobRunId: input.jobRunId, traceId: input.traceId ?? null });
    try {
      const result = await useCases.assembleMaster(input.jobRunId);
      logEvent('info', 'worker.step.completed', { step: 'assemble-master', jobRunId: input.jobRunId, traceId: input.traceId ?? null, durationMs: Date.now() - startedAt });
      return result;
    } catch (error) {
      logEvent('error', 'worker.step.failed', { step: 'assemble-master', jobRunId: input.jobRunId, traceId: input.traceId ?? null, durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : 'unknown' });
      throw error;
    }
  }
});

const runQa = productionWorkflow.task({
  name: 'qa',
  parents: [assembleMaster],
  retries: 1,
  fn: async (input: ProductionWorkflowInput) => {
    const startedAt = Date.now();
    logEvent('info', 'worker.step.started', { step: 'qa', jobRunId: input.jobRunId, traceId: input.traceId ?? null });
    try {
      const result = await useCases.runQa(input.jobRunId);
      logEvent('info', 'worker.step.completed', { step: 'qa', jobRunId: input.jobRunId, traceId: input.traceId ?? null, durationMs: Date.now() - startedAt });
      return result;
    } catch (error) {
      logEvent('error', 'worker.step.failed', { step: 'qa', jobRunId: input.jobRunId, traceId: input.traceId ?? null, durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : 'unknown' });
      throw error;
    }
  }
});

const finalize = productionWorkflow.task({
  name: 'finalize',
  parents: [runQa],
  retries: 1,
  fn: async (input: ProductionWorkflowInput) => {
    const startedAt = Date.now();
    logEvent('info', 'worker.step.started', { step: 'finalize', jobRunId: input.jobRunId, traceId: input.traceId ?? null });
    try {
      const result = await useCases.finalize(input.jobRunId);
      logEvent('info', 'worker.step.completed', { step: 'finalize', jobRunId: input.jobRunId, traceId: input.traceId ?? null, durationMs: Date.now() - startedAt });
      return result;
    } catch (error) {
      logEvent('error', 'worker.step.failed', { step: 'finalize', jobRunId: input.jobRunId, traceId: input.traceId ?? null, durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : 'unknown' });
      throw error;
    }
  }
});

const approval = productionWorkflow.durableTask({
  name: 'approval',
  parents: [finalize],
  executionTimeout: '30m',
  retries: 0,
  fn: async (input: ProductionWorkflowInput, ctx: any) => {
    logEvent('info', 'worker.approval.waiting', { jobRunId: input.jobRunId, traceId: input.traceId ?? null });
    const granted = await useCases.findGrantedApproval(input.jobRunId);
    if (granted) {
      return useCases.confirmApproval(granted);
    }
    const event = await ctx.waitForEvent(
      'production-approval:' + input.jobRunId,
      undefined,
      undefined,
      undefined,
      '24h'
    );
    if (!event || typeof event !== 'object') {
      throw new NonRetryableError('approval_event_missing');
    }
    const value = event as Record<string, unknown>;
    if (
      typeof value.artifactVersionId !== 'string' ||
      typeof value.checksum !== 'string' ||
      typeof value.approvedBy !== 'string'
    ) {
      throw new NonRetryableError('approval_event_invalid');
    }
    return useCases.confirmApproval({
      jobRunId: input.jobRunId,
      artifactVersionId: value.artifactVersionId,
      checksum: value.checksum,
      approvedBy: value.approvedBy
    });
  }
});

export const transferTask = productionWorkflow.task({
  name: 'transfer',
  parents: [approval],
  retries: 2,
  backoff: { factor: 2, maxSeconds: 10 },
  fn: async (input: ProductionWorkflowInput) => {
    const startedAt = Date.now();
    logEvent('info', 'worker.step.started', { step: 'transfer', jobRunId: input.jobRunId, traceId: input.traceId ?? null });
    try {
      const result = await useCases.transfer(input.jobRunId);
      logEvent('info', 'worker.step.completed', { step: 'transfer', jobRunId: input.jobRunId, traceId: input.traceId ?? null, durationMs: Date.now() - startedAt });
      return result;
    } catch (error) {
      logEvent('error', 'worker.step.failed', { step: 'transfer', jobRunId: input.jobRunId, traceId: input.traceId ?? null, durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : 'unknown' });
      throw error;
    }
  }
});

productionWorkflow.onFailure({
  name: 'on-failure',
  fn: async (input: ProductionWorkflowInput, ctx: any) => {
    const errors = ctx.errors?.() ?? {};
    const text = JSON.stringify(errors);
    const state = /timeout|timed out|exceeded timeout/i.test(text) ? 'timed_out' : 'failed';
    await useCases.fail(input.jobRunId, text.slice(0, 2000), state as 'failed' | 'timed_out');
    return { status: state };
  }
});

export const durableWorkerWorkflow = productionWorkflow;
export { hatchet, useCases };