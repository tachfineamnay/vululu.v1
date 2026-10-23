import { execSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ProductionUseCases,
  ProjectWorkflowUseCases,
  type Actor,
  type AuditPort,
  type BriefInput,
  type JobRunRecord,
  type JobRunRepository,
  type ProductionWorkflowPort,
  type ProjectRecord,
  type ProjectRepository,
  type ProjectWorkflowPort,
  type ReproducibilityPort,
  type ReproducibilitySnapshot
} from '@vululu/application';

const testDbUrl = 'postgresql://vululu@127.0.0.1:55432/vululu_v1_00_test?schema=public';
process.env.V0_TEST_DB = '1';
process.env.DATABASE_URL_TEST = testDbUrl;
process.env.DATABASE_URL = testDbUrl;
process.env.APP_ENV = 'local';

const actor: Actor = { id: 'user-1', role: 'user' };

const project: ProjectRecord = {
  id: 'project-1',
  userId: actor.id,
  contextId: 'context-1',
  title: 'Projet test',
  platform: 'Instagram',
  format: 'Video',
  objective: 'Tester',
  sceneDurationSeconds: 2,
  status: 'storyboard_ready'
};

const snapshot: ReproducibilitySnapshot = {
  schemaVersion: 1,
  capturedAt: '2026-10-23T00:00:00.000Z',
  project: { id: project.id, platform: project.platform, format: project.format, sceneDurationSeconds: 2, status: project.status },
  context: { revisionId: 'ctx-rev-1', checksum: 'ctx-checksum', data: { name: 'Ctx' } },
  brief: { revisionId: 'brief-rev-1', version: 1, checksum: 'brief-checksum', data: { objective: 'Tester' } },
  scenes: [{ sceneId: 'scene-1', sceneKey: 'SCENE-001', position: 1, durationSeconds: 2, version: 0, checksum: '' }],
  characters: [{ characterId: 'char-1', characterKey: 'CHAR-001', version: 1, checksum: 'char-checksum', name: 'A', description: 'B' }],
  providerPolicy: { provider: 'local-deterministic', model: 'scene-svg-v1', deterministic: true },
  render: { width: 1080, height: 1920, fps: 30, imageFormat: 'png', videoCodec: 'h264', audioCodec: 'aac', audioSilent: true }
};

class FakeProjectRepository implements ProjectRepository {
  async create(input: Omit<ProjectRecord, 'id'>): Promise<ProjectRecord> {
    return { ...input, id: 'created' };
  }
  async findOwned(projectId: string, userId: string): Promise<ProjectRecord | null> {
    return projectId === project.id && userId === actor.id ? project : null;
  }
  async listOwned(): Promise<ProjectRecord[]> {
    return [project];
  }
  async updateStatus(): Promise<void> {}
}

class FakeReproducibility implements ReproducibilityPort {
  public calls = 0;
  async capture(): Promise<ReproducibilitySnapshot> {
    this.calls += 1;
    return snapshot;
  }
}

class FakeJobRuns implements JobRunRepository {
  public created: Array<{ projectId: string; type: string; snapshot: ReproducibilitySnapshot; steps: string[] }> = [];
  public statuses: Array<{ id: string; status: string; error?: string }> = [];
  async createWithSteps(input: { projectId: string; type: string; snapshot: ReproducibilitySnapshot; steps: string[] }): Promise<JobRunRecord> {
    this.created.push(input);
    return { id: 'job-run-1', projectId: input.projectId, type: input.type, status: 'queued', snapshot: input.snapshot as unknown as Record<string, unknown>, snapshotVersion: 1, snapshotChecksum: 'snapshot-checksum', outputs: null, outputsChecksum: null };
  }
  async findRunning(): Promise<JobRunRecord | null> {
    return null;
  }
  async markStatus(id: string, status: string, error?: string): Promise<void> {
    this.statuses.push({ id, status, error });
  }
}

class FakeProductionWorkflow implements ProductionWorkflowPort {
  public started: Array<{ projectId: string; jobRunId?: string }> = [];
  public shouldFail = false;
  async startProduction(_actor: Actor, projectId: string, jobRunId?: string): Promise<unknown> {
    if (this.shouldFail) {
      throw new Error('media_failed');
    }
    this.started.push({ projectId, jobRunId });
    return { job: { id: 'legacy-job-1', status: 'queued' } };
  }
  async startCorrection(): Promise<unknown> {
    return {};
  }
  async approve(): Promise<unknown> {
    return { approval: { id: 'approval-1' } };
  }
  async transfer(): Promise<unknown> {
    return { transfer: { id: 'transfer-1', status: 'submitted' } };
  }
  async getQa(): Promise<unknown> {
    return { status: 'PASS' };
  }
}

