import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { AssistantCopy, CreativeSpec } from '@vululu/contracts';
import type { AssistantProvider } from '../../apps/api/src/infrastructure/assistant/vertex';
import { businesses } from '../fixtures/assistant-businesses';
vi.hoisted(() => {
  const u = new URL(process.env.DATABASE_URL_TEST || 'postgres://vululu@127.0.0.1:55432/vululu_v1_00_test');
  if (!['127.0.0.1', 'localhost'].includes(u.hostname) || !u.pathname.endsWith('_test')) throw Error('Disposable PostgreSQL required');
  process.env.DATABASE_URL = u.href;
  process.env.APP_ENV = 'test';
  process.env.SESSION_SECRET = crypto.randomUUID();
  process.env.ARTIFACT_DIR = '/tmp/vululu-f02-test-artifacts';
});
import { prisma } from '@vululu/db';
import { buildServer } from '../../apps/api/src/server';
import { execute } from '../../apps/api/src/infrastructure/execution/broker';
import { generateAssistantClaim } from '../../apps/api/src/infrastructure/assistant/service';

const b = businesses[0];
const copy: AssistantCopy = { campaign: 'Au contact de la terre', strategy: 'Ouvrir une conversation avec les débutants.', posts:
  ['Le premier geste', 'De la terre au tour', 'Et si vous commenciez ?'].map((headline) => ({ headline, caption: 'Quelle étape aimeriez-vous découvrir ?', cta: 'Posez votre question',
    storyboard: Array.from({ length: 3 }, () => ({ shot: 'Imaginer un plan rapproché du tour.', onScreen: 'Un geste à découvrir' })) })) };
const spec: CreativeSpec = { schemaVersion: 1, width: 1080, height: 1080, brand: { background: '#ffffff', accent: '#225588' }, safeArea: 0.05,
  scenes: ['SCENE-001', 'SCENE-002'].map((key) => ({ key, seconds: 2, layers: [{ type: 'text', role: 'cta', text: 'Contactez-nous', color: '#111111', size: 48,
    bold: false, x: 0.1, y: 0.1, w: 0.8, h: 0.2, opacity: 1 }] })) };
let app: Awaited<ReturnType<typeof buildServer>>, owner: string, stranger: string, project: string, context: string, offer: string;
let own: Record<string, string>, other: Record<string, string>;
const endpoint = () => `/api/projects/${project}/assistant`;
const post = (url: string, payload: object, headers = own) => app.inject({ method: 'POST', url, payload, headers });
const send = (payload: object) => post(endpoint(), payload);
const plan = (engine = 'ai') => ({ requestId: randomUUID(), kind: 'marketing', engine, offerId: offer, week: '2030-01-07', regulated: false, prompt: 'Prépare une campagne centrée sur le geste du tournage.' });
async function login(id: string) {
  const response = await post('/api/auth/login', { email: `${id}@assistant.example`, password: 'Test-only login phrase' }, {});
  expect(response.statusCode).toBe(200);
  return { cookie: response.cookies.map((c) => `${c.name}=${c.value}`).join('; '), 'x-csrf-token': response.json().csrfToken };
}
async function run(turn: { operation: { id: string; digest: string } }, mock: AssistantProvider) {
  expect((await post(`/api/execution/${turn.operation.id}/approve`, { digest: turn.operation.digest })).statusCode).toBe(200);
  await execute(turn.operation.id, { invoke: (job, signal) => generateAssistantClaim(job, signal, mock) });
  return prisma.executionOperation.findUniqueOrThrow({ where: { id: turn.operation.id } });
}
const history = async () => (await app.inject({ url: endpoint(), headers: own })).json().turns;

