/* eslint-disable @typescript-eslint/no-explicit-any -- POC Hatchet isole, types SDK volontairement souples */
import { HatchetClient, NonRetryableError } from '@hatchet-dev/typescript-sdk/v1';
import { routeCapability } from '../../../packages/domain/src/index';
import {
  approve,
  beginRun,
  costOnce,
  effectOnce,
  effectCount,
  getApproval,
  setApprovalPending,
  setRunStatus,
  sha256,
  step,
  type PipelineInput,
  type RouteView
} from './ledger';

// POC: aucune dependance a Prisma/Fastify. Le client lit HATCHET_CLIENT_*.
const hatchet: any = HatchetClient.init();

const models = [
  {
    id: 'model-primary',
    providerId: 'provider-a',
    providerKey: 'mock-a',
    modelKey: 'mock-a-primary',
    capabilityKeys: ['scene.generate'],
    quality: 90,
    latencyMs: 20,
    costCentsPerUnit: 5,
    license: 'internal' as const,
    active: true,
    qualified: true
  },
  {
    id: 'model-fallback',
    providerId: 'provider-b',
    providerKey: 'mock-b',
    modelKey: 'mock-b-fallback',
    capabilityKeys: ['scene.generate'],
    quality: 70,
    latencyMs: 30,
    costCentsPerUnit: 2,
    license: 'internal' as const,
    active: true,
    qualified: true
  }
];

export const pipeline = hatchet.workflow({ name: 'vululu-poc-pipeline' });

const prepare = pipeline.task({
  name: 'prepare',
  fn: async (input: PipelineInput) => {
    const snapshot = await beginRun(input);
    return { snapshot, checksum: sha256(JSON.stringify(snapshot)) };
  }
});

const route = pipeline.task({
  name: 'route',
  parents: [prepare],
  fn: async (input: PipelineInput): Promise<RouteView> => {
    let decision: any;
    try {
      decision = routeCapability({
        models,
        requirement: {
          capabilityKey: 'scene.generate',
          allowedLicenses: ['internal']
        },
        budgetCents: input.budgetCents ?? 10,
        decidedAt: new Date().toISOString()
      });
    } catch (error) {
      if (error instanceof Error && /budget|No eligible/i.test(error.message)) {
        throw new NonRetryableError('budget_insufficient');
      }
      throw error;
    }
    const selected = models.find((model) => model.id === decision.selectedModelId)!;
    const view: RouteView = {
      selectedModelId: selected.id,
      fallbackModelId: decision.fallbackModelId,
      provider: selected.providerKey,
      model: selected.modelKey,
      estimatedCents: selected.costCentsPerUnit,
      decision
    };
    await effectOnce('route:' + input.runId, 'route_decision', view as unknown as Record<string, unknown>);
    await step(input.runId, 'route', 'succeeded', 1, view);
    return view;
  }
});

const generate = pipeline.task({
  name: 'generate',
  parents: [route],
  retries: 2,
  backoff: { factor: 2, maxSeconds: 2 },
  executionTimeout: '20m',
  fn: async (input: PipelineInput, ctx: any) => {
    const attempt = ctx.retryCount();
    if (input.failMode === 'permanent') {
      throw new NonRetryableError('permanent_generation_failure');
    }
    if (input.failMode === 'transient' && attempt === 0) {
      throw new Error('transient_generation_failure');
    }
    const routeOutput = (await ctx.parentOutput(route)) as RouteView;
    const scenes: Array<{ sceneKey: string; checksum: string; version: number }> = [];
    for (let ordinal = 1; ordinal <= 5; ordinal += 1) {
      const sceneKey = 'SCENE-' + String(ordinal).padStart(3, '0');
      const checksum = sha256(input.runId + ':' + sceneKey + ':' + routeOutput.selectedModelId);
      const result = await effectOnce('scene:' + input.runId + ':' + sceneKey, 'scene', {
        sceneKey,
        version: 1,
        checksum,
        provider: routeOutput.provider,
        model: routeOutput.model
      });
      scenes.push({ sceneKey, checksum, version: 1 });
      if (input.crashAfterEffect && ordinal === 1 && result.created) {
        ctx.logger.info('POC_CRASH_WINDOW: effet scene 1 persiste, attente kill worker');
        await new Promise((resolve) => setTimeout(resolve, 120000));
      }
      if (input.failMode === 'transient' && ordinal === 2 && attempt === 1) {
        throw new Error('transient_after_effect_should_not_duplicate');
      }
    }
    const output = { scenes, provider: routeOutput.provider, model: routeOutput.model };
    await step(input.runId, 'generate', 'succeeded', attempt + 1, output);
    return output;
  }
});

