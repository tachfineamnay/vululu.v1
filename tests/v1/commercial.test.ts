import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
// Dedicated database: this suite explicitly turns on a database-wide enforcement switch.
const enabled = vi.hoisted(() => {
  const u = new URL(
    process.env.BILLING_DATABASE_URL_TEST || 'postgres://vululu@localhost:55432/c12_billing_test',
  );
  if (!['localhost', '127.0.0.1'].includes(u.hostname) || !u.pathname.endsWith('_billing_test'))
    throw Error('Dedicated disposable *_billing_test DB required');
  Object.assign(process.env, {
    DATABASE_URL: u.href,
    APP_ENV: 'test',
    // This suite exercises the commercial architecture: beta mode is explicitly off.
    VULULU_BETA_MODE: '0',
    BILLING_STRIPE_MODE: 'test',
    SESSION_SECRET: crypto.randomUUID(),
    APP_ORIGIN: 'http://localhost:3100',
    STRIPE_TEST_SECRET_KEY: 'sk_test_fixture_no_network',
    STRIPE_TEST_WEBHOOK_SECRET: 'whsec_' + crypto.randomUUID(),
  });
  return !!process.env.BILLING_DATABASE_URL_TEST;
});
import { prisma } from '@vululu/db';
import { buildServer } from '../../apps/api/src/server';
import {
  account,
  checkout,
  cancelCheckout,
  paymentReceipt,
  stripeClient,
  reconcileRefund,
} from '../../apps/api/src/infrastructure/billing/service';
import {
  approve,
  execute,
  cancel,
  resolveIncident,
  propose,
} from '../../apps/api/src/infrastructure/execution/broker';
const pass = randomUUID(),
  fixturePrice = 1234,
  users: string[] = [];
let app: Awaited<ReturnType<typeof buildServer>>,
  product: string,
  admin: Awaited<ReturnType<typeof login>>,
  support: Awaited<ReturnType<typeof login>>;
const post = (url: string, payload: object, headers: Record<string, string>) =>
  app.inject({ method: 'POST', url, payload, headers });
