import { test, expect } from '@playwright/test';

test('admin : ajouter, remplacer et supprimer une cle IA ; demo sans acces', async ({ page }) => {
  for (const name of ['ADMIN_EMAIL', 'ADMIN_PASSWORD', 'DEMO_EMAIL', 'DEMO_PASSWORD']) expect(process.env[name]).toBeTruthy();
  async function login(email: string, password: string) {
    await page.goto('/login'); await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Mot de passe', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Entrer dans le studio' }).click(); await expect(page).toHaveURL(/\/$/);
  }
  await login(process.env.ADMIN_EMAIL!, process.env.ADMIN_PASSWORD!);
  if (process.env.E2E_EXPECT_SECURE === '1') {
    const cookies = await page.context().cookies();
    expect(cookies.find((cookie) => cookie.name === 'session')).toMatchObject({ secure: true, httpOnly: true, sameSite: 'Lax' });
  }
  const csrf = await page.evaluate(() => decodeURIComponent(document.cookie.split('; ').find((part) => part.startsWith('vululu_csrf='))?.split('=')[1] ?? ''));
  const headers = { 'x-csrf-token': csrf }; const providerKey = 'e2e-credentials-' + Date.now();
  const created = await page.request.post('/api/admin/providers', { headers, data: { key: providerKey, name: 'Fournisseur de recette' } }); expect(created.status()).toBe(201);
  await page.goto('/admin/fournisseurs');
  const form = page.getByTestId('provider-credentials-' + providerKey); const field = form.getByLabel('Clé API', { exact: true });
  await expect(field).toHaveAttribute('type', 'password'); await expect(field).toBeEnabled();
  const first = 'fixture-e2e-key-first-' + Date.now(); const second = 'fixture-e2e-key-second-' + Date.now();
  await field.fill(first); await form.getByRole('button', { name: 'Enregistrer la clé', exact: true }).click();
  await expect(form.getByTestId('credential-status')).toContainText('Clé enregistrée'); await expect(field).toHaveValue('');
  const response = await page.request.get('/api/admin/providers'); expect(await response.text()).not.toContain(first);
  expect(await page.evaluate((secret) => Object.values(localStorage).every((value) => !value.includes(secret)), first)).toBe(true);
  await page.reload(); await expect(field).toHaveValue(''); await expect(form.getByTestId('credential-status')).toContainText('Clé enregistrée');
  await field.fill(second); await form.getByRole('button', { name: 'Remplacer la clé', exact: true }).click();
  await expect(form.getByRole('button', { name: 'Confirmer le remplacement' })).toBeVisible();
  await form.getByRole('button', { name: 'Annuler', exact: true }).click(); await expect(field).toHaveValue(second);
  await form.getByRole('button', { name: 'Remplacer la clé', exact: true }).click(); await form.getByRole('button', { name: 'Confirmer le remplacement' }).click(); await expect(field).toHaveValue('');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await form.getByRole('button', { name: 'Supprimer la clé', exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  if (process.env.MVP_CAPTURE_CREDENTIALS === '1') await form.screenshot({ path: '.v1/credentials-mobile.png' });
  await form.getByRole('button', { name: 'Supprimer la clé', exact: true }).click(); await form.getByRole('button', { name: 'Annuler', exact: true }).click();
  await expect(form.getByTestId('credential-status')).toContainText('Clé enregistrée');
  await form.getByRole('button', { name: 'Supprimer la clé', exact: true }).click(); await form.getByRole('button', { name: 'Confirmer la suppression' }).click();
  await expect(form.getByTestId('credential-status')).toContainText('Aucune clé');
  // Une seconde fixture reste chiffrée pour la recette sauvegarde/restauration.
  const restoreKey = providerKey + '-restore';
  expect((await page.request.post('/api/admin/providers', { headers, data: { key: restoreKey, name: 'Fixture restauration' } })).status()).toBe(201);
  expect((await page.request.put('/api/admin/providers/' + restoreKey + '/credentials', { headers, data: { apiKey: 'fixture-only-backup-credential' } })).status()).toBe(200);
  expect((await page.request.post('/api/auth/logout', { headers })).status()).toBe(200);
  await login(process.env.DEMO_EMAIL!, process.env.DEMO_PASSWORD!);
  const demoCsrf = await page.evaluate(() => decodeURIComponent(document.cookie.split('; ').find((part) => part.startsWith('vululu_csrf='))?.split('=')[1] ?? ''));
  expect((await page.request.put('/api/admin/providers/' + providerKey + '/credentials', { headers: { 'x-csrf-token': demoCsrf }, data: { apiKey: second } })).status()).toBe(403);
  expect((await page.request.get('/api/admin/providers')).status()).toBe(403);
});
