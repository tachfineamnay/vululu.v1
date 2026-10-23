import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Doit etre hoiste avant les imports : force la base de test AVANT chargement de
// @vululu/db et de l'env API (aucun acces a la base de demonstration).
vi.hoisted(() => {
  const testDbUrl = 'postgresql://vululu@127.0.0.1:55432/vululu_v1_00_test?schema=public';
  process.env.V0_TEST_DB = '1';
  process.env.DATABASE_URL_TEST = testDbUrl;
  process.env.DATABASE_URL = testDbUrl;
});

import type { Approval, Artifact, ArtifactVersion, BrandContext, Brief, JobRun, Project, Scene, User } from '@prisma/client';
import { prisma } from '@vululu/db';
import { env } from '../../apps/api/src/env';
import {
  DeterministicProviderAdapter,
  DETERMINISTIC_PROVIDER_NAME,
  LOCAL_ORCHESTRATOR_DEFAULT_STEPS,
  LocalOrchestratorAdapter,
  LocalStoragePort,
  MediaRendererAdapter,
  POSTIZ_MOCK_PROVIDER,
  PostizMockAdapter,
  PrismaAuditAdapter,
  PrismaBriefRepository,
  PrismaContextRepository,
  PrismaProductionRepository,
  PrismaProjectRepository,
  PrismaSceneRepository
} from '../../apps/api/src/infrastructure/index';

const TEST_DB_URL = 'postgresql://vululu@127.0.0.1:55432/vululu_v1_00_test?schema=public';
const RUN_ID = 'infra-' + Date.now();
const TEMP_ROOT = path.join(env.repoRoot, '.v1', 'test', RUN_ID);

let db: typeof prisma;
let contextRepo: PrismaContextRepository;
let projectRepo: PrismaProjectRepository;
let briefRepo: PrismaBriefRepository;
let sceneRepo: PrismaSceneRepository;
let productionRepo: PrismaProductionRepository;
let media: MediaRendererAdapter;
let provider: DeterministicProviderAdapter;
let orchestrator: LocalOrchestratorAdapter;
let postiz: PostizMockAdapter;
let audit: PrismaAuditAdapter;

let userA: User;
let userB: User;
let context: BrandContext;
let project: Project;
let brief: Brief;
let scenes: Scene[];
let artifact: Artifact;
let master: ArtifactVersion;
let approval: Approval;
let successJobRun: JobRun;

