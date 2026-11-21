import type { FastifyInstance, FastifyRequest } from 'fastify';
import type Stripe from 'stripe';
import { z } from 'zod';
import { prisma } from '@vululu/db';
import type { Prisma } from '@prisma/client';
import {
  account,
  applyEvent,
  audit,
  checkout,
  cancelCheckout,
  enableCommerce,
  paymentReceipt,
  createProduct,
  fail,
  lock,
  verify,
  reconcileRefund,
} from '../infrastructure/billing/service';
import {
  reauth,
  openTicket,
  threads,
  threadsPage,
  THREAD_PAGE_SIZE,
  replyTicket,
  exportPage,
  erase,
} from '../infrastructure/billing/support';
import { activationPhrase, billingConfig, requestedBillingMode } from '../infrastructure/billing/config';
import { betaPaymentsFrozen } from '../betaMode';
import { rateLimitPreHandler } from '../infrastructure/security/rateLimiter';
import { HttpError } from '../errors';
import { recordAuditEvent } from '../security/audit';
const key = z.string().min(1).max(160),
  message = z.string().trim().min(2).max(3000),
  evidence = z.string().trim().min(4).max(160),
  status = z.enum(['OPEN', 'IN_PROGRESS', 'CLOSED']),
  password = z.string().min(1).max(200);
