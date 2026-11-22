import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { AccountMail } from '../../apps/api/src/infrastructure/email/accountMail';
import type { EnginePort } from '../../apps/api/src/infrastructure/execution/registry';

/**
 * BETA01 — bêta gratuite de bout en bout sur PostgreSQL jetable.
 *
 * La base est celle du dépôt (`*_test`, 127.0.0.1 uniquement) : aucune base
 * distante, aucun fournisseur, aucun débit. Stripe n'est jamais appelé :
 * la configuration de test est synthétique et les transports ne sont pas
 * sollicités, le refus bêta intervenant avant toute lecture Stripe.
 */
const dbUrl = new URL(
  process.env.DATABASE_URL_TEST || 'postgresql://vululu@127.0.0.1:55432/vululu_v1_00_test?schema=public',
);
if (!['127.0.0.1', 'localhost'].includes(dbUrl.hostname) || !dbUrl.pathname.endsWith('_test')) {
  throw new Error('Disposable local test DB required');
}
process.env.DATABASE_URL = dbUrl.href;
process.env.DATABASE_URL_TEST = dbUrl.href;
process.env.V0_TEST_DB = '1';
process.env.APP_ENV = 'test';
process.env.SESSION_SECRET ||= randomUUID();
process.env.ACCOUNT_EMAIL_ORIGIN = 'http://localhost:3100';
process.env.APP_ORIGIN = 'http://localhost:3100';
process.env.BILLING_STRIPE_MODE = 'test';
process.env.VULULU_BETA_MODE = '1';
// Synthetic, non-functional fixtures: no network call is made with them.
process.env.STRIPE_TEST_SECRET_KEY ||= ['sk', 'test', 'beta01_fixture'].join('_');
process.env.STRIPE_TEST_WEBHOOK_SECRET ||= 'whsec_' + randomUUID().replace(/-/g, '');

const password = 'A test-only beta passphrase';
const sink: AccountMail[] = [];
const userIds: string[] = [];
const productIds: string[] = [];

type Server = Awaited<ReturnType<typeof import('../../apps/api/src/server').buildServer>>;
type Db = typeof import('@vululu/db')['prisma'];

let app: Server;
let db: Db;
let service: typeof import('../../apps/api/src/infrastructure/billing/service');
let broker: typeof import('../../apps/api/src/infrastructure/execution/broker');
let freeze: typeof import('../../apps/api/src/infrastructure/beta/freeze');

type Session = { id: string; headers: Record<string, string> };

function sessionHeaders(response: { cookies: { name: string; value: string }[]; json: () => unknown }): Record<string, string> {
  return {
    cookie: response.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; '),
    'x-csrf-token': String((response.json() as { csrfToken?: string }).csrfToken ?? ''),
  };
}

async function loginAs(address: string, value = password): Promise<Session> {
  const response = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: address, password: value } });
  expect(response.statusCode).toBe(200);
  const headers = sessionHeaders(response);
  const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers });
  expect(me.statusCode).toBe(200);
  return { id: me.json().user.id as string, headers };
}

async function fixtureUser(role = 'user'): Promise<Session> {
  const id = randomUUID();
  userIds.push(id);
  await db.user.create({
    data: { id, email: `${id}@beta01.example`, name: 'Bêta fixture', role, passwordHash: await bcrypt.hash(password, 4) },
  });
  return loginAs(`${id}@beta01.example`);
}

function mailToken(address: string, page: string) {
  return vi.waitFor(
    () => {
      const mail = sink.find((entry) => entry.to === address && entry.text.includes(`/${page}#`));
      if (!mail) throw new Error('account mail pending');
      const link = new URL(mail.text.split('\n')[2]);
      const token = new URLSearchParams(link.hash.slice(1)).get('token');
      if (!token) throw new Error('token missing');
      return token;
    },
    { timeout: 5000 },
  );
}

let betaUser: Session;
let projectId: string;

beforeAll(async () => {
  db = (await import('@vululu/db')).prisma;
  service = await import('../../apps/api/src/infrastructure/billing/service');
  broker = await import('../../apps/api/src/infrastructure/execution/broker');
  freeze = await import('../../apps/api/src/infrastructure/beta/freeze');
  app = await (
    await import('../../apps/api/src/server')
  ).buildServer({
    accountMail: {
      async send(message) {
        sink.push(message);
      },
    },
  });
});