function sha256(value: string | Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function createOtherProject(title: string): Promise<Project> {
  return projectRepo.create({
    userId: userA.id,
    contextId: context.id,
    title,
    platform: 'Instagram',
    format: 'Video',
    objective: 'Fixture de test infrastructure',
    sceneDurationSeconds: 2,
    status: 'draft'
  });
}

beforeAll(async () => {
  fs.mkdirSync(TEMP_ROOT, { recursive: true });

  // Migration deploy sur la base de test isolee (idempotent).
  execSync('pnpm exec prisma migrate deploy --schema packages/db/prisma/schema.prisma', {
    cwd: env.repoRoot,
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: 'pipe'
  });

  // Client @vululu/db singleton : DATABASE_URL est force vers la base de test
  // par vi.hoisted avant tout import.
  db = prisma;

  contextRepo = new PrismaContextRepository(db);
  projectRepo = new PrismaProjectRepository(db);
  briefRepo = new PrismaBriefRepository(db);
  sceneRepo = new PrismaSceneRepository(db);
  productionRepo = new PrismaProductionRepository(db);
  media = new MediaRendererAdapter();
  provider = new DeterministicProviderAdapter();
  orchestrator = new LocalOrchestratorAdapter({ database: db });
  postiz = new PostizMockAdapter(db);
  audit = new PrismaAuditAdapter(db);

  userA = await db.user.create({
    data: { email: 'infra-a-' + RUN_ID + '@vululu.local', passwordHash: 'test-hash', name: 'Infra A', role: 'user' }
  });
  userB = await db.user.create({
    data: { email: 'infra-b-' + RUN_ID + '@vululu.local', passwordHash: 'test-hash', name: 'Infra B', role: 'user' }
  });

  context = await contextRepo.create({
    userId: userA.id,
    name: 'Contexte infrastructure',
    website: 'https://example.com',
    description: 'Contexte de test des adaptateurs',
    audience: 'Createurs',
    tone: 'Direct',
    colorPrimary: '#6C5CE7',
    colorSecondary: '#00D2FF'
  });

  project = await projectRepo.create({
    userId: userA.id,
    contextId: context.id,
    title: 'Projet infrastructure',
    platform: 'Instagram',
    format: 'Video',
    objective: 'Tester les adaptateurs V1-00',
    sceneDurationSeconds: 2,
    status: 'draft'
  });

  brief = await briefRepo.createRevision({
    projectId: project.id,
    objective: 'Brief initial',
    audience: 'Createurs',
    tone: 'Direct',
    cta: 'Decouvrir',
    platform: 'Instagram',
    format: 'Video',
    version: 1,
    checksum: sha256('brief-v1:' + project.id)
  });

  scenes = await sceneRepo.upsertMany(project.id, [
    {
      sceneKey: 'SCENE-001',
      position: 1,
      title: 'Accroche',
      description: 'Accroche visuelle',
      durationSeconds: 2,
      characterKey: null
    },
    {
      sceneKey: 'SCENE-002',
      position: 2,
      title: 'Probleme',
      description: 'Probleme concret',
      durationSeconds: 2,
      characterKey: null
    },
    {
      sceneKey: 'SCENE-003',
      position: 3,
      title: 'Appel a action',
      description: 'CTA clair',
      durationSeconds: 2,
      characterKey: null
    }
  ]);

  for (const scene of scenes) {
    await productionRepo.createSceneVersion({
      sceneId: scene.id,
      version: 1,
      imagePath: 'projects/' + project.id + '/scenes/' + scene.sceneKey + '/v1.png',
      prompt: scene.sceneKey + ' prompt initial',
      checksum: sha256(scene.id + ':v1')
    });
  }

  artifact = await db.artifact.create({ data: { projectId: project.id, kind: 'master' } });
  master = await productionRepo.createMasterVersion({
    artifactId: artifact.id,
    version: 1,
    masterPath: 'projects/' + project.id + '/master/v1.mp4',
    checksum: sha256('master-v1:' + project.id),
    qaStatus: 'PENDING',
    qaReport: null
  });
  await productionRepo.updateQa(master.id, 'PASS', { status: 'PASS', checks: [] });
  approval = await productionRepo.createOrUpdateApproval({
    artifactVersionId: master.id,
    approvedBy: userA.id,
    checksum: master.checksum
  });

  successJobRun = (await orchestrator.enqueue({
    projectId: project.id,
    type: 'produce',
    snapshot: { projectId: project.id, briefVersion: brief.version }
  })) as JobRun;
});

afterAll(async () => {
  if (db) {
    try {
      await db.auditEvent.deleteMany({ where: { action: { startsWith: 'infra-test-' + RUN_ID } } });
    } catch {
      // Nettoyage best-effort : les evenements sont deja identifies par prefixe.
    }
    try {
      if (userA) await db.user.delete({ where: { id: userA.id } });
      if (userB) await db.user.delete({ where: { id: userB.id } });
    } catch {
      // Le cascade PostgreSQL nettoie les fixtures si le test a echoue avant l'ecriture.
    }
    await db.$disconnect();
  }
  fs.rmSync(TEMP_ROOT, { recursive: true, force: true });
});

describe('LocalStoragePort (contrat storage)', () => {
  it('resout, lit, verifie l existence et calcule le checksum SHA256', () => {
    const root = path.join(TEMP_ROOT, 'storage');
    const port = new LocalStoragePort(root);
    const relative = path.join('projects', 'p1', 'artifact.png');
    const content = Buffer.from('vululu-v1-00-storage-contract');

    const absolute = port.resolve(relative);
    expect(absolute).toBe(path.join(root, relative));
    expect(port.resolve(relative)).toBe(absolute);
    expect(port.exists(absolute)).toBe(false);

    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content);

    expect(port.exists(absolute)).toBe(true);
    expect(port.readBuffer(absolute).equals(content)).toBe(true);
    expect(port.checksum(absolute)).toBe(sha256(content));
    expect(port.checksum(absolute)).toHaveLength(64);
  });

  it('refuse tout chemin hors de la racine des artefacts', () => {
    const root = path.join(TEMP_ROOT, 'storage-guard');
    const port = new LocalStoragePort(root);
    expect(() => port.resolve('../evasion.png')).toThrow(/chemin_hors_artefacts/);
    expect(() => port.resolve('../../etc/passwd')).toThrow(/chemin_hors_artefacts/);
    expect(() => port.exists(path.join(TEMP_ROOT, 'outside.png'))).toThrow(/chemin_hors_artefacts/);
    expect(() => port.readBuffer(path.join(TEMP_ROOT, 'outside.png'))).toThrow(/chemin_hors_artefacts/);
  });

  it('utilise env.artifactRoot par defaut', () => {
    const port = new LocalStoragePort();
    expect(port.artifactRoot).toBe(path.resolve(env.artifactRoot));
    expect(port.resolve('project/scene.png')).toBe(path.join(path.resolve(env.artifactRoot), 'project', 'scene.png'));
  });
});

