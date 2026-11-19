import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
vi.hoisted(() => {
  const u = new URL(process.env.DATABASE_URL_TEST || 'postgres://vululu@127.0.0.1:55432/vululu_v1_00_test');
  if (!['localhost', '127.0.0.1'].includes(u.hostname) || !u.pathname.endsWith('_test'))
    throw Error('Disposable local DB required');
  Object.assign(process.env, {
    APP_ENV: 'test',
    DATABASE_URL: u.href,
    SESSION_SECRET: crypto.randomUUID(),
    POSTIZ_ANALYTICS_ENABLED: '0',
  });
});
import { prisma } from '@vululu/db';
import { buildServer } from '../../apps/api/src/server';
import { cipher } from '../../apps/api/src/infrastructure/publishing/service';
import { purge, reminder, monday } from '../../apps/api/src/infrastructure/results/store';
let app: Awaited<ReturnType<typeof buildServer>>;
const user = randomUUID(),
  other = randomUUID(),
  project = randomUUID(),
  conn = randomUUID(),
  pub = randomUUID(),
  ids = [randomUUID(), randomUUID(), randomUUID()];
let h: Record<string, string>, foreign: Record<string, string>, offer: string, campaign: string;
beforeAll(async () => {
  app = await buildServer();
  const pass = randomUUID(),
    passwordHash = await bcrypt.hash(pass, 4);
  async function login(id: string) {
    await prisma.user.create({
      data: { id, email: id + '@fixture.test', name: 'C11 fixture', passwordHash },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: id + '@fixture.test', password: pass },
    });
    return {
      cookie: res.cookies.map((c) => `${c.name}=${c.value}`).join('; '),
      'x-csrf-token': res.json().csrfToken,
    };
  }
  h = await login(user);
  foreign = await login(other);
  const ctx = await prisma.brandContext.create({
    data: { userId: user, name: 'Fixture C11', description: 'Test uniquement' },
  });
  offer = (await prisma.confirmedOffer.create({ data: { contextId: ctx.id, name: 'Atelier de test' } })).id;
  const c = await app.inject({
    method: 'POST',
    url: '/api/campaigns',
    headers: h,
    payload: { name: 'Campagne de recette' },
  });
  expect(c.statusCode).toBe(201);
  campaign = c.json().campaign.id;
  await prisma.project.create({
    data: {
      id: project,
      userId: user,
      contextId: ctx.id,
      campaignId: campaign,
      title: 'Création fixture',
      platform: 'LinkedIn',
      format: 'Affiche',
      objective: 'Présenter',
    },
  });
  for (const [i, id] of ids.entries()) {
    const r = await app.inject({
      method: 'POST',
      url: '/api/calendar',
      headers: h,
      payload: {
        id,
        requestId: randomUUID(),
        expectedVersion: 0,
        data: {
          title: 'Sujet ' + i,
          audience: 'Public test',
          objective: 'Expliquer',
          offerId: offer,
          campaignId: campaign,
          projectId: project,
          status: 'IDEA',
          archived: false,
          timeZone: 'UTC',
          plannedAt: new Date(Math.floor(Date.now() / 60000) * 60000 - (3 - i) * 86400000).toISOString(),
          variants: [{ platform: 'LinkedIn', format: 'Affiche', caption: 'Fixture', cta: 'Lire' }],
        },
      },
    });
    expect(r.statusCode, r.body).toBe(200);
  }
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await app.close();
  await prisma.publicationRequest.deleteMany({ where: { id: pub } });
  await prisma.publishingConnection.deleteMany({ where: { id: conn } });
  await prisma.marketingRevision.deleteMany({ where: { projectId: project } });
  await prisma.contentItem.deleteMany({ where: { userId: user } });
  await prisma.project.deleteMany({ where: { id: project } });
  await prisma.user.deleteMany({ where: { id: { in: [user, other] } } });
});
it('retrieves the campaign and three distinct content histories, then explicitly prepares a next-week plan', async () => {
  const hist = (await app.inject({ url: '/api/results/history', headers: h })).json();
  expect(hist.rows.filter((x: { kind: string }) => x.kind === 'content')).toHaveLength(3);
  expect(hist.rows).toContainEqual(expect.objectContaining({ kind: 'campaign', subject: campaign }));
  const r = await app.inject({ url: '/api/results', headers: h });
  expect(r.json().offers).toEqual([{ id: offer, name: 'Atelier de test', previous: 'Sujet 2', project }]);
  expect(r.json().usage).toMatchObject({
    firstExport: null,
    firstPublication: null,
    centsPerUsable: null,
    activeDays: 1,
  });
  const next = new Date(+monday(new Date()) + 7 * 86400000);
  const plan = await app.inject({
    method: 'POST',
    url: `/api/projects/${project}/marketing`,
    headers: h,
    payload: {
      requestId: randomUUID(),
      offerId: offer,
      week: next.toISOString().slice(0, 10),
      regulated: false,
    },
  });
  expect(plan.statusCode, plan.body).toBe(200);
  expect((await app.inject({ url: '/api/results/history', headers: h })).json().rows[0].kind).toBe('plan');
  expect((await app.inject({ url: '/api/results/history', headers: foreign })).json().rows).toEqual([]);
  expect(await prisma.contentItem.count({ where: { userId: user } })).toBe(3);
});
it('uses only confirmed receipts for metrics; fixture zero is not missing, relay state is not a sale', async () => {
  process.env.PUBLISHING_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  await prisma.creativeRevision.create({
    data: { projectId: project, version: 1, spec: {}, manifest: {}, approvedAt: new Date() },
  });
  await prisma.publishingConnection.create({
    data: {
      id: conn,
      ownerId: user,
      provider: 'postiz',
      platform: 'LinkedIn',
      channel: 'fixture',
      expiresAt: new Date(Date.now() + 60000),
      tokenCipher: cipher.encrypt('test-only', conn + ':token'),
      hookCipher: 'unused',
    },
  });
  await prisma.publicationRequest.create({
    data: {
      id: pub,
      submitKey: randomUUID(),
      cancelKey: randomUUID(),
      connectionId: conn,
      projectId: project,
      revision: 1,
      itemId: ids[0],
      itemVersion: 1,
      state: 'SUBMITTED',
      remoteId: 'fixture-post',
    },
  });
  const url = '/api/results/publications/' + pub + '/metrics',
    read = (headers = h) => app.inject({ method: 'POST', url, headers, payload: {} });
  expect((await read()).statusCode).toBe(404);
  await prisma.publicationRequest.update({
    where: { id: pub },
    data: { state: 'PUBLISHED', networkReceipt: 'test-receipt' },
  });
  expect((await read(foreign)).statusCode).toBe(404);
  expect((await read()).json()).toMatchObject({ retrievedAt: null, metrics: { clicks: 'NOT_AVAILABLE' } });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json([{ label: 'Clicks', data: [{ total: 0, date: '2026-10-01' }] }])),
  );
  process.env.POSTIZ_ANALYTICS_ENABLED = '1';
  try {
    const res = await read();
    expect(res.json()).toMatchObject({
      source: 'Postiz · LinkedIn',
      metrics: { clicks: 0, leads: 'NOT_AVAILABLE', sales: 'NOT_AVAILABLE' },
    });
    expect(res.body).not.toContain('test-only');
    expect(
      (await app.inject({ url: '/api/results', headers: h })).json().publications[0].observation,
    ).toEqual(res.json());
    expect(
      (await app.inject({ url: '/api/results', headers: h })).json().usage.firstPublication,
    ).toBeTruthy();
    await prisma.publishingConnection.update({ where: { id: conn }, data: { revoked: true } });
    expect((await read()).json().retrievedAt).toBeNull();
  } finally {
    vi.unstubAllGlobals();
    process.env.POSTIZ_ANALYTICS_ENABLED = '0';
  }
});
it('defaults to no reminders, supports weekly dismissal and opt-out, expires detail but retains first export', async () => {
  const change = (body: object) =>
    app.inject({ method: 'POST', url: '/api/results/reminder', headers: h, payload: body });
  expect(await reminder(user)).toEqual({ enabled: false, due: false });
  expect((await change({ enabled: true })).json().due).toBe(true);
  expect((await change({ dismiss: true })).json().due).toBe(false);
  expect((await reminder(user, new Date(Date.now() + 7 * 86400000))).due).toBe(true);
  await change({ enabled: false });
  expect((await reminder(user)).enabled).toBe(false);
  const at = new Date(Date.now() - 181 * 86400000);
  await prisma.resultEvent.create({
    data: { userId: user, kind: 'export', subject: project, detail: 'Master fixture', at },
  });
  await purge();
  expect(await prisma.resultEvent.count({ where: { userId: user, kind: 'export' } })).toBe(0);
  expect((await prisma.resultPreference.findUnique({ where: { userId: user } }))!.firstExport).toEqual(at);
});
it('pages tied timestamps without overlap; cost uses reported cents only and withholds incomplete totals', async () => {
  const at = new Date();
  await prisma.resultEvent.createMany({
    data: Array.from({ length: 53 }, (_, i) => ({
      userId: user,
      at,
      kind: 'export',
      subject: 'pagination-fixture-' + i,
      detail: 'fixture',
    })),
  });
  const first = (await app.inject({ url: '/api/results/history', headers: h })).json();
  expect(first.rows).toHaveLength(50);
  const second = (
    await app.inject({ url: '/api/results/history?' + new URLSearchParams(first.next), headers: h })
  ).json();
  const keys = [...first.rows, ...second.rows]
    .filter((x) => x.subject.startsWith('pagination-fixture-'))
    .map((x) => x.key);
  expect(new Set(keys).size).toBe(53);
  expect(keys.length).toBe(53);
  await prisma.creativeRevision.create({
    data: { projectId: project, version: 3, spec: {}, manifest: {}, approvedAt: new Date() },
  });
  await prisma.executionAccount.create({ data: { userId: user, limitCents: 100, tools: [] } });
  try {
    const op = await prisma.executionOperation.create({
      data: {
        id: randomUUID(),
        accountId: user,
        projectId: project,
        key: randomUUID(),
        correlationId: randomUUID(),
        digest: 'fixture',
        tool: 'fixture',
        revision: 1,
        state: 'SUCCEEDED',
        costState: 'REPORTED',
        reportedCents: 12,
        maxCents: 20,
      },
    });
    const current = async () => (await app.inject({ url: '/api/results', headers: h })).json().usage;
    const u = await current();
    expect(u.centsPerUsable).toBe(12 / u.usable);
    await prisma.executionOperation.update({
      where: { id: op.id },
      data: { state: 'UNKNOWN', costState: 'UNKNOWN' },
    });
    expect((await current()).centsPerUsable).toBeNull();
  } finally {
    await prisma.executionOperation.deleteMany({ where: { accountId: user } });
    await prisma.executionAccount.delete({ where: { userId: user } });
  }
});