beforeAll(async () => { app = await buildServer({ accountMail: null }); });
afterAll(async () => { await app.close(); await prisma.$disconnect(); });
beforeEach(async () => {
  for (const [key, value] of Object.entries({ ASSISTANT_VERTEX_ENABLED: '1', ASSISTANT_VERTEX_PROJECT: 'fixture-project', ASSISTANT_VERTEX_LOCATION: 'global',
    ASSISTANT_VERTEX_MODEL: 'gemini-2.5-flash', ASSISTANT_VERTEX_INPUT_MICROUSD: '1', ASSISTANT_VERTEX_OUTPUT_MICROUSD: '2' })) vi.stubEnv(key, value);
  owner = randomUUID(); stranger = randomUUID();
  const passwordHash = await (await import('bcryptjs')).default.hash('Test-only login phrase', 4);
  for (const id of [owner, stranger]) await prisma.user.create({ data: { id, email: `${id}@assistant.example`, name: 'Assistant fixture', passwordHash } });
  own = await login(owner); other = await login(stranger);
  context = (await prisma.brandContext.create({ data: { userId: owner, name: b.name, description: b.description, audience: b.audience,
    tone: b.tone, website: 'https://private.example/never-sent' } })).id;
  project = (await prisma.project.create({ data: { contextId: context, userId: owner, title: 'Campagne atelier', objective: b.goal, platform: 'Instagram', format: 'Video' } })).id;
  offer = (await prisma.confirmedOffer.create({ data: { contextId: context, name: b.offer } })).id;
  await prisma.executionAccount.create({ data: { userId: owner, enabled: true, limitCents: 32, tools: ['assistant.draft@1'] } });
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await prisma.assistantTurn.deleteMany({ where: { projectId: project } });
  await prisma.executionOperation.deleteMany({ where: { projectId: project } });
  await prisma.executionAccount.deleteMany({ where: { userId: owner } });
  await prisma.creativeRevision.deleteMany({ where: { projectId: project } });
  await prisma.project.delete({ where: { id: project } });
  await prisma.user.deleteMany({ where: { id: { in: [owner, stranger] } } });
});

it('isolates project scope, requires approval and budget, carries scoped turns, and edits and approves exact copy', async () => {
  const request = plan();
  expect((await post(endpoint(), request, other)).statusCode).toBe(404);
  expect((await post(endpoint(), request, { cookie: own.cookie })).statusCode).toBe(403);
  const proposed = await send(request);
  expect(proposed.statusCode).toBe(200);
  const turn = proposed.json();
  expect((await send(request)).json().operation.id).toBe(turn.operation.id);
  const mock = { generate: vi.fn().mockResolvedValue({ status: 'complete', output: copy, costCents: 2 }) };
  await execute(turn.operation.id, { invoke: (job, signal) => generateAssistantClaim(job, signal, mock) });
  expect(mock.generate).not.toHaveBeenCalled();
  expect((await post(`/api/execution/${turn.operation.id}/approve`, { digest: 'a'.repeat(64) })).statusCode).toBe(409);
  await prisma.executionAccount.update({ where: { userId: owner }, data: { limitCents: 0 } });
  expect((await post(`/api/execution/${turn.operation.id}/approve`, { digest: turn.operation.digest })).statusCode).toBe(409);
  expect(mock.generate).not.toHaveBeenCalled();
  await prisma.executionAccount.update({ where: { userId: owner }, data: { limitCents: 32 } });
  expect(await run(turn, mock)).toMatchObject({ state: 'SUCCEEDED', reportedCents: 2 });
  expect(mock.generate).toHaveBeenCalledOnce();
  const sent = mock.generate.mock.calls[0][0];
  expect(sent.data).toMatchObject({ request: request.prompt, business: { audience: b.audience, tone: b.tone, objective: b.goal }, offer: b.offer });
  expect(JSON.stringify(sent)).not.toContain('private.example');
  const follow = (await send({ ...plan(), parentId: turn.id, prompt: 'Garde le concept, mais écris des titres plus courts.' })).json();
  await run(follow, mock);
  expect(mock.generate.mock.calls[1][0].data.previous[0].suggestion.campaign).toBe(copy.campaign);
  const foreign = await prisma.brandContext.create({ data: { userId: stranger, name: 'Autre atelier', description: 'Une autre activité.' } });
  const foreignOffer = await prisma.confirmedOffer.create({ data: { contextId: foreign.id, name: 'Autre offre' } });
  expect((await send({ ...plan(), offerId: foreignOffer.id })).statusCode).toBe(404);
  const edit = await post(`${endpoint()}/${follow.id}/edit`, { requestId: randomUUID(), copy: { ...copy, campaign: 'Un geste à découvrir' } });
  expect(edit.statusCode).toBe(200);
  expect(edit.json()).toMatchObject({ origin: 'edited', parentId: follow.id, approvedAt: null });
  const approval = await post(`${endpoint()}/${edit.json().id}/approve`, { digest: edit.json().digest, factsReviewed: true, professionalReview: false });
  expect(approval.statusCode).toBe(200);
  expect(approval.json().approvedAt).toBeTruthy();
  expect((await history()).find((r: { id: string }) => r.id === follow.id).result.copy).toEqual(copy);
  expect(await prisma.contentItem.count({ where: { projectId: project } })).toBe(0);
});

it('keeps offline drafts usable after invalid suggestions and retains unknown provider cost for reconciliation', async () => {
  const bad = (await send(plan())).json();
  expect(await run(bad, { async generate() { return { status: 'complete', output: { ...copy, campaign: 'Formation certifiée' }, costCents: 1 }; } })).toMatchObject({ state: 'SUCCEEDED' });
  const timedOut = (await send(plan())).json();
  expect(await run(timedOut, { async generate() { return { status: 'deadline', costCents: null }; } })).toMatchObject({ state: 'UNKNOWN', costState: 'UNKNOWN' });
  expect(await history()).toEqual(expect.arrayContaining([expect.objectContaining({ origin: 'fallback', reason: 'invalid_suggestion' }), expect.objectContaining({ origin: 'fallback', reason: 'deadline' })]));
  expect(await prisma.executionAccount.findUnique({ where: { userId: owner } })).toMatchObject({ spentCents: 1, reservedCents: 8 });
  vi.stubEnv('ASSISTANT_VERTEX_ENABLED', '0');
  expect((await send(plan('offline'))).json()).toMatchObject({ origin: 'offline', operation: null });
  expect((await send(plan())).statusCode).toBe(409);
});

it('uses existing scope and digest checks to apply a validated creative suggestion without changing other scenes', async () => {
  await prisma.creativeRevision.create({ data: { projectId: project, version: 1, spec } });
  const input = { kind: 'creative', requestId: randomUUID(), engine: 'ai', prompt: 'Donne une invitation plus chaleureuse et un fond bleu.',
    scope: { target: { projectId: project, sceneKey: 'SCENE-002' }, expectedRevision: 1 } };
  const r = await send(input);
  expect(r.statusCode).toBe(200);
  const turn = r.json();
  const mock = { generate: vi.fn().mockResolvedValue({ status: 'complete', costCents: 2, output: { changes: [
    { operation: 'cta', parameters: { text: 'Parlons de votre projet' } }, { operation: 'color', parameters: { background: '#225588' } }
  ] } }) };
  await run(turn, mock);
  expect(mock.generate.mock.calls[0][0].data.selectedScene.position).toBe(2);
  const preview = (await history())[0].result.preview;
  expect(preview.action.target.sceneKey).toBe('SCENE-002');
  expect(await prisma.creativeRevision.count({ where: { projectId: project } })).toBe(1);
  const apply = `/api/projects/${project}/creative/actions/apply`;
  expect((await post(apply, { action: preview.action, surface: preview.surface, digest: preview.digest, approved: true }, other)).statusCode).toBe(404);
  expect((await post(apply, { action: preview.action, surface: preview.surface, digest: preview.digest, approved: true })).statusCode).toBe(200);
  const two = await prisma.creativeRevision.findUniqueOrThrow({ where: { projectId_version: { projectId: project, version: 2 } } });
  expect((two.spec as CreativeSpec).scenes[0]).toEqual(spec.scenes[0]);
  expect((two.spec as CreativeSpec).scenes[1]).toMatchObject({ background: '#225588', layers: [{ text: 'Parlons de votre projet' }] });
  expect((await post(apply, { action: preview.action, surface: preview.surface, digest: preview.digest, approved: true })).statusCode).toBe(409);
  const offline = await send({ ...input, requestId: randomUUID(), engine: 'offline', prompt: 'CTA "Posez votre question"', scope: { ...input.scope, expectedRevision: 2 } });
  expect(offline.json()).toMatchObject({ origin: 'offline', result: { preview: { after: { layers: [{ text: 'Posez votre question' }] } } } });
});