const id = (p: unknown) => z.object({ id: key }).parse(p).id;
export async function billingWebhook(app: FastifyInstance) {
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_r, b, cb) => cb(null, b));
  app.post(
    '/api/billing/stripe-webhook',
    {
      bodyLimit: 131072,
      preHandler: [
        rateLimitPreHandler(
          { name: 'stripe-webhook', limit: 240, windowSeconds: 60, failClosed: true },
          (r) => 'stripe-webhook:' + r.ip,
        ),
      ],
    },
    async (r) => {
      if (!Buffer.isBuffer(r.body)) return fail(400, 'raw_body_required');
      const event = verify(r.body, String(r.headers['stripe-signature'] ?? ''));
      return applyEvent(event, r.body);
    },
  );
}
export async function billingRoutes(app: FastifyInstance, { stripe }: { stripe?: Stripe } = {}) {
  app.addHook('onRequest', async (_r, reply) => {
    reply.header('Cache-Control', 'private, no-store');
  });
  const rate = rateLimitPreHandler(
    { name: 'commercial', limit: 60, windowSeconds: 60, failClosed: true },
    (r) => 'commerce:' + r.currentUser!.id,
  );
  // P11-E — file d'assistance partagée : le personnel support et un super-administrateur
  // peuvent la consulter et répondre. Tout autre rôle est refusé et audité.
  const supportGate = async (request: FastifyRequest) => {
    const role = request.currentUser?.role;
    if (role === 'support' || role === 'super_admin') return;
    await recordAuditEvent({
      actorId: request.currentUser?.id ?? null,
      action: 'rbac.denied',
      targetType: 'role',
      targetId: 'support',
      metadata: { method: request.method, path: request.url, actualRole: role ?? null }
    });
    throw new HttpError(403, 'forbidden', 'Acces refuse.');
  };
  const auth = { preHandler: [app.authenticate, rate] },
    admin = { preHandler: [app.requireSuperAdmin, rate] },
    support = { preHandler: [app.authenticate, supportGate, rate] },
    sensitive = {
      preHandler: [
        app.authenticate,
        rateLimitPreHandler(
          { name: 'privacy-reauth', limit: 10, windowSeconds: 60, failClosed: true },
          (r) => 'privacy:' + r.currentUser!.id,
        ),
      ],
    };
  app.get('/api/billing/account', auth, (r) => account(r.currentUser!.id));
  app.post('/api/billing/checkout', auth, (r) => {
    const b = z.strictObject({ productId: z.uuid(), requestKey: z.uuid() }).parse(r.body);
    return checkout(r.currentUser!.id, b.productId, b.requestKey, stripe);
  });
  app.post('/api/billing/orders/:id/cancel', auth, (r) => cancelCheckout(r.currentUser!.id, id(r.params), stripe));
  app.post('/api/billing/orders/:id/receipt', auth, (r) => paymentReceipt(r.currentUser!.id, id(r.params), stripe));
  app.get('/api/billing/tickets', auth, (r) => threads({ userId: r.currentUser!.id }, { take: THREAD_PAGE_SIZE }));
  app.post('/api/billing/tickets', auth, (r) => {
    const b = z
      .strictObject({
        subject: z.string().trim().min(2).max(120),
        message,
        // BETA01 : typage optionnel, sans collecte supplémentaire.
        kind: z.enum(['SUPPORT', 'BETA_FEEDBACK']).default('SUPPORT'),
      })
      .parse(r.body);
    if (b.kind === 'BETA_FEEDBACK' && !betaPaymentsFrozen()) return fail(400, 'beta_mode_inactive');
    return openTicket(r.currentUser!.id, b.kind, b.subject, b.message);
  });
  const update = z.strictObject({ expected: status, status, message });
  app.post('/api/billing/tickets/:id', auth, (r) => {
    const b = update.parse(r.body);
    return replyTicket(r.currentUser!.id, id(r.params), 'customer', b.status, b.expected, b.message);
  });
  const supportQuery = z.object({
    kind: z.enum(['SUPPORT', 'BETA_FEEDBACK']).optional(),
    status: status.optional(),
    q: z.string().trim().max(120).optional(),
    // P12-08 — pagination bornée par curseur stable (identifiant de dossier).
    cursor: z.uuid().optional(),
    pageSize: z.coerce.number().int().min(1).max(50).optional(),
  });
  app.get('/api/support/cases', support, async (r) => {
    const filters = supportQuery.parse(r.query);
    // BETA01 : les retours de bêta arrivent dans la même file d'assistance.
    const where: Prisma.ServiceTicketWhereInput = {
      kind: filters.kind ?? { in: ['SUPPORT', 'BETA_FEEDBACK'] },
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.q
        ? {
            OR: [
              { subject: { contains: filters.q, mode: 'insensitive' as const } },
              { user: { email: { contains: filters.q, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    };
    // P12-08 — la file ne charge plus tout l'historique : page bornée (curseur) + messages
    // récents (THREAD_ENTRY_LIMIT) + total réel par état calculé avec le MÊME filtre.
    return prisma.$transaction(async (tx) => {
      await audit(tx, r.currentUser!.id, 'support.queue_read', 'support');
      const [page, byStatus] = await Promise.all([
        threadsPage(where, { cursor: filters.cursor, pageSize: filters.pageSize }),
        tx.serviceTicket.groupBy({ by: ['status'], where, _count: { _all: true } })
      ]);
      const counts: Record<string, number> = {};
      for (const row of byStatus) counts[row.status] = row._count._all;
      return { ...page, counts, filters: { kind: filters.kind ?? null, status: filters.status ?? null, q: filters.q ?? null } };
    });
  });
  app.post('/api/support/cases/:id', support, (r) => {
    const b = update.parse(r.body);
    return replyTicket(r.currentUser!.id, id(r.params), 'support', b.status, b.expected, b.message);
  });
  app.post('/api/billing/privacy/export', sensitive, async (r) => {
    const b = z
        .strictObject({
          password,
          section: z.enum([
            'profile',
            'projects',
            'contexts',
            'calendar',
            'campaigns',
            'briefs',
            'messages',
            'assets',
            'tickets',
            'billing',
          ]),
          after: key.optional(),
        })
        .parse(r.body),
      u = r.currentUser!.id;
    await reauth(u, b.password);
    await prisma.$transaction((tx) => audit(tx, u, 'privacy.export', u, { section: b.section }));
    return exportPage(u, b.section, b.after ?? '');
  });
  app.post('/api/billing/privacy/erasure', sensitive, async (r) => {
    const b = z.strictObject({ password, confirm: z.literal('DELETE') }).parse(r.body),
      u = r.currentUser!.id;
    await reauth(u, b.password);
    return openTicket(u, 'ERASURE', 'Demande de suppression', 'Demande confirmée par le titulaire.');
  });
  app.get('/api/admin/commerce', admin, async (r) => {
    await prisma.$transaction((tx) => audit(tx, r.currentUser!.id, 'admin.overview_read', 'commerce'));
    const mode = requestedBillingMode();
    const frozen = betaPaymentsFrozen();
    const control = await prisma.billingControl.findUniqueOrThrow({ where: { id: 'commercial' } });
    return {
      mode,
      activeMode: control.mode,
      // BETA01 : état de gel lu côté serveur, jamais déduit de l'interface.
      beta: { enabled: frozen, paymentsFrozen: frozen },
      activationPhrase: mode ? activationPhrase(mode) : null,
      checkoutConfigured: !!billingConfig()?.checkoutEnabled,
      audit: await prisma.auditEvent.findMany({ where: { targetType: 'commercial', action: { in: [
        'commerce.enforcement.enabled', 'commerce.catalog.approved', 'commerce.catalog.visibility',
        'commerce.refund.reconciled', 'commerce.account.suspension', 'commerce.credit.reconciled',
        'commerce.beta.frozen'
      ] } }, orderBy: { createdAt: 'desc' }, take: 40,
        select: { id: true, action: true, targetId: true, actorId: true, createdAt: true, metadata: true } }),
      products: await prisma.billingProduct.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
      commercial: control.enabled,
      // P12-08 — la console commerce lit une page bornée, jamais toutes les files.
      cases: await threads({}, { take: 20 }),
      incidents: await prisma.billingOrder.findMany({
        where: { OR: [{ state: 'PARTIAL_REVIEW' }, { refundReview: true }] },
        take: 100,
        select: { id: true, userId: true, refunded: true, mode: true },
      }),
      holds: await prisma.billingUse.findMany({
        where: { state: 'HELD' },
        take: 100,
        orderBy: { createdAt: 'asc' },
        select: { key: true, units: true, bucket: true, createdAt: true },
      }),
    };
  });
  app.post('/api/admin/commerce/products', admin, (r) => createProduct(r.currentUser!.id, r.body));
  app.post('/api/admin/commerce/products/:id/list', admin, (r) => {
    const b = z.strictObject({ listed: z.boolean() }).parse(r.body);
    return prisma.$transaction(async (tx) => {
      const p = await tx.billingProduct.update({ where: { id: id(r.params) }, data: b });
      await audit(tx, r.currentUser!.id, 'catalog.visibility', p.id, b);
      return p;
    });
  });
  app.post('/api/admin/commerce/enable', admin, (r) => {
    const b = z.strictObject({ confirm: z.string().max(40), evidence: evidence.optional() }).parse(r.body);
    return enableCommerce(r.currentUser!.id, b.confirm, b.evidence);
  });
  app.post('/api/admin/commerce/accounts/:id', admin, (r) => {
    const b = z.strictObject({ suspended: z.boolean(), evidence }).parse(r.body),
      u = id(r.params);
    return prisma.$transaction(async (tx) => {
      await lock(tx, u);
      if (!(await tx.user.count({ where: { id: u, role: 'user' } }))) return fail(404, 'customer_not_found');
      await tx.billingAccount.upsert({
        where: { userId: u },
        create: { userId: u, suspended: b.suspended },
        update: { suspended: b.suspended },
      });
      await audit(tx, r.currentUser!.id, 'account.suspension', u, b);
      return { suspended: b.suspended };
    });
  });
  app.post('/api/admin/commerce/orders/:id/reconcile', admin, (r) =>
    reconcileRefund(r.currentUser!.id, id(r.params), z.strictObject({ evidence }).parse(r.body).evidence),
  );
  app.post('/api/admin/commerce/credits/:id/resolve', admin, (r) => {
    const b = z.strictObject({ consumed: z.boolean(), evidence }).parse(r.body),
      k = 'exec:' + id(r.params);
    return prisma.$transaction(async (tx) => {
      const o = await tx.executionOperation.findUnique({ where: { id: id(r.params) } });
      if (!o || o.state !== 'RESOLVED') return fail(409, 'cost_resolution_required');
      await lock(tx, o.accountId);
      const x = await tx.billingUse.updateMany({
        where: { key: k, state: 'HELD' },
        data: { state: b.consumed ? 'USED' : 'RELEASED', closedAt: new Date() },
      });
      if (!x.count) return fail(409, 'credit_not_held');
      await audit(tx, r.currentUser!.id, 'credit.reconciled', k, b);
      return { resolved: true };
    });
  });
  app.post('/api/admin/commerce/holds/repair', admin, (r) => {
    const b = z.strictObject({ key: z.string().max(180), evidence }).parse(r.body);
    return prisma.$transaction(async (tx) => {
      const use = await tx.billingUse.findUnique({
        where: { key: b.key },
        include: { order: { select: { userId: true } } },
      });
      if (!use || use.state !== 'HELD') return fail(409, 'credit_not_held');
      await lock(tx, use.order.userId);
      if (b.key.startsWith('creative.render:')) {
        const rid = b.key.slice('creative.render:'.length);
        const render = await tx.studioRender.findUnique({
          where: { id: rid },
          select: { createdAt: true, state: true, source: { select: { manifest: true } } },
        });
        if (!render || render.state !== 'running' || Date.now() - render.createdAt.getTime() < 86400000)
          return fail(409, 'render_not_stale');
        if (!render.source.manifest) return fail(409, 'missing_terminal_evidence');
        await tx.studioRender.update({ where: { id: rid, state: 'running' }, data: { state: 'succeeded' } });
      } else if (b.key.startsWith('production.job:')) {
        const jid = b.key.slice('production.job:'.length);
        const job = await tx.productionJob.findUnique({
          where: { id: jid },
          select: { jobRun: { select: { status: true } } },
        });
        const state = job?.jobRun?.status;
        if (!state || !['failed', 'cancelled', 'timed_out', 'succeeded'].includes(state))
          return fail(409, 'missing_terminal_evidence');
        await tx.productionJob.update({
          where: { id: jid },
          data: { status: state === 'timed_out' ? 'failed' : state },
        });
      } else return fail(409, 'use_execution_resolution');
      await audit(tx, r.currentUser!.id, 'hold.repaired', b.key, { evidence: b.evidence });
      return { resolved: true };
    });
  });
  app.post('/api/admin/commerce/erasure/:id', admin, (r) => {
    const b = z.strictObject({ evidence, confirm: z.literal('REVIEW DELETE') }).parse(r.body);
    return erase(r.currentUser!.id, id(r.params), b.evidence);
  });
  let timer: ReturnType<typeof setInterval>;
  app.addHook('onReady', async () => {
    const clean = () =>
      void prisma.serviceTicket
        .deleteMany({ where: { status: 'CLOSED', updatedAt: { lt: new Date(Date.now() - 90 * 86400000) } } })
        .catch(() => app.log.warn('ticket retention sweep failed'));
    clean();
    timer = setInterval(clean, 86400000);
    timer.unref();
  });
  app.addHook('onClose', async () => clearInterval(timer));
}
