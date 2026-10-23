import { execSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BriefUseCases,
  MessageUseCases,
  ProductionUseCases,
  StoryboardUseCases,
  type Actor,
  type AuditPort,
  type BriefWithRevisions,
  type JobRunRecord,
  type PostizPort,
  type ProductionExecutorPort,
  type ProductionJobRecord,
  type MasterRepository,
  type ProductionRunRepository,
  type ProjectBundleQueryPort,
  type ProjectBundleRecord,
  type ProjectRecord,
  type ProjectRepository,
  type ReproducibilitySnapshot,
  type SceneRepository,
  type StoryboardStore,
  type BriefStore,
  type MessageStore,
  type TransferRecord
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
  status: 'draft'
};

class FakeProjects implements ProjectRepository {
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

class FakeAudit implements AuditPort {
  public events: string[] = [];
  async record(input: { action: string }): Promise<void> {
    this.events.push(input.action);
  }
}

const clock = { now: () => new Date('2026-10-23T00:00:00.000Z') };
let counter = 0;
const ids = { next: () => 'id-' + ++counter };

class FakeBriefStore implements BriefStore {
  public current: BriefWithRevisions | null = null;
  public saves = 0;
  async findWithRevisions(): Promise<BriefWithRevisions | null> {
    return this.current;
  }
  async saveRevision(input: Parameters<BriefStore['saveRevision']>[0]): Promise<BriefWithRevisions> {
    this.saves += 1;
    const revision = {
      id: input.revisionId,
      briefId: input.briefId,
      version: input.version,
      ...input.content,
      checksum: input.checksum,
      createdAt: input.createdAt
    };
    this.current = {
      id: input.briefId,
      projectId: input.projectId,
      ...input.content,
      version: input.version,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      revisions: [...(this.current?.revisions ?? []), revision]
    };
    return this.current;
  }
}

class FakeBriefStoreInitial extends FakeBriefStore {
  constructor(initial: BriefWithRevisions) {
    super();
    this.current = initial;
  }
}

class FakeStoryboardStore implements StoryboardStore {
  public saved: Parameters<StoryboardStore['saveAtomic']>[0] | null = null;
  async findCharacter(): Promise<null> {
    return null;
  }
  async saveAtomic(input: Parameters<StoryboardStore['saveAtomic']>[0]): Promise<void> {
    this.saved = input;
  }
}

class FakeBundleQuery implements ProjectBundleQueryPort {
  async getOwnedBundle(): Promise<ProjectBundleRecord> {
    return {
      project: { ...project, createdAt: new Date(), updatedAt: new Date() },
      context: {
        id: 'context-1',
        name: 'Ctx',
        website: null,
        description: 'Desc',
        audience: null,
        tone: null,
        colorPrimary: '#000',
        colorSecondary: '#fff',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      brief: null,
      messages: [],
      scenes: [],
      characters: [],
      master: null,
      masterVersions: [],
      job: null
    };
  }
}

class FakeScenes implements SceneRepository {
  async listByProject(): Promise<[]> {
    return [];
  }
  async findOwned(): Promise<null> {
    return null;
  }
  async upsertMany(): Promise<[]> {
    return [];
  }
  async updateDuration(): Promise<never> {
    throw new Error('unused');
  }
}

class FakeRunRepository implements ProductionRunRepository {
  public started: Array<{ projectId: string; type: string }> = [];
  public jobFailed = false;
  async startRun(input: { projectId: string; type: 'produce' | 'correction' }): Promise<{ job: ProductionJobRecord; jobRun: JobRunRecord }> {
    this.started.push({ projectId: input.projectId, type: input.type });
    return {
      job: {
        id: 'job-1',
        projectId: input.projectId,
        type: input.type,
        status: 'queued',
        step: 'queued',
        progress: 0,
        error: null,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      jobRun: {
        id: 'jobrun-1',
        projectId: input.projectId,
        type: input.type,
        status: 'queued',
        snapshot: {} as ReproducibilitySnapshot,
        snapshotVersion: 1,
        snapshotChecksum: 'checksum',
        outputs: null,
        outputsChecksum: null
      }
    };
  }
  async updateJob(_jobId: string, input: { status?: string }): Promise<void> {
    this.jobFailed = input.status === 'failed';
  }
  async updateStep(): Promise<void> {}
}

class FakeExecutor implements ProductionExecutorPort {
  public calls = 0;
  public shouldFail = false;
  async start(): Promise<void> {
    if (this.shouldFail) {
      throw new Error('media_failed');
    }
    this.calls += 1;
  }
}

function fakeMasterRepository(overrides: Partial<MasterRepository> = {}): MasterRepository {
  return {
    latestMaster: async () => ({
      id: 'master-1',
      artifactId: 'artifact-1',
      version: 1,
      masterPath: 'master.mp4',
      checksum: 'a'.repeat(64),
      qaStatus: 'PASS',
      qaReport: { status: 'PASS', checks: [] }
    }),
    findApproval: async () => ({
      id: 'approval-1',
      artifactVersionId: 'master-1',
      approvedBy: actor.id,
      checksum: 'a'.repeat(64),
      invalidatedAt: null
    }),
    findTransfer: async (): Promise<TransferRecord | null> => null,
    createOrUpdateApproval: async () => ({
      id: 'approval-1',
      artifactVersionId: 'master-1',
      approvedBy: actor.id,
      checksum: 'a'.repeat(64),
      invalidatedAt: null
    }),
    ...overrides
  } as unknown as MasterRepository;
}

class FakePostiz implements PostizPort {
  public calls = 0;
  async transfer(input: { approvalId: string; checksum: string; artifactVersionId: string }): Promise<TransferRecord> {
    this.calls += 1;
    return {
      id: 'transfer-1',
      approvalId: input.approvalId,
      status: 'submitted',
      provider: 'postiz-mock',
      externalId: null
    };
  }
}

describe('V1-01-A.1 use cases specialises', () => {
  it('cree un brief versionne par BriefStore transactionnel', async () => {
    const briefs = new FakeBriefStore();
    const audit = new FakeAudit();
    const useCases = new BriefUseCases(new FakeProjects(), briefs, clock, ids, audit);
    const result = await useCases.update(actor, project.id, {
      objective: 'Objectif',
      audience: 'Audience',
      tone: 'Ton',
      cta: 'CTA',
      platform: 'Instagram',
      format: 'Video'
    });
    expect(result.version).toBe(1);
    expect(result.revisions).toHaveLength(1);
    expect(briefs.saves).toBe(1);
    expect(audit.events).toContain('brief.updated');
  });

  it('genere un storyboard atomique avec 5 scenes et une CharacterVersion', async () => {
    const storyboardStore = new FakeStoryboardStore();
    const useCases = new StoryboardUseCases(
      new FakeProjects(),
      new FakeBriefStoreInitial({
        id: 'brief-1',
        projectId: project.id,
        objective: 'Objectif',
        audience: 'Audience',
        tone: 'Ton',
        cta: 'CTA',
        platform: 'Instagram',
        format: 'Video',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        revisions: []
      }),
      new FakeScenes(),
      storyboardStore,
      new FakeBundleQuery(),
      clock,
      ids,
      new FakeAudit()
    );
    await useCases.generate(actor, project.id);
    expect(storyboardStore.saved).not.toBeNull();
    expect(storyboardStore.saved?.scenes).toHaveLength(5);
    expect(storyboardStore.saved?.projectStatus).toBe('storyboard_ready');
    expect(storyboardStore.saved?.character.nextVersion?.version).toBe(1);
  });

  it('cree la paire de messages avec une reponse deterministe', async () => {
    const created: Array<{ role: string; content: string }> = [];
    const messageStore = {
      async createPair(input: { projectId: string; userContent: string; assistantContent: string }) {
        created.push({ role: 'user', content: input.userContent });
        created.push({ role: 'assistant', content: input.assistantContent });
        return {
          userMessage: { id: 'm1', projectId: input.projectId, role: 'user' as const, content: input.userContent, createdAt: new Date() },
          assistantMessage: { id: 'm2', projectId: input.projectId, role: 'assistant' as const, content: input.assistantContent, createdAt: new Date() }
        };
      }
    } satisfies MessageStore;
    const useCases = new MessageUseCases(new FakeProjects(), messageStore, new FakeBundleQuery(), new FakeAudit());
    const result = await useCases.add(actor, project.id, 'Bonjour');
    expect(result.userMessage.content).toBe('Bonjour');
    expect(created).toHaveLength(2);
    expect(created[1].content.length).toBeGreaterThan(0);
  });

  it('demarre la production via le run transactionnel et l executant injecte', async () => {
    const runs = new FakeRunRepository();
    const executor = new FakeExecutor();
    const useCases = new ProductionUseCases(
      new FakeProjects(),
      runs,
      executor,
      fakeMasterRepository(),
      new FakePostiz(),
      new FakeAudit(),
      clock,
      ids
    );
    const result = await useCases.startProduction(actor, project.id);
    expect(result.job.id).toBe('job-1');
    expect(result.jobRun.id).toBe('jobrun-1');
    expect(executor.calls).toBe(1);
    expect(runs.started[0].projectId).toBe(project.id);
  });

  it('marque le ProductionJob failed si l executant synchrone echoue', async () => {
    const runs = new FakeRunRepository();
    const executor = new FakeExecutor();
    executor.shouldFail = true;
    const useCases = new ProductionUseCases(
      new FakeProjects(),
      runs,
      executor,
      fakeMasterRepository(),
      new FakePostiz(),
      new FakeAudit(),
      clock,
      ids
    );
    await expect(useCases.startProduction(actor, project.id)).rejects.toThrow('media_failed');
    expect(runs.jobFailed).toBe(true);
  });

  it('refuse un projet non proprietaire', async () => {
    const useCases = new ProductionUseCases(
      new FakeProjects(),
      new FakeRunRepository(),
      new FakeExecutor(),
      fakeMasterRepository(),
      new FakePostiz(),
      new FakeAudit(),
      clock,
      ids
    );
    await expect(useCases.startProduction({ id: 'intruder', role: 'user' }, project.id)).rejects.toMatchObject({
      code: 'project_not_found'
    });
  });
});

describe('V1-01-A.1 transactions PostgreSQL', () => {
  let prisma: any;
  let userId = '';
  let contextId = '';
  let runRepo: any;
  let storyboardStore: any;
  let briefStore: any;

  beforeAll(async () => {
    execSync('pnpm exec prisma migrate deploy --schema packages/db/prisma/schema.prisma', {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: testDbUrl },
      stdio: 'pipe'
    });
    const dbModule = await import('@vululu/db');
    const runModule = await import('../../apps/api/src/infrastructure/prisma/productionRunRepository');
    const storyModule = await import('../../apps/api/src/infrastructure/prisma/storyboardStore');
    const briefModule = await import('../../apps/api/src/infrastructure/prisma/briefStore');
    prisma = dbModule.prisma;
    runRepo = new runModule.PrismaProductionRunRepository();
    storyboardStore = new storyModule.PrismaStoryboardStore();
    briefStore = new briefModule.PrismaBriefStore();
    const stamp = Date.now().toString();
    const user = await prisma.user.create({
      data: { email: 'v1-01-a1-' + stamp + '@vululu.local', passwordHash: 'hash', name: 'A1 Test', role: 'user' }
    });
    userId = user.id;
    const context = await prisma.brandContext.create({
      data: { userId, name: 'Contexte A1', description: 'Test', colorPrimary: '#111111', colorSecondary: '#222222' }
    });
    contextId = context.id;
    await prisma.contextRevision.create({
      data: { contextId, version: 1, checksum: 'ctx-checksum', data: { name: context.name } }
    });
  });

  afterAll(async () => {
    if (prisma && userId) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
      await prisma.$disconnect();
    }
  });

