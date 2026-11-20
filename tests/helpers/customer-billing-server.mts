import bcrypt from 'bcryptjs';
const db = new URL(process.env.DATABASE_URL_TEST || '');
const id = process.env.F05_BROWSER_ACCOUNT;
const password = process.env.F05_BROWSER_PASSWORD;
const signing = process.env.F05_BROWSER_WEBHOOK;
if (process.env.APP_ENV !== 'test' || process.env.V0_TEST_DB !== '1' || !id || !password || !signing ||
  !['localhost', '127.0.0.1'].includes(db.hostname) || !db.pathname.endsWith('_browser_billing_test')) throw Error('Disposable browser billing database required');
Object.assign(process.env, {
  // This fixture reproduces a commercial instance: the beta mode is explicitly off.
  VULULU_BETA_MODE: '0',
  BILLING_STRIPE_MODE: 'test', STRIPE_TEST_SECRET_KEY: ['sk', 'test', 'browser_fixture'].join('_'), STRIPE_TEST_WEBHOOK_SECRET: signing
});
const { buildServer } = await import('../../apps/api/src/server');
const { prisma } = await import('@vululu/db');
const { stripeClient, createProduct, enableCommerce } = await import('../../apps/api/src/infrastructure/billing/service');
await prisma.user.create({ data: { id, name: 'Fixture Client', email: `${id}@billing-browser.example`, passwordHash: await bcrypt.hash(password, 4) } });
await prisma.billingProduct.updateMany({ data: { listed: false } });
const offer = await createProduct(id, { name: 'Pass média de recette', amount: 825, currency: 'eur', days: 4, regular: 0,
  premium: 3, imageUnits: 1, videoUnits: 3, features: ['media.image@1', 'media.video@1'], terms: 'prepaid-v1',
  ownerApproved: true, evidence: 'fixture non commerciale de navigateur' });
await enableCommerce(id, 'ENABLE TEST ENTITLEMENTS');
const stripe = stripeClient();
function session(orderId: string) {
  return { id: 'cs_test_' + orderId, livemode: false, status: 'open', mode: 'payment', currency: offer.currency,
    amount_total: offer.amount, client_reference_id: orderId, url: 'https://checkout.stripe.com/c/pay/cs_test_' + orderId } as never;
}
stripe.checkout.sessions.create = (async (input: { client_reference_id?: string }) => {
  if (!input.client_reference_id) throw Error('Missing fixture order');
  return session(input.client_reference_id);
}) as typeof stripe.checkout.sessions.create;
stripe.checkout.sessions.retrieve = (async (value: string) => session(value.slice('cs_test_'.length))) as typeof stripe.checkout.sessions.retrieve;
const app = await buildServer({ accountMail: null, billingStripe: stripe });
app.addHook('onClose', async () => { await prisma.$disconnect(); });
await app.listen({ host: '127.0.0.1', port: 3101 });
