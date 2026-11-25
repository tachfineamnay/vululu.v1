import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
test('C12 · customer ticket, restricted support reply, admin oversight', async ({ browser, baseURL }) => {
  test.skip(
    !process.env.SUPPORT_EMAIL || !process.env.ADMIN_EMAIL,
    'Dedicated support and admin test logins required',
  );
  const ticket = 'Question de recette ' + randomUUID().slice(0, 8);
  async function session(prefix: string) {
    const ctx = await browser.newContext({ baseURL });
    const p = await ctx.newPage(),
      r = await p.request.post('/api/auth/login', {
        data: { email: process.env[prefix + '_EMAIL'], password: process.env[prefix + '_PASSWORD'] },
      });
    expect(r.status()).toBe(200);
    return { ctx, p };
  }
  const u = await session('DEMO'),
    s = await session('SUPPORT'),
    a = await session('ADMIN');
  try {
    await u.p.goto('/account');
    await u.p.getByLabel('Objet', { exact: true }).fill(ticket);
    await u.p.getByLabel('Message', { exact: true }).fill('Fixture : comment lire le solde ?');
    await u.p.getByRole('button', { name: 'Ouvrir un dossier' }).click();
    await expect(u.p.locator('summary').filter({ hasText: ticket })).toContainText('En attente d’assistance');
    await s.p.goto('/support');
    await s.p.locator('summary').filter({ hasText: ticket }).click();
    const currentTicket = s.p.locator('details').filter({hasText: ticket});
    await currentTicket
      .getByLabel('Réponse', { exact: true })
      .fill('Le solde réservé est distinct du solde disponible.');
    await currentTicket.getByRole('combobox', { name: 'État' }).selectOption('IN_PROGRESS');
    await currentTicket.getByRole('button', { name: 'Enregistrer', exact: true }).click();
    await expect(s.p.locator('summary').filter({ hasText: ticket })).toContainText('En cours');
    expect((await s.p.request.get('/api/admin/commerce')).status()).toBe(403);
    await a.p.goto('/admin/commerce');
    await expect(a.p.getByRole('heading', { name: /^Commerce/ })).toBeVisible();
    await expect(a.p.locator('summary').filter({ hasText: ticket })).toContainText('En cours');
    await u.p.reload();
    await u.p.locator('summary').filter({ hasText: ticket }).click();
    await expect(u.p.locator('details').filter({hasText:ticket}).getByText('Le solde réservé est distinct du solde disponible.')).toBeVisible();
  } finally {
    await Promise.all([u.ctx.close(), s.ctx.close(), a.ctx.close()]);
  }
});
