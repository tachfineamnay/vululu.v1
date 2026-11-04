import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => {
  process.env.APP_ENV = 'test'; process.env.V0_TEST_DB = '1';
  process.env.DATABASE_URL_TEST = 'postgresql://vululu@127.0.0.1:55432/vululu_v1_00_test?schema=public';
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
  process.env.SESSION_SECRET = globalThis.crypto.randomUUID();
  process.env.ARTIFACT_DIR = '.v1/library-test-artifacts';
});
import { prisma as db } from '@vululu/db';
import { AssetUseCases } from '@vululu/application';
import { renderScene, inspectAsset } from '../../packages/media/src/index';
import { buildServer } from '../../apps/api/src/server';
import { PrismaAssetRepository } from '../../apps/api/src/infrastructure/prisma/assetRepository';
import { PrismaContextRepository } from '../../apps/api/src/infrastructure/prisma/contextRepository';
import { PrismaProjectRepository } from '../../apps/api/src/infrastructure/prisma/projectRepository';
import { PrismaAuditAdapter } from '../../apps/api/src/infrastructure/audit/prismaAuditAdapter';
import { LocalFilesystemArtifactStorage } from '../../apps/api/src/infrastructure/storage/localArtifactStorage';
import { PrismaProductionRunRepository } from '../../apps/api/src/infrastructure/prisma/productionRunRepository';

type Auth = { cookie: string; csrf: string; userId: string; contextId: string; projectId: string };
type Version = { id: string; assetId: string; sha256: string; version: number; name: string };
let app: Awaited<ReturnType<typeof buildServer>>;
let a: Auth; let b: Auth; let otherContext: string; let png: Buffer;
const users: string[] = [];
const metadata = { name: 'Notes fictives', kind: 'document', mimeType: 'text/plain', license: 'commercial', provenance: 'Création originale fictive pour la recette' };
function request(auth: Auth, method: 'GET' | 'PUT', url: string, payload?: object) {
  return app.inject({ method, url, headers: { cookie: auth.cookie, 'x-csrf-token': auth.csrf }, ...(payload ? { payload } : {}) });
}
function upload(auth: Auth, input: Record<string, unknown> = {}, bytes = Buffer.from('Notes fictives pour test'), contextId = auth.contextId) {
  return app.inject({ method: 'POST', url: `/api/contexts/${contextId}/assets`, headers: { cookie: auth.cookie, 'x-csrf-token': auth.csrf, 'content-type': 'application/octet-stream', 'x-asset-metadata': encodeURIComponent(JSON.stringify({ ...metadata, ...input })) }, payload: bytes });
}
async function create(input: Record<string, unknown> = {}, bytes?: Buffer) {
  const response = await upload(a, input, bytes);
  expect(response.statusCode, response.body).toBe(201);
  return response.json().version as Version;
}
function url(v: Version) { return `/api/assets/${v.assetId}/versions/${v.id}/content`; }
async function select(versionIds: string[], usage = 'organic') {
  return request(a, 'PUT', `/api/projects/${a.projectId}/assets`, { usage, versionIds });
}
beforeAll(async () => {
  app = await buildServer();
  const password = crypto.randomBytes(24).toString('base64url');
  const passwordHash = await bcrypt.hash(password, 4);
  async function setup(label: string) {
    const user = await db.user.create({ data: { email: `assets-${crypto.randomUUID()}@example.test`, name: label, passwordHash, role: 'user' } }); users.push(user.id);
    const context = await db.brandContext.create({ data: { userId: user.id, name: label, description: 'Contexte fictif actifs' } });
    const project = await db.project.create({ data: { userId: user.id, contextId: context.id, title: label, platform: 'Instagram', format: 'Video', objective: 'Fixture' } });
    const response = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: user.email, password } });
    expect(response.statusCode).toBe(200);
    return { userId: user.id, contextId: context.id, projectId: project.id, cookie: response.cookies.map((c) => c.name + '=' + c.value).join('; '), csrf: response.json().csrfToken };
  }
  a = await setup('Actifs A'); b = await setup('Actifs B');
  otherContext = (await db.brandContext.create({ data: { userId: a.userId, name: 'Autre contexte A', description: 'Isolation des contextes' } })).id;
  const fixture = await renderScene({ projectId: 'asset-fixture', artifactRoot: path.resolve('.v1/library-test-artifacts'), sceneKey: 'SCENE-001', position: 1, title: 'Image fictive', description: 'Fixture', brandName: 'Fixture', colorPrimary: '#123456', colorSecondary: '#abcdef', version: 1 });
  png = fs.readFileSync(fixture.absolutePath);
});
afterAll(async () => {
  await db.project.deleteMany({ where: { userId: { in: users } } });
  await db.brandAsset.deleteMany({ where: { userId: { in: users } } });
  await db.brandContext.deleteMany({ where: { userId: { in: users } } });
  await db.auditEvent.deleteMany({ where: { actorId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  if (app) await app.close(); await db.$disconnect();
});
describe('Actifs : API, stockage reel et droits', () => {
  it('importe une image et conserve deux versions et leurs octets exacts', async () => {
    const old = await create({ name: 'Logo v1', kind: 'logo', mimeType: 'image/png' }, png);
    const before = await db.brandAssetVersion.findUniqueOrThrow({ where: { id: old.id } });
    const next = await create({ assetId: old.assetId, name: 'Logo v2', kind: 'logo', mimeType: 'image/png' }, png);
    expect(next.version).toBe(2);
    expect(await db.brandAssetVersion.findUniqueOrThrow({ where: { id: old.id } })).toEqual(before);
    for (const v of [old, next]) {
      const file = await request(a, 'GET', url(v)); expect(file.statusCode).toBe(200);
      expect(file.rawPayload).toEqual(png); expect(v.sha256).toBe(crypto.createHash('sha256').update(png).digest('hex'));
      expect(file.headers['x-content-type-options']).toBe('nosniff');
    }
    const detail = (await request(a, 'GET', '/api/assets/' + old.assetId)).json().asset;
    expect(detail.versions).toHaveLength(2);
    for (const v of detail.versions) { expect(v).not.toHaveProperty('storageKey'); expect(v).not.toHaveProperty('userId'); }
  });
  it('sert les ranges et force les documents en pieces jointes', async () => {
    const v = await create();
    const file = await app.inject({ method: 'GET', url: url(v), headers: { cookie: a.cookie, range: 'bytes=0-4' } });
    expect(file.statusCode).toBe(206); expect(file.body).toBe('Notes');
    expect(file.headers['content-disposition']).toContain('attachment'); expect(file.headers['cache-control']).toBe('private, no-store');
    expect((await app.inject({ method: 'GET', url: url(v), headers: { cookie: a.cookie, range: 'bytes=99999-' } })).statusCode).toBe(416);
  });
  it('isole toutes les lectures, versions et selections entre utilisateurs et contextes', async () => {
    const v = await create();
    expect((await request(b, 'GET', url(v))).statusCode).toBe(404);
    expect((await request(b, 'GET', '/api/assets/' + v.assetId)).statusCode).toBe(404);
    expect((await request(b, 'GET', `/api/contexts/${a.contextId}/assets`)).statusCode).toBe(404);
    expect((await request(b, 'GET', `/api/projects/${a.projectId}/assets`)).statusCode).toBe(404);
    expect((await upload(b, { assetId: v.assetId })).statusCode).toBe(404);
    expect((await upload(a, { assetId: v.assetId }, undefined, otherContext)).statusCode).toBe(400);
    expect((await upload(a, {}, undefined, b.contextId)).statusCode).toBe(404);
    expect((await request(b, 'PUT', `/api/projects/${b.projectId}/assets`, { versionIds: [v.id] })).statusCode).toBe(404);
    const other = (await upload(a, {}, undefined, otherContext)).json().version as Version;
    expect((await select([other.id])).statusCode).toBe(404);
    const foreign = (await upload(b)).json().version as Version;
    expect((await request(a, 'GET', `/api/assets/${v.assetId}/versions/${foreign.id}/content`)).statusCode).toBe(404);
    await db.user.update({ where: { id: b.userId }, data: { role: 'super_admin' } });
    expect((await request(b, 'GET', url(v))).statusCode).toBe(404);
    await db.user.update({ where: { id: b.userId }, data: { role: 'user' } });
  });
  it('refuse anonyme et CSRF avant le corps binaire', async () => {
    expect((await app.inject({ method: 'GET', url: `/api/contexts/${a.contextId}/assets` })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: `/api/contexts/${a.contextId}/assets`, headers: { 'content-type': 'application/octet-stream' }, payload: png })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: `/api/contexts/${a.contextId}/assets`, headers: { cookie: a.cookie, 'content-type': 'application/octet-stream' }, payload: png })).statusCode).toBe(403);
  });
  it.each([{ name: '../evil.txt' }, { name: 'bad\\path' }, { mimeType: 'text/html' }, { kind: 'logo' }, { provenance: '' }, { license: 'invented' }])('refuse les metadonnees dangereuses ou incoherentes %o', async (input) => {
    const before = await db.brandAsset.count({ where: { userId: a.userId } });
    expect((await upload(a, input)).statusCode).toBe(400);
    expect(await db.brandAsset.count({ where: { userId: a.userId } })).toBe(before);
  });
  it('refuse octets invalides, fichier vide et limite depassee', async () => {
    expect((await upload(a, {}, Buffer.from([0xff, 0x00]))).statusCode).toBe(400);
    expect((await upload(a, {}, Buffer.alloc(0))).statusCode).toBe(400);
    expect((await upload(a, {}, Buffer.alloc(32 * 1024 * 1024 + 1))).statusCode).toBe(413);
  });
  it('controle droits, contexte et unicite de version sans selection partielle', async () => {
    const internal = await create({ license: 'internal' }); const unknown = await create({ license: 'unknown' });
    expect((await select([internal.id])).statusCode).toBe(200);
    expect((await select([internal.id], 'sponsored')).statusCode).toBe(400);
    expect((await select([unknown.id])).statusCode).toBe(400);
    expect((await request(a, 'GET', `/api/projects/${a.projectId}/assets`)).json().versionIds).toEqual([internal.id]);
    const next = await create({ assetId: internal.assetId, license: 'commercial' });
    expect((await select([internal.id, next.id])).statusCode).toBe(400);
    expect((await select([next.id], 'sponsored')).statusCode).toBe(200);
    expect((await select([])).statusCode).toBe(200);
  });
  it('revalide les droits et proprietaires dans le repository sans passer par HTTP', async () => {
    const v = await create({ license: 'internal' }); const repo = new PrismaAssetRepository(db);
    await expect(repo.selectOwned(b.projectId, b.userId, 'organic', [v.id])).rejects.toMatchObject({ statusCode: 404 });
    await expect(repo.selectOwned(a.projectId, a.userId, 'sponsored', [v.id])).rejects.toThrow('Droits insuffisants');
    await expect(repo.finalize(v.id, b.userId, 'failed')).rejects.toMatchObject({ statusCode: 409 });
  });
  it('fige une selection et refuse de la modifier pendant une production', async () => {
    const v = await create(); expect((await select([v.id], 'sponsored')).statusCode).toBe(200);
    await db.brief.create({ data: { projectId: a.projectId, objective: 'Fixture', audience: 'Fixture', tone: 'Fixture', cta: 'Fixture', platform: 'Instagram', format: 'Video' } });
    await db.scene.createMany({ data: Array.from({ length: 5 }, (_, i) => ({ projectId: a.projectId, sceneKey: 'SCENE-00' + (i + 1), position: i + 1, title: 'Fixture', description: 'Fixture' })) });
    const run = await new PrismaProductionRunRepository(db).startRun({ userId: a.userId, projectId: a.projectId, type: 'produce', targetSceneKey: null, instruction: null, steps: ['render'] });
    const before = await db.jobRun.findUniqueOrThrow({ where: { id: run.jobRun.id } });
    expect(before.snapshot).toMatchObject({ project: { usage: 'sponsored' }, assets: [{ assetId: v.assetId, versionId: v.id, sha256: v.sha256, license: 'commercial' }] });
    await create({ assetId: v.assetId, name: 'Version suivante' });
    expect((await select([])).statusCode).toBe(409);
    expect(await db.jobRun.findUniqueOrThrow({ where: { id: run.jobRun.id } })).toEqual(before);
    await db.jobRun.update({ where: { id: run.jobRun.id }, data: { status: 'completed' } });
    await db.project.update({ where: { id: a.projectId }, data: { status: 'review' } });
    expect((await select([])).statusCode).toBe(200);
  });
  it('MOCK stockage en echec : version failed, jamais utilisable ni lisible', async () => {
    const storage = new LocalFilesystemArtifactStorage(path.resolve('.v1/asset-failure-test'));
    vi.spyOn(storage, 'putObject').mockRejectedValue(new Error('MOCK intentional storage outage'));
    const useCases = new AssetUseCases(new PrismaAssetRepository(db), new PrismaContextRepository(db), new PrismaProjectRepository(db), { inspect: inspectAsset }, storage, { local: storage }, new PrismaAuditAdapter(), { now: () => new Date() }, { next: () => crypto.randomUUID() });
    const actor = { id: a.userId, role: 'user' as const };
    await expect(useCases.upload(actor, a.contextId, metadata as any, Buffer.from('Fixture echec stockage'))).rejects.toMatchObject({ statusCode: 503, code: 'asset_storage_failed' });
    const failed = await db.brandAssetVersion.findFirstOrThrow({ where: { asset: { userId: a.userId }, state: 'failed' } });
    expect((await useCases.list(actor, a.contextId)).flatMap((row) => row.versions).map((row) => row.id)).not.toContain(failed.id);
    await expect(useCases.content(actor, failed.assetId, failed.id)).rejects.toMatchObject({ statusCode: 404 });
  });
  it('numerote deux imports concurrents sans ecraser les versions', async () => {
    const v = await create();
    const results = await Promise.all([upload(a, { assetId: v.assetId, name: 'Parallele 2' }), upload(a, { assetId: v.assetId, name: 'Parallele 3' })]);
    expect(results.map((r) => r.statusCode)).toEqual([201, 201]);
    expect(results.map((r) => r.json().version.version).sort()).toEqual([2, 3]);
    expect((await request(a, 'GET', url(v))).statusCode).toBe(200);
  });
});