  async function createProject(title: string) {
    return prisma.project.create({
      data: { userId, contextId, title, platform: 'Instagram', format: 'Video', objective: 'Test', sceneDurationSeconds: 2 }
    });
  }

  async function seedStoryboard(projectId: string) {
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
      await prisma.scene.create({
        data: { projectId, sceneKey: 'SCENE-00' + index, position: index, title: 'Scene ' + index, description: 'Desc', durationSeconds: 2, characterKey: 'CHAR-001' }
      });
    }
  }

  it('cree snapshot + JobRun + StepRun + ProductionJob dans une transaction et refuse un second run actif', async () => {
    const project = await createProject('Run atomique');
    await seedStoryboard(project.id);
    const first = await runRepo.startRun({
      userId,
      projectId: project.id,
      type: 'produce',
      targetSceneKey: null,
      steps: ['snapshot', 'render-scenes', 'assemble-master', 'qa']
    });
    const row = await prisma.jobRun.findUnique({
      where: { id: first.jobRun.id },
      include: { steps: true }
    });
    expect(row).toBeTruthy();
    expect(row.steps).toHaveLength(4);
    expect(row.snapshot.context.revisionId).toBeTruthy();
    expect(row.snapshot.brief.revisionId).toBeTruthy();
    expect(row.snapshot.scenes).toHaveLength(5);
    expect(row.snapshot.characters).toHaveLength(1);
    expect(row.snapshotChecksum).toHaveLength(64);
    const updatedProject = await prisma.project.findUnique({ where: { id: project.id } });
    expect(updatedProject.status).toBe('producing');
    await expect(runRepo.startRun({
      userId,
      projectId: project.id,
      type: 'produce',
      targetSceneKey: null,
      steps: ['snapshot']
    })).rejects.toMatchObject({ code: 'job_running' });
  });

