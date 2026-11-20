import { randomUUID, createHash } from 'node:crypto';
import Stripe from 'stripe';
import { z } from 'zod';
import { prisma } from '@vululu/db';
import type { Prisma, ExecutionOperation } from '@prisma/client';
import { HttpError } from '../../errors';
import { billingMessage } from './messages';
export type Tx = Prisma.TransactionClient;
export const fail = (status: number, code: string): never => {
  throw new HttpError(status, code, billingMessage(code));
};
export const features = [
  'creative.render',
  'production.job',
  'marketing.plan@1',
  'assistant.draft@1',
  'media.image@1',
  'media.video@1',
  'postiz.schedule@1',
] as const;
export const productInput = z.strictObject({
  name: z.string().trim().min(2).max(120),
  amount: z.int().min(1).max(99999999),
  currency: z.enum(['usd', 'eur', 'gbp']),
  days: z.int().min(1).max(366),
  regular: z.int().min(0).max(1000000),
  premium: z.int().min(0).max(1000000),
  imageUnits: z.int().positive().max(1000000),
  videoUnits: z.int().positive().max(1000000),
  features: z
    .array(z.enum(features))
    .min(1)
    .max(features.length)
    .refine((a) => new Set(a).size === a.length),
  terms: z.literal('prepaid-v1'),
  evidence: z.string().trim().min(4).max(160),
  ownerApproved: z.literal(true),
});
export const audit = (
  tx: Tx,
  actorId: string,
  action: string,
  targetId: string,
  metadata?: Prisma.InputJsonObject,
) =>
  tx.auditEvent.create({
    data: { actorId, action: 'commerce.' + action, targetType: 'commercial', targetId, metadata },
  });