class FakeProjectWorkflow implements ProjectWorkflowPort {
  public briefCalls = 0;
  async getBundle(): Promise<unknown> {
    return { project };
  }
  async updateBrief(_actor: Actor, _projectId: string, input: BriefInput): Promise<unknown> {
    this.briefCalls += 1;
    return { brief: { version: 2, ...input } };
  }
  async generateStoryboard(): Promise<unknown> {
    return { scenes: [{ sceneKey: 'SCENE-001' }] };
  }
  async addMessage(): Promise<unknown> {
    return { userMessage: {}, assistantMessage: {} };
  }
  async updateSceneDuration(): Promise<unknown> {
    return { scene: {} };
  }
}

class FakeAudit implements AuditPort {
  public events: Array<{ action: string }> = [];
  async record(input: { action: string }): Promise<void> {
    this.events.push(input);
  }
}

describe('V1-01-A application use cases', () => {
  it('capture un snapshot et passe le jobRunId a l executant de production', async () => {
    const jobs = new FakeJobRuns();
    const workflow = new FakeProductionWorkflow();
    const audit = new FakeAudit();
    const useCases = new ProductionUseCases(
      new FakeProjectRepository(),
      new FakeReproducibility(),
      jobs,
      workflow,
      audit
    );
    const result = await useCases.startProduction(actor, project.id);
    expect(jobs.created).toHaveLength(1);
    expect(jobs.created[0].snapshot.context.revisionId).toBe('ctx-rev-1');
    expect(jobs.created[0].snapshot.brief.revisionId).toBe('brief-rev-1');
    expect(jobs.created[0].snapshot.scenes[0].sceneKey).toBe('SCENE-001');
    expect(jobs.created[0].snapshot.characters[0].checksum).toBe('char-checksum');
    expect(workflow.started[0].jobRunId).toBe('job-run-1');
    expect((result.job as { id: string }).id).toBe('legacy-job-1');
    expect(audit.events.some((event) => event.action === 'production.started')).toBe(true);
  });

  it('marque le JobRun failed si l executant echoue', async () => {
    const jobs = new FakeJobRuns();
    const workflow = new FakeProductionWorkflow();
    workflow.shouldFail = true;
    const useCases = new ProductionUseCases(
      new FakeProjectRepository(),
      new FakeReproducibility(),
      jobs,
      workflow,
      new FakeAudit()
    );
    await expect(useCases.startProduction(actor, project.id)).rejects.toThrow('media_failed');
    expect(jobs.statuses[0].status).toBe('failed');
  });

  it('refuse un projet non proprietaire', async () => {
    const useCases = new ProductionUseCases(
      new FakeProjectRepository(),
      new FakeReproducibility(),
      new FakeJobRuns(),
      new FakeProductionWorkflow(),
      new FakeAudit()
    );
    await expect(useCases.startProduction({ id: 'intruder', role: 'user' }, project.id)).rejects.toMatchObject({ code: 'project_not_found' });
  });

  it('delegue le brief et journalise l action', async () => {
    const workflow = new FakeProjectWorkflow();
    const audit = new FakeAudit();
    const useCases = new ProjectWorkflowUseCases(workflow, audit);
    const result = await useCases.updateBrief(actor, project.id, {
      objective: 'Objectif',
      audience: 'Audience',
      tone: 'Ton',
      cta: 'CTA',
      platform: 'Instagram',
      format: 'Video'
    });
    expect((result as { brief: { version: number } }).brief.version).toBe(2);
    expect(workflow.briefCalls).toBe(1);
    expect(audit.events.some((event) => event.action === 'brief.updated')).toBe(true);
  });
});

