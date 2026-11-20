import { randomUUID, createHash } from 'node:crypto';
import Stripe from 'stripe';
import { z } from 'zod';
import { prisma } from '@vululu/db';
import type { Prisma, ExecutionOperation } from '@prisma/client';
import { HttpError } from '../../errors';
import { billingMessage } from './messages';
import { activationPhrase, billingConfig, requestedBillingMode } from './config';
import { betaPaymentsFrozen } from '../../betaMode';
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
  mode: true,
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
  const mode = requestedBillingMode();
  if (!mode || (mode === 'live' && !billingConfig())) return fail(503, 'stripe_unavailable');
  return prisma.$transaction(async (tx) => {
    const p = await tx.billingProduct.create({ data: { id: randomUUID(), approvedBy: actor, mode, ...b } });
    await audit(tx, actor, 'catalog.approved', p.id, { ownerApproved, mode, evidence: p.evidence });
    return p;
  });
}
export async function account(userId: string) {
  const config = billingConfig(), mode = requestedBillingMode();
  // BETA01 : en bêta gratuite, le catalogue n'est plus proposé à l'achat et
  // aucun contrôle ne demande de carte. L'historique financier reste lisible.
  const beta = betaPaymentsFrozen();
  const [control, flag, catalog, orders, totals] = await prisma.$transaction(
    [
      prisma.billingControl.findUniqueOrThrow({ where: { id: 'commercial' } }),
      prisma.billingAccount.findUnique({ where: { userId } }),
      prisma.billingProduct.findMany({
        where: { listed: true, mode: mode ?? 'disabled' },
        select: publicProduct,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.billingOrder.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          mode: true,
          state: true,
          sessionId: true,
          stripeAccount: true,
          intentId: true,
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
    mode,
    testMode: mode !== 'live',
    beta: { enabled: beta, paymentsFrozen: beta },
    checkoutAvailable:
      !beta && !!config?.checkoutEnabled && control.enabled && control.mode === config.mode,
    catalog: beta ? [] : catalog,
    orders: orders.map(({ sessionId, stripeAccount, intentId, ...o }) => {
      const status = o.refundReview
        ? 'REFUND_REVIEW'
        : o.state === 'PAID' && (!o.expiresAt || o.expiresAt <= new Date())
          ? 'EXPIRED'
          : o.state === 'PAID' && o.mode !== control.mode ? 'INACTIVE_MODE' : o.state;
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
      const connected = config?.mode === o.mode && config.stripeAccount === stripeAccount;
      return { ...o, status, canCancel: !!sessionId && connected && ['PENDING', 'FAILED'].includes(o.state),
        canReceipt: connected && !!intentId && !!o.paidAt, regular: balance('regular'), premium: balance('premium') };
    }),
  };
}
function requiredConfig() {
  return billingConfig() ?? fail(503, 'stripe_unavailable');
}
export function stripeClient(config = requiredConfig()) {
  return new Stripe(config.secretKey, { maxNetworkRetries: 1, timeout: 10000 });
}
async function checkStripeAccount(config: ReturnType<typeof requiredConfig>, client: Stripe) {
  if (!config.live) return;
  try {
    if ((await client.accounts.retrieve()).id === config.stripeAccount) return;
  } catch { /* Do not leak provider error bodies or keys. */ }
  return fail(503, 'stripe_account_mismatch');
}
export async function enableCommerce(actor: string, confirm: string, evidence?: string) {
  // BETA01 : le gel commercial est strict. Aucune action administrative ne peut
  // réactiver les ventes tant que le mode bêta est actif ; le catalogue, le
  // ledger et les droits existants restent inchangés.
  if (betaPaymentsFrozen()) return fail(409, 'beta_mode_active');
  const config = requiredConfig();
  if (confirm !== activationPhrase(config.mode) || (config.live && !evidence)) return fail(400, 'activation_confirmation_required');
  if (!config.checkoutEnabled) return fail(503, 'stripe_checkout_unavailable');
  await checkStripeAccount(config, stripeClient(config));
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "BillingControl" WHERE id='commercial' FOR UPDATE`;
    const control = await tx.billingControl.findUniqueOrThrow({ where: { id: 'commercial' } });
    if (control.mode === 'live' && !config.live) return fail(409, 'billing_mode_mismatch');
    if (!(await tx.billingProduct.count({ where: { listed: true, mode: config.mode } }))) return fail(409, 'catalog_empty');
    await tx.billingControl.update({ where: { id: 'commercial' }, data: { enabled: true, mode: config.mode } });
    await audit(tx, actor, 'enforcement.enabled', 'commercial', { mode: config.mode, evidence: evidence ?? null });
    return { enabled: true, mode: config.mode };
  });
}
export async function checkout(userId: string, productId: string, requestKey: string, mockedClient?: Stripe) {
  // BETA01 : refus explicite au niveau du service, avant toute lecture de
  // configuration Stripe et sans effet de bord. Masquer un bouton ne suffit pas.
  if (betaPaymentsFrozen()) return fail(403, 'beta_mode_active');
  const config = requiredConfig(), { origin, mode } = config;
  if (!config.checkoutEnabled || !origin) return fail(503, 'stripe_checkout_unavailable');
  const client = mockedClient ?? stripeClient(config);
  await checkStripeAccount(config, client);
  const o = await prisma.$transaction(async (tx) => {
    await lock(tx, userId);
    const control = await tx.billingControl.findUniqueOrThrow({ where: { id: 'commercial' } });
    if (!control.enabled) return fail(409, 'commercial_not_enabled');
    if (control.mode !== mode) return fail(409, 'billing_mode_mismatch');
    if ((await tx.billingAccount.findUnique({ where: { userId } }))?.suspended)
      return fail(403, 'billing_suspended');
    const p = await tx.billingProduct.findFirst({ where: { id: productId, listed: true, mode } });
    if (!p) return fail(404, 'product_not_available');
    const retry = await tx.billingOrder.findUnique({ where: { userId_requestKey: { userId, requestKey } } });
    const pending = retry
      ? null
      : await tx.billingOrder.findFirst({
          where: { userId, productId, mode, state: { in: ['PENDING', 'FAILED'] } },
          orderBy: { createdAt: 'desc' },
        });
    const row = pending
      ? { ...pending, product: p }
      : await tx.billingOrder.upsert({
          where: { userId_requestKey: { userId, requestKey } },
          create: { id: randomUUID(), userId, productId, requestKey, mode, stripeAccount: config.stripeAccount },
          update: {},
          include: { product: true },
        });
    if (row.productId !== productId || row.mode !== mode || row.stripeAccount !== config.stripeAccount || !['PENDING', 'FAILED'].includes(row.state))
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
          { idempotencyKey: `vululu-${mode}:` + o.id },
        );
  } catch {
    return fail(503, 'checkout_not_confirmed');
  }
  if (
    s.livemode !== config.live || s.status !== 'open' || s.mode !== 'payment' ||
    s.currency !== o.product.currency || s.amount_total !== o.product.amount ||
    !s.id.startsWith(`cs_${mode}_`) ||
    s.client_reference_id !== o.id ||
    !s.url ||
    !stripeCheckoutUrl(s.url)
  )
    return fail(409, 'checkout_not_open');
  const patched = await prisma.billingOrder.updateMany({ where: { id: o.id, state: { in: ['PENDING', 'FAILED'] },
    OR: [{ sessionId: null }, { sessionId: s.id }] }, data: { sessionId: s.id } });
  if (!patched.count) return fail(409, 'checkout_not_open');
  return { orderId: o.id, url: s.url };
}
function stripeCheckoutUrl(raw: string) {
  try {
    const url = new URL(raw);
    return url.origin === 'https://checkout.stripe.com' && !url.username && !url.password;
  } catch { return false; }
}
export async function cancelCheckout(userId: string, id: string, mockedClient?: Stripe) {
  const o = await prisma.billingOrder.findFirst({ where: { id, userId } });
  if (!o) return fail(404, 'order_not_found');
  if (!['PENDING', 'FAILED'].includes(o.state) || !o.sessionId) return fail(409, 'not_open');
  const config = requiredConfig();
  if (o.mode !== config.mode || o.stripeAccount !== config.stripeAccount || !o.sessionId.startsWith(`cs_${config.mode}_`))
    return fail(409, 'billing_mode_mismatch');
  const stripe = mockedClient ?? stripeClient(config);
  await prisma.$transaction((tx) => audit(tx, userId, 'checkout.expiration_requested', o.id, { mode: o.mode }));
  try {
    await stripe.checkout.sessions.expire(o.sessionId, {}, { idempotencyKey: `expire:${o.mode}:` + o.id });
  } catch { return fail(409, 'expiration_not_confirmed'); }
  return { awaitingWebhook: true };
}
export async function paymentReceipt(userId: string, id: string, mockedClient?: Stripe) {
  const o = await prisma.billingOrder.findFirst({ where: { id, userId }, include: { product: true } });
  if (!o) return fail(404, 'order_not_found');
  const config = requiredConfig();
  if (o.mode !== config.mode || o.stripeAccount !== config.stripeAccount) return fail(409, 'billing_mode_mismatch');
  if (!o.paidAt || !o.intentId) return fail(409, 'payment_receipt_unavailable');
  try {
    const intent = await (mockedClient ?? stripeClient(config)).paymentIntents.retrieve(o.intentId, { expand: ['latest_charge'] });
    const charge = intent.latest_charge;
    if (intent.id !== o.intentId || intent.status !== 'succeeded' || intent.livemode !== config.live ||
      intent.metadata.vululuOrder !== o.id || intent.currency !== o.product.currency || intent.amount_received !== o.product.amount ||
      !charge || typeof charge === 'string' || charge.payment_intent !== intent.id || charge.livemode !== config.live || !charge.receipt_url)
      return fail(409, 'payment_receipt_unavailable');
    const url = new URL(charge.receipt_url);
    if (url.origin !== 'https://pay.stripe.com' || url.username || url.password || !url.pathname.startsWith('/receipts/'))
      return fail(409, 'payment_receipt_unavailable');
    return { url: url.href };
  } catch { return fail(409, 'payment_receipt_unavailable'); }
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
  livemode: z.boolean().optional(),
});
export function verify(raw: Buffer, signature: string, mockedClient?: Stripe) {
  const config = requiredConfig(), secret = config.webhookSecret;
  const client = mockedClient ?? stripeClient(config);
  if (!secret?.startsWith('whsec_')) return fail(503, 'webhook_not_configured');
  try {
    const e = client.webhooks.constructEvent(raw, signature, secret, 300);
    const timestamp = Number(/(?:^|,)t=(\d+)/.exec(signature)?.[1]);
    if (
      !Number.isSafeInteger(timestamp) ||
      Math.abs(Date.now() / 1000 - timestamp) > 300 ||
      e.livemode !== config.live ||
      !/^evt_[A-Za-z0-9_-]{1,160}$/.test(e.id) || !Number.isSafeInteger(e.created) || e.created <= 0 ||
      e.account
    )
      throw Error();
    return e;
  } catch {
    return fail(400, 'invalid_stripe_webhook');
  }
}
// Only the signature-verified route calls this reducer. Never trust browser redirects for allocation.
export async function applyEvent(e: Stripe.Event, raw: Buffer) {
  const config = requiredConfig();
  if (e.livemode !== config.live || e.account) return fail(400, 'invalid_stripe_webhook');
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
      (['charge.refunded', 'refund.failed'].includes(e.type) && obj.payment_intent
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
    if (o.mode !== config.mode || o.product.mode !== config.mode || o.stripeAccount !== config.stripeAccount ||
      (obj.livemode !== undefined && obj.livemode !== config.live)) return fail(409, 'billing_mode_mismatch');
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
        !obj.id.startsWith(`cs_${config.mode}_`) ||
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
  const control = await tx.billingControl.findUniqueOrThrow({ where: { id: 'commercial' } });
  if (!control.enabled) return;
  if (
    !(await tx.billingUse.count({
      where: {
        key: 'exec:' + o.id,
        state: 'HELD',
        order: { userId: o.accountId, mode: control.mode, state: 'PAID', refundReview: false, expiresAt: { gt: new Date() } },
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
export async function reconcileRefund(actor: string, id: string, evidence: string, mockedClient?: Stripe) {
  const config = requiredConfig(), client = mockedClient ?? stripeClient(config);
  const o = await prisma.billingOrder.findUnique({
    where: { id },
    include: { product: true, _count: { select: { receipts: true } } },
  });
  if (!o?.intentId || !o.paidAt || (!o.refundReview && o.state !== 'PARTIAL_REVIEW'))
    return fail(409, 'order_not_in_review');
  if (o.mode !== config.mode || o.stripeAccount !== config.stripeAccount) return fail(409, 'billing_mode_mismatch');
  const started = Math.floor(Date.now() / 1000);
  let total = 0;
  try {
    const intent = await client.paymentIntents.retrieve(o.intentId);
    if (
      intent.id !== o.intentId || intent.livemode !== config.live ||
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