describe('DeterministicProviderAdapter (contrat provider)', () => {
  it('se declare local-deterministic sans pretendre etre une IA', () => {
    expect(provider.name).toBe(DETERMINISTIC_PROVIDER_NAME);
    expect(provider.name).toBe('local-deterministic');
    expect(provider.name).not.toMatch(/gpt|claude|gemini|openai|anthropic|midjourney|dall-e/i);
  });

  it('genere un PNG deterministe reutilisable par le port', async () => {
    const root = path.join(TEMP_ROOT, 'provider');
    const storagePort = new LocalStoragePort(root);
    const request = {
      projectId: 'project-provider',
      artifactRoot: root,
      sceneKey: 'SCENE-001',
      position: 1,
      title: 'Titre deterministe',
      description: 'Description deterministe',
      brandName: 'Vululu Test',
      colorPrimary: '#6C5CE7',
      colorSecondary: '#00D2FF',
      version: 1
    };

    const first = await provider.generateScene(request);
    const second = await provider.generateScene(request);

    expect(first.width).toBe(1080);
    expect(first.height).toBe(1920);
    expect(first.checksum).toHaveLength(64);
    expect(second.checksum).toBe(first.checksum);
    expect(second.absolutePath).toBe(first.absolutePath);
    expect(storagePort.exists(first.absolutePath)).toBe(true);
    expect(storagePort.checksum(first.absolutePath)).toBe(first.checksum);
    expect(first.relativePath.startsWith('project-provider/')).toBe(true);
  });
});

describe('MediaRendererAdapter (contrat media)', () => {
  it('rend scenes + master puis QA PASS, et QA FAIL si checksum altere', async () => {
    const root = path.join(TEMP_ROOT, 'media');
    const renders = [];
    // Trois scenes : le concat FFmpeg du renderer V0 ne preserve pas la duree
    // de la derniere image quand il n'y a que deux scenes (limitation connue,
    // hors perimetre packages/media). Trois scenes reproduisent le cas V0.
    for (let index = 0; index < 3; index += 1) {
      renders.push(
        await media.renderScene({
          projectId: 'project-media',
          artifactRoot: root,
          sceneKey: 'SCENE-00' + (index + 1),
          position: index + 1,
          title: 'Scene media ' + (index + 1),
          description: 'Description media ' + (index + 1),
          brandName: 'Vululu Media',
          colorPrimary: '#6C5CE7',
          colorSecondary: '#00D2FF',
          version: 1
        })
      );
    }
    expect(renders).toHaveLength(3);
    expect(renders.every((item) => item.width === 1080 && item.height === 1920)).toBe(true);

    const masterRender = await media.assembleMaster({
      projectId: 'project-media',
      artifactRoot: root,
      version: 1,
      scenePaths: renders.map((item) => item.absolutePath),
      sceneDurationsSeconds: [2, 2, 2]
    });

    expect(masterRender.videoCodec).toBe('h264');
    expect(masterRender.audioCodec).toBe('aac');
    expect(masterRender.width).toBe(1080);
    expect(masterRender.height).toBe(1920);
    expect(masterRender.expectedDurationSeconds).toBe(6);
    expect(masterRender.checksum).toHaveLength(64);

    const report = await media.runQa(renders, masterRender);
    expect(report.status).toBe('PASS');
    expect(report.checks.length).toBeGreaterThanOrEqual(7);
    expect(report.checks.every((check) => check.status === 'PASS')).toBe(true);

    const tampered = renders.map((item) => ({ ...item }));
    tampered[0].checksum = '0'.repeat(64);
    const failedReport = await media.runQa(tampered, masterRender);
    expect(failedReport.status).toBe('FAIL');
    expect(failedReport.checks.some((check) => check.status === 'FAIL')).toBe(true);
  });
});

