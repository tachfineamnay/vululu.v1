import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.APP_ENV = 'test';
  process.env.V0_TEST_DB = '1';
  process.env.DATABASE_URL_TEST = 'postgresql://vululu@127.0.0.1:55432/vululu_v1_00_test?schema=public';
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
  process.env.SESSION_SECRET = globalThis.crypto.randomUUID();
});
import { prisma as db } from '@vululu/db';
import { buildServer } from '../../apps/api/src/server';
import { PrismaCampaignRepository } from '../../apps/api/src/infrastructure/prisma/campaignRepository';

let app: Awaited<ReturnType<typeof buildServer>>;
const password = crypto.randomBytes(24).toString('base64url');
const users: string[] = [];
let projectA: string;
let projectB: string;
type Auth = { cookie: string; csrf: string };
let authA: Auth;
let authB: Auth;

async function request(auth: Auth, method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) {
  return app.inject({ method, url, headers: { cookie: auth.cookie, 'x-csrf-token': auth.csrf }, ...(payload ? { payload } : {}) });
}
async function create(auth: Auth, name = 'Collection démo') {
  const response = await request(auth, 'POST', '/api/campaigns', { name, description: 'Regroupement explicite' });
  expect(response.statusCode).toBe(201);
  return response.json().campaign as { id: string; name: string; description: string };
}

