import { expect, test } from '@playwright/test';
import { createRequire } from 'node:module';
import path from 'node:path';
const { unzipSync } = createRequire(path.resolve('apps/api/package.json'))('fflate');
import { createHash } from 'node:crypto';
import { availableFormats, productionFormats } from '@vululu/contracts';

for (const format of availableFormats.Instagram) {
  const { label, studio, file } = productionFormats[format];
  test(`${label}: create, edit, render, approve and download`, async ({ page }) => {
    const login = await page.request.post('/api/auth/login', { data: {
      email: process.env.F06_BROWSER_EMAIL, password: process.env.F06_BROWSER_PASSWORD
    } });
    expect(login.ok()).toBe(true);
    await page.goto('/projects/new');
    await page.getByTestId('project-title').fill(`Lancement ${label}`);
    await page.getByTestId('project-objective').fill('Présenter la nouvelle collection');
    await page.getByTestId('project-next').click();
    await page.getByTestId('project-context').selectOption({ label: 'Atelier de test' });
    await page.getByTestId('project-next').click();
    await page.getByTestId('project-format').selectOption(format);
    if (file === 'mp4') {
      await page.getByText('Durée et réglages différables', { exact: true }).click();
      await page.getByTestId('project-scene-duration').selectOption('3');
    }
    await page.getByTestId('project-next').click();
    await page.getByTestId('project-submit').click();
    await expect(page.getByTestId('project-title-heading')).toHaveText(`Lancement ${label}`);
    await expect(page.getByTestId('produce')).toHaveCount(0);
    await page.getByRole('button', { name: 'Ouvrir la composition' }).click();
    await page.getByText('Calque 1 · headline', { exact: true }).click();
    await page.getByRole('textbox', { name: 'Texte', exact: true }).fill('Nouvelle collection');
    await page.getByRole('button', { name: 'Enregistrer une nouvelle révision' }).click();
    await page.getByRole('button', { name: 'Rendre le master v1' }).click();
    await page.getByRole('button', { name: 'Approuver cette version' }).click({ timeout: 35_000 });
    await expect(page.getByRole('button', { name: 'Version approuvée' })).toBeDisabled();
    const link = page.getByRole('link', { name: `Exporter le master v1 · ${file.toUpperCase()}` });
    const href = (await link.getAttribute('href'))!;
    const download = page.waitForEvent('download');
    await link.click();
    expect((await download).suggestedFilename()).toMatch(new RegExp(`\\.${file}$`));
    const result = await page.request.get(href);
    expect(result.ok()).toBe(true);
    const revision = await (await page.request.get(href.replace(/\/export$/, ''))).json();
    expect(revision.spec.delivery?.kind ?? null).toBe(studio);
    expect(revision.spec.scenes[0].layers[0].text).toBe('Nouvelle collection');
    const bytes = await result.body();
    if (file === 'mp4') {
      expect(bytes.subarray(4, 8).toString()).toBe('ftyp');
      expect(revision.spec.scenes.every((scene: { seconds: number }) => scene.seconds === 3)).toBe(true);
      expect(Math.abs(revision.manifest.seconds - 3 * revision.spec.scenes.length)).toBeLessThanOrEqual(2 / 30);
    }
    else if (file === 'png') expect(bytes.subarray(1, 4).toString()).toBe('PNG');
    else {
      const entries = unzipSync(bytes);
      expect(Object.keys(entries)).toEqual(['001-SCENE-001.png', '002-SCENE-002.png', 'manifest.json']);
      const index = JSON.parse(Buffer.from(entries['manifest.json']).toString());
      expect(index.revision).toBe(1);
      for (const slide of index.slides) expect(createHash('sha256').update(entries[slide.name]).digest('hex')).toBe(slide.sha256);
    }
  });
}
