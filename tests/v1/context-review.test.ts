import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { createServer } from 'node:http';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
vi.hoisted(() => {
  process.env.APP_ENV = 'test'; process.env.V0_TEST_DB = '1';
  process.env.DATABASE_URL_TEST = 'postgresql://vululu@127.0.0.1:55432/vululu_v1_00_test?schema=public';
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
  process.env.SESSION_SECRET = globalThis.crypto.randomUUID();
});
import { prisma as db } from '@vululu/db';
import { buildServer } from '../../apps/api/src/server';

let app: Awaited<ReturnType<typeof buildServer>>;
let userId: string; let otherId: string; let contextId: string;
let headers: { cookie: string; 'x-csrf-token': string }; let foreign: typeof headers;
const content = { name: 'Atelier fictif', description: 'Description réellement saisie', website: 'http://127.0.0.1:9/private', audience: '', tone: '', colorPrimary: '#123456', colorSecondary: '#abcdef' };
let remoteRequests = 0;
const forbiddenSite = createServer((_request, response) => { remoteRequests++; response.end('Contenu privé, jamais à analyser'); });
beforeAll(async () => {
  await new Promise<void>((resolve) => forbiddenSite.listen(0, '127.0.0.1', resolve));
  const address = forbiddenSite.address();
  if (!address || typeof address === 'string') throw new Error('Fixture HTTP locale indisponible');
  content.website = `http://127.0.0.1:${address.port}/private`;
  app = await buildServer(); const password = crypto.randomUUID(); const passwordHash = await bcrypt.hash(password, 4);
  async function setup() {
    const u = await db.user.create({ data: { email: `context-review-${crypto.randomUUID()}@example.test`, name: 'Fixture', passwordHash, role: 'user' } });
    const response = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: u.email, password } }); expect(response.statusCode).toBe(200);
    return { id: u.id, headers: { cookie: response.cookies.map((c) => c.name + '=' + c.value).join('; '), 'x-csrf-token': response.json().csrfToken } };
  }
  const a = await setup(); const b = await setup(); userId = a.id; headers = a.headers; otherId = b.id; foreign = b.headers;
  const response = await app.inject({ method: 'POST', url: '/api/contexts', headers, payload: content }); expect(response.statusCode).toBe(201); contextId = response.json().context.id;
});
afterAll(async () => {
  await db.project.deleteMany({ where: { userId: { in: [userId, otherId] } } });
  await db.brandContext.deleteMany({ where: { userId: { in: [userId, otherId] } } });
  await db.auditEvent.deleteMany({ where: { actorId: { in: [userId, otherId] } } });
  await db.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
  await app.close(); await db.$disconnect(); await new Promise<void>((resolve) => forbiddenSite.close(() => resolve()));
});
async function read() { return app.inject({ method: 'GET', url: `/api/contexts/${contextId}/review`, headers }); }
function save(version: number, value = content, confirmed = true) { return app.inject({ method: 'PUT', url: `/api/contexts/${contextId}/review`, headers, payload: { expectedVersion: version, content: value, confirmed } }); }
it('expose une revision appartenant au compte sans identifiant proprietaire', async () => {
  const response = await read(); expect(response.statusCode).toBe(200); expect(response.json().version).toBe(1); expect(response.json().context).not.toHaveProperty('userId');
});
it('propose des hypotheses MOCK sans changement en base ni contenu distant invente', async () => {
  const before = await db.brandContext.findUniqueOrThrow({ where: { id: contextId } });
  const response = await app.inject({ method: 'POST', url: `/api/contexts/${contextId}/analyze`, headers, payload: {} });
  expect(response.statusCode).toBe(200); expect(response.json()).toMatchObject({ mode: 'MOCK', sourceVersion: 1, websiteFetched: false });
  expect(response.json().hypotheses.map((h: any) => h.field)).toEqual(['audience', 'tone']);
  expect(await db.brandContext.findUniqueOrThrow({ where: { id: contextId } })).toEqual(before);
  expect(await db.contextRevision.count({ where: { contextId } })).toBe(1);
  expect(remoteRequests).toBe(0);
});
it('exige confirmation et CSRF, y compris pour la simulation', async () => {
  expect((await save(1, content, false)).statusCode).toBe(400);
  expect((await app.inject({ method: 'POST', url: `/api/contexts/${contextId}/analyze`, headers: { cookie: headers.cookie }, payload: {} })).statusCode).toBe(403);
  expect((await app.inject({ method: 'GET', url: `/api/contexts/${contextId}/review` })).statusCode).toBe(401);
});
it('conserve ancienne revision et snapshot et rejoue sans doublon', async () => {
  const old = await db.contextRevision.findFirstOrThrow({ where: { contextId } });
  const project = await db.project.create({ data: { userId, contextId, title: 'Fixture', platform: 'Instagram', format: 'Video', objective: 'Fixture' } });
  const run = await db.jobRun.create({ data: { projectId: project.id, type: 'produce', status: 'completed', snapshot: { context: { revisionId: old.id, checksum: old.checksum, data: old.data } } } });
  const edited = { ...content, audience: 'Audience relue', tone: 'Ton relu' };
  const response = await save(1, edited); expect(response.statusCode).toBe(200); expect(response.json().version).toBe(2);
  expect((await save(1, edited)).statusCode).toBe(200);
  expect(await db.contextRevision.count({ where: { contextId } })).toBe(2);
  expect(await db.contextRevision.findUniqueOrThrow({ where: { id: old.id } })).toEqual(old);
  expect(await db.jobRun.findUniqueOrThrow({ where: { id: run.id } })).toEqual(run);
});
it('refuse une edition concurrente differente et les couleurs actives', async () => {
  expect((await save(1, { ...content, audience: 'Autre édition' })).statusCode).toBe(409);
  expect((await save(2, { ...content, colorPrimary: 'url(https://example.test)' })).statusCode).toBe(400);
});
it('isole lecture, proposition et mutation meme pour un super-admin', async () => {
  await db.user.update({ where: { id: otherId }, data: { role: 'super_admin' } });
  for (const [method, suffix, payload] of [['GET', 'review', undefined], ['POST', 'analyze', {}], ['PUT', 'review', { expectedVersion: 2, content, confirmed: true }]] as const) {
    expect((await app.inject({ method, url: `/api/contexts/${contextId}/${suffix}`, headers: foreign, ...(payload ? { payload } : {}) })).statusCode).toBe(404);
  }
});
