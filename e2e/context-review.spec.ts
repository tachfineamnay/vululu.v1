import { test, expect } from '@playwright/test';

test('contexte : proposition MOCK relue, validation humaine et revisions persistantes', async ({ page }) => {
  page.setDefaultTimeout(30000);
  const email = process.env.DEMO_EMAIL ?? ''; const password = process.env.DEMO_PASSWORD ?? '';
  expect(email.length, 'Compte de recette ordinaire requis').toBeGreaterThan(0);
  await page.goto('/login'); await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrer dans le studio' }).click(); await expect(page).toHaveURL(/\/$/);
  const csrf = await page.evaluate(() => decodeURIComponent(document.cookie.split('; ').find((c) => c.startsWith('vululu_csrf='))?.split('=')[1] ?? ''));
  const response = await page.request.post('/api/contexts', { headers: { 'x-csrf-token': csrf }, data: { name: 'Contexte relu ' + Date.now(), description: 'Marque fictive de céramique, information saisie.', website: 'http://127.0.0.1:9/aucun-fetch' } });
  expect(response.status()).toBe(201); const { context } = await response.json();
  await page.goto('/contexts'); await page.getByTestId('context-card-' + context.id).click();
  const save = page.getByRole('button', { name: 'Confirmer et enregistrer la fiche', exact: true });
  await expect(save).toBeDisabled();
  await page.getByRole('button', { name: 'Préparer une proposition démo', exact: true }).click();
  const proposal = page.getByRole('region', { name: 'Proposition simulée' });
  await expect(proposal).toContainText('MOCK'); await expect(proposal).toContainText('Aucune URL consultée');
  await expect(proposal).toContainText('Exemple générique de démo');
  await page.getByRole('button', { name: 'Reprendre les hypothèses dans le brouillon' }).click();
  await expect(page.getByLabel('Audience du contexte', { exact: true })).toHaveValue(/Public intéressé/);
  await expect(save).toBeDisabled();
  await page.getByLabel('Audience du contexte', { exact: true }).fill('Collectionneurs, audience relue manuellement');
  const color = page.getByLabel('Couleur principale');
  expect((await color.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  if (process.env.CAPTURE_STUDIO === '1') {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: '.v1/context-review.png', fullPage: true });
    await color.screenshot({ path: '.v1/context-color.png' });
  }
  await page.getByRole('checkbox', { name: 'J’ai relu les informations et les hypothèses ; je confirme cette fiche.' }).check();
  await save.click(); await expect(page.getByRole('status')).toContainText('révision 2');
  await page.reload();
  await expect(page.getByLabel('Audience du contexte', { exact: true })).toHaveValue('Collectionneurs, audience relue manuellement');
  const history = page.getByRole('region', { name: 'Historique du contexte' });
  await expect(history.locator('details')).toHaveCount(2);
  await history.locator('details').last().locator('summary').click();
  await expect(history.locator('details').last()).toContainText('Non renseigné');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
