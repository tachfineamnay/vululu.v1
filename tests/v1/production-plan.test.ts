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
import { PrismaSceneRepository } from '../../apps/api/src/infrastructure/prisma/sceneRepository';

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
async function reviseDuration(projectId: string, seconds = 3) {
  const updated = await app.inject({ method: 'PATCH', url: `/api/projects/${projectId}/brief`, headers: auth, payload: { objective: 'Présenter la marque fictive', audience: 'Audience fictive', tone: 'Direct', cta: 'Découvrir', platform: 'Instagram', format: 'Video', settings: { defaultSceneDurationSeconds: seconds, maxMockCents: 10 } } });
  expect(updated.statusCode).toBe(200); return updated.json().brief;
}
async function regenerate(projectId: string, brief: { version: number; revisions: { checksum: string }[] }) {
  expect((await app.inject({ method: 'POST', url: `/api/projects/${projectId}/brief/confirm`, headers: auth, payload: { version: brief.version, checksum: brief.revisions.at(-1)!.checksum } })).statusCode).toBe(200);
  const response = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/storyboard`, headers: auth, payload: {} });
  expect(response.statusCode).toBe(200); return response.json();
}
it('regenere la duree prevue tout en conservant la scene personnalisee et les identifiants', async () => {
  const value = await confirmed(10);
  const initial = await db.scene.findMany({ where: { projectId: value.projectId }, orderBy: { position: 'asc' } });
  expect((await app.inject({ method: 'PATCH', url: `/api/projects/${value.projectId}/scenes/SCENE-003`, headers: auth, payload: { durationSeconds: 5 } })).statusCode).toBe(200);
  const brief = await reviseDuration(value.projectId);
  const response = await app.inject({ method: 'GET', url: `/api/projects/${value.projectId}/production-plan`, headers: auth });
  expect(response.statusCode).toBe(200);
  expect(response.json().plan).toMatchObject({ briefVersion: 2, durationSeconds: 17 });
  const bundle = await regenerate(value.projectId, brief);
  expect(bundle.scenes.map((s: { id: string }) => s.id)).toEqual(initial.map((s) => s.id));
  expect(bundle.scenes.map((s: { durationSeconds: number }) => s.durationSeconds)).toEqual([3, 3, 5, 3, 3]);
  expect(bundle.scenes.map((s: { usesBriefDuration: boolean }) => s.usesBriefDuration)).toEqual([true, true, false, true, true]);
  expect((await app.inject({ method: 'GET', url: `/api/projects/${value.projectId}/production-plan`, headers: auth })).json().plan.durationSeconds).toBe(17);
});
it('permet de reprendre explicitement la duree du brief apres une personnalisation', async () => {
  const value = await confirmed(10);
  await app.inject({ method: 'PATCH', url: `/api/projects/${value.projectId}/scenes/SCENE-003`, headers: auth, payload: { durationSeconds: 5 } });
  const reset = await app.inject({ method: 'PATCH', url: `/api/projects/${value.projectId}/scenes/SCENE-003`, headers: auth, payload: { useBriefDuration: true } });
  expect(reset.statusCode).toBe(200); expect(reset.json().scene).toMatchObject({ durationSeconds: 2, usesBriefDuration: true });
  const brief = await reviseDuration(value.projectId);
  const bundle = await regenerate(value.projectId, brief);
  expect(bundle.scenes.every((s: { durationSeconds: number }) => s.durationSeconds === 3)).toBe(true);
});
it('preserve les durees historiques sans inventer leur origine', async () => {
  const value = await confirmed(10);
  // Une ligne sans origine explicite représente un ancien enregistrement.
  await db.scene.deleteMany({ where: { projectId: value.projectId, sceneKey: 'SCENE-003' } });
  const legacy = await db.scene.create({ data: { projectId: value.projectId, sceneKey: 'SCENE-003', position: 3, title: 'Historique', description: 'Durée historique', durationSeconds: 7 } });
  const brief = await reviseDuration(value.projectId);
  expect((await app.inject({ method: 'GET', url: `/api/projects/${value.projectId}/production-plan`, headers: auth })).json().plan.durationSeconds).toBe(19);
  const bundle = await regenerate(value.projectId, brief);
  expect(bundle.scenes[2]).toMatchObject({ id: legacy.id, durationSeconds: 7, usesBriefDuration: null });
});
it('isole les modes de duree et refuse toute modification pendant une production', async () => {
  const value = await confirmed(10); const url = `/api/projects/${value.projectId}/scenes/SCENE-003`;
  expect((await app.inject({ method: 'PATCH', url, headers: foreign, payload: { useBriefDuration: true } })).statusCode).toBe(404);
  expect((await app.inject({ method: 'PATCH', url, headers: { cookie: auth.cookie }, payload: { useBriefDuration: true } })).statusCode).toBe(403);
  for (const payload of [{ useBriefDuration: false }, { useBriefDuration: true, durationSeconds: 5 }, { durationSeconds: 0 }, { durationSeconds: 16 }, { durationSeconds: 3, usesBriefDuration: true }]) expect((await app.inject({ method: 'PATCH', url, headers: auth, payload })).statusCode).toBe(400);
  const run = await start(value.projectId); const snapshot = run.jobRun.snapshot;
  for (const payload of [{ useBriefDuration: true }, { durationSeconds: 5 }]) expect((await app.inject({ method: 'PATCH', url, headers: auth, payload })).statusCode).toBe(409);
  await expect(new PrismaSceneRepository(db).updateDuration(value.projectId, 'SCENE-003', null, userId)).rejects.toMatchObject({ code: 'project_busy' });
  expect((await db.jobRun.findUniqueOrThrow({ where: { id: run.jobRun.id } })).snapshot).toEqual(snapshot);
  expect((await db.scene.findFirstOrThrow({ where: { projectId: value.projectId, sceneKey: 'SCENE-003' } })).durationSeconds).toBe(2);
});