const validate = pipeline.task({
  name: 'validate',
  parents: [generate],
  fn: async (input: PipelineInput, ctx: any) => {
    const generated = await ctx.parentOutput(generate);
    const count = await effectCount(input.runId, 'scene:' + input.runId + ':');
    if (count !== 5) {
      throw new NonRetryableError('scene_effect_count_invalid:' + count);
    }
    const checksums = (generated.scenes as Array<{ checksum: string }>).map((scene) => scene.checksum);
    const checksum = sha256(checksums.join(':'));
    await step(input.runId, 'validate', 'succeeded', 1, { checksums, checksum, effectCount: count });
    return { checksums, checksum, effectCount: count };
  }
});

const finalize = pipeline.task({
  name: 'finalize',
  parents: [validate],
  fn: async (input: PipelineInput, ctx: any) => {
    const validation = await ctx.parentOutput(validate);
    const result = await effectOnce('finalize:' + input.runId, 'finalize', {
      checksum: validation.checksum,
      scenes: validation.checksums
    });
    await setRunStatus(input.runId, 'waiting_approval');
    await step(input.runId, 'finalize', 'succeeded', 1, result.payload);
    return { checksum: validation.checksum, idempotent: !result.created };
  }
});

const approval = pipeline.durableTask({
  name: 'approval',
  parents: [finalize],
  executionTimeout: '10m',
  fn: async (input: PipelineInput, ctx: any) => {
    const finalized = await ctx.parentOutput(finalize);
    const checksum = finalized.checksum as string;
    await setApprovalPending(input.runId, checksum);
    await step(input.runId, 'approval', 'waiting', 1, { checksum });
    const event = await ctx.waitForEvent('poc-approval-' + input.runId);
    if (!event || event.approved !== true || event.checksum !== checksum) {
      throw new NonRetryableError('approval_rejected');
    }
    const applied = await approve(input.runId, checksum);
    if (!applied) {
      throw new NonRetryableError('approval_not_applicable');
    }
    await step(input.runId, 'approval', 'succeeded', 1, { checksum });
    return { approved: true, checksum };
  }
});

const transfer = pipeline.task({
  name: 'transfer',
  parents: [approval],
  fn: async (input: PipelineInput, ctx: any) => {
    const approvalOutput = await ctx.parentOutput(approval);
    const current = await getApproval(input.runId);
    if (!current || current.status !== 'approved' || current.checksum !== approvalOutput.checksum) {
      throw new NonRetryableError('approval_state_invalid');
    }
    await effectOnce('transfer:' + input.runId, 'postiz_mock_transfer', {
      approvalChecksum: approvalOutput.checksum,
      status: 'acknowledged',
      mock: true
    });
    await costOnce('cost:' + input.runId + ':transfer', 'mock-postiz', 1, 1);
    await setRunStatus(input.runId, 'succeeded');
    await step(input.runId, 'transfer', 'succeeded', 1, { status: 'acknowledged' });
    return { status: 'acknowledged', checksum: approvalOutput.checksum };
  }
});

pipeline.onFailure({
  name: 'on-failure',
  fn: async (input: PipelineInput, ctx: any) => {
    const errors = ctx.errors?.() ?? {};
    await setRunStatus(input.runId, 'failed');
    await step(input.runId, 'failure', 'failed', 1, { errors });
    return { status: 'failed', errors };
  }
});

const timeoutWorkflow = hatchet.workflow({ name: 'vululu-poc-timeout' });
const timeoutTask = timeoutWorkflow.task({
  name: 'timeout-step',
  executionTimeout: '2s',
  fn: async () => {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    return { status: 'should_not_complete' };
  }
});

export const workflows = [pipeline, timeoutWorkflow];
export const tasks = { prepare, route, generate, validate, finalize, approval, transfer };
export { hatchet, timeoutTask, timeoutWorkflow };
export type { PipelineInput } from './ledger';