import { expect, test } from '@playwright/test';

test('Studio : composer, prévisualiser et retrouver une révision approuvée', async ({ page }) => {
  const response = await page.request.post('/api/auth/login', {
    data: { email: process.env.DEMO_EMAIL, password: process.env.DEMO_PASSWORD }
  });
  expect(response.status()).toBe(200);
  const headers = { 'x-csrf-token': (await response.json()).csrfToken };
  const c = await page.request.post('/api/contexts', {
    headers,
    data: { name: 'Atelier créatif', description: 'Démonstration locale de composition.' }
  });
  expect(c.status()).toBe(201);
  const p = await page.request.post('/api/projects', {
    headers,
    data: {
      contextId: (await c.json()).context.id,
      title: 'Test de composition',
      platform: 'Instagram',
      format: 'Video',
      objective: 'Découverte'
    }
  });
  expect(p.status()).toBe(201);
  await page.goto('/projects/' + (await p.json()).project.id);
  const panel = page
    .locator('details')
    .filter({ has: page.locator('summary', { hasText: /^Composition et versions$/ }) });
  const open = async () => {
    await page.getByText('Composition et versions', { exact: true }).click();
    await expect(panel.getByRole('combobox', { name: 'Timeline' })).toBeVisible();
  };
  await open();
  await panel.getByRole('button', { name: 'Dupliquer la scène' }).click();
  await panel.getByRole('button', { name: 'Dupliquer la scène' }).click();
  expect(await panel.getByRole('combobox', { name: 'Timeline' }).locator('option').count()).toBe(3);
  await panel.getByRole('combobox', { name: 'Timeline' }).selectOption('1');
  await panel.getByText('Calque 2 · cta').click();
  await panel.getByRole('textbox', { name: 'Texte', exact: true }).fill('Réserver en atelier');
  await panel.getByRole('button', { name: 'Prévisualiser la scène' }).click();
  await expect(panel.getByRole('img', { name: 'Aperçu du rendu de SCENE-002' })).toBeVisible();
  await panel.getByRole('button', { name: 'Enregistrer une nouvelle révision' }).click();
  await panel.getByRole('button', { name: 'Rendre le master v1' }).click();
  await expect(panel.getByRole('link', { name: 'Exporter le master v1' })).toBeVisible();
  await panel.getByRole('button', { name: 'Approuver cette version' }).click();
  await expect(panel.getByRole('button', { name: 'Version approuvée' })).toBeDisabled();
  await page.reload();
  await open();
  await expect(panel.getByRole('button', { name: 'Version approuvée' })).toBeDisabled();
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await panel.evaluate((el) => el.getBoundingClientRect().right <= innerWidth)).toBe(true);
  }
});
