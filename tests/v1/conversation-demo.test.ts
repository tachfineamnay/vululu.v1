import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { createServer } from 'node:http';
import { beforeAll, afterAll, expect, it, vi } from 'vitest';
vi.hoisted(() => {
  process.env.APP_ENV = 'test'; process.env.V0_TEST_DB = '1';
  process.env.DATABASE_URL_TEST = 'postgresql://vululu@127.0.0.1:55432/vululu_v1_00_test?schema=public';
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST; process.env.SESSION_SECRET = globalThis.crypto.randomUUID();
});
import { prisma as db } from '@vululu/db';
import { buildServer } from '../../apps/api/src/server';

let app: Awaited<ReturnType<typeof buildServer>>; let userId: string; let foreignId: string; let auth: Record<string, string>; let foreign: Record<string, string>; let contextId: string;
beforeAll(async () => {
  app = await buildServer(); const password = crypto.randomUUID(); const passwordHash = await bcrypt.hash(password, 4);
  async function account(role: string) {
    const u = await db.user.create({ data: { email: 'conversation-' + crypto.randomUUID() + '@example.test', passwordHash, name: 'Fixture', role } });
    const result = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: u.email, password } }); expect(result.statusCode).toBe(200);
    return { id: u.id, headers: { cookie: result.cookies.map((c) => c.name + '=' + c.value).join('; '), 'x-csrf-token': result.json().csrfToken } };
  }
  const a = await account('user'); const b = await account('super_admin'); userId = a.id; foreignId = b.id; auth = a.headers; foreign = b.headers;
  contextId = (await db.brandContext.create({ data: { userId, name: 'Atelier fictif', description: 'Fixture de conversation' } })).id;
});
afterAll(async () => {
  await db.project.deleteMany({ where: { userId } }); await db.brandContext.deleteMany({ where: { userId } });
  await db.auditEvent.deleteMany({ where: { actorId: { in: [userId, foreignId] } } }); await db.user.deleteMany({ where: { id: { in: [userId, foreignId] } } });
  await app.close(); await db.$disconnect();
});
function project() { return db.project.create({ data: { userId, contextId, title: 'Collection fictive', platform: 'Instagram', format: 'Video', objective: 'Présenter notre atelier fictif' } }); }
function message(id: string, content: string, headers = auth) { return app.inject({ method: 'POST', url: `/api/projects/${id}/messages`, headers, payload: { content } }); }
const fields = { objective: 'Présenter une lampe fictive', audience: 'Visiteurs de démonstration', tone: 'Chaleureux', cta: 'Découvrir la lampe' };
async function saveBrief(id: string, content = fields) {
  const result = await app.inject({ method: 'PATCH', url: `/api/projects/${id}/brief`, headers: auth, payload: { ...content, platform: 'Instagram', format: 'Video' } }); expect(result.statusCode).toBe(200);
  const brief = result.json().brief;
  expect((await app.inject({ method: 'POST', url: `/api/projects/${id}/brief/confirm`, headers: auth, payload: { version: brief.version, checksum: brief.revisions.at(-1).checksum } })).statusCode).toBe(200);
  return brief;
}
it('propose un brief MOCK persistant avec sources et exemples sans creer de brief ni de run', async () => {
  const p = await project(); const response = await message(p.id, '/brief'); expect(response.statusCode).toBe(201);
  const proposal = response.json().assistantMessage.proposal;
  expect(proposal).toMatchObject({ schemaVersion: 1, mode: 'MOCK', kind: 'brief', baseBriefVersion: null, fields: { objective: p.objective }, sources: { objective: 'project', audience: 'example', cta: 'example' } });
  expect(proposal.hypotheses).toContain('audience'); expect(response.json().assistantMessage.content).toContain('MOCK');
  expect(await db.brief.count({ where: { projectId: p.id } })).toBe(0); expect(await db.jobRun.count({ where: { projectId: p.id } })).toBe(0);
  const bundle = (await app.inject({ method: 'GET', url: `/api/projects/${p.id}`, headers: auth })).json();
  expect(bundle.messages.at(-1).proposal).toEqual(proposal); expect(bundle.messages).toHaveLength(2);
});
it('reprend exactement les champs declares et ne traite pas une URL comme une source distante', async () => {
  let requests = 0; const source = createServer((_request, reply) => { requests++; reply.end('Contenu à ne pas consulter'); });
  await new Promise<void>((resolve) => source.listen(0, '127.0.0.1', resolve));
  try {
    const url = 'http://127.0.0.1:' + (source.address() as import('node:net').AddressInfo).port + '/projet';
    const p = await project(); const response = await message(p.id, 'Objectif: ' + url + '\nAudience: Public fictif\nTon: Direct\nCTA: Voir le projet'); expect(response.statusCode).toBe(201);
    expect(response.json().assistantMessage.proposal).toMatchObject({ kind: 'brief', fields: { objective: url, audience: 'Public fictif', tone: 'Direct', cta: 'Voir le projet' }, hypotheses: [], sources: { objective: 'user', audience: 'user', tone: 'user', cta: 'user' } });
    expect(requests).toBe(0); expect(await db.brief.count({ where: { projectId: p.id } })).toBe(0);
  } finally { await new Promise<void>((resolve, reject) => source.close((error) => error ? reject(error) : resolve())); }
});
it('renvoie vers la confirmation exacte sans confirmer par un message', async () => {
  const p = await project();
  const saved = await app.inject({ method: 'PATCH', url: `/api/projects/${p.id}/brief`, headers: auth, payload: { ...fields, platform: 'Instagram', format: 'Video' } }); expect(saved.statusCode).toBe(200);
  const response = await message(p.id, 'Confirmer le brief'); expect(response.statusCode).toBe(201); expect(response.json().assistantMessage.content).toContain('MOCK');
  expect((await db.brief.findUniqueOrThrow({ where: { projectId: p.id } })).confirmedVersion).toBeNull(); expect(await db.jobRun.count({ where: { projectId: p.id } })).toBe(0);
});
it('adapte le storyboard au brief tout en conservant les Scene ID', async () => {
  const p = await project(); await saveBrief(p.id);
  const first = await app.inject({ method: 'POST', url: `/api/projects/${p.id}/storyboard`, headers: auth, payload: {} }); expect(first.statusCode).toBe(200);
  const scenes = first.json().scenes; expect(scenes[0].description).toContain(fields.objective); expect(scenes.at(-1).description).toContain(fields.cta);
  await saveBrief(p.id, { ...fields, objective: 'Présenter une chaise fictive', cta: 'Découvrir la chaise' });
  const second = await app.inject({ method: 'POST', url: `/api/projects/${p.id}/storyboard`, headers: auth, payload: {} }); expect(second.statusCode).toBe(200);
  expect(second.json().scenes.map((s: { id: string }) => s.id)).toEqual(scenes.map((s: { id: string }) => s.id));
  expect(second.json().scenes[0].description).toContain('Présenter une chaise fictive');
  expect(second.json().characters[0].id).toBe(first.json().characters[0].id);
});
it('prepare une correction versionnee sans la lancer ni creer un nouveau master', async () => {
  const p = await project(); await saveBrief(p.id);
  const storyboard = await app.inject({ method: 'POST', url: `/api/projects/${p.id}/storyboard`, headers: auth, payload: {} }); expect(storyboard.statusCode).toBe(200);
  const rows = await db.scene.findMany({ where: { projectId: p.id } });
  // Fichiers fictifs : ce test verifie la proposition, pas un rendu.
  await db.sceneVersion.createMany({ data: rows.map((s) => ({ sceneId: s.id, version: 1, imagePath: 'fixture.png', prompt: 'MOCK fixture', checksum: 'a'.repeat(64) })) });
  await db.artifact.create({ data: { projectId: p.id, kind: 'master', versions: { create: { version: 1, masterPath: 'fixture.mp4', checksum: 'b'.repeat(64), qaStatus: 'PASS' } } } });
  const response = await message(p.id, 'SCENE-003: Rapprocher le produit.'); expect(response.statusCode).toBe(201);
  expect(response.json().assistantMessage.proposal).toMatchObject({ kind: 'correction', mode: 'MOCK', sceneKey: 'SCENE-003', sceneVersion: 1, sceneChecksum: 'a'.repeat(64), masterVersion: 1, masterChecksum: 'b'.repeat(64), instruction: 'Rapprocher le produit.' });
  expect(await db.jobRun.count({ where: { projectId: p.id } })).toBe(0); expect(await db.artifactVersion.count({ where: { artifact: { projectId: p.id } } })).toBe(1);
});
it('isole les messages et refuse un contenu vide ou un payload de proposition client', async () => {
  const p = await project();
  expect((await message(p.id, '/brief', foreign)).statusCode).toBe(404);
  expect((await message(p.id, '/brief', { cookie: auth.cookie })).statusCode).toBe(403);
  expect((await message(p.id, '   ')).statusCode).toBe(400);
  expect((await app.inject({ method: 'POST', url: `/api/projects/${p.id}/messages`, headers: auth, payload: { content: '/brief', proposal: { mode: 'REAL' } } })).statusCode).toBe(400);
  expect(await db.message.count({ where: { projectId: p.id } })).toBe(0);
});
it('demande une clarification pour des champs repetes sans ecraser une valeur', async () => {
  const p = await project(); const response = await message(p.id, 'Objectif: Premier choix\nObjectif: Second choix');
  expect(response.statusCode).toBe(201); expect(response.json().assistantMessage.proposal ?? null).toBeNull(); expect(response.json().assistantMessage.content).toContain('clarification');
});
it('traite les mots de commande dans un champ comme des donnees', async () => {
  const p = await project(); const response = await message(p.id, 'Objectif: Relire SCENE-003\nAudience: Public fictif\nTon: Direct\nCTA: Confirmer une inscription');
  expect(response.statusCode).toBe(201); expect(response.json().assistantMessage.proposal).toMatchObject({ kind: 'brief', fields: { objective: 'Relire SCENE-003', cta: 'Confirmer une inscription' } });
  expect(await db.jobRun.count({ where: { projectId: p.id } })).toBe(0);
});
