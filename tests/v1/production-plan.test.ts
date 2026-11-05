import crypto from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import bcrypt from 'bcryptjs';
import { beforeAll, afterAll, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => {
  const name = 'vululu_plan_' + globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, 12);
  process.env.APP_ENV = 'test'; process.env.V0_TEST_DB = '1';
  process.env.DATABASE_URL_TEST = `postgresql://vululu@127.0.0.1:55432/${name}?schema=public`;
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST; process.env.SESSION_SECRET = globalThis.crypto.randomUUID();
  return { name, url: process.env.DATABASE_URL_TEST };
});
import { PrismaClient, prisma as db } from '@vululu/db';
import { buildServer } from '../../apps/api/src/server';
import { PrismaProductionRunRepository } from '../../apps/api/src/infrastructure/prisma/productionRunRepository';

let app: Awaited<ReturnType<typeof buildServer>>; let userId: string; let auth: Record<string, string>; let foreign: Record<string, string>;
beforeAll(async () => {
  const admin = new PrismaClient({ datasourceUrl: 'postgresql://vululu@127.0.0.1:55432/postgres?schema=public' });
  // Nom construit localement, sans entrée utilisateur ; base jetable conservée comme preuve.
  await admin.$executeRawUnsafe('CREATE DATABASE "' + fixture.name + '"'); await admin.$disconnect();
  const cli = createRequire(import.meta.url).resolve('prisma/build/index.js');
  execFileSync(process.execPath, [cli, 'migrate', 'deploy', '--schema', path.join(process.cwd(), 'packages/db/prisma/schema.prisma')], { env: { ...process.env, DATABASE_URL: fixture.url }, stdio: 'pipe' });
  app = await buildServer();
  const password = crypto.randomUUID(); const passwordHash = await bcrypt.hash(password, 4);
  async function account(role: string) {
    const user = await db.user.create({ data: { email: 'plan-' + crypto.randomUUID() + '@example.test', passwordHash, name: 'Fixture', role } });
    const result = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: user.email, password } }); expect(result.statusCode).toBe(200);
    return { id: user.id, headers: { cookie: result.cookies.map((c) => c.name + '=' + c.value).join('; '), 'x-csrf-token': result.json().csrfToken } };
  }
  const a = await account('user'); userId = a.id; auth = a.headers; foreign = (await account('super_admin')).headers;
  const provider = await db.provider.create({ data: { key: 'plan-mock', name: 'Fixture MOCK' } });
  await db.model.create({ data: { providerId: provider.id, modelKey: 'plan-scene', capabilityKeys: ['scene.generate'], quality: 90, latencyMs: 5, costCentsPerUnit: 5, license: 'commercial', qualified: true } });
});
afterAll(async () => { await app?.close(); await db.$disconnect(); });
async function draft(maxMockCents = 10, platform = 'Instagram', omitSettings = false) {
  const context = await db.brandContext.create({ data: { userId, name: 'Marque fictive', description: 'Recette plan' } });
  const project = await db.project.create({ data: { userId, contextId: context.id, title: 'Plan fictif', platform, format: 'Video', objective: 'Fixture', sceneDurationSeconds: 10 } });
  const result = await app.inject({ method: 'PATCH', url: `/api/projects/${project.id}/brief`, headers: auth, payload: { objective: 'Présenter la marque fictive', audience: 'Audience fictive', tone: 'Direct', cta: 'Découvrir', platform, format: 'Video', ...(!omitSettings ? { settings: { maxMockCents } } : {}) } });
  expect(result.statusCode).toBe(200); return { projectId: project.id, brief: result.json().brief };
}
async function confirmed(maxMockCents: number) {
  const value = await draft(maxMockCents);
  const result = await app.inject({ method: 'POST', url: `/api/projects/${value.projectId}/brief/confirm`, headers: auth, payload: { version: 1, checksum: value.brief.revisions[0].checksum } }); expect(result.statusCode).toBe(200);
  expect((await app.inject({ method: 'POST', url: `/api/projects/${value.projectId}/storyboard`, headers: auth, payload: {} })).statusCode).toBe(200);
  return value;
}
function start(projectId: string) { return new PrismaProductionRunRepository(db).startRun({ userId, projectId, type: 'produce', targetSceneKey: null, instruction: null, steps: ['validate-snapshot', 'resolve-capabilities', 'render-scenes', 'assemble-master', 'qa'], outbox: { kind: 'start_run', payload: {} } }); }
it('expose le plan local et son plafond avant confirmation sans ecriture ni invocation', async () => {
  const value = await draft(10);
  const result = await app.inject({ method: 'GET', url: `/api/projects/${value.projectId}/production-plan`, headers: auth }); expect(result.statusCode).toBe(200);
  const plan = result.json().plan;
  expect(plan).toMatchObject({ mode: 'MOCK', executionMode: 'local', ready: true, sceneCount: 5, pricing: { estimatedCents: 0, ceilingCents: 10 } });
  expect(plan.steps.map((s: { key: string }) => s.key)).toContain('render-scenes'); expect(plan.checksum).toMatch(/^[a-f0-9]{64}$/);
  expect(await db.jobRun.count({ where: { projectId: value.projectId } })).toBe(0);
  expect(await db.costEvent.count({ where: { projectId: value.projectId } })).toBe(0);
  expect((await db.brief.findUniqueOrThrow({ where: { projectId: value.projectId } })).confirmedVersion).toBeNull();
  expect(JSON.stringify(plan)).not.toMatch(/passwordHash|instructions|guardrails|soul/);
});
it('isole le plan meme face a un super-admin et exige une session', async () => {
  const value = await draft();
  expect((await app.inject({ method: 'GET', url: `/api/projects/${value.projectId}/production-plan`, headers: foreign })).statusCode).toBe(404);
  expect((await app.inject({ method: 'GET', url: `/api/projects/${value.projectId}/production-plan` })).statusCode).toBe(401);
});
it('refuse un budget durable insuffisant avant de creer job ou outbox', async () => {
  const value = await confirmed(0);
  const beforeOutbox = await db.orchestrationOutbox.count();
  await expect(start(value.projectId)).rejects.toMatchObject({ code: 'budget_exceeded' });
  expect(await db.jobRun.count({ where: { projectId: value.projectId } })).toBe(0);
  expect(await db.productionJob.count({ where: { projectId: value.projectId } })).toBe(0);
  expect(await db.orchestrationOutbox.count()).toBe(beforeOutbox);
  expect((await db.project.findUniqueOrThrow({ where: { id: value.projectId } })).status).toBe('storyboard_ready');
});
it('capture le plan et le prix MOCK retenus quand le plafond suffit', async () => {
  const value = await confirmed(10); const run = await start(value.projectId);
  expect(run.jobRun.snapshot).toMatchObject({ plan: { mode: 'MOCK', executionMode: 'hatchet', ready: true, pricing: { estimatedCents: 5, ceilingCents: 10 } } });
});
it('canonicalise le profil des nouveaux briefs meme si le client omet les parametres', async () => {
  const value = await draft(10, 'LinkedIn', true);
  expect(value.brief.settings).toMatchObject({ ratio: '1:1', defaultSceneDurationSeconds: 10, profileVersion: 'v1-demo-2026-11-04' });
});
it('estime la nouvelle duree du brief sans reutiliser un storyboard devenu obsolete', async () => {
  const value = await confirmed(10);
  const updated = await app.inject({ method: 'PATCH', url: `/api/projects/${value.projectId}/brief`, headers: auth, payload: { objective: 'Présenter la marque fictive', audience: 'Audience fictive', tone: 'Direct', cta: 'Découvrir', platform: 'Instagram', format: 'Video', settings: { defaultSceneDurationSeconds: 3, maxMockCents: 10 } } });
  expect(updated.statusCode).toBe(200);
  const response = await app.inject({ method: 'GET', url: `/api/projects/${value.projectId}/production-plan`, headers: auth });
  expect(response.statusCode).toBe(200);
  expect(response.json().plan).toMatchObject({ briefVersion: 2, durationSeconds: 15 });
});
