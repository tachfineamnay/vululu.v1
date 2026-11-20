import { createHmac, randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('buys an owner-approved test pass, waits for the signed confirmation, and sees premium balance', async ({ page }) => {
  const login = await page.request.post('/api/auth/login', { data: {
    email: `${process.env.F05_BROWSER_ACCOUNT}@billing-browser.example`, password: process.env.F05_BROWSER_PASSWORD
  } });
  expect(login.ok()).toBe(true);
  await page.route('https://checkout.stripe.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<h1>Checkout MOCK</h1>' }));
  await page.goto('/account');
  await expect(page.getByRole('heading', { name: /Pass média de recette/ }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Acheter en mode test' }).click();
  await expect(page.getByRole('heading', { name: 'Checkout MOCK' })).toBeVisible();
  const id = new URL(page.url()).pathname.split('cs_test_')[1];
  expect(id).toMatch(/^[\da-f-]{36}$/);
  await page.goto('/account?return=1');
  const purchase = page.locator('article').filter({ hasText: id });
  await expect(purchase.getByRole('heading', { name: 'Pass média de recette · En attente du paiement' })).toBeVisible();
  const now = Math.floor(Date.now() / 1000);
  const data = JSON.stringify({ id: 'evt_' + randomUUID(), object: 'event', type: 'payment_intent.succeeded',
    created: now, livemode: false, data: { object: { id: 'pi_' + id, status: 'succeeded', metadata: { vululuOrder: id },
      currency: 'eur', amount: 825, amount_received: 825 } } });
  const digest = createHmac('sha256', process.env.F05_BROWSER_WEBHOOK!).update(`${now}.${data}`).digest('hex');
  const receipt = await page.request.post('/api/billing/stripe-webhook', { data, headers: {
    'Content-Type': 'application/json', 'Stripe-Signature': `t=${now},v1=${digest}`
  } });
  expect(receipt.ok(), await receipt.text()).toBe(true);
  await expect(purchase.getByRole('heading', { name: 'Pass média de recette · Payé', exact: true })).toBeVisible();
  await expect(purchase.getByText('Crédits média : 3 disponibles · 0 réservés · 0 consommés')).toBeVisible();
});
