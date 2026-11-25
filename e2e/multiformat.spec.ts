import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('Studio : préparer et exporter les pages indépendantes d’un carrousel', async ({ page }) => {
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
  for (const name of ['rocket.jpg', 'moon.png']) {
    const r = await page.request.post(`/api/contexts/${(await c.json()).context.id}/assets`, {
      headers: {
        ...headers,
        'content-type': 'application/octet-stream',
        'x-asset-metadata': encodeURIComponent(
          JSON.stringify({
            name,
            kind: 'image',
            mimeType: name.endsWith('jpg') ? 'image/jpeg' : 'image/png',
            license: 'commercial',
            provenance: 'Recette C04 scikit-image'
          })
        )
      },
      data: await fs.readFile('tests/fixtures/c04/' + name)
    });
    expect(r.status()).toBe(201);
  }
  await page.goto('/projects/' + (await p.json()).project.id);
  await page.getByText('Composition et versions', { exact: true }).click();
  const guide = page
    .locator('details')
    .filter({ has: page.locator(':scope > summary', { hasText: 'Préparer une déclinaison' }) })
    .last();
  await guide.locator('summary').click();
  await guide.getByRole('combobox', { name: 'Format', exact: true }).selectOption('carousel');
  await guide.getByLabel('rocket.jpg').check();
  await guide.getByLabel('moon.png').check();
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await guide.evaluate((el) => el.getBoundingClientRect().right <= innerWidth)).toBe(true);
  }
  await guide.getByRole('button', { name: 'Composer dans l’éditeur' }).click();
  await page.getByRole('combobox', { name: 'Timeline' }).selectOption('1');
  await page.getByRole('button', { name: 'Prévisualiser la scène' }).click();
  await expect(page.getByAltText('Aperçu du rendu de SCENE-002')).toBeVisible();
  await page.getByRole('button', { name: 'Enregistrer une nouvelle révision' }).click();
  await page.getByRole('button', { name: 'Rendre le master v1' }).click();
  await expect(page.getByAltText('Export rendu')).toBeVisible();
  await page.getByRole('combobox', { name: 'Timeline' }).selectOption('1');
  const link = page.getByRole('link', { name: 'Exporter la scène SCENE-002', exact: true });
  expect((await page.request.get((await link.getAttribute('href'))!)).headers()['content-type']).toContain(
    'image/png'
  );
});