describe('Repositories Prisma (integration base de test)', () => {
  it('ContextRepository : creation, isolation proprietaire et revision', async () => {
    const owned = await contextRepo.findOwned(context.id, userA.id);
    expect(owned).not.toBeNull();
    expect(owned?.name).toBe('Contexte infrastructure');

    expect(await contextRepo.findOwned(context.id, userB.id)).toBeNull();
    expect(await contextRepo.findOwned('contexte-inexistant', userA.id)).toBeNull();

    const listA = await contextRepo.listOwned(userA.id);
    expect(listA.map((item) => item.id)).toContain(context.id);
    expect(listA.every((item) => item.userId === userA.id)).toBe(true);
    expect((await contextRepo.listOwned(userB.id)).map((item) => item.id)).not.toContain(context.id);

    await contextRepo.addRevision(context.id, 1, sha256('context-revision-1'), {
      name: 'Contexte infrastructure',
      tone: 'Direct'
    });
    const revision = await db.contextRevision.findUnique({
      where: { contextId_version: { contextId: context.id, version: 1 } }
    });
    expect(revision).not.toBeNull();
    expect(revision?.checksum).toBe(sha256('context-revision-1'));
    expect(revision?.data).toEqual({ name: 'Contexte infrastructure', tone: 'Direct' });
  });

  it('ProjectRepository : creation, isolation et mise a jour de statut', async () => {
    const owned = await projectRepo.findOwned(project.id, userA.id);
    expect(owned).not.toBeNull();
    expect(owned?.contextId).toBe(context.id);
    expect(await projectRepo.findOwned(project.id, userB.id)).toBeNull();

    const listA = await projectRepo.listOwned(userA.id);
    expect(listA.map((item) => item.id)).toContain(project.id);
    const listB = await projectRepo.listOwned(userB.id);
    expect(listB).toHaveLength(0);

    await projectRepo.updateStatus(project.id, 'brief_ready');
    expect((await projectRepo.findOwned(project.id, userA.id))?.status).toBe('brief_ready');
    await projectRepo.updateStatus(project.id, 'draft');
  });

  it('BriefRepository : revisions append-only et version courante', async () => {
    expect((await briefRepo.findCurrent('projet-inexistant'))).toBeNull();
    expect((await briefRepo.findCurrent(project.id))?.version).toBe(1);
    expect(brief.version).toBe(1);

    const second = await briefRepo.createRevision({
      projectId: project.id,
      objective: 'Brief v2',
      audience: 'Createurs avances',
      tone: 'Direct',
      cta: 'Decouvrir v2',
      platform: 'Instagram',
      format: 'Video',
      version: 2,
      checksum: sha256('brief-v2:' + project.id)
    });
    expect(second.version).toBe(2);
    const current = await briefRepo.findCurrent(project.id);
    expect(current?.objective).toBe('Brief v2');
    expect(current?.version).toBe(2);

    const revisions = await db.briefRevision.findMany({
      where: { briefId: brief.id },
      orderBy: { version: 'asc' }
    });
    expect(revisions.map((revision) => revision.version)).toEqual([1, 2]);
    expect(revisions[0].checksum).not.toBe(revisions[1].checksum);

    await expect(
      briefRepo.createRevision({
        projectId: project.id,
        objective: 'Doublon interdit',
        audience: 'Createurs',
        tone: 'Direct',
        cta: 'Doublon',
        platform: 'Instagram',
        format: 'Video',
        version: 2,
        checksum: 'a'.repeat(64)
      })
    ).rejects.toThrow(/brief_version_invalide/);
  });

  it('SceneRepository : upsert stable, isolation et mise a jour de duree', async () => {
    const list = await sceneRepo.listByProject(project.id);
    expect(list.map((scene) => scene.sceneKey)).toEqual(['SCENE-001', 'SCENE-002', 'SCENE-003']);
    expect(list.map((scene) => scene.id)).toEqual(scenes.map((scene) => scene.id));

    const owned = await sceneRepo.findOwned(project.id, 'SCENE-001', userA.id);
    expect(owned?.id).toBe(scenes[0].id);
    expect(await sceneRepo.findOwned(project.id, 'SCENE-001', userB.id)).toBeNull();

    await sceneRepo.upsertMany(project.id, [
      {
        sceneKey: 'SCENE-001',
        position: 1,
        title: 'Accroche modifiee',
        description: 'Accroche visuelle',
        durationSeconds: 2,
        characterKey: null
      },
      {
        sceneKey: 'SCENE-002',
        position: 2,
        title: 'Probleme',
        description: 'Probleme concret',
        durationSeconds: 2,
        characterKey: null
      },
      {
        sceneKey: 'SCENE-003',
        position: 3,
        title: 'Appel a action',
        description: 'CTA clair',
        durationSeconds: 2,
        characterKey: null
      }
    ]);

    const afterUpsert = await sceneRepo.listByProject(project.id);
    expect(afterUpsert).toHaveLength(3);
    expect(afterUpsert[0].id).toBe(scenes[0].id);
    expect(afterUpsert[0].title).toBe('Accroche modifiee');

    const updated = await sceneRepo.updateDuration(project.id, 'SCENE-003', 5);
    expect(updated.durationSeconds).toBe(5);
    expect((await sceneRepo.findOwned(project.id, 'SCENE-003', userA.id))?.durationSeconds).toBe(5);
    await sceneRepo.updateDuration(project.id, 'SCENE-003', 2);

    await expect(sceneRepo.updateDuration(project.id, 'SCENE-999', 2)).rejects.toThrow(/scene_introuvable/);
  });

  it('ProductionRepository : versions de scene, master, QA et approbation exacte', async () => {
    const latestScenes = await productionRepo.latestSceneVersions(project.id);
    expect(latestScenes).toHaveLength(3);
    expect(latestScenes.every((item) => item.version !== null && item.version.version === 1)).toBe(true);
    expect(latestScenes[0].scene.sceneKey).toBe('SCENE-001');

    const latestMaster = await productionRepo.latestMaster(project.id);
    expect(latestMaster).not.toBeNull();
    expect(latestMaster?.id).toBe(master.id);
    expect(latestMaster?.qaStatus).toBe('PASS');
    expect(latestMaster?.qaReport).toEqual({ status: 'PASS', checks: [] });
    expect(await productionRepo.nextMasterVersion(project.id)).toBe(2);
    expect(await productionRepo.latestMaster('projet-inexistant')).toBeNull();
    expect(await productionRepo.nextMasterVersion('projet-inexistant')).toBe(1);

    const foundApproval = await productionRepo.findApproval(master.id);
    expect(foundApproval?.id).toBe(approval.id);
    expect(foundApproval?.checksum).toBe(master.checksum);
    expect(foundApproval?.invalidatedAt).toBeNull();

    await productionRepo.invalidateApprovals(project.id);
    const invalidated = await productionRepo.findApproval(master.id);
    expect(invalidated?.invalidatedAt).toBeInstanceOf(Date);

    const reapproved = await productionRepo.createOrUpdateApproval({
      artifactVersionId: master.id,
      approvedBy: userB.id,
      checksum: master.checksum
    });
    expect(reapproved.invalidatedAt).toBeNull();
    expect(reapproved.approvedBy).toBe(userB.id);
  });

  it('ProductionRepository : transferts et JobRun', async () => {
    const secondMaster = await productionRepo.createMasterVersion({
      artifactId: artifact.id,
      version: 2,
      masterPath: 'projects/' + project.id + '/master/v2.mp4',
      checksum: sha256('master-v2:' + project.id),
      qaStatus: 'PASS',
      qaReport: { status: 'PASS', checks: [] }
    });
    expect(await productionRepo.nextMasterVersion(project.id)).toBe(3);
    expect((await productionRepo.latestMaster(project.id))?.version).toBe(2);

    const secondApproval = await productionRepo.createOrUpdateApproval({
      artifactVersionId: secondMaster.id,
      approvedBy: userA.id,
      checksum: secondMaster.checksum
    });
    const transfer = await productionRepo.createTransfer({
      approvalId: secondApproval.id,
      status: 'submitted',
      provider: 'postiz-mock',
      externalId: null
    });
    expect(transfer.status).toBe('submitted');
    expect(await productionRepo.findTransfer(secondApproval.id)).toEqual(transfer);
    expect(await productionRepo.findTransfer('approbation-inexistante')).toBeNull();
    await productionRepo.updateTransferStatus(transfer.id, 'acknowledged');
    expect((await productionRepo.findTransfer(secondApproval.id))?.status).toBe('acknowledged');

    const jobProject = await createOtherProject('Projet JobRun isole');
    const jobRun = await productionRepo.createJobRun({
      projectId: jobProject.id,
      type: 'correction',
      status: 'queued',
      snapshot: { sceneKey: 'SCENE-001', instruction: 'corriger' }
    });
    expect(jobRun.status).toBe('queued');
    expect(await productionRepo.findJobRun(jobRun.id)).toEqual(jobRun);
    expect(await productionRepo.findJobRun('job-inexistant')).toBeNull();
    await productionRepo.updateJobRunStatus(jobRun.id, 'running');
    expect((await productionRepo.findJobRun(jobRun.id))?.status).toBe('running');
    await productionRepo.updateJobRunStatus(jobRun.id, 'succeeded');
    expect((await productionRepo.findJobRun(jobRun.id))?.status).toBe('succeeded');
  });
});

