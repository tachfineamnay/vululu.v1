import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
test('mobile creation → desktop edit → authorized job → interrupted session recovery and export', async ({
  page,
  context,
  browser
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const login = await page.request.post('/api/auth/login', {
    data: { email: process.env.DEMO_EMAIL, password: process.env.DEMO_PASSWORD }
  });
  expect(login.status()).toBe(200);
  const headers = { 'x-csrf-token': (await login.json()).csrfToken };
  const brand = await page.request.post('/api/contexts', {
    headers,
    data: { name: 'Atelier Boréal', description: 'Objets en céramique faits à la main.' }
  });
  expect(brand.ok()).toBe(true);
  const ctx = (await brand.json()).context.id;
  await page.goto('/projects/new?context=' + ctx);
  await page.getByTestId('project-title').fill('Collection Horizon');
  await page.getByTestId('project-objective').fill('Présenter la collection de céramiques.');
  await page.getByTestId('project-next').click();
  await page.getByTestId('project-context').selectOption(ctx);
  await page.getByTestId('project-next').click();
  await page.getByTestId('project-next').click();
  await page.getByTestId('project-submit').click();
  await expect(page.getByTestId('project-title-heading')).toHaveText('Collection Horizon');
  const url = page.url(),
    id = url.split('/').pop()!;
  await expect(page.getByTestId('studio-connection')).toHaveText('En direct');
  await page.getByTestId('brief-audience').fill('Amateurs de céramique');
  await page.getByTestId('brief-tone').fill('Simple et chaleureux');
  await page.getByTestId('brief-cta').fill('Découvrir la collection');
  await page.getByTestId('brief-save').click();
  await page.getByTestId('brief-confirm').click();
  await page.getByTestId('storyboard-generate').click();
  await expect(page.getByTestId('produce')).toBeEnabled();
  await page.getByRole('link', { name: 'Ressources et import' }).click();
  await page.getByText('Ajouter un fichier ou une version', { exact: true }).click();
  await page.getByLabel('Type d’actif').selectOption('image');
  await page.getByLabel('Nom de la version').fill('Horizon lunaire');
  await page.getByLabel('Fichier', { exact: true }).setInputFiles('tests/fixtures/c04/moon.png');
  await page.getByLabel('Droits déclarés').selectOption('commercial');
  await page.getByLabel('Provenance et autorisation').fill('Fixture de recette autorisée, collection C04.');
  await page.getByRole('button', { name: 'Importer et vérifier' }).click();
  await expect(page.getByText('Version 1 importée et vérifiée.')).toBeVisible();
  await page.getByRole('link', { name: 'Retour au projet' }).click();
  await page.getByText('Composition et versions', { exact: true }).click();
  await page.getByText('Préparer une déclinaison', { exact: true }).click();
  await page.getByRole('radio', { name: /Immersif/ }).check();
  await page.getByLabel('Horizon lunaire', { exact: true }).check();
  await page.getByRole('button', { name: 'Composer dans l’éditeur' }).click();
  await page.getByRole('button', { name: 'Enregistrer une nouvelle révision' }).click();
  await expect(page.getByRole('button', { name: 'Rendre le master v1' })).toBeVisible();
  const desk = await browser.newContext({
    storageState: await context.storageState(),
    viewport: { width: 1440, height: 940 },
    reducedMotion: 'reduce'
  });
  try {
    const d = await desk.newPage();
    await d.goto(url);
    await d.getByText('Composition et versions', { exact: true }).click();
    await d.getByText(/^Calque \d+ · cta$/).click();
    await d.getByRole('textbox', { name: 'Texte', exact: true }).fill('Explorer Horizon');
    await d.getByRole('button', { name: 'Enregistrer une nouvelle révision' }).click();
    await expect(page.getByText('La version v2 est disponible.', { exact: false })).toBeVisible();
    const job = d.waitForResponse((r) => r.url().endsWith('/produce') && r.request().method() === 'POST');
    await d.getByTestId('produce').click();
    expect((await job).status()).toBe(202);
    await context.setOffline(true);
    await expect(page.getByTestId('studio-connection')).toContainText('Hors ligne');
    await expect
      .poll(async () => (await (await d.request.get('/api/projects/' + id)).json()).job?.status, {
        timeout: 50000
      })
      .toBe('succeeded');
    await context.setOffline(false);
    await expect(page.getByTestId('studio-connection')).toHaveText('En direct');
    await expect(page.getByTestId('job-status')).toContainText('succeeded');
    await page.getByRole('button', { name: 'Recharger la dernière version' }).click();
    await page.getByRole('button', { name: 'Rendre le master v2' }).click();
    await page.getByRole('button', { name: 'Approuver cette version' }).click();
    await expect(page.getByRole('button', { name: 'Version approuvée' })).toBeDisabled();
    const dl = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Exporter le master v2' }).click();
    const file = await (await dl).path();
    expect((await fs.readFile(file!)).subarray(1, 4).toString()).toBe('PNG');
    for (const width of [390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.evaluate(() => window.scrollTo(0, 0));
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `overflow at ${width}`
      ).toBe(true);
      if (process.env.C10_CAPTURE) {
        await fs.mkdir(process.env.C10_CAPTURE, { recursive: true });
        await page.screenshot({ path: `${process.env.C10_CAPTURE}/studio-${width}.png` });
      }
    }
    await page.route('**/studio/stream*', (r) => r.abort());
    await page.reload();
    await expect(page.getByTestId('studio-connection')).toHaveText('Actualisation périodique');
    await expect(page.getByRole('button', { name: /Composer.*Composition v2.*approuvée/ })).toBeVisible();
    await page.request.post('/api/auth/logout', { headers });
    await expect(page).toHaveURL(/\/login/, { timeout: 15000 });
  } finally {
    await desk.close();
  }
});
