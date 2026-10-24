import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  const testDbUrl = 'postgresql://vululu@127.0.0.1:55432/vululu_v1_00_test?schema=public';
  process.env.V0_TEST_DB = '1';
  process.env.DATABASE_URL_TEST = testDbUrl;
  process.env.DATABASE_URL = testDbUrl;
});

import { prisma } from '@vululu/db';
import type {
  DurableOrchestratorPort,
  DurableRoutingPort,
  MediaRendererPort,
  StoragePort,
  MasterRenderRequest,
  SceneRenderRequest
} from '@vululu/application';
import {
  DurableProductionUseCases,
  DURABLE_PRODUCTION_STEPS
} from '@vululu/application';
import { env } from '../../apps/api/src/env';
import {
  DurableRoutingService,
  OutboxDispatcher,
  PostizMockAdapter,
  PrismaAuditAdapter,
  PrismaDurableProductionStore,
  PrismaProductionRepository,
  PrismaProductionRunRepository
} from '../../apps/api/src/infrastructure';

const TEST_DB_URL = 'postgresql://vululu@127.0.0.1:55432/vululu_v1_00_test?schema=public';
const RUN_ID = 'd-' + Date.now();

function sha(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

class FakeMedia implements MediaRendererPort {
  async renderScene(input: SceneRenderRequest) {
    const checksum = sha('scene:' + input.projectId + ':' + input.sceneKey + ':' + input.version + ':' + (input.instruction ?? ''));
    return {
      relativePath: 'projects/' + input.projectId + '/scenes/' + input.sceneKey + '/v' + input.version + '.png',
      absolutePath: 'C:/fake/' + input.sceneKey + '-v' + input.version + '.png',
      checksum,
      width: 1080,
      height: 1920
    };
  }
  async assembleMaster(input: MasterRenderRequest) {
    const duration = input.sceneDurationsSeconds.reduce((total, value) => total + value, 0);
    return {
      relativePath: 'projects/' + input.projectId + '/master/v' + input.version + '.mp4',
      absolutePath: 'C:/fake/master-v' + input.version + '.mp4',
      checksum: sha('master:' + input.projectId + ':' + input.version),
      duration,
      expectedDurationSeconds: duration,
      videoCodec: 'h264',
      audioCodec: 'aac',
      width: 1080,
      height: 1920
    };
  }
  async runQa() {
    return { status: 'PASS', checks: [{ name: 'fake', status: 'PASS', detail: 'ok' }] };
  }
}

class FakeStorage implements StoragePort {
  resolve(relativePath: string): string {
    return 'C:/fake/' + relativePath;
  }
  exists(): boolean {
    return true;
  }
  readBuffer(): Buffer {
    return Buffer.from('fake');
  }
  checksum(): string {
    return sha('fake');
  }
}

class FakeRouting implements DurableRoutingPort {
  async resolve(input: { jobRunId: string }): Promise<{
    agentDefinitionId: string | null;
    agentConfigVersionId: string | null;
    agentConfigChecksum: string | null;
    capabilityKey: string;
    providerId: string | null;
    modelId: string | null;
    providerKey: string;
    modelKey: string;
    fallbackModelId: string | null;
    policy: Record<string, unknown>;
    decisionId: string | null;
    estimatedCents: number;
    actualCents: number;
    usedFallback: boolean;
  }> {
    return {
      agentDefinitionId: 'agent-d',
      agentConfigVersionId: 'config-d',
      agentConfigChecksum: sha('config'),
      capabilityKey: 'scene.generate',
      providerId: 'provider-d',
      modelId: 'model-d',
      providerKey: 'mock-d',
      modelKey: 'mock-d',
      fallbackModelId: null,
      policy: { mock: true },
      decisionId: 'decision-' + input.jobRunId,
      estimatedCents: 2,
      actualCents: 2,
      usedFallback: false
    };
  }
}

class FakeOrchestrator implements DurableOrchestratorPort {
  fail = true;
  submissions = 0;
  async submitStart(input: { outboxId: string; jobRunId: string }): Promise<{ workflowRunId: string }> {
    this.submissions += 1;
    if (this.fail) throw new Error('hatchet_unreachable');
    return { workflowRunId: 'workflow-' + input.jobRunId };
  }
  async signalApproval(): Promise<void> {}
  async getRunStatus(): Promise<string> {
    return 'RUNNING';
  }
  async getRunEvidence(): Promise<Record<string, unknown>> {
    return {};
  }
  async cancelRun(): Promise<void> {}
  async retryFailedStep(): Promise<void> {}
  async resumeRun(): Promise<void> {}
}

let userId = '';
let projectId = '';

async function createProject(title: string) {
  const context = await prisma.brandContext.create({
    data: {
      userId,
      name: 'Contexte ' + title,
      description: 'Contexte test D',
      colorPrimary: '#6C5CE7',
      colorSecondary: '#00D2FF',
      revisions: {
        create: [{ version: 1, checksum: sha('context:' + title), data: { name: title } }]
      }
    }
  });
  const project = await prisma.project.create({
    data: {
      userId,
      contextId: context.id,
      title,
      platform: 'Instagram',
      format: 'Video',
      objective: 'Test D',
      sceneDurationSeconds: 2,
      status: 'draft',
      brief: {
        create: {
          objective: 'Objectif',
          audience: 'Audience',
          tone: 'Direct',
          cta: 'CTA',
          platform: 'Instagram',
          format: 'Video',
          version: 1,
          revisions: {
            create: [{ version: 1, checksum: sha('brief:' + title), objective: 'Objectif', audience: 'Audience', tone: 'Direct', cta: 'CTA', platform: 'Instagram', format: 'Video' }]
          }
        }
      },
      scenes: {
        create: [
          { sceneKey: 'SCENE-001', position: 1, title: 'Scene 1', description: 'Desc 1', durationSeconds: 2 },
          { sceneKey: 'SCENE-002', position: 2, title: 'Scene 2', description: 'Desc 2', durationSeconds: 2 },
          { sceneKey: 'SCENE-003', position: 3, title: 'Scene 3', description: 'Desc 3', durationSeconds: 2 },
          { sceneKey: 'SCENE-004', position: 4, title: 'Scene 4', description: 'Desc 4', durationSeconds: 2 },
          { sceneKey: 'SCENE-005', position: 5, title: 'Scene 5', description: 'Desc 5', durationSeconds: 2 }
        ]
      }
    },
    include: { scenes: true, brief: true, context: true }
  });
  return project;
}

beforeAll(async () => {
  execSync('pnpm exec prisma migrate deploy --schema packages/db/prisma/schema.prisma', {
    cwd: env.repoRoot,
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: 'pipe'
  });
  const user = await prisma.user.create({
    data: {
      email: 'd-test-' + RUN_ID + '@vululu.local',
      passwordHash: 'hash',
      name: 'D Test',
      role: 'user'
    }
  });
  userId = user.id;
  const project = await createProject('Projet D ' + RUN_ID);
  projectId = project.id;
});

afterAll(async () => {
  try {
    await prisma.user.delete({ where: { id: userId } });
  } catch {
    // cascade best effort
  }
  await prisma.$disconnect();
});

describe('V1-01-D orchestration durable', () => {
  it('cree le JobRun et son outbox dans la meme transaction, puis reconcilie', async () => {
    const runs = new PrismaProductionRunRepository(prisma);
    const { job, jobRun } = await runs.startRun({
      userId,
      projectId,
      type: 'produce',
      targetSceneKey: null,
      instruction: null,
      steps: [...DURABLE_PRODUCTION_STEPS],
      outbox: { kind: 'start_run', payload: { projectId, type: 'produce' } }
    });
    expect(job.status).toBe('queued');
    expect(jobRun.status).toBe('queued');
    const outbox = await prisma.orchestrationOutbox.findUnique({
      where: { idempotencyKey: 'start:' + jobRun.id }
    });
    expect(outbox?.status).toBe('pending');

    const fake = new FakeOrchestrator();
    const dispatcher = new OutboxDispatcher(fake, prisma);
    await dispatcher.dispatchRun(jobRun.id);
    const failed = await prisma.orchestrationOutbox.findUnique({
      where: { idempotencyKey: 'start:' + jobRun.id }
    });
    expect(failed?.status).toBe('pending');
    expect(failed?.attempts).toBe(1);
    expect((await prisma.jobRun.findUnique({ where: { id: jobRun.id } }))?.workflowRunId).toBeNull();

    await prisma.orchestrationOutbox.update({
      where: { id: failed!.id },
      data: { nextAttemptAt: new Date(Date.now() - 1000) }
    });
    fake.fail = false;
    await dispatcher.dispatchRun(jobRun.id);
    const dispatched = await prisma.orchestrationOutbox.findUnique({
      where: { id: failed!.id }
    });
    expect(dispatched?.status).toBe('dispatched');
    expect(dispatched?.workflowRunId).toBe('workflow-' + jobRun.id);
    expect((await prisma.jobRun.findUnique({ where: { id: jobRun.id } }))?.workflowRunId).toBe(
      'workflow-' + jobRun.id
    );
    await prisma.jobRun.update({ where: { id: jobRun.id }, data: { status: 'failed' } });
  });

  it('execute le pipeline applicatif, finalise une version exacte et transfere une seule fois', async () => {
    const store = new PrismaDurableProductionStore(prisma);
    const master = new PrismaProductionRepository(prisma);
    const audit = new PrismaAuditAdapter(prisma);
    const useCases = new DurableProductionUseCases(
      store,
      new FakeMedia(),
      new FakeStorage(),
      new FakeRouting(),
      master,
      new PostizMockAdapter(prisma),
      audit,
      { now: () => new Date('2026-10-24T00:00:00.000Z') },
      'C:/fake',
      0,
      100
    );
    const runs = new PrismaProductionRunRepository(prisma);
    const { jobRun } = await runs.startRun({
      userId,
      projectId,
      type: 'produce',
      targetSceneKey: null,
      instruction: null,
      steps: [...DURABLE_PRODUCTION_STEPS],
      outbox: { kind: 'start_run', payload: { projectId, type: 'produce' } }
    });

    await useCases.validateSnapshot(jobRun.id);
    await useCases.resolveCapabilities(jobRun.id);
    await useCases.renderScenes(jobRun.id);
    await useCases.assembleMaster(jobRun.id);
    await useCases.runQa(jobRun.id);
    const finalized = await useCases.finalize(jobRun.id);
    expect(finalized.artifactVersionId).toBeTruthy();
    const waiting = await prisma.jobRun.findUnique({ where: { id: jobRun.id } });
    expect(waiting?.status).toBe('waiting_approval');
    expect(await prisma.sceneVersion.count({ where: { scene: { projectId } } })).toBe(5);
    expect(await prisma.artifactVersion.count({ where: { artifact: { projectId } } })).toBe(1);

    // Rejeu de la finalisation : RunArtifact empeche une seconde version.
    await useCases.finalize(jobRun.id);
    expect(await prisma.artifactVersion.count({ where: { artifact: { projectId } } })).toBe(1);

    const artifact = await master.latestMaster(projectId);
    expect(artifact?.id).toBe(finalized.artifactVersionId);
    const approval = await master.createOrUpdateApproval({
      artifactVersionId: finalized.artifactVersionId,
      approvedBy: userId,
      checksum: finalized.checksum
    });
    await useCases.confirmApproval({
      jobRunId: jobRun.id,
      artifactVersionId: finalized.artifactVersionId,
      checksum: finalized.checksum,
      approvedBy: userId
    });
    await useCases.transfer(jobRun.id);
    expect((await prisma.jobRun.findUnique({ where: { id: jobRun.id } }))?.status).toBe('succeeded');
    expect(await prisma.transfer.count({ where: { approvalId: approval.id } })).toBe(1);

    await expect(
      store.transitionJob(jobRun.id, 'running', 'test')
    ).rejects.toThrow(/Transition job interdite/);
  });

  it('cree une correction de SCENE-003 comme nouvelle version et invalide l approbation precedente', async () => {
    const store = new PrismaDurableProductionStore(prisma);
    const master = new PrismaProductionRepository(prisma);
    const useCases = new DurableProductionUseCases(
      store,
      new FakeMedia(),
      new FakeStorage(),
      new FakeRouting(),
      master,
      new PostizMockAdapter(prisma),
      new PrismaAuditAdapter(prisma),
      { now: () => new Date('2026-10-24T00:00:00.000Z') },
      'C:/fake',
      0,
      100
    );
    const runs = new PrismaProductionRunRepository(prisma);
    const { jobRun } = await runs.startRun({
      userId,
      projectId,
      type: 'correction',
      targetSceneKey: 'SCENE-003',
      instruction: 'Correction test',
      steps: [...DURABLE_PRODUCTION_STEPS],
      outbox: { kind: 'start_run', payload: { projectId, type: 'correction' } }
    });
    await useCases.validateSnapshot(jobRun.id);
    await useCases.resolveCapabilities(jobRun.id);
    await useCases.renderScenes(jobRun.id);
    await useCases.assembleMaster(jobRun.id);
    await useCases.runQa(jobRun.id);
    const finalized = await useCases.finalize(jobRun.id);
    expect(finalized.masterVersion).toBe(2);
    const scene3 = await prisma.scene.findUnique({ where: { projectId_sceneKey: { projectId, sceneKey: 'SCENE-003' } } });
    const versions = await prisma.sceneVersion.findMany({ where: { sceneId: scene3!.id }, orderBy: { version: 'asc' } });
    expect(versions.map((version) => version.version)).toEqual([1, 2]);
    const previous = await prisma.artifactVersion.findFirst({ where: { artifact: { projectId }, version: 1 } });
    const previousApproval = await prisma.approval.findUnique({ where: { artifactVersionId: previous!.id } });
    expect(previousApproval?.invalidatedAt).not.toBeNull();
  });

  it('route avec fallback mock trace et refuse un budget insuffisant', async () => {
    const providerA = await prisma.provider.create({ data: { key: 'd-mock-a-' + RUN_ID, name: 'Mock A' } });
    const providerB = await prisma.provider.create({ data: { key: 'd-mock-b-' + RUN_ID, name: 'Mock B' } });
    await prisma.model.create({
      data: {
        providerId: providerA.id,
        modelKey: 'd-primary-' + RUN_ID,
        capabilityKeys: ['d.scene.generate.' + RUN_ID],
        quality: 90,
        latencyMs: 10,
        costCentsPerUnit: 5,
        license: 'internal',
        active: true,
        qualified: true
      }
    });
    await prisma.model.create({
      data: {
        providerId: providerB.id,
        modelKey: 'd-fallback-' + RUN_ID,
        capabilityKeys: ['d.scene.generate.' + RUN_ID],
        quality: 70,
        latencyMs: 10,
        costCentsPerUnit: 2,
        license: 'internal',
        active: true,
        qualified: true
      }
    });
    process.env.DURABLE_AGENT_KEY = 'missing-agent-' + RUN_ID;
    const routing = new DurableRoutingService(prisma, new Set(['d-primary-' + RUN_ID]));
    const decision = await routing.resolve({
      jobRunId: 'job-route-' + RUN_ID,
      projectId,
      capabilityKey: 'd.scene.generate.' + RUN_ID,
      budgetCents: 10,
      input: {},
      idempotencyKey: 'route:test'
    });
    expect(decision.usedFallback).toBe(true);
    expect(decision.modelKey).toBe('d-fallback-' + RUN_ID);
    expect(decision.actualCents).toBe(2);
    await expect(
      routing.resolve({
        jobRunId: 'job-budget-' + RUN_ID,
        projectId,
        capabilityKey: 'd.scene.generate.' + RUN_ID,
        budgetCents: 1,
        input: {},
        idempotencyKey: 'route:budget'
      })
    ).rejects.toThrow(/No eligible model/);
  });
});