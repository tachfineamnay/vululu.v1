import { describe, expect, it } from 'vitest';
import { billingConfig, requestedBillingMode } from '../apps/api/src/infrastructure/billing/config';
const testKey = ['sk', 'test', 'fixture'].join('_');
const liveKey = ['sk', 'live', 'fixture'].join('_');
const signingKey = ['whsec', 'fixture'].join('_');
const live = {
  APP_ENV: 'production', DEMO_MODE: '0', BILLING_STRIPE_MODE: 'live', APP_ORIGIN: 'https://billing.example.test',
  STRIPE_LIVE_SECRET_KEY: liveKey, STRIPE_LIVE_WEBHOOK_SECRET: signingKey, STRIPE_LIVE_ACCOUNT_ID: 'acct_fixture',
  STRIPE_LIVE_CHECKOUT_ENABLED: '1'
};
describe('Stripe mode policy (pure fixtures, no environment mutation or network)', () => {
  it('defaults to test and never falls back to the other credential set', () => {
    expect(requestedBillingMode({})).toBe('test');
    expect(billingConfig({ STRIPE_TEST_SECRET_KEY: liveKey })).toBeNull();
    expect(billingConfig({ ...live, STRIPE_LIVE_SECRET_KEY: testKey })).toBeNull();
    expect(billingConfig({ ...live, BILLING_STRIPE_MODE: 'sandbox' })).toBeNull();
    expect(billingConfig({ ...live, BILLING_STRIPE_MODE: 'test' })).toBeNull();
  });
  it('refuses live from demo/test or without the verified-endpoint configuration', () => {
    for (const invalid of [
      { APP_ENV: 'test' }, { DEMO_MODE: '1' }, { V0_TEST_DB: '1' },
      { STRIPE_LIVE_ACCOUNT_ID: undefined }, { STRIPE_LIVE_WEBHOOK_SECRET: '' }
    ]) expect(billingConfig({ ...live, ...invalid })).toBeNull();
  });
  it('separates purchase readiness from webhook reconciliation', () => {
    expect(billingConfig(live)).toMatchObject({ mode: 'live', checkoutEnabled: true, stripeAccount: 'acct_fixture' });
    expect(billingConfig({ ...live, STRIPE_LIVE_CHECKOUT_ENABLED: '0' })).toMatchObject({ checkoutEnabled: false, webhookSecret: signingKey });
    for (const origin of ['http://billing.example.test', 'https://a:b@billing.example.test', 'https://billing.example.test/path']) {
      expect(billingConfig({ ...live, APP_ORIGIN: origin })?.checkoutEnabled).toBe(false);
    }
    expect(billingConfig({ STRIPE_TEST_SECRET_KEY: testKey, APP_ORIGIN: 'http://localhost:3100' })?.checkoutEnabled).toBe(false);
  });
});
