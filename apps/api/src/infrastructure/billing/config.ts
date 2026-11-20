export type BillingMode = 'test' | 'live';
type Env = Readonly<Record<string, string | undefined>>;

export function requestedBillingMode(env: Env = process.env): BillingMode | null {
  const mode = env.BILLING_STRIPE_MODE || 'test';
  return mode === 'test' || mode === 'live' ? mode : null;
}

/** Validation has no network side effects. Never fall back to credentials from the other mode. */
export function billingConfig(env: Env = process.env) {
  const mode = requestedBillingMode(env);
  if (!mode) return null;
  const live = mode === 'live';
  if (live && (env.APP_ENV !== 'production' || env.V0_TEST_DB === '1' || env.DEMO_MODE !== '0')) return null;
  const secretKey = env[live ? 'STRIPE_LIVE_SECRET_KEY' : 'STRIPE_TEST_SECRET_KEY']?.trim();
  const webhookSecret = env[live ? 'STRIPE_LIVE_WEBHOOK_SECRET' : 'STRIPE_TEST_WEBHOOK_SECRET']?.trim();
  const stripeAccount = live ? env.STRIPE_LIVE_ACCOUNT_ID?.trim() : undefined;
  if (!secretKey || !new RegExp(`^sk_${mode}_[A-Za-z0-9_]+$`).test(secretKey)) return null;
  if (live && (!stripeAccount || !/^acct_[A-Za-z0-9]+$/.test(stripeAccount) || !/^whsec_[A-Za-z0-9_-]+$/.test(webhookSecret ?? ''))) return null;
  let origin: string | undefined;
  try {
    const raw = env.APP_ORIGIN?.split(',')[0].trim() ?? '';
    const url = new URL(raw);
    if (!url.username && !url.password && !url.search && !url.hash && url.pathname === '/' &&
      (url.protocol === 'https:' || (!live && url.protocol === 'http:'))) origin = url.origin;
  } catch { /* An absent or invalid return origin disables new purchases. */ }
  return {
    mode, live, stripeAccount: stripeAccount ?? null, origin, secretKey,
    webhookSecret: /^whsec_[A-Za-z0-9_-]+$/.test(webhookSecret ?? '') ? webhookSecret : undefined,
    checkoutEnabled: !!origin && !!webhookSecret && /^whsec_[A-Za-z0-9_-]+$/.test(webhookSecret) &&
      (!live || env.STRIPE_LIVE_CHECKOUT_ENABLED === '1')
  };
}
export const activationPhrase = (mode: BillingMode) => `ENABLE ${mode.toUpperCase()} ENTITLEMENTS`;