describe('V1-01-A snapshot integration', () => {
  let prisma: any;
  let userId = '';
  let projectId = '';
  let adapter: any;
  let jobRepo: any;

  beforeAll(async () => {
    execSync('pnpm exec prisma migrate deploy --schema packages/db/prisma/schema.prisma', {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: testDbUrl },
      stdio: 'pipe'
    });
    const dbModule = await import('@vululu/db');
    const reproModule = await import('../../apps/api/src/infrastructure/prisma/reproducibilityAdapter');
    const jobModule = await import('../../apps/api/src/infrastructure/prisma/jobRunRepository');
    prisma = dbModule.prisma;
    const stamp = Date.now().toString();
    const user = await prisma.user.create({
      data: { email: 'v1-01-a-' + stamp + '@vululu.local', passwordHash: 'hash', name: 'V1 Test', role: 'user' }
    });
    userId = user.id;
    const context = await prisma.brandContext.create({
      data: { userId, name: 'Contexte snapshot', description: 'Test', colorPrimary: '#111111', colorSecondary: '#222222' }
    });
    await prisma.contextRevision.create({
      data: { contextId: context.id, version: 1, checksum: 'ctx-checksum', data: { name: context.name } }
    });
    const project = await prisma.project.create({
      data: { userId, contextId: context.id, title: 'Projet snapshot', platform: 'Instagram', format: 'Video', objective: 'Test', sceneDurationSeconds: 2 }
    });
    projectId = project.id;
    const brief = await prisma.brief.create({
      data: { projectId, objective: 'Objectif', audience: 'Audience', tone: 'Ton', cta: 'CTA', platform: 'Instagram', format: 'Video', version: 1 }
    });
    await prisma.briefRevision.create({
      data: { briefId: brief.id, version: 1, objective: 'Objectif', audience: 'Audience', tone: 'Ton', cta: 'CTA', platform: 'Instagram', format: 'Video', checksum: 'brief-checksum' }
    });
    const character = await prisma.character.create({
      data: { projectId, characterKey: 'CHAR-001', name: 'Personnage', description: 'Description' }
    });
    await prisma.characterVersion.create({
      data: { characterId: character.id, version: 1, name: character.name, description: character.description, checksum: 'char-checksum' }
    });
    for (let index = 1; index <= 5; index += 1) {
      const scene = await prisma.scene.create({
        data: { projectId, sceneKey: 'SCENE-00' + index, position: index, title: 'Scene ' + index, description: 'Desc', durationSeconds: 2, characterKey: 'CHAR-001' }
      });
      await prisma.sceneVersion.create({
        data: { sceneId: scene.id, version: 1, imagePath: projectId + '/scenes/SCENE-00' + index + '/v1.png', prompt: 'test', checksum: 'scene-checksum-' + index }
      });
    }
    adapter = new reproModule.PrismaReproducibilityAdapter();
    jobRepo = new jobModule.PrismaJobRunRepository();
  });

  afterAll(async () => {
    if (prisma && userId) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
      await prisma.$disconnect();
    }
  });

  it('capture contexte, brief, scenes, personnages et politiques provider/render', async () => {
    const captured = await adapter.capture(projectId, userId);
    expect(captured.schemaVersion).toBe(1);
    expect(captured.context.revisionId).toBeTruthy();
    expect(captured.context.checksum).toBe('ctx-checksum');
    expect(captured.brief.revisionId).toBeTruthy();
    expect(captured.brief.checksum).toBe('brief-checksum');
    expect(captured.scenes).toHaveLength(5);
    expect(captured.scenes.every((scene: any) => scene.version === 1 && scene.checksum.startsWith('scene-checksum-'))).toBe(true);
    expect(captured.characters[0].version).toBe(1);
    expect(captured.characters[0].checksum).toBe('char-checksum');
    expect(captured.providerPolicy.deterministic).toBe(true);
    expect(captured.render.audioSilent).toBe(true);
  });

  it('cree JobRun et StepRun dans une transaction', async () => {
    const job = await jobRepo.createWithSteps({
      projectId,
      type: 'produce',
      snapshot,
      steps: ['snapshot', 'render-scenes', 'assemble-master', 'qa']
    });
    const row = await prisma.jobRun.findUnique({ where: { id: job.id }, include: { steps: true } });
    expect(row).toBeTruthy();
    expect(row.steps).toHaveLength(4);
    expect(row.status).toBe('queued');
    expect(row.snapshot.schemaVersion).toBe(1);
    expect(row.snapshotChecksum).toHaveLength(64);
    expect(row.outputs).toBeNull();
    expect(row.outputsChecksum).toBeNull();
  });

  it('rollback le JobRun si la transaction echoue', async () => {
    const before = await prisma.jobRun.count();
    await expect(jobRepo.createWithSteps({
      projectId: 'project-does-not-exist',
      type: 'produce',
      snapshot,
      steps: ['snapshot']
    })).rejects.toBeTruthy();
    const after = await prisma.jobRun.count();
    expect(after).toBe(before);
  });
});