afterAll(async () => {
  await app?.close();
  if (!db) return;
  await db.billingControl.update({ where: { id: 'commercial' }, data: { enabled: false } });
  const orders = { order: { userId: { in: userIds } } };
  await db.billingReceipt.deleteMany({ where: orders });
  await db.billingUse.deleteMany({ where: orders });
  await db.billingOrder.deleteMany({ where: { userId: { in: userIds } } });
  await db.billingProduct.deleteMany({ where: { id: { in: productIds } } });
  const ownedProjects = await db.project.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
  await db.studioRender.deleteMany({ where: { projectId: { in: ownedProjects.map((project: { id: string }) => project.id) } } });
  await db.executionOperation.deleteMany({ where: { accountId: { in: userIds } } });
  await db.executionAccount.deleteMany({ where: { userId: { in: userIds } } });
  await db.serviceTicket.deleteMany({ where: { userId: { in: userIds } } });
  await db.accountToken.deleteMany({ where: { email: { endsWith: '@beta01.example' } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
});

describe('BETA01 — free beta over HTTP and PostgreSQL (no payment, no external call)', () => {
  it('A. a beta tester registers, verifies, signs in and completes onboarding', async () => {
    const address = `${randomUUID()}@beta01.example`;
    const registration = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: address } });
    expect(registration.statusCode).toBe(202);
    const token = await mailToken(address, 'verify-email');
    const verified = await app.inject({
      method: 'POST',
      url: '/api/auth/verify-email',
      payload: { token, password, name: 'Bêta Testeuse' },
    });
    // F01 : la vérification claim le jeton et crée le compte immédiatement (200),
    // contrairement à l'envoi de lien qui est accepté en 202.
    expect(verified.statusCode).toBe(200);
    betaUser = await loginAs(address);
    userIds.push(betaUser.id);
    expect(betaUser.id).toBeTruthy();
    const context = await app.inject({
      method: 'POST',
      url: '/api/contexts',
      headers: betaUser.headers,
      payload: { name: 'Atelier Bêta', description: 'Entrepreneure indépendante en test gratuit.' },
    });
    expect(context.statusCode).toBe(201);
    const contextId = context.json().context.id as string;
    const project = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: betaUser.headers,
      payload: { contextId, title: 'Premier projet bêta', platform: 'Instagram', format: 'Affiche', objective: 'Tester sans payer' },
    });
    expect(project.statusCode).toBe(201);
    projectId = project.json().project.id as string;
    // Creative revision used by the ToolBroker fixtures (composition, not the feature under test).
    await db.creativeRevision.create({ data: { projectId, version: 1, spec: {} } });
  });

  it('B. a beta user renders and keeps a creative revision without buying any plan', async () => {
    // Studio render rows pass the existing SQL billing triggers only because commerce is frozen.
    const render = await db.studioRender.create({ data: { projectId, revision: 1, state: 'running' } });
    await db.studioRender.update({ where: { id: render.id }, data: { state: 'succeeded' } });
    expect(await db.billingUse.count({ where: { key: 'creative.render:' + render.id } })).toBe(0);
    expect(await db.billingOrder.count({ where: { userId: betaUser.id } })).toBe(0);
    expect(await db.creativeRevision.count({ where: { projectId } })).toBeGreaterThan(0);
  });

  it('C. customer checkout is refused server-side, before any Stripe configuration is read', async () => {
    const overHttp = await app.inject({
      method: 'POST',
      url: '/api/billing/checkout',
      headers: betaUser.headers,
      payload: { productId: randomUUID(), requestKey: randomUUID() },
    });
    expect(overHttp.statusCode).toBe(403);
    expect(overHttp.json().error).toBe('beta_mode_active');
    await expect(service.checkout(betaUser.id, randomUUID(), randomUUID())).rejects.toMatchObject({
      statusCode: 403,
      code: 'beta_mode_active',
    });
    // No order, no session, no receipt was created by the refusal.
    expect(await db.billingOrder.count({ where: { userId: betaUser.id } })).toBe(0);
  });

  it('D. live commercial activation cannot proceed during beta, and the freeze is audited once', async () => {
    const admin = await fixtureUser('super_admin');
    await expect(service.enableCommerce(admin.id, 'ENABLE TEST ENTITLEMENTS')).rejects.toMatchObject({
      code: 'beta_mode_active',
    });
    const refused = await app.inject({
      method: 'POST',
      url: '/api/admin/commerce/enable',
      headers: admin.headers,
      payload: { confirm: 'ENABLE TEST ENTITLEMENTS' },
    });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error).toBe('beta_mode_active');
    expect((await db.billingControl.findUniqueOrThrow({ where: { id: 'commercial' } })).enabled).toBe(false);

    // A residual commercial switch left on is closed by the boot freeze, once, and audited.
    await db.billingControl.update({ where: { id: 'commercial' }, data: { enabled: true } });
    expect(await freeze.freezeCommercialForBeta()).toEqual({ beta: true, frozen: true });
    expect((await db.billingControl.findUniqueOrThrow({ where: { id: 'commercial' } })).enabled).toBe(false);
    const audits = await db.auditEvent.count({ where: { action: 'commerce.beta.frozen', targetId: 'commercial' } });
    expect(audits).toBeGreaterThanOrEqual(1);
    expect(await freeze.freezeCommercialForBeta()).toEqual({ beta: true, frozen: false });
    expect(await db.auditEvent.count({ where: { action: 'commerce.beta.frozen', targetId: 'commercial' } })).toBe(audits);
    // Nothing is deleted: products, orders, receipts and rights stay readable (checked in E).
  });

  it('E. existing financial history stays readable while the catalog is no longer offered', async () => {
    const productId = randomUUID();
    productIds.push(productId);
    const admin = await fixtureUser('super_admin');
    await db.billingProduct.create({
      data: {
        id: productId,
        mode: 'test',
        name: 'Pass historique bêta',
        amount: 1234,
        currency: 'usd',
        days: 30,
        regular: 5,
        premium: 2,
        imageUnits: 1,
        videoUnits: 2,
        features: ['creative.render'],
        terms: 'prepaid-v1',
        evidence: 'beta01 fixture — historique',
        approvedBy: admin.id,
        listed: true,
      },
    });
    await db.billingOrder.create({
      data: {
        id: randomUUID(),
        userId: betaUser.id,
        productId,
        mode: 'test',
        requestKey: randomUUID(),
        state: 'PAID',
        paidAt: new Date(Date.now() - 3600000),
        expiresAt: new Date(Date.now() + 86400000),
        intentId: 'pi_' + randomUUID().replace(/-/g, ''),
      },
    });
    const view = await service.account(betaUser.id);
    expect(view.beta).toEqual({ enabled: true, paymentsFrozen: true });
    expect(view.checkoutAvailable).toBe(false);
    expect(view.catalog).toEqual([]);
    const order = view.orders.find((entry) => entry.product.id === productId);
    expect(order?.status).toBe('PAID');
    expect(order?.product.name).toBe('Pass historique bêta');

    const overHttp = await app.inject({ method: 'GET', url: '/api/billing/account', headers: betaUser.headers });
    expect(overHttp.statusCode).toBe(200);
    expect(overHttp.json().beta.enabled).toBe(true);

    // The operator still sees the preserved catalog and the beta state.
    const commerce = await app.inject({ method: 'GET', url: '/api/admin/commerce', headers: admin.headers });
    expect(commerce.statusCode).toBe(200);
    expect(commerce.json().beta.enabled).toBe(true);
    expect((commerce.json().products as { id: string }[]).some((row) => row.id === productId)).toBe(true);
  });

  it('F. paid AI and media operations without authorization are denied in beta', async () => {
    await db.executionAccount.create({
      data: { userId: betaUser.id, limitCents: 100, enabled: true, tools: ['studio.inspect@1'] },
    });
    // Declared tool list does not include the chargeable operation: denied before any reservation.
    await expect(
      broker.propose(betaUser.id, projectId, { key: randomUUID(), tool: 'sandbox.generate@1', revision: 1 }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'tool_disabled' });
    // A disabled account is denied even for a declared tool.
    await db.executionAccount.update({ where: { userId: betaUser.id }, data: { enabled: false } });
    await expect(
      broker.propose(betaUser.id, projectId, { key: randomUUID(), tool: 'studio.inspect@1', revision: 1 }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'tool_disabled' });
    expect(await db.executionOperation.count({ where: { accountId: betaUser.id } })).toBe(0);
  });

  it('G. approved operations remain bounded by explicit approval, budget and audit trail', async () => {
    await db.executionAccount.update({
      where: { userId: betaUser.id },
      data: { enabled: true, limitCents: 10, tools: ['sandbox.generate@1'], spentCents: 0, reservedCents: 0 },
    });
    const key = randomUUID();
    const proposed = await broker.propose(betaUser.id, projectId, { key, tool: 'sandbox.generate@1', revision: 1 });
    expect(proposed.state).toBe('PROPOSED');
    // Nothing is spent before the explicit approval.
    const queued = await broker.approve(betaUser.id, proposed.id, proposed.digest);
    expect(queued.state).toBe('QUEUED');
    const engine: EnginePort = { async invoke() { return { costCents: 10, costBasis: 'configured_estimate' }; } };
    await broker.execute(proposed.id, engine);
    const settled = await db.executionOperation.findUniqueOrThrow({ where: { id: proposed.id } });
    expect(settled.state).toBe('SUCCEEDED');
    expect(settled.reportedCents).toBe(10);
    const wallet = await db.executionAccount.findUniqueOrThrow({ where: { userId: betaUser.id } });
    expect(wallet.spentCents).toBeGreaterThanOrEqual(10);
    expect(wallet.reservedCents).toBe(0);
    // No billing consumption: beta access is not a purchase.
    expect(await db.billingUse.count({ where: { key: 'exec:' + proposed.id } })).toBe(0);
    // The finite budget still stops the next operation.
    const next = await broker.propose(betaUser.id, projectId, { key: randomUUID(), tool: 'sandbox.generate@1', revision: 1 });
    await expect(broker.approve(betaUser.id, next.id, next.digest)).rejects.toMatchObject({ code: 'budget_exhausted' });
    // Audit history remains available for the approved operation.
    expect(await db.auditEvent.count({ where: { targetType: 'execution', targetId: proposed.id } })).toBeGreaterThan(0);
  });

  it('H. manual exports and offline paths still work in beta', async () => {
    // Data export is the same authorized path used outside beta: reauthentication + scoped page.
    const exported = await app.inject({
      method: 'POST',
      url: '/api/billing/privacy/export',
      headers: betaUser.headers,
      payload: { password, section: 'projects' },
    });
    expect(exported.statusCode).toBe(200);
    expect(Array.isArray(exported.json().data)).toBe(true);
    const calendar = await app.inject({
      method: 'POST',
      url: '/api/billing/privacy/export',
      headers: betaUser.headers,
      payload: { password, section: 'calendar' },
    });
    expect(calendar.statusCode).toBe(200);
    // The project and its composition stay readable without any commercial entitlement.
    const list = await app.inject({ method: 'GET', url: '/api/projects', headers: betaUser.headers });
    expect(list.statusCode).toBe(200);
    expect((list.json().items as { id: string }[]).some((row) => row.id === projectId)).toBe(true);
  });

  it('I. beta feedback opens a typed ticket, reachable by support, distinct from billing incidents', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/billing/tickets',
      headers: betaUser.headers,
      payload: { subject: 'Bug bêta', message: 'Le bouton de l’atelier ne répond pas.', kind: 'BETA_FEEDBACK' },
    });
    expect(created.statusCode).toBe(200);
    const ticketId = created.json().id as string;
    expect((await db.serviceTicket.findUniqueOrThrow({ where: { id: ticketId } })).kind).toBe('BETA_FEEDBACK');

    const support = await fixtureUser('support');
    const queue = await app.inject({ method: 'GET', url: '/api/support/cases', headers: support.headers });
    expect(queue.statusCode).toBe(200);
    expect((queue.json() as { id: string }[]).some((row) => row.id === ticketId)).toBe(true);
    const reply = await app.inject({
      method: 'POST',
      url: '/api/support/cases/' + ticketId,
      headers: support.headers,
      payload: { expected: 'OPEN', status: 'IN_PROGRESS', message: 'Bien reçu, nous regardons.' },
    });
    expect(reply.statusCode).toBe(200);
    // The tester still sees the case in their own space.
    const mine = await app.inject({ method: 'GET', url: '/api/billing/tickets', headers: betaUser.headers });
    expect((mine.json() as { id: string }[]).some((row) => row.id === ticketId)).toBe(true);

    // Outside beta, feedback is refused with an explicit code, never silently accepted.
    process.env.VULULU_BETA_MODE = '0';
    try {
      const refused = await app.inject({
        method: 'POST',
        url: '/api/billing/tickets',
        headers: betaUser.headers,
        payload: { subject: 'Hors bêta', message: 'Retour hors période de bêta.', kind: 'BETA_FEEDBACK' },
      });
      expect(refused.statusCode).toBe(400);
      expect(refused.json().error).toBe('beta_mode_inactive');
    } finally {
      process.env.VULULU_BETA_MODE = '1';
    }
  });

  it('J. with beta disabled, the commercial architecture is preserved and still gated', async () => {
    process.env.VULULU_BETA_MODE = '0';
    try {
      // The beta refusal is gone; the existing F05 safety gates take over again.
      await expect(service.enableCommerce(betaUser.id, 'WRONG PHRASE')).rejects.toMatchObject({
        code: 'activation_confirmation_required',
      });
      const checkout = await app.inject({
        method: 'POST',
        url: '/api/billing/checkout',
        headers: betaUser.headers,
        payload: { productId: randomUUID(), requestKey: randomUUID() },
      });
      expect(checkout.statusCode).toBe(409);
      expect(checkout.json().error).toBe('commercial_not_enabled');
      // The catalog is offered again, but nothing is purchasable without explicit activation.
      const view = await service.account(betaUser.id);
      expect(view.beta.enabled).toBe(false);
      expect(view.catalog.length).toBeGreaterThan(0);
      expect(view.checkoutAvailable).toBe(false);
      expect(view.commercial).toBe(false);
    } finally {
      process.env.VULULU_BETA_MODE = '1';
      await db.billingControl.update({ where: { id: 'commercial' }, data: { enabled: false } });
    }
  });
});
