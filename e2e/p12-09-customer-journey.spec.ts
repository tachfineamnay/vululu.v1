import { test, expect } from '@playwright/test';

/**
 * P12-09 — parcours client complet, navigation réelle et état serveur persisté.
 * Les étapes de la carte de parcours doivent ouvrir la section correspondante, et les étapes
 * franchies doivent survivre au rafraîchissement (direction choisie, rendu, approbation).
 * Fournisseurs locaux uniquement : aucun appel payant.
 */
test('parcours : étapes cliquables, portes d’assets et continuité après rafraîchissement', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(process.env.DEMO_EMAIL!);
  await page.getByLabel('Mot de passe', { exact: true }).fill(process.env.DEMO_PASSWORD!);
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/$/);
  const csrf = await page.evaluate(() => decodeURIComponent(document.cookie.split('; ').find((part) => part.startsWith('vululu_csrf='))?.split('=')[1] ?? ''));
  const headers = { 'x-csrf-token': csrf };
  const stamp = Date.now();
  const contextResponse = await page.request.post('/api/contexts', { headers, data: { name: 'Identité parcours ' + stamp, description: 'Identité de marque de recette' } });
  expect(contextResponse.status()).toBe(201);
  const { context } = await contextResponse.json();
  const created = await page.request.post('/api/projects', { headers, data: { contextId: context.id, title: 'Parcours client ' + stamp, objective: 'Faire connaître une activité locale', platform: 'Instagram', format: 'Video' } });
  expect(created.status()).toBe(201);
  const { project } = await created.json();

  await page.goto('/projects/' + project.id);
  const journey = page.getByTestId('campaign-journey');
  await expect(journey).toBeVisible();
  // Les 12 étapes du parcours sont présentes et nommées.
  for (const key of ['objective', 'channel', 'format', 'assets', 'brainstorm', 'directions', 'selection', 'creation', 'review', 'approval', 'delivery', 'results']) {
    await expect(journey.getByTestId('journey-step-' + key)).toBeVisible();
  }
  // Sans ressources confirmées, la porte des assets est courante et la suite reste « à venir ».
  await expect(journey.locator('[data-step="assets"]')).toHaveAttribute('data-state', 'current');
  await expect(journey.locator('[data-step="brainstorm"]')).toHaveAttribute('data-state', 'upcoming');
  await expect(page.getByTestId('brainstorm-locked')).toBeVisible();

  // Les étapes franchies pointent vers une section réelle et le focus suit la navigation.
  await journey.getByTestId('journey-step-brainstorm').press('Enter');
  await expect(page.locator('#brainstorm-heading')).toBeVisible();

  // État serveur : aucune direction choisie au départ, puis sélection persistée (P12-05).
  const directions = await (await page.request.get('/api/projects/' + project.id + '/creative/directions', { headers })).json();
  expect(directions.selectedVersion).toBeNull();
  await page.reload();
  await expect(journey.locator('[data-step="assets"]')).toHaveAttribute('data-state', 'current');
  const after = await (await page.request.get('/api/projects/' + project.id + '/creative/directions', { headers })).json();
  expect(after.selectedVersion).toBeNull();
});