describe('LocalOrchestratorAdapter (JobRun/StepRun, in-process)', () => {
  it('enqueue cree un JobRun queued avec ses steps pending et son snapshot', async () => {
    expect(successJobRun.id).toBeTruthy();
    expect(successJobRun.status).toBe('queued');
    expect(successJobRun.type).toBe('produce');
    expect(successJobRun.snapshot).toEqual({ projectId: project.id, briefVersion: 1 });

    const steps = await db.stepRun.findMany({
      where: { jobRunId: successJobRun.id },
      orderBy: { name: 'asc' }
    });
    expect(steps).toHaveLength(LOCAL_ORCHESTRATOR_DEFAULT_STEPS.length);
    expect(steps.map((step) => step.name).sort()).toEqual([...LOCAL_ORCHESTRATOR_DEFAULT_STEPS].sort());
    expect(steps.every((step) => step.status === 'pending')).toBe(true);
  });

  it('markRunning puis markSucceeded met a jour le run et clot les steps', async () => {
    await orchestrator.markRunning(successJobRun.id);
    expect((await db.jobRun.findUnique({ where: { id: successJobRun.id } }))?.status).toBe('running');

    await orchestrator.markSucceeded(successJobRun.id);
    const jobRun = await db.jobRun.findUnique({ where: { id: successJobRun.id } });
    expect(jobRun?.status).toBe('succeeded');

    const steps = await db.stepRun.findMany({ where: { jobRunId: successJobRun.id } });
    expect(steps.every((step) => step.status === 'succeeded')).toBe(true);
    expect(steps.every((step) => step.finishedAt !== null)).toBe(true);
  });

  it('markFailed met a jour le run et journalise l erreur sur les steps', async () => {
    const failedRun = await orchestrator.enqueue({
      projectId: project.id,
      type: 'correct',
      snapshot: { sceneKey: 'SCENE-002' }
    });
    await orchestrator.markRunning(failedRun.id);
    await orchestrator.markFailed(failedRun.id, 'Echec renderer simule');

    const jobRun = await db.jobRun.findUnique({ where: { id: failedRun.id } });
    expect(jobRun?.status).toBe('failed');
    const steps = await db.stepRun.findMany({ where: { jobRunId: failedRun.id } });
    expect(steps.every((step) => step.status === 'failed')).toBe(true);
    expect(steps.every((step) => step.error === 'Echec renderer simule')).toBe(true);
  });

  it('refuse un jobRun inconnu au lieu de creer un etat fantome', async () => {
    await expect(orchestrator.markRunning('jobrun-inexistant')).rejects.toThrow(/job_run_introuvable/);
    await expect(orchestrator.markSucceeded('jobrun-inexistant')).rejects.toThrow(/job_run_introuvable/);
    await expect(orchestrator.markFailed('jobrun-inexistant', 'erreur')).rejects.toThrow(/job_run_introuvable/);
  });
});

describe('PostizMockAdapter (mock contractuel, idempotent)', () => {
  it('cree un TransferRecord MOCK puis l acquitte localement, sans publication', async () => {
    const first = await postiz.transfer({
      approvalId: approval.id,
      checksum: approval.checksum,
      artifactVersionId: master.id
    });
    expect(first.provider).toBe(POSTIZ_MOCK_PROVIDER);
    expect(first.status).toBe('submitted');
    expect(first.externalId).toBeNull();
    expect(first.status).not.toBe('published');

    await new Promise((resolve) => setTimeout(resolve, 600));
    const second = await postiz.transfer({
      approvalId: approval.id,
      checksum: approval.checksum,
      artifactVersionId: master.id
    });
    expect(second.status).toBe('acknowledged');
    expect(second.id).toBe(first.id);
    expect(await db.transfer.count({ where: { approvalId: approval.id } })).toBe(1);
  });

  it('refuse un checksum divergent, une approbation invalidee ou absente', async () => {
    const riskyProject = await createOtherProject('Projet risque postiz');
    const riskyArtifact = await db.artifact.create({ data: { projectId: riskyProject.id, kind: 'master' } });
    const riskyVersion = await productionRepo.createMasterVersion({
      artifactId: riskyArtifact.id,
      version: 1,
      masterPath: 'projects/' + riskyProject.id + '/master/v1.mp4',
      checksum: sha256('risky-master:' + riskyProject.id),
      qaStatus: 'PASS',
      qaReport: null
    });
    const riskyApproval = await productionRepo.createOrUpdateApproval({
      artifactVersionId: riskyVersion.id,
      approvedBy: userA.id,
      checksum: riskyVersion.checksum
    });

    await expect(
      postiz.transfer({
        approvalId: riskyApproval.id,
        checksum: 'f'.repeat(64),
        artifactVersionId: riskyVersion.id
      })
    ).rejects.toThrow(/checksum_divergent/);

    await db.approval.update({ where: { id: riskyApproval.id }, data: { invalidatedAt: new Date() } });
    await expect(
      postiz.transfer({
        approvalId: riskyApproval.id,
        checksum: riskyVersion.checksum,
        artifactVersionId: riskyVersion.id
      })
    ).rejects.toThrow(/approbation_invalidee/);

    await expect(
      postiz.transfer({ approvalId: 'approval-inexistant', checksum: 'a'.repeat(64), artifactVersionId: 'version-inexistante' })
    ).rejects.toThrow(/approbation_requise/);
    expect(await db.transfer.count({ where: { approvalId: riskyApproval.id } })).toBe(0);
  });
});

describe('PrismaAuditAdapter (AuditEvent)', () => {
  it('persiste actor, action, cible et metadata JSON', async () => {
    const action = 'infra-test-' + RUN_ID + '-project-read';
    await audit.record({
      actorId: userA.id,
      action,
      targetType: 'project',
      targetId: project.id,
      metadata: { route: 'GET /projects', count: 1 }
    });

    const event = await db.auditEvent.findFirst({ where: { action } });
    expect(event).not.toBeNull();
    expect(event?.actorId).toBe(userA.id);
    expect(event?.targetType).toBe('project');
    expect(event?.targetId).toBe(project.id);
    expect(event?.metadata).toEqual({ route: 'GET /projects', count: 1 });
    expect(event?.createdAt).toBeInstanceOf(Date);
  });

  it('accepte un acteur anonyme et une metadata absente', async () => {
    const action = 'infra-test-' + RUN_ID + '-anonymous';
    await audit.record({
      actorId: null,
      action,
      targetType: 'system',
      targetId: null
    });
    const event = await db.auditEvent.findFirst({ where: { action } });
    expect(event?.actorId).toBeNull();
    expect(event?.targetId).toBeNull();
    expect(event?.metadata).toBeNull();
  });
});