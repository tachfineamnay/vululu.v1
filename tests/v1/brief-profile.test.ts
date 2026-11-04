import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { productionSourceChecksum } from '@vululu/application';
import { beforeAll, afterAll, expect, it, vi } from 'vitest';
vi.hoisted(() => {
  process.env.APP_ENV = 'test'; process.env.V0_TEST_DB = '1';
  process.env.DATABASE_URL_TEST = 'postgresql://vululu@127.0.0.1:55432/vululu_v1_00_test?schema=public';
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST; process.env.SESSION_SECRET = globalThis.crypto.randomUUID();
});
import { prisma as db } from '@vululu/db';
import { buildServer } from '../../apps/api/src/server';
import { PrismaProductionRunRepository } from '../../apps/api/src/infrastructure/prisma/productionRunRepository';
import { PrismaProductionExecutionStore } from '../../apps/api/src/infrastructure/production/productionExecutionStore';

let app: Awaited<ReturnType<typeof buildServer>>;
let userId: string; let foreignId: string; let contextId: string;
let auth: Record<string, string>; let foreign: Record<string, string>;
const brief = { objective: 'Présenter une collection fictive', audience: 'Public fictif', tone: 'Chaleureux', cta: 'Découvrir', platform: 'Instagram', format: 'Video' };
beforeAll(async () => {
  app = await buildServer(); const password = crypto.randomUUID(); const passwordHash = await bcrypt.hash(password, 4);
  async function setup() {
    const u = await db.user.create({ data: { email: `brief-profile-${crypto.randomUUID()}@example.test`, name: 'Fixture', passwordHash, role: 'user' } });
    const response = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: u.email, password } }); expect(response.statusCode).toBe(200);
    return { id: u.id, headers: { cookie: response.cookies.map((c) => c.name + '=' + c.value).join('; '), 'x-csrf-token': response.json().csrfToken } };
  }
  const a = await setup(); const b = await setup(); userId = a.id; auth = a.headers; foreignId = b.id; foreign = b.headers;
  contextId = (await db.brandContext.create({ data: { userId, name: 'Marque fictive', description: 'Fixture brief enrichi' } })).id;
});
afterAll(async () => {
  await db.project.deleteMany({ where: { userId: { in: [userId, foreignId] } } });
  await db.brandContext.deleteMany({ where: { userId: { in: [userId, foreignId] } } });
  await db.auditEvent.deleteMany({ where: { actorId: { in: [userId, foreignId] } } });
  await db.user.deleteMany({ where: { id: { in: [userId, foreignId] } } }); await app.close(); await db.$disconnect();
});
async function draft(settings: object = { ratio: '4:5', visualStyle: 'bold', direction: 'Plan produit', maxMockCents: 30 }, format = 'Video') {
  const project = await db.project.create({ data: { userId, contextId, title: 'Fixture brief', platform: 'Instagram', format, objective: 'Fixture' } });
  const response = await app.inject({ method: 'PATCH', url: `/api/projects/${project.id}/brief`, headers: auth, payload: { ...brief, format, settings } }); expect(response.statusCode, response.body).toBe(200);
  return { projectId: project.id, brief: response.json().brief };
}
function confirm(projectId: string, version: number, checksum: string, headers = auth) { return app.inject({ method: 'POST', url: `/api/projects/${projectId}/brief/confirm`, headers, payload: { version, checksum } }); }
function start(projectId: string) { return new PrismaProductionRunRepository(db).startRun({ userId, projectId, type: 'produce', targetSceneKey: null, instruction: null, steps: ['snapshot'] }); }
async function scenes(projectId: string) {
  await db.scene.createMany({ data: Array.from({ length: 5 }, (_, i) => ({ projectId, sceneKey: 'SCENE-00' + (i + 1), position: i + 1, title: 'Fixture', description: 'Fixture' })) });
  const current = await db.brief.findUniqueOrThrow({ where: { projectId } });
  await db.project.update({ where: { id: projectId }, data: { storyboardBriefVersion: current.version } });
}
it('persiste les parametres dans le brief et sa revision immuable', async () => {
  const value = await draft(); expect(value.brief.settings).toMatchObject({ ratio: '4:5', visualStyle: 'bold', profileVersion: 'v1-demo-2026-11-04' });
  const revision = await db.briefRevision.findFirstOrThrow({ where: { briefId: value.brief.id } }); expect(revision.settings).toEqual(value.brief.settings);
  expect(value.brief.confirmedVersion ?? null).toBeNull();
});
it('refuse le lancement sans confirmation exacte, puis capture ses parametres', async () => {
  const value = await draft(); await scenes(value.projectId);
  await expect(start(value.projectId)).rejects.toMatchObject({ code: 'brief_confirmation_required' });
  const checksum = value.brief.revisions[0].checksum;
  expect((await confirm(value.projectId, value.brief.version, '0'.repeat(64))).statusCode).toBe(409);
  expect((await confirm(value.projectId, value.brief.version, checksum)).statusCode).toBe(200);
  expect((await confirm(value.projectId, value.brief.version, checksum)).statusCode).toBe(200);
  const run = await start(value.projectId);
  expect(run.jobRun.snapshot).toMatchObject({ render: { width: 1080, height: 1350 }, brief: { version: value.brief.version, checksum, data: { settings: { ratio: '4:5', visualStyle: 'bold' } } } });
});
it('invalide la confirmation lors d une nouvelle revision sans toucher a l ancienne', async () => {
  const value = await draft(); const first = await db.briefRevision.findFirstOrThrow({ where: { briefId: value.brief.id } });
  expect((await confirm(value.projectId, 1, first.checksum)).statusCode).toBe(200);
  const response = await app.inject({ method: 'PATCH', url: `/api/projects/${value.projectId}/brief`, headers: auth, payload: { ...brief, settings: { ratio: '1:1', visualStyle: 'minimal' } } }); expect(response.statusCode).toBe(200);
  expect(response.json().brief).toMatchObject({ version: 2, confirmedVersion: null, confirmedChecksum: null });
  expect((await confirm(value.projectId, 1, first.checksum)).statusCode).toBe(409);
  expect(await db.briefRevision.findUniqueOrThrow({ where: { id: first.id } })).toEqual(first);
});
it('refuse les profils incoherents et le changement de reseau implicite', async () => {
  const value = await draft();
  for (const payload of [{ ...brief, settings: { ratio: '16:9' } }, { ...brief, platform: 'TikTok', settings: {} }]) {
    expect((await app.inject({ method: 'PATCH', url: `/api/projects/${value.projectId}/brief`, headers: auth, payload })).statusCode).toBe(400);
  }
});
it('isole confirmation et CSRF, meme pour un super-admin', async () => {
  const value = await draft(); const checksum = value.brief.revisions[0].checksum;
  await db.user.update({ where: { id: foreignId }, data: { role: 'super_admin' } });
  expect((await confirm(value.projectId, 1, checksum, foreign)).statusCode).toBe(404);
  expect((await confirm(value.projectId, 1, checksum, { cookie: auth.cookie })).statusCode).toBe(403);
});
it('execute le contexte et les parametres figes meme apres une edition de la marque', async () => {
  const value = await draft(); await scenes(value.projectId);
  expect((await confirm(value.projectId, 1, value.brief.revisions[0].checksum)).statusCode).toBe(200);
  const before = await db.brandContext.findUniqueOrThrow({ where: { id: contextId } });
  const run = await start(value.projectId);
  await db.brandContext.update({ where: { id: contextId }, data: { name: 'Fiche modifiée après lancement' } });
  const store = new PrismaProductionExecutionStore(db);
  const frozen = await store.loadExecutionProject(value.projectId, run.jobRun.id);
  expect(frozen.context.name).toBe(before.name);
  expect(frozen.render).toMatchObject({ width: 1080, height: 1350, visualStyle: 'bold', direction: 'Plan produit' });
});
it('exige de regenerer le storyboard apres une nouvelle version de brief confirmee', async () => {
  const value = await draft(); const checksum = value.brief.revisions[0].checksum;
  expect((await confirm(value.projectId, 1, checksum)).statusCode).toBe(200);
  expect((await app.inject({ method: 'POST', url: `/api/projects/${value.projectId}/storyboard`, headers: auth, payload: {} })).statusCode).toBe(200);
  const update = await app.inject({ method: 'PATCH', url: `/api/projects/${value.projectId}/brief`, headers: auth, payload: { ...brief, cta: 'Nouvelle invitation' } }); expect(update.statusCode).toBe(200);
  expect((await confirm(value.projectId, 2, update.json().brief.revisions.at(-1).checksum)).statusCode).toBe(200);
  await expect(start(value.projectId)).rejects.toMatchObject({ code: 'storyboard_stale' });
  expect((await app.inject({ method: 'POST', url: `/api/projects/${value.projectId}/storyboard`, headers: auth, payload: {} })).statusCode).toBe(200);
  expect((await start(value.projectId)).jobRun.snapshot).toMatchObject({ brief: { version: 2 } });
});
it('ne genere pas de storyboard a partir d un brouillon non confirme', async () => {
  const value = await draft();
  expect((await app.inject({ method: 'POST', url: `/api/projects/${value.projectId}/storyboard`, headers: auth, payload: {} })).statusCode).toBe(409);
});
it.each([null, { sourceBriefVersion: 0 }])('refuse une correction sans provenance de brief compatible (cas %#)', async (manifest) => {
  const value = await draft(); await scenes(value.projectId);
  expect((await confirm(value.projectId, 1, value.brief.revisions[0].checksum)).statusCode).toBe(200);
  const rows = await db.scene.findMany({ where: { projectId: value.projectId } });
  await db.sceneVersion.createMany({ data: rows.map((s) => ({ sceneId: s.id, version: 1, imagePath: 'fixture.png', prompt: 'MOCK fixture', checksum: 'a'.repeat(64) })) });
  await db.artifact.create({ data: { projectId: value.projectId, kind: 'master', versions: { create: { version: 1, masterPath: 'fixture.mp4', checksum: 'b'.repeat(64), qaStatus: 'PASS', ...(manifest ? { manifest } : {}) } } } });
  await expect(new PrismaProductionRunRepository(db).startRun({ userId, projectId: value.projectId, type: 'correction', targetSceneKey: 'SCENE-003', instruction: 'Correction locale', steps: ['snapshot'] })).rejects.toMatchObject({ code: 'brief_changed_full_production_required' });
});
it('refuse de melanger deux contextes de marque dans une correction locale', async () => {
  const value = await draft(); await scenes(value.projectId);
  expect((await confirm(value.projectId, 1, value.brief.revisions[0].checksum)).statusCode).toBe(200);
  const run = await start(value.projectId);
  const snapshot = run.jobRun.snapshot as unknown as import('@vululu/application').ReproducibilitySnapshot;
  const sourceInputChecksum = productionSourceChecksum(snapshot);
  await db.jobRun.update({ where: { id: run.jobRun.id }, data: { status: 'completed' } });
  await db.project.update({ where: { id: value.projectId }, data: { status: 'review' } });
  const rows = await db.scene.findMany({ where: { projectId: value.projectId } });
  await db.sceneVersion.createMany({ data: rows.map((s) => ({ sceneId: s.id, version: 1, imagePath: 'fixture.png', prompt: 'MOCK fixture', checksum: 'a'.repeat(64) })) });
  await db.artifact.create({ data: { projectId: value.projectId, kind: 'master', versions: { create: { version: 1, masterPath: 'fixture.mp4', checksum: 'b'.repeat(64), qaStatus: 'PASS', manifest: { sourceBriefVersion: 1, sourceInputChecksum } } } } });
  await db.brandContext.update({ where: { id: contextId }, data: { colorPrimary: '#123456' } });
  await expect(new PrismaProductionRunRepository(db).startRun({ userId, projectId: value.projectId, type: 'correction', targetSceneKey: 'SCENE-003', instruction: 'Correction locale', steps: ['snapshot'] })).rejects.toMatchObject({ code: 'brief_changed_full_production_required' });
  expect(await db.jobRun.count({ where: { projectId: value.projectId } })).toBe(1);
});
it.each([{ format: 'Affiche', settings: {}, code: 'format_not_qualified' }, { format: 'Video', settings: { audio: { musicVersionId: 'not-qualified-yet' } }, code: 'audio_not_qualified' }])('ne promet pas un rendu encore non qualifie : $code', async ({ format, settings, code }) => {
  const value = await draft(settings, format); await scenes(value.projectId);
  expect((await confirm(value.projectId, 1, value.brief.revisions[0].checksum)).statusCode).toBe(200);
  await expect(start(value.projectId)).rejects.toMatchObject({ code });
  expect(await db.jobRun.count({ where: { projectId: value.projectId } })).toBe(0);
});