  it('serialise deux demarrages concurrents et ne laisse qu un seul run actif', async () => {
    const project = await createProject('Run concurrent');
    await seedStoryboard(project.id);
    const results = await Promise.allSettled([
      runRepo.startRun({
        userId,
        projectId: project.id,
        type: 'produce',
        targetSceneKey: null,
        instruction: null,
        steps: ['snapshot', 'render-scenes', 'assemble-master', 'qa']
      }),
      runRepo.startRun({
        userId,
        projectId: project.id,
        type: 'produce',
        targetSceneKey: null,
        instruction: null,
        steps: ['snapshot', 'render-scenes', 'assemble-master', 'qa']
      })
    ]);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: 'job_running' });
    const active = await prisma.jobRun.count({
      where: { projectId: project.id, status: { in: ['queued', 'running'] } }
    });
    expect(active).toBe(1);
  });

  it('rollback integral du storyboard si une scene est invalide', async () => {
    const project = await createProject('Storyboard rollback');
    const before = await prisma.project.findUnique({ where: { id: project.id } });
    const character = {
      id: 'character-a1',
      characterKey: 'CHAR-001',
      name: 'Personnage',
      description: 'Description',
      expectedVersion: null,
      nextVersion: {
        id: 'character-version-a1',
        version: 1,
        checksum: 'a'.repeat(64),
        createdAt: new Date()
      }
    };
    await expect(storyboardStore.saveAtomic({
      projectId: project.id,
      userId,
      projectStatus: 'storyboard_ready',
      character,
      scenes: [
        { id: 'scene-a1', sceneKey: 'SCENE-001', position: 1, title: 'A', description: 'A', durationSeconds: 2, characterKey: 'CHAR-001' },
        { id: 'scene-a2', sceneKey: 'SCENE-001', position: 2, title: 'B', description: 'B', durationSeconds: 2, characterKey: 'CHAR-001' }
      ]
    })).rejects.toBeTruthy();
    const after = await prisma.project.findUnique({ where: { id: project.id } });
    expect(after.status).toBe(before.status);
    expect(await prisma.character.count({ where: { projectId: project.id } })).toBe(0);
    expect(await prisma.characterVersion.count({ where: { character: { projectId: project.id } } })).toBe(0);
    expect(await prisma.scene.count({ where: { projectId: project.id } })).toBe(0);
  });

  it('refuse une revision de brief qui saute une version', async () => {
    const project = await createProject('Brief transactionnel');
    const base = {
      userId,
      projectId: project.id,
      briefId: 'brief-a1',
      revisionId: 'revision-a1',
      content: {
        objective: 'O',
        audience: 'A',
        tone: 'T',
        cta: 'C',
        platform: 'Instagram' as const,
        format: 'Video' as const
      },
      checksum: 'b'.repeat(64),
      createdAt: new Date(),
      projectStatus: 'brief_ready'
    };
    await briefStore.saveRevision({ ...base, version: 1 });
    const second = await briefStore.saveRevision({ ...base, revisionId: 'revision-a2', version: 2 });
    expect(second.version).toBe(2);
    await expect(briefStore.saveRevision({ ...base, revisionId: 'revision-a3', version: 2 })).rejects.toMatchObject({
      code: 'brief_version_conflict'
    });
  });
});