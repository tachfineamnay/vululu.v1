import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  const testDbUrl = 'postgresql://vululu@127.0.0.1:55432/vululu_v1_00_test?schema=public';
  process.env.V0_TEST_DB = '1';
  process.env.DATABASE_URL_TEST = testDbUrl;
  process.env.DATABASE_URL = testDbUrl;
});

import { prisma } from '@vululu/db';
import { env } from '../../apps/api/src/env';
import type {
  DurableRoutingPort,
  MasterRenderRequest,
  MediaRendererPort,
  SceneRenderRequest
} from '@vululu/application';
import { DurableProductionUseCases, DURABLE_PRODUCTION_STEPS } from '@vululu/application';
import {
  ArtifactInventoryService,
  ArtifactMigrationService,
  LocalFilesystemArtifactStorage,
  LocalStoragePort,
  PostizMockAdapter,
  PrismaArtifactAccess,
  PrismaArtifactPublisher,
  PrismaAuditAdapter,
  PrismaDurableProductionStore,
  PrismaProductionRepository,
  PrismaProductionRunRepository,
  S3CompatibleArtifactStorage
} from '../../apps/api/src/infrastructure';

const TEST_DB_URL = 'postgresql://vululu@127.0.0.1:55432/vululu_v1_00_test?schema=public';
const RUN_ID = 'e-' + Date.now();
const ROOT = path.join(env.repoRoot, '.v1', 'test', RUN_ID);
const S3_ENABLED = process.env.E_S3_TEST === '1';

class FakeMedia implements MediaRendererPort {
  async renderScene(input: SceneRenderRequest) {
    const content = Buffer.from('scene:' + input.sceneKey + ':' + input.version);
    const checksum = sha(content);
    const absolutePath = path.join(ROOT, 'tmp', input.sceneKey + '-v' + input.version + '.png');
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content);
    return {
      relativePath: 'tmp/' + input.sceneKey + '/v' + input.version + '.png',
      absolutePath,
      checksum,
      width: 1080,
      height: 1920
    };
  }
  async assembleMaster(input: MasterRenderRequest) {
    const content = Buffer.from('master-video-' + input.version);
    const checksum = sha(content);
    const absolutePath = path.join(ROOT, 'tmp', 'master-v' + input.version + '.mp4');
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content);
    return {
      relativePath: 'tmp/master-v' + input.version + '.mp4',
      absolutePath,
      checksum,
      duration: input.sceneDurationsSeconds.reduce((total, value) => total + value, 0),
      expectedDurationSeconds: input.sceneDurationsSeconds.reduce((total, value) => total + value, 0),
      videoCodec: 'h264',
      audioCodec: 'aac',
      width: 1080,
      height: 1920
    };
  }
  async runQa() {
    return { status: 'PASS', checks: [{ name: 'e', status: 'PASS', detail: 'ok' }] };
  }
}

class FakeRouting implements DurableRoutingPort {
  async resolve(input: { jobRunId: string }) {
    return {
      agentDefinitionId: 'e-agent',
      agentConfigVersionId: 'e-config',
      agentConfigChecksum: sha('e-config'),
      capabilityKey: 'scene.generate',
      providerId: 'e-provider',
      modelId: 'e-model',
      providerKey: 'mock-e',
      modelKey: 'mock-e',
      fallbackModelId: null,
      policy: { mock: true },
      decisionId: 'e-decision-' + input.jobRunId,
      estimatedCents: 1,
      actualCents: 1,
      usedFallback: false
    };
  }
}

async function createProject(): Promise<{ userId: string; projectId: string }> {
  const user = await prisma.user.create({
    data: { email: 'e-pipeline-' + RUN_ID + '@vululu.local', passwordHash: 'x', name: 'E pipeline', role: 'user' }
  });
  const context = await prisma.brandContext.create({
    data: { userId: user.id, name: 'E ctx', description: 'E ctx' }
  });
  const project = await prisma.project.create({
    data: {
      userId: user.id,
      contextId: context.id,
      title: 'E pipeline ' + RUN_ID,
      platform: 'Instagram',
      format: 'Video',
      objective: 'E',
      status: 'draft',
      brief: {
        create: {
          objective: 'o', audience: 'a', tone: 't', cta: 'c', platform: 'Instagram', format: 'Video', version: 1,
          revisions: { create: [{ version: 1, objective: 'o', audience: 'a', tone: 't', cta: 'c', platform: 'Instagram', format: 'Video', checksum: sha('e-brief') }] }
        }
      },
      scenes: {
        create: [1, 2, 3, 4, 5].map((position) => ({
          sceneKey: 'SCENE-00' + position,
          position,
          title: 'Scene ' + position,
          description: 'Desc ' + position,
          durationSeconds: 2
        }))
      }
    }
  });
  return { userId: user.id, projectId: project.id };
}


function sha(value: string | Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

beforeAll(async () => {
  fs.mkdirSync(ROOT, { recursive: true });
  execSync('pnpm exec prisma migrate deploy --schema packages/db/prisma/schema.prisma', {
    cwd: env.repoRoot,
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: 'pipe'
  });
  await prisma.$executeRawUnsafe('SELECT 1');
});

afterAll(async () => {
  await prisma.$disconnect();
  fs.rmSync(ROOT, { recursive: true, force: true });
});

describe('V1-01-E stockage local et publication', () => {
  it('respecte le contrat local : upload, checksum, head, stream et range', async () => {
    const storage = new LocalFilesystemArtifactStorage(ROOT);
    const content = Buffer.from('scene-bytes-' + RUN_ID);
    const source = path.join(ROOT, 'source.png');
    fs.writeFileSync(source, content);
    const key = 'artifacts/project-e/scenes/scene-1/v1/' + sha(content) + '.png';
    const put = await storage.putFile({
      key,
      filePath: source,
      contentType: 'image/png',
      sha256: sha(content),
      sizeBytes: content.length
    });
    expect(put.provider).toBe('local');
    expect(put.key).toBe(key);
    expect(await storage.verify(key, sha(content))).toBe(true);
    const head = await storage.head(key);
    expect(head?.sizeBytes).toBe(content.length);
    const full = await storage.get(key);
    const chunks: Buffer[] = [];
    for await (const chunk of full.stream) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).equals(content)).toBe(true);
    const partial = await storage.get(key, { start: 0, end: 4 });
    const parts: Buffer[] = [];
    for await (const chunk of partial.stream) parts.push(Buffer.from(chunk));
    expect(Buffer.concat(parts).toString()).toBe('scene');
    await expect(storage.get(key, { start: 0, end: 999999 })).rejects.toThrow(/range/);
    const second = await storage.putFile({
      key,
      filePath: source,
      contentType: 'image/png',
      sha256: sha(content),
      sizeBytes: content.length
    });
    expect(second.key).toBe(key);
    expect(await storage.list('artifacts/project-e')).toHaveLength(1);
    await expect(
      storage.putFile({
        key,
        filePath: source,
        contentType: 'image/png',
        sha256: sha('different'),
        sizeBytes: content.length
      })
    ).rejects.toThrow(/checksum/);
  });

  it('publie de maniere idempotente et trace ArtifactObject', async () => {
    const storage = new LocalFilesystemArtifactStorage(ROOT);
    const publisher = new PrismaArtifactPublisher(storage, prisma);
    const source = path.join(ROOT, 'master.mp4');
    const content = Buffer.from('master-bytes-' + RUN_ID);
    fs.writeFileSync(source, content);
    const first = await publisher.publish({
      kind: 'master',
      jobRunId: 'job-e-' + RUN_ID,
      projectId: 'project-e-' + RUN_ID,
      version: 1,
      filePath: source,
      contentType: 'video/mp4',
      checksum: sha(content),
      manifest: { test: true }
    });
    const second = await publisher.publish({
      kind: 'master',
      jobRunId: 'job-e-' + RUN_ID,
      projectId: 'project-e-' + RUN_ID,
      version: 1,
      filePath: source,
      contentType: 'video/mp4',
      checksum: sha(content),
      manifest: { test: true }
    });
    expect(second.key).toBe(first.key);
    expect(await publisher.verifyPublished(second)).toBe(true);
    const objects = await prisma.artifactObject.findMany({
      where: { provider: 'local', key: first.key }
    });
    expect(objects).toHaveLength(1);
    expect(objects[0].state).toBe('staged');
    expect(objects[0].manifest).toEqual({ test: true });
  });

  it('sert les anciens chemins et les nouveaux storageKey avec isolation proprietaire', async () => {
    const storage = new LocalFilesystemArtifactStorage(ROOT);
    const access = new PrismaArtifactAccess(storage, prisma);
    const userA = await prisma.user.create({
      data: { email: 'e-a-' + RUN_ID + '@vululu.local', passwordHash: 'x', name: 'E A', role: 'user' }
    });
    const userB = await prisma.user.create({
      data: { email: 'e-b-' + RUN_ID + '@vululu.local', passwordHash: 'x', name: 'E B', role: 'user' }
    });
    const context = await prisma.brandContext.create({
      data: { userId: userA.id, name: 'ctx', description: 'ctx' }
    });
    const project = await prisma.project.create({
      data: {
        userId: userA.id,
        contextId: context.id,
        title: 'E access',
        platform: 'Instagram',
        format: 'Video',
        objective: 'E'
      }
    });
    const scene = await prisma.scene.create({
      data: { projectId: project.id, sceneKey: 'SCENE-001', position: 1, title: 'S', description: 'D' }
    });
    const content = Buffer.from('access-image-' + RUN_ID);
    const key = 'artifacts/' + project.id + '/scenes/' + scene.id + '/v1/' + sha(content) + '.png';
    fs.mkdirSync(path.dirname(path.join(ROOT, key)), { recursive: true });
    fs.writeFileSync(path.join(ROOT, key), content);
    await prisma.sceneVersion.create({
      data: {
        sceneId: scene.id,
        version: 1,
        imagePath: 'legacy/image.png',
        prompt: 'p',
        checksum: sha(content),
        storageKey: key,
        storageProvider: 'local',
        mimeType: 'image/png',
        sizeBytes: BigInt(content.length),
        sha256: sha(content),
        finalizationState: 'ready'
      }
    });
    const file = await access.getSceneImage(userA.id, project.id, 'SCENE-001');
    expect(file.storageKey).toBe(key);
    const stream = await file.openRead!();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).equals(content)).toBe(true);
    await expect(access.getSceneImage(userB.id, project.id, 'SCENE-001')).rejects.toThrow(/introuvable/);
    await prisma.user.delete({ where: { id: userA.id } });
    await prisma.user.delete({ where: { id: userB.id } });
  });


  it('publie le pipeline finalise vers le stockage et enregistre les metadonnees immuables', async () => {
    const fixture = await createProject();
    const storage = new LocalFilesystemArtifactStorage(ROOT);
    const publisher = new PrismaArtifactPublisher(storage, prisma);
    const store = new PrismaDurableProductionStore(prisma);
    const master = new PrismaProductionRepository(prisma);
    const useCases = new DurableProductionUseCases(
      store,
      new FakeMedia(),
      new LocalStoragePort(ROOT),
      new FakeRouting(),
      master,
      new PostizMockAdapter(prisma),
      new PrismaAuditAdapter(prisma),
      { now: () => new Date('2026-10-25T00:00:00.000Z') },
      ROOT,
      0,
      100,
      publisher
    );
    const runs = new PrismaProductionRunRepository(prisma);
    const { jobRun } = await runs.startRun({
      userId: fixture.userId,
      projectId: fixture.projectId,
      type: 'produce',
      targetSceneKey: null,
      instruction: null,
      steps: [...DURABLE_PRODUCTION_STEPS],
      outbox: { kind: 'start_run', payload: { projectId: fixture.projectId, type: 'produce' } }
    });
    for (const step of ['validateSnapshot', 'resolveCapabilities', 'renderScenes', 'assembleMaster', 'runQa', 'finalize'] as const) {
      await (useCases[step] as (id: string) => Promise<unknown>)(jobRun.id);
    }
    const finalized = await useCases.finalize(jobRun.id);
    const artifact = await master.latestMaster(fixture.projectId);
    expect(artifact?.id).toBe(finalized.artifactVersionId);
    const sceneVersions = await prisma.sceneVersion.findMany({
      where: { scene: { projectId: fixture.projectId } },
      orderBy: { version: 'asc' }
    });
    expect(sceneVersions).toHaveLength(5);
    expect(sceneVersions.every((version) => version.storageKey && version.storageProvider === 'local')).toBe(true);
    expect(sceneVersions.every((version) => version.finalizationState === 'ready')).toBe(true);
    const masterRow = await prisma.artifactVersion.findUnique({ where: { id: finalized.artifactVersionId } });
    expect(masterRow?.storageKey).toBeTruthy();
    expect(masterRow?.sha256).toBe(masterRow?.checksum);
    const runArtifact = await prisma.runArtifact.findUnique({ where: { jobRunId: jobRun.id } });
    expect(runArtifact?.manifest).toBeTruthy();
    const storedObjects = await prisma.artifactObject.findMany({ where: { jobRunId: jobRun.id } });
    expect(storedObjects).toHaveLength(6);
    expect(storedObjects.every((object) => object.state === 'ready')).toBe(true);
    const access = new PrismaArtifactAccess(storage, prisma);
    const image = await access.getSceneImage(fixture.userId, fixture.projectId, 'SCENE-003');
    expect(image.storageKey).toBeTruthy();
    const chunks: Buffer[] = [];
    for await (const chunk of (await image.openRead!()) as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk));
    expect(chunks.length).toBeGreaterThan(0);
    await prisma.user.delete({ where: { id: fixture.userId } });
  });

  it('inventorie les objets manquants/orphelins sans supprimer', async () => {
    const storage = new LocalFilesystemArtifactStorage(ROOT);
    const inventory = new ArtifactInventoryService(storage, prisma, storage);
    const orphan = path.join(ROOT, 'artifacts/orphan/object.bin');
    fs.mkdirSync(path.dirname(orphan), { recursive: true });
    fs.writeFileSync(orphan, 'orphan');
    const report = await inventory.report({ prefix: 'artifacts', graceHours: 0 });
    expect(report.mode).toBe('audit');
    expect(report.dryRun).toBe(true);
    expect(report.counts.orphan_object).toBeGreaterThan(0);
    expect(report.cleanupCandidates.some((candidate) => candidate.key.includes('orphan'))).toBe(true);
    expect(fs.existsSync(orphan)).toBe(true);
  });

  it('prepare une migration legacy dry-run sans marquer le média migre', async () => {
    const storage = new LocalFilesystemArtifactStorage(ROOT);
    const publisher = new PrismaArtifactPublisher(storage, prisma);
    const migration = new ArtifactMigrationService(storage, publisher, prisma, storage);
    const plan = await migration.plan(5);
    expect(Array.isArray(plan)).toBe(true);
    const result = await migration.migrate({ apply: false, limit: 5 });
    expect(result.apply).toBe(false);
  });
});

describe.skipIf(!S3_ENABLED)('V1-01-E stockage S3-compatible local', () => {
  it('respecte le contrat sur un backend S3 real (rclone serve s3)', async () => {
    const endpoint = process.env.S3_ENDPOINT!;
    const bucket = process.env.S3_BUCKET!;
    const storage = new S3CompatibleArtifactStorage({
      endpoint,
      region: process.env.S3_REGION || 'us-east-1',
      bucket,
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      forcePathStyle: true,
      timeoutMs: 30000,
      maxAttempts: 2
    });
    const content = Buffer.from('s3-real-' + RUN_ID + '-' + 'x'.repeat(1024));
    const key = 'e-contract/' + RUN_ID + '/' + sha(content) + '.bin';
    const put = await storage.putObject({
      key,
      body: content,
      contentType: 'application/octet-stream',
      sha256: sha(content),
      sizeBytes: content.length
    });
    expect(put.provider).toBe('s3');
    expect(await storage.verify(key, sha(content))).toBe(true);
    const head = await storage.head(key);
    expect(head?.sizeBytes).toBe(content.length);
    const full = await storage.get(key);
    const chunks: Buffer[] = [];
    for await (const chunk of full.stream) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).equals(content)).toBe(true);
    const partial = await storage.get(key, { start: 0, end: 4 });
    const parts: Buffer[] = [];
    for await (const chunk of partial.stream) parts.push(Buffer.from(chunk));
    expect(Buffer.concat(parts).toString()).toBe('s3-re');
    expect((await storage.list('e-contract/' + RUN_ID)).length).toBeGreaterThan(0);
    (storage as unknown as { close?: () => void }).close?.();
  });

  it('gere un fichier volumineux par upload multipart et lecture partielle', async () => {
    const storage = new S3CompatibleArtifactStorage({
      endpoint: process.env.S3_ENDPOINT!,
      region: process.env.S3_REGION || 'us-east-1',
      bucket: process.env.S3_BUCKET!,
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      forcePathStyle: true,
      timeoutMs: 60000,
      maxAttempts: 2
    });
    const large = Buffer.alloc(12 * 1024 * 1024);
    for (let index = 0; index < large.length; index += 1) large[index] = index % 251;
    const source = path.join(ROOT, 'large.mp4');
    fs.writeFileSync(source, large);
    const key = 'e-contract/' + RUN_ID + '/large/' + sha(large) + '.mp4';
    const put = await storage.putFile({
      key,
      filePath: source,
      contentType: 'video/mp4',
      sha256: sha(large),
      sizeBytes: large.length
    });
    expect(put.sizeBytes).toBe(large.length);
    expect(await storage.verify(key, sha(large))).toBe(true);
    const partial = await storage.get(key, { start: 8 * 1024 * 1024, end: 8 * 1024 * 1024 + 9 });
    const chunks: Buffer[] = [];
    for await (const chunk of partial.stream) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).equals(large.subarray(8 * 1024 * 1024, 8 * 1024 * 1024 + 10))).toBe(true);
    (storage as unknown as { close?: () => void }).close?.();
  });
});