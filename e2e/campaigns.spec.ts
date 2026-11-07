import { test, expect } from '@playwright/test';

test('campagne persistante : creer, rattacher, relire et retirer un projet', async ({ page }) => {
  const email = process.env.DEMO_EMAIL ?? '';
  const password = process.env.DEMO_PASSWORD ?? '';
  expect(email.length, 'DEMO_EMAIL du compte utilisateur de test est requis').toBeGreaterThan(0);
  expect(password.length, 'DEMO_PASSWORD doit etre injecte pour la recette').toBeGreaterThan(0);
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrer dans le studio' }).click();
  await expect(page).toHaveURL(/\/$/);
  const csrf = await page.evaluate(() => decodeURIComponent(document.cookie.split('; ').find((part) => part.startsWith('vululu_csrf='))?.split('=')[1] ?? ''));
  const stamp = Date.now();
  const contextResponse = await page.request.post('/api/contexts', { headers: { 'x-csrf-token': csrf }, data: { name: 'Contexte campagne ' + stamp, description: 'Contexte fictif de recette campagnes' } });
  expect(contextResponse.status()).toBe(201);
  const { context } = await contextResponse.json();
  const title = 'Creation campagne ' + stamp;
  const projectResponse = await page.request.post('/api/projects', { headers: { 'x-csrf-token': csrf }, data: { contextId: context.id, title, platform: 'Instagram', format: 'Video', objective: 'Recette fictive' } });
  expect(projectResponse.status()).toBe(201);
  const { project } = await projectResponse.json();

  await page.goto('/campaigns');
  await expect(page.getByRole('heading', { name: 'Campagnes', exact: true })).toBeVisible();
  const name = 'Collection E2E ' + stamp;
  await page.getByLabel('Nom de la campagne').fill(name);
  await page.getByLabel('Description', { exact: true }).fill('Campagne fictive de recette');
  await page.getByRole('button', { name: 'Créer la campagne', exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await page.getByLabel('Projet à rattacher').selectOption(project.id);
  await page.getByRole('button', { name: 'Rattacher le projet', exact: true }).click();
  await expect(page.getByRole('link', { name: title, exact: true })).toBeVisible();
  if (process.env.CAPTURE_STUDIO === '1') {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: '.v1/campaigns.png', fullPage: true });
  }
  await page.reload();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: title, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Retirer ' + title + ' de la campagne', exact: true }).click();
  await expect(page.getByRole('link', { name: title, exact: true })).toHaveCount(0);
  await expect(page.getByText('Aucun projet dans cette campagne.', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