async function login(role = 'user') {
  const id = randomUUID(),
    email = id + '@fixture.test';
  users.push(id);
  await prisma.user.create({
    data: { id, email, name: 'Controlled fixture', role, passwordHash: await bcrypt.hash(pass, 4) },
  });
  const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: pass } });
  expect(r.statusCode).toBe(200);
  return {
    id,
    headers: {
      cookie: r.cookies.map((c) => c.name + '=' + c.value).join('; '),
      'x-csrf-token': r.json().csrfToken,
    },
  };
}
// No network: inject only the official SDK object's Checkout transport boundary.
async function order(user: string) {
  const client = stripeClient();
  vi.spyOn(client.checkout.sessions, 'create').mockImplementation(async (input: unknown) => {
    const order = (input as { client_reference_id: string }).client_reference_id;
    return {
      id: 'cs_test_' + order,
      livemode: false, status: 'open', mode: 'payment', currency: 'usd', amount_total: fixturePrice,
      client_reference_id: order,
      url: 'https://checkout.stripe.com/c/pay/cs_test_' + order,
    } as never;
  });
  const r = await checkout(user, product, randomUUID(), client);
  expect(client.checkout.sessions.create).toHaveBeenCalledWith(
    expect.objectContaining({
      mode: 'payment',
      line_items: [
        expect.objectContaining({ price_data: expect.objectContaining({ unit_amount: fixturePrice }) }),
      ],
    }),
    { idempotencyKey: 'vululu-test:' + r.orderId },
  );
  vi.spyOn(client.checkout.sessions, 'retrieve').mockResolvedValue({
    id: 'cs_test_' + r.orderId,
    livemode: false, status: 'open', mode: 'payment', currency: 'usd', amount_total: fixturePrice,
    client_reference_id: r.orderId,
    url: r.url,
  } as never);
  expect(await checkout(user, product, randomUUID(), client)).toEqual(r);
  expect(client.checkout.sessions.create).toHaveBeenCalledTimes(1);
  return r.orderId;
}
function event(id: string, type = 'payment_intent.succeeded', fields: Record<string, unknown> = {}) {
  return {
    id: 'evt_' + randomUUID(),
    type,
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    object: 'event',
    data: {
      object: {
        id: 'pi_' + id,
        metadata: { vululuOrder: id },
        currency: 'usd',
        amount: fixturePrice,
        amount_received: fixturePrice,
        status: 'succeeded',
        ...fields,
      },
    },
  };
}
function webhook(e: ReturnType<typeof event>, options: { age?: number; tamper?: boolean } = {}) {
  const payload = JSON.stringify(e),
    signature = stripeClient().webhooks.generateTestHeaderString({
      payload,
      secret: process.env.STRIPE_TEST_WEBHOOK_SECRET!,
      timestamp: Math.floor(Date.now() / 1000) - (options.age ?? 0),
    });
  return app.inject({
    method: 'POST',
    url: '/api/billing/stripe-webhook',
    payload: payload + (options.tamper ? ' ' : ''),
    headers: { 'content-type': 'application/json', 'stripe-signature': signature },
  });
}
async function project(userId: string) {
  const ctx = await prisma.brandContext.create({ data: { userId, name: 'QA', description: 'fixture' } });
  const p = await prisma.project.create({
    data: {
      contextId: ctx.id,
      userId,
      title: 'Fixture',
      objective: 'Test',
      format: 'Affiche',
      platform: 'Instagram',
    },
  });
  await prisma.creativeRevision.create({ data: { projectId: p.id, version: 1, spec: {} } });
  return p.id;
}
describe.skipIf(!enabled)('C12 — controlled test-mode financial fixtures only', () => {
  beforeAll(async () => {
    app = await buildServer();
    expect((await prisma.billingControl.findUniqueOrThrow({ where: { id: 'commercial' } })).enabled).toBe(
      false,
    );
    admin = await login('super_admin');
    support = await login('support');
    const r = await post(
      '/api/admin/commerce/products',
      {
        name: 'Fixture only — NOT commercial pricing',
        currency: 'usd',
        amount: fixturePrice,
        days: 5,
        regular: 1,
        premium: 2,
        imageUnits: 2,
        videoUnits: 4,
        features: ['creative.render', 'media.image@1'],
        terms: 'prepaid-v1',
        evidence: 'test-fixture-not-an-owner-price',
        ownerApproved: true,
      },
      admin.headers,
    );
    expect(r.statusCode, r.body).toBe(200);
    product = r.json().id;
    expect(
      (await post('/api/admin/commerce/enable', { confirm: 'ENABLE TEST ENTITLEMENTS' }, admin.headers))
        .statusCode,
    ).toBe(200);
  });
  afterAll(async () => {
    await app?.close();
    if (!product) return;
    await prisma.billingControl.update({ where: { id: 'commercial' }, data: { enabled: false } });
    const orders = { order: { userId: { in: users } } };
    await prisma.billingReceipt.deleteMany({ where: orders });
    await prisma.billingUse.deleteMany({ where: orders });
    await prisma.billingOrder.deleteMany({ where: { userId: { in: users } } });
    await prisma.billingProduct.delete({ where: { id: product } });
    await prisma.mediaGeneration.deleteMany({ where: { source: { project: { userId: { in: users } } } } });
    await prisma.executionOperation.deleteMany({ where: { accountId: { in: users } } });
    await prisma.executionAccount.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  });
  it('does not accept live keys or owner-unapproved catalog entries', async () => {
    const previous = process.env.STRIPE_TEST_SECRET_KEY;
    try {
      process.env.STRIPE_TEST_SECRET_KEY = 'sk_live_not_a_key';
      expect(() => stripeClient()).toThrow();
    } finally {
      process.env.STRIPE_TEST_SECRET_KEY = previous;
    }
    const p = await prisma.billingProduct.findUniqueOrThrow({ where: { id: product } });
    await expect(
      prisma.billingProduct.update({ where: { id: product }, data: { amount: p.amount + 1 } }),
    ).rejects.toThrow(/immutable_billing_product/);
    expect(
      (await post('/api/admin/commerce/products', { ownerApproved: false }, admin.headers)).statusCode,
    ).toBe(400);
  });
  it('requires exact, recent, test-only signed evidence before granting; duplicates and stale failures cannot mint or remove a grant', async () => {
    const user = await login(),
      id = await order(user.id),
      paid = event(id);
    expect((await account(user.id)).orders[0].regular.available).toBe(0);
    expect((await webhook(paid, { tamper: true })).statusCode).toBe(400);
    expect((await webhook(paid, { age: 400 })).statusCode).toBe(400);
    expect((await webhook({ ...paid, livemode: true })).statusCode).toBe(400);
    expect((await webhook(event(id, 'payment_intent.succeeded', { amount_received: 1 }))).statusCode).toBe(
      409,
    );
    expect((await webhook(event(id, 'payment_intent.payment_failed'))).statusCode).toBe(200);
    expect((await account(user.id)).orders[0].status).toBe('FAILED');
    const res = await Promise.all([webhook(paid), webhook(paid)]);
    expect(res.map((r) => r.statusCode)).toEqual([200, 200]);
    expect(res.some((r) => r.json().replay)).toBe(true);
    await webhook(event(id, 'payment_intent.payment_failed'));
    expect((await account(user.id)).orders[0]).toMatchObject({
      status: 'PAID',
      regular: { available: 1 },
      premium: { available: 2 },
    });
    expect(
      (await webhook({ ...paid, data: { object: { ...paid.data.object, amount: 1 } } })).statusCode,
    ).toBe(409);
  });
  it('signed cumulative refunds before/after success, cancellation and expiry never create a negative or revive revoked credits', async () => {
    const u = await login(),
      id = await order(u.id),
      refund = (n: number) =>
        event(id, 'charge.refunded', { id: 'ch_fixture', payment_intent: 'pi_' + id, amount_refunded: n });
    await webhook(refund(200));
    await webhook(event(id));
    expect((await account(u.id)).orders[0]).toMatchObject({
      status: 'PARTIAL_REVIEW',
      refunded: 200,
      premium: { available: 0 },
    });
    await webhook(refund(fixturePrice));
    await webhook(refund(100));
    await webhook(event(id));
    expect((await account(u.id)).orders[0]).toMatchObject({ status: 'REFUNDED', refunded: fixturePrice });
    const old = await order(u.id);
    await webhook({ ...event(old), created: Math.floor(Date.now() / 1000) - 10 * 86400 });
    expect((await account(u.id)).orders.find((o) => o.id === old)?.status).toBe('EXPIRED');
    const open = await order(u.id);
    await webhook(
      event(open, 'checkout.session.expired', { id: 'cs_test_' + open, client_reference_id: open }),
    );
    expect((await account(u.id)).orders.find((o) => o.id === open)?.status).toBe('CANCELLED');
  });
  it('freezes a failed refund; only an evidence-backed test-provider read can restore access', async () => {
    const u = await login(),
      id = await order(u.id);
    await webhook(event(id));
    await webhook(
      event(id, 'charge.refunded', {
        id: 'ch_test',
        payment_intent: 'pi_' + id,
        amount_refunded: fixturePrice,
      }),
    );
    const failed = event(id, 'refund.failed', {
      id: 're_test',
      metadata: {},
      payment_intent: 'pi_' + id,
      status: 'failed',
    });
    expect((await webhook(failed)).statusCode).toBe(200);
    expect((await account(u.id)).orders[0].status).toBe('REFUND_REVIEW');
    const client = stripeClient();
    vi.spyOn(client.paymentIntents, 'retrieve').mockResolvedValue({
      id: 'pi_' + id,
      livemode: false,
      status: 'succeeded',
      metadata: { vululuOrder: id },
      currency: 'usd',
      amount_received: fixturePrice,
    } as never);
    vi.spyOn(client.refunds, 'list').mockResolvedValue({
      has_more: false,
      data: [{ payment_intent: 'pi_' + id, currency: 'usd', status: 'failed', amount: fixturePrice }],
    } as never);
    expect((await reconcileRefund(admin.id, id, 'controlled read fixture', client)).state).toBe('PAID');
    expect((await account(u.id)).orders[0].regular.available).toBe(1);
  });
  it('serializes concurrent regular holds, rolls back exhaustion, releases failures, charges only terminal success', async () => {
    const u = await login(),
      p = await project(u.id),
      render = () => prisma.studioRender.create({ data: { projectId: p, revision: 1, state: 'running' } });
    await expect(render()).rejects.toThrow(/billing_plan_required/);
    await webhook(event(await order(u.id)));
    const batch = await Promise.allSettled([render(), render(), render()]);
    expect(batch.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect((await account(u.id)).orders[0]).toMatchObject({
      regular: { held: 1, available: 0 },
      premium: { available: 2 },
    });
    await prisma.studioRender.updateMany({ where: { projectId: p }, data: { state: 'failed' } });
    const ok = await render();
    await prisma.studioRender.update({ where: { id: ok.id }, data: { state: 'succeeded' } });
    await prisma.studioRender.update({ where: { id: ok.id }, data: { state: 'succeeded' } });
    expect((await account(u.id)).orders[0].regular).toEqual({ available: 0, used: 1, held: 0 });
    await expect(render()).rejects.toThrow(/billing_render_already_reserved/);
    await prisma.creativeRevision.create({ data: { projectId: p, version: 2, spec: {} } });
    await expect(
      prisma.studioRender.create({ data: { projectId: p, revision: 2, state: 'running' } }),
    ).rejects.toThrow(/billing_quota_exhausted/);
    await expect(prisma.productionJob.create({ data: { projectId: p, type: 'production' } })).rejects.toThrow(
      /billing_plan_required/,
    );
  });
  it('C05 broker keeps premium and regular buckets distinct; cancel releases; ambiguous work requires two explicit reconciliations', async () => {
    const u = await login(),
      p = await project(u.id);
    await webhook(event(await order(u.id)));
    await prisma.executionAccount.create({
      data: { userId: u.id, tools: ['media.image@1'], enabled: true, limitCents: 10 },
    });
    const make = async () => {
      const key = randomUUID();
      await prisma.mediaGeneration.create({
        data: {
          id: key,
          projectId: p,
          revision: 1,
          sceneKey: 'SCENE-001',
          tool: 'media.image@1',
          provider: 'fixture',
          model: 'fixture',
          parameters: {
            schemaVersion: 1,
            requestId: key,
            revision: 1,
            kind: 'image',
            sceneKey: 'SCENE-001',
            prompt: 'Fixture locale sans appel externe',
            size: '1024:1024',
            rightsConfirmed: true,
          },
          state: 'DRAFT',
        },
      });
      return propose(u.id, p, { tool: 'media.image@1', key, revision: 1 });
    };
    const a = await make(),
      b = await make();
    await approve(u.id, a.id, a.digest);
    await expect(approve(u.id, b.id, b.digest)).rejects.toThrow(/billing_quota_exhausted/);
    await cancel(u.id, a.id);
    await approve(u.id, b.id, b.digest);
    await execute(b.id, {
      invoke: async () => {
        throw Error('fixture ambiguity');
      },
    });
    await resolveIncident(admin.id, b.id, 1, randomUUID());
    const url = '/api/admin/commerce/credits/' + b.id + '/resolve';
    expect((await account(u.id)).orders[0]).toMatchObject({
      premium: { held: 2 },
      regular: { available: 1 },
    });
    expect(
      (await post(url, { consumed: true, evidence: 'fixture verified usable' }, support.headers)).statusCode,
    ).toBe(403);
    expect(
      (await post(url, { consumed: true, evidence: 'fixture verified usable' }, admin.headers)).statusCode,
    ).toBe(200);
    expect(
      (await post(url, { consumed: true, evidence: 'fixture verified usable' }, admin.headers)).statusCode,
    ).toBe(409);
    expect((await account(u.id)).orders[0].premium).toEqual({ held: 0, used: 2, available: 0 });
  });
  it('rechecks purchased rights at worker claim; refunded queued work releases both reservations without invoking a provider', async () => {
    const u = await login(),
      p = await project(u.id),
      id = await order(u.id);
    await webhook(event(id));
    await prisma.executionAccount.create({
      data: { userId: u.id, tools: ['studio.render@1'], enabled: true, limitCents: 0 },
    });
    const op = await propose(u.id, p, { tool: 'studio.render@1', key: randomUUID(), revision: 1 });
    await approve(u.id, op.id, op.digest);
    await webhook(
      event(id, 'charge.refunded', {
        id: 'ch_test',
        payment_intent: 'pi_' + id,
        amount_refunded: fixturePrice,
      }),
    );
    const invoke = vi.fn();
    await execute(op.id, { invoke });
    expect(invoke).not.toHaveBeenCalled();
    expect((await account(u.id)).orders[0]).toMatchObject({
      status: 'REFUNDED',
      regular: { available: 0, held: 0, used: 0 },
    });
  });
  it('isolates customers, SUPPORT and ADMIN; persists ticket history, suspension and an accountable admin action', async () => {
    const u = await login(),
      other = await login(),
      t = await post(
        '/api/billing/tickets',
        { subject: 'Aide test', message: 'Question de recette' },
        u.headers,
      );
    expect(t.statusCode, t.body).toBe(200);
    const id = t.json().id,
      body = { expected: 'OPEN', status: 'IN_PROGRESS', message: 'Prise en charge.' };
    expect(
      (await post('/api/billing/tickets/' + id, { ...body, status: 'OPEN' }, other.headers)).statusCode,
    ).toBe(404);
    expect((await post('/api/support/cases/' + id, body, admin.headers)).statusCode).toBe(403);
    expect((await post('/api/support/cases/' + id, body, support.headers)).statusCode).toBe(200);
    expect(await prisma.ticketEntry.count({ where: { ticketId: id } })).toBe(2);
    const url = '/api/admin/commerce/accounts/' + u.id,
      b = { suspended: true, evidence: 'fixture review' };
    expect((await post(url, b, support.headers)).statusCode).toBe(403);
    expect((await post(url, b, admin.headers)).statusCode).toBe(200);
    expect(
      await prisma.auditEvent.count({
        where: { actorId: admin.id, targetId: u.id, action: 'commerce.account.suspension' },
      }),
    ).toBe(1);
    expect(
      (await post('/api/contexts', { name: 'blocked', description: 'Test' }, u.headers)).statusCode,
    ).toBe(403);
    expect(
      (await app.inject({ url: '/api/billing/tickets', headers: u.headers })).json()[0].entries,
    ).toHaveLength(2);
  });
  it('requires reauthentication and explicit admin review for deletion; export excludes secrets', async () => {
    const u = await login();
    expect(
      (await post('/api/billing/privacy/export', { section: 'profile', password: 'wrong' }, u.headers))
        .statusCode,
    ).toBe(403);
    const r = await post('/api/billing/privacy/export', { section: 'profile', password: pass }, u.headers);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.body).not.toContain('passwordHash');
    const t = await post('/api/billing/privacy/erasure', { confirm: 'DELETE', password: pass }, u.headers);
    const url = '/api/admin/commerce/erasure/' + t.json().id,
      b = { evidence: 'fixture reviewed', confirm: 'REVIEW DELETE' };
    expect((await post(url, b, support.headers)).statusCode).toBe(403);
    const result = await post(url, b, admin.headers);
    expect(result.json(), result.body).toEqual({ deleted: true });
    expect((await app.inject({ url: '/api/billing/account', headers: u.headers })).statusCode).toBe(401);
  });
  it('separates catalog, checkout, signed events and spendable balances by mode without enabling live', async () => {
    const u = await login(), id = randomUUID(), liveProduct = randomUUID();
    const p = await prisma.billingProduct.findUniqueOrThrow({ where: { id: product } });
    await prisma.billingProduct.create({ data: { ...p, id: liveProduct, mode: 'live' } });
    try {
      await expect(checkout(u.id, liveProduct, randomUUID())).rejects.toMatchObject({ code: 'product_not_available' });
      const row = await prisma.billingOrder.create({ data: { id, userId: u.id, productId: liveProduct, mode: 'live',
        stripeAccount: 'acct_fixture', requestKey: randomUUID(), state: 'PAID', paidAt: new Date(), expiresAt: new Date(Date.now() + 300000) } });
      const a = await account(u.id);
      expect(a.catalog.some((o) => o.id === liveProduct)).toBe(false);
      expect(a.orders.find((o) => o.id === id)).toMatchObject({ status: 'INACTIVE_MODE', premium: { available: 0 } });
      await expect(prisma.$executeRaw`SELECT billing_hold(${u.id},${randomUUID()},'media.image@1','premium')`).rejects.toThrow(/billing_plan_required/);
      expect((await webhook(event(id))).statusCode).toBe(409);
      expect((await prisma.billingOrder.findUniqueOrThrow({ where: { id } })).intentId).toBe(row.intentId);
      expect(await prisma.billingReceipt.count({ where: { orderId: id } })).toBe(0);
      expect((await post('/api/admin/commerce/enable', { confirm: 'ENABLE LIVE ENTITLEMENTS', evidence: 'fixture only' }, admin.headers)).statusCode).toBe(400);
    } finally {
      await prisma.billingOrder.deleteMany({ where: { id } });
      await prisma.billingProduct.delete({ where: { id: liveProduct } });
    }
  });
  it('keeps cancellation webhook-authoritative and returns only an owner-scoped Stripe receipt', async () => {
    const u = await login(), id = await order(u.id), client = stripeClient();
    const expire = vi.spyOn(client.checkout.sessions, 'expire').mockResolvedValue({} as never);
    await expect(cancelCheckout(admin.id, id, client)).rejects.toMatchObject({ statusCode: 404 });
    expect(await cancelCheckout(u.id, id, client)).toEqual({ awaitingWebhook: true });
    expect(expire).toHaveBeenCalledWith('cs_test_' + id, {}, { idempotencyKey: 'expire:test:' + id });
    expect((await account(u.id)).orders[0].status).toBe('PENDING');
    await webhook(event(id, 'checkout.session.expired', { id: 'cs_test_' + id, client_reference_id: id }));
    expect((await account(u.id)).orders[0].status).toBe('CANCELLED');
    const paid = await order(u.id);
    await webhook(event(paid));
    const retrieve = vi.spyOn(client.paymentIntents, 'retrieve').mockResolvedValue({
      id: 'pi_' + paid, status: 'succeeded', livemode: false, metadata: { vululuOrder: paid }, currency: 'usd', amount_received: fixturePrice,
      latest_charge: { payment_intent: 'pi_' + paid, livemode: false, receipt_url: 'https://pay.stripe.com/receipts/payment/fixture' }
    } as never);
    await expect(paymentReceipt(admin.id, paid, client)).rejects.toMatchObject({ statusCode: 404 });
    expect(retrieve).not.toHaveBeenCalled();
    expect(await paymentReceipt(u.id, paid, client)).toEqual({ url: 'https://pay.stripe.com/receipts/payment/fixture' });
    expect(retrieve).toHaveBeenCalledWith('pi_' + paid, { expand: ['latest_charge'] });
  });

});