export const lock = (tx: Tx, u: string) => tx.$executeRaw`SELECT billing_lock(${u})`;
export const publicProduct = {
  id: true,
  name: true,
  amount: true,
  currency: true,
  days: true,
  regular: true,
  premium: true,
  imageUnits: true,
  videoUnits: true,
  features: true,
  terms: true,
} as const;
export async function createProduct(actor: string, input: unknown) {
  const { ownerApproved, ...b } = productInput.parse(input);
  return prisma.$transaction(async (tx) => {
    const p = await tx.billingProduct.create({ data: { id: randomUUID(), approvedBy: actor, ...b } });
    await audit(tx, actor, 'catalog.approved', p.id, { ownerApproved, evidence: p.evidence });
    return p;
  });
}
export async function account(userId: string) {
  const [control, flag, catalog, orders, totals] = await prisma.$transaction(
    [
      prisma.billingControl.findUniqueOrThrow({ where: { id: 'commercial' } }),
      prisma.billingAccount.findUnique({ where: { userId } }),
      prisma.billingProduct.findMany({
        where: { listed: true },
        select: publicProduct,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.billingOrder.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          state: true,
          paidAt: true,
          expiresAt: true,
          refunded: true,
          refundReview: true,
          createdAt: true,
          product: { select: publicProduct },
        },
      }),
      prisma.$queryRaw<{orderId:string;bucket:string;state:string;units:number}[]>`
        SELECT b."orderId",b.bucket,b.state,sum(b.units)::int AS units
        FROM "BillingUse" b JOIN "BillingOrder" o ON o.id=b."orderId"
        WHERE o."userId"=${userId} AND b.state IN ('HELD','USED') GROUP BY b."orderId",b.bucket,b.state`,
    ],
    { isolationLevel: 'RepeatableRead' },
  );
  const counts = new Map(totals.map((r) => [r.orderId + ':' + r.bucket + ':' + r.state, r.units]));
  return {
    commercial: control.enabled,
    suspended: !!flag?.suspended,
    testMode: true,
    catalog,
    orders: orders.map((o) => {
      const status = o.refundReview
        ? 'REFUND_REVIEW'
        : o.state === 'PAID' && (!o.expiresAt || o.expiresAt <= new Date())
          ? 'EXPIRED'
          : o.state;
      const balance = (bucket: 'regular' | 'premium') => {
        const sum = (s: string) => counts.get(o.id + ':' + bucket + ':' + s) ?? 0,
          used = sum('USED'),
          held = sum('HELD');
        return {
          used,
          held,
          available: status === 'PAID' && !flag?.suspended ? Math.max(0, o.product[bucket] - used - held) : 0,
        };
      };
      return { ...o, status, regular: balance('regular'), premium: balance('premium') };
    }),
  };
}
export function stripeClient() {
  const key = process.env.STRIPE_TEST_SECRET_KEY;
  if (!key?.startsWith('sk_test_')) return fail(503, 'stripe_test_unavailable');
  return new Stripe(key, { maxNetworkRetries: 1, timeout: 10000 });
}
export async function checkout(
  userId: string,
  productId: string,
  requestKey: string,
  client = stripeClient(),
) {
  const origin = process.env.APP_ORIGIN?.split(',')[0];
  if (!origin) return fail(503, 'billing_origin_missing');
  const o = await prisma.$transaction(async (tx) => {
    await lock(tx, userId);
    if (!(await tx.billingControl.findUniqueOrThrow({ where: { id: 'commercial' } })).enabled)
      return fail(409, 'commercial_not_enabled');
    if ((await tx.billingAccount.findUnique({ where: { userId } }))?.suspended)
      return fail(403, 'billing_suspended');
    const p = await tx.billingProduct.findFirst({ where: { id: productId, listed: true } });
    if (!p) return fail(404, 'product_not_available');
    const retry = await tx.billingOrder.findUnique({ where: { userId_requestKey: { userId, requestKey } } });
    const pending = retry
      ? null
      : await tx.billingOrder.findFirst({
          where: { userId, productId, state: { in: ['PENDING', 'FAILED'] } },
          orderBy: { createdAt: 'desc' },
        });
    const row = pending
      ? { ...pending, product: p }
      : await tx.billingOrder.upsert({
          where: { userId_requestKey: { userId, requestKey } },
          create: { id: randomUUID(), userId, productId, requestKey },
          update: {},
          include: { product: true },
        });
    if (row.productId !== productId || !['PENDING', 'FAILED'].includes(row.state))
      return fail(409, 'checkout_conflict');
    return row;
  });
  // Do not recreate an ambiguous checkout after Stripe's idempotency retention window.
  if (!o.sessionId && Date.now() - o.createdAt.getTime() > 23 * 3600000)
    return fail(409, 'checkout_needs_review');
  let s: Stripe.Checkout.Session;
  try {
    s = o.sessionId
      ? await client.checkout.sessions.retrieve(o.sessionId)
      : await client.checkout.sessions.create(
          {
            mode: 'payment',
            payment_method_types: ['card'],
            client_reference_id: o.id,
            metadata: { vululuOrder: o.id },
            payment_intent_data: { metadata: { vululuOrder: o.id } },
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency: o.product.currency,
                  unit_amount: o.product.amount,
                  product_data: { name: o.product.name },
                },
              },
            ],
            success_url: origin + '/account?return=1',
            cancel_url: origin + '/account?return=1',
          },
          { idempotencyKey: 'vululu-test:' + o.id },
        );
  } catch {
    return fail(503, 'checkout_not_confirmed');
  }
  if (
    s.livemode ||
    !s.id.startsWith('cs_test_') ||
    s.client_reference_id !== o.id ||
    !s.url ||
    new URL(s.url).origin !== 'https://checkout.stripe.com'
  )
    return fail(409, 'checkout_not_open');
  await prisma.billingOrder.update({ where: { id: o.id }, data: { sessionId: s.id } });
  return { orderId: o.id, url: s.url };
}
const object = z.object({
  id: z.string(),
  metadata: z.record(z.string(), z.string()).nullish(),
  currency: z.string().nullish(),
  amount: z.int().optional(),
  amount_received: z.int().optional(),
  amount_refunded: z.int().optional(),
  payment_intent: z.string().nullish(),
  status: z.string().nullish(),
  client_reference_id: z.string().nullish(),
});
export function verify(raw: Buffer, signature: string, client = stripeClient()) {
  const secret = process.env.STRIPE_TEST_WEBHOOK_SECRET;
  if (!secret?.startsWith('whsec_')) return fail(503, 'webhook_not_configured');
  try {
    const e = client.webhooks.constructEvent(raw, signature, secret, 300);
    const timestamp = Number(/(?:^|,)t=(\d+)/.exec(signature)?.[1]);
    if (
      !Number.isSafeInteger(timestamp) ||
      Math.abs(Date.now() / 1000 - timestamp) > 300 ||
      e.livemode !== false ||
      e.account
    )
      throw Error();
    return e;
  } catch {
    return fail(400, 'invalid_test_webhook');
  }
}
// Only the signature-verified route calls this reducer. Never trust browser redirects for allocation.
export async function applyEvent(e: Stripe.Event, raw: Buffer) {
  if (e.livemode !== false) return fail(400, 'live_event_refused');
  if (
    ![
      'payment_intent.succeeded',
      'payment_intent.payment_failed',
      'payment_intent.canceled',
      'checkout.session.expired',
      'charge.refunded',
      'refund.failed',
    ].includes(e.type)
  )
    return { ignored: true };
  const obj = object.parse(e.data.object),
    refundFailed = e.type === 'refund.failed',
    id =
      obj.metadata?.vululuOrder ??
      (refundFailed && obj.payment_intent
        ? (
            await prisma.billingOrder.findUnique({
              where: { intentId: obj.payment_intent },
              select: { id: true },
            })
          )?.id
        : undefined);
  if (!id) {
    if (refundFailed) return fail(409, 'unmatched_refund');
    return { ignored: true };
  }
  const digest = createHash('sha256').update(raw).digest('hex');
  return prisma.$transaction(async (tx) => {
    const hint = await tx.billingOrder.findUnique({ where: { id }, select: { userId: true } });
    if (!hint) return fail(409, 'unknown_order');
    await lock(tx, hint.userId);
    const o = await tx.billingOrder.findUniqueOrThrow({ where: { id }, include: { product: true } });
    const prior = await tx.billingReceipt.findUnique({ where: { id: e.id } });
    if (prior) {
      if (prior.digest !== digest || prior.orderId !== id) return fail(409, 'receipt_conflict');
      return { replay: true };
    }
    const expired = e.type === 'checkout.session.expired',
      refund = e.type === 'charge.refunded';
    const intent = expired ? null : refund || refundFailed ? obj.payment_intent : obj.id;
    if (expired) {
      if (
        !obj.id.startsWith('cs_test_') ||
        (o.sessionId && obj.id !== o.sessionId) ||
        obj.client_reference_id !== id
      )
        return fail(409, 'session_mismatch');
    } else if (
      !intent?.startsWith('pi_') ||
      (o.intentId && intent !== o.intentId) ||
      obj.currency !== o.product.currency ||
      (!refundFailed && obj.amount !== o.product.amount)
    )
      return fail(409, 'payment_mismatch');
    let review = o.refundReview,
      state = o.state,
      refunded = o.refunded,
      paidAt = o.paidAt,
      expiresAt = o.expiresAt;
    if (e.type === 'payment_intent.succeeded') {
      if (obj.amount_received !== o.product.amount || obj.status !== 'succeeded')
        return fail(409, 'unsettled_payment');
      if (!paidAt) {
        paidAt = new Date(e.created * 1000);
        expiresAt = new Date(+paidAt + 86400000 * o.product.days);
      }
      if (!refunded) state = 'PAID';
    } else if (refundFailed) {
      if (e.created >= o.reviewThrough) review = true;
    } else if (refund) {
      if (!obj.amount_refunded || obj.amount_refunded > o.product.amount) return fail(409, 'refund_mismatch');
      if (e.created >= o.reviewThrough) {
        refunded = Math.max(refunded, obj.amount_refunded);
        state = refunded === o.product.amount ? 'REFUNDED' : 'PARTIAL_REVIEW';
      }
    } else if (!paidAt && !refunded) {
      if (expired || e.type === 'payment_intent.canceled') state = 'CANCELLED';
      else if (state !== 'CANCELLED') state = 'FAILED';
    }
    await tx.billingOrder.update({
      where: { id },
      data: {
        state,
        refundReview: review,
        refunded,
        paidAt,
        expiresAt,
        intentId: intent ?? o.intentId,
        ...(expired ? { sessionId: obj.id } : {}),
      },
    });
    await tx.billingReceipt.create({ data: { id: e.id, orderId: id, kind: e.type, digest } });
    return { accepted: true };
  });
}
export async function holdTool(tx: Tx, o: ExecutionOperation) {
  if (['postiz.cancel@1', 'studio.inspect@1'].includes(o.tool)) return;
  const f = o.tool === 'studio.render@1' ? 'creative.render' : o.tool,
    b = o.tool.startsWith('media.') ? 'premium' : o.tool.startsWith('postiz.') ? 'feature' : 'regular';
  if (
    o.tool === 'studio.render@1' &&
    (await tx.billingControl.findUniqueOrThrow({ where: { id: 'commercial' } })).enabled
  ) {
    const r = await tx.creativeRevision.findUnique({
      where: { projectId_version: { projectId: o.projectId, version: o.revision } },
      select: { manifest: true },
    });
    if (r?.manifest) return fail(409, 'master_already_rendered');
  }
  await tx.$executeRaw`SELECT billing_hold(${o.accountId},${'exec:' + o.id},${f},${b},${o.tool === 'studio.render@1' ? o.projectId + ':' + o.revision : null})`;
}
export async function checkClaim(tx: Tx, o: ExecutionOperation) {
  if (['postiz.cancel@1', 'studio.inspect@1'].includes(o.tool)) return;
  await lock(tx, o.accountId);
  if ((await tx.billingAccount.findUnique({ where: { userId: o.accountId } }))?.suspended)
    return fail(403, 'billing_suspended');
  if (!(await tx.billingControl.findUniqueOrThrow({ where: { id: 'commercial' } })).enabled) return;
  if (
    !(await tx.billingUse.count({
      where: {
        key: 'exec:' + o.id,
        state: 'HELD',
        order: { userId: o.accountId, state: 'PAID', refundReview: false, expiresAt: { gt: new Date() } },
      },
    }))
  )
    return fail(403, 'entitlement_inactive');
}
export async function finishTool(tx: Tx, o: ExecutionOperation, outcome: 'cancel' | 'success' | 'manual') {
  if (outcome === 'manual') return;
  let used = outcome === 'success';
  if (used && o.tool.startsWith('media.'))
    used = !!(await tx.mediaGeneration.count({ where: { id: o.key, state: 'READY' } }));
  if (used && o.tool === 'marketing.plan@1')
    used = !!(await tx.marketingRevision.count({ where: { operationId: o.id, origin: 'provider' } }));
  if (used && o.tool === 'assistant.draft@1')
    used = !!(await tx.assistantTurn.count({ where: { operationId: o.id, origin: 'ai' } }));
  await tx.$executeRaw`SELECT billing_finish(${'exec:' + o.id},${used})`;
}
// A failed refund can contradict a previous cumulative charge notification. Never regrant on
// that notification alone. An admin can re-read the provider, but cannot enter a chosen balance.
export async function reconcileRefund(actor: string, id: string, evidence: string, client = stripeClient()) {
  const o = await prisma.billingOrder.findUnique({
    where: { id },
    include: { product: true, _count: { select: { receipts: true } } },
  });
  if (!o?.intentId || !o.paidAt || (!o.refundReview && o.state !== 'PARTIAL_REVIEW'))
    return fail(409, 'order_not_in_review');
  const started = Math.floor(Date.now() / 1000);
  let total = 0;
  try {
    const intent = await client.paymentIntents.retrieve(o.intentId);
    if (
      intent.livemode ||
      intent.status !== 'succeeded' ||
      intent.metadata.vululuOrder !== id ||
      intent.currency !== o.product.currency ||
      intent.amount_received !== o.product.amount
    )
      return fail(409, 'provider_review_required');
    const rows = await client.refunds.list({ payment_intent: o.intentId, limit: 100 });
    if (rows.has_more) return fail(409, 'provider_review_required');
    for (const row of rows.data) {
      if (
        row.payment_intent !== intent.id ||
        row.currency !== intent.currency ||
        !['succeeded', 'failed', 'canceled'].includes(row.status ?? '')
      )
        return fail(409, 'provider_review_required');
      if (row.status === 'succeeded') total += row.amount;
    }
  } catch {
    return fail(409, 'provider_review_required');
  }
  if (!Number.isSafeInteger(total) || total < 0 || total > o.product.amount)
    return fail(409, 'provider_review_required');
  return prisma.$transaction(async (tx) => {
    await lock(tx, o.userId);
    if ((await tx.billingReceipt.count({ where: { orderId: id } })) !== o._count.receipts)
      return fail(409, 'retry_reconciliation');
    const state = total === 0 ? 'PAID' : total === o.product.amount ? 'REFUNDED' : 'PARTIAL_REVIEW';
    await tx.billingOrder.update({
      where: { id },
      data: { state, refundReview: false, refunded: total, reviewThrough: started },
    });
    await audit(tx, actor, 'refund.reconciled', id, { evidence, refunded: total });
    return { state, refunded: total };
  });
}