beforeAll(async () => {
  execSync('pnpm exec prisma migrate deploy --schema packages/db/prisma/schema.prisma', { env: { ...process.env }, stdio: 'pipe' });
  app = await buildServer();
  const hash = await bcrypt.hash(password, 4);
  const setup = async (label: string) => {
    const user = await db.user.create({ data: { email: `campaign-${label}-${crypto.randomUUID()}@example.test`, name: label, passwordHash: hash, role: 'user' } });
    users.push(user.id);
    const context = await db.brandContext.create({ data: { userId: user.id, name: label, description: 'Fixture campagne' } });
    const project = await db.project.create({ data: { userId: user.id, contextId: context.id, title: 'Projet ' + label, platform: 'Instagram', format: 'Video', objective: 'Fixture', status: 'review' } });
    const response = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: user.email, password } });
    expect(response.statusCode).toBe(200);
    return { projectId: project.id, auth: { cookie: response.cookies.map((cookie) => cookie.name + '=' + cookie.value).join('; '), csrf: response.json().csrfToken } };
  };
  const a = await setup('A'); const b = await setup('B');
  projectA = a.projectId; projectB = b.projectId; authA = a.auth; authB = b.auth;
});
afterAll(async () => {
  await db.project.deleteMany({ where: { userId: { in: users } } });
  await db.brandContext.deleteMany({ where: { userId: { in: users } } });
  await db.auditEvent.deleteMany({ where: { actorId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  if (app) await app.close();
  await db.$disconnect();
});

describe('Campagnes : API reelle, isolation proprietaire et regroupement', () => {
  it('cree, relit et liste sans exposer le proprietaire', async () => {
    const campaign = await create(authA, '  Collection hiver  ');
    expect(campaign.name).toBe('Collection hiver');
    expect(campaign).not.toHaveProperty('userId');
    const list = await request(authA, 'GET', '/api/campaigns');
    expect(list.statusCode).toBe(200);
    expect(list.json().items.map((item: { id: string }) => item.id)).toContain(campaign.id);
    const detail = await request(authA, 'GET', '/api/campaigns/' + campaign.id);
    expect(detail.statusCode).toBe(200);
    expect(detail.json().projects).toEqual([]);
    expect(await db.auditEvent.count({ where: { action: 'campaign.created', targetId: campaign.id, actorId: users[0] } })).toBe(1);
  });

  it.each([{ name: ' ' }, { name: 'x'.repeat(161) }, { name: 'Valide', description: 'x'.repeat(2001) }])('valide les entrees avant ecriture', async (payload) => {
    const response = await request(authA, 'POST', '/api/campaigns', payload);
    expect(response.statusCode).toBe(400);
  });

  it('rattache, deplace et retire un projet sans modifier son contenu', async () => {
    const first = await create(authA, 'Premiere collection');
    const second = await create(authA, 'Deuxieme collection');
    const before = await db.project.findUniqueOrThrow({ where: { id: projectA } });
    const snapshot = { fixture: 'campaign-grouping' };
    const run = await db.jobRun.create({ data: { projectId: projectA, type: 'produce', status: 'awaiting_review', snapshot, snapshotChecksum: crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex') } });
    for (let repeat = 0; repeat < 2; repeat++) {
      const assigned = await request(authA, 'PUT', `/api/projects/${projectA}/campaign`, { campaignId: first.id });
      expect(assigned.statusCode).toBe(200);
      expect(assigned.json()).toEqual({ projectId: projectA, campaignId: first.id });
    }
    let detail = await request(authA, 'GET', '/api/campaigns/' + first.id);
    expect(detail.json().projects.map((item: { id: string }) => item.id)).toEqual([projectA]);
    expect((await request(authA, 'PUT', `/api/projects/${projectA}/campaign`, { campaignId: second.id })).statusCode).toBe(200);
    detail = await request(authA, 'GET', '/api/campaigns/' + first.id);
    expect(detail.json().projects).toEqual([]);
    expect((await request(authA, 'PUT', `/api/projects/${projectA}/campaign`, { campaignId: null })).statusCode).toBe(200);
    const after = await db.project.findUniqueOrThrow({ where: { id: projectA } });
    expect(after.campaignId).toBeNull();
    expect({ title: after.title, status: after.status, context: after.contextId }).toEqual({ title: before.title, status: before.status, context: before.contextId });
    expect(await db.jobRun.findUniqueOrThrow({ where: { id: run.id } })).toEqual(run);
  });

  it('refuse toutes les lectures et affectations inter-user meme avec des IDs connus', async () => {
    const campaignA = await create(authA, 'Prive A');
    const campaignB = await create(authB, 'Prive B');
    expect((await request(authB, 'GET', '/api/campaigns/' + campaignA.id)).statusCode).toBe(404);
    const list = await request(authB, 'GET', '/api/campaigns');
    expect(list.json().items.map((item: { id: string }) => item.id)).not.toContain(campaignA.id);
    expect((await request(authB, 'PUT', `/api/projects/${projectA}/campaign`, { campaignId: campaignB.id })).statusCode).toBe(404);
    expect((await request(authA, 'PUT', `/api/projects/${projectA}/campaign`, { campaignId: campaignB.id })).statusCode).toBe(404);
    expect((await request(authA, 'PUT', `/api/projects/${projectB}/campaign`, { campaignId: campaignA.id })).statusCode).toBe(404);
    expect((await request(authB, 'PUT', `/api/projects/${projectA}/campaign`, { campaignId: null })).statusCode).toBe(404);
    expect((await db.project.findUniqueOrThrow({ where: { id: projectA } })).campaignId).toBeNull();
  });

  it('refuse la lecture anonyme et les mutations sans CSRF', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/campaigns' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/campaigns', headers: { cookie: authA.cookie }, payload: { name: 'Sans CSRF' } })).statusCode).toBe(403);
  });
  it('revalide les deux proprietaires dans l adaptateur meme sans le cas d usage', async () => {
    const a = await create(authA, 'Adaptateur A'); const b = await create(authB, 'Adaptateur B');
    const repository = new PrismaCampaignRepository(db);
    expect(await repository.assignProjectOwned(projectA, b.id, users[0])).toBe(false);
    expect(await repository.assignProjectOwned(projectB, a.id, users[0])).toBe(false);
    expect(await repository.assignProjectOwned(projectB, null, users[0])).toBe(false);
    expect((await db.project.findUniqueOrThrow({ where: { id: projectB } })).campaignId).toBeNull();
  });
});
