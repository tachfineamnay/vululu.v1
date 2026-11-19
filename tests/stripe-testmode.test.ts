import { it, expect } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';
// Explicit opt-in qualification on an authorized *test* account. No mutations, charges or secrets logged.
it.skipIf(process.env.QUALIFY_STRIPE_TEST !== '1')(
  'official Stripe test API · read-only account balance',
  async () => {
    const key = process.env.STRIPE_TEST_SECRET_KEY;
    if (!key?.startsWith('sk_test_')) throw Error('An authorized Stripe test key is required');
    const Stripe = createRequire(path.resolve('apps/api/package.json'))('stripe');
    const res = await new Stripe(key, { timeout: 8000, maxNetworkRetries: 0 }).balance.retrieve();
    expect(res.livemode).toBe(false);
  },
);
