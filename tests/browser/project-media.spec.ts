import { expect, test } from '@playwright/test';

test('authorizes mock image and video generations and exports a composition with the verified assets', async ({ page }) => {
  const login = await page.request.post('/api/auth/login', { data: {
    email: `${process.env.F03_BROWSER_ACCOUNT}@media-browser.example`, password: process.env.F03_BROWSER_PASSWORD
  } });
  expect(login.ok()).toBe(true);
  const headers = { 'x-csrf-token': (await login.json()).csrfToken };
  async function post(path: string, data: unknown) {
    const response = await page.request.post(path, { data, headers });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  }
  const { context } = await post('/api/contexts', { name: 'Atelier F03', description: 'Atelier de céramique.' });
  const { project } = await post('/api/projects', { contextId: context.id, title: 'Visuel atelier', objective: 'Montrer la matière', platform: 'Instagram', format: 'Video' });
  const base = `/api/projects/${project.id}/creative`;
  await post(base, { expectedVersion: 0, spec: { schemaVersion: 1, width: 1080, height: 1920,
    delivery: { kind: 'short', platform: 'Instagram' }, brand: { background: '#ffffff', accent: '#225588' }, safeArea: 0.05,
    scenes: [{ key: 'SCENE-001', seconds: 2, layers: [{ type: 'text', role: 'cta', text: 'Découvrez notre atelier', x: 0.1, y: 0.75, w: 0.8, h: 0.15, opacity: 1, size: 48, color: '#111111', bold: false }] }] } });
  await page.goto(`/projects/${project.id}`);
  await page.getByText('Composition et versions', { exact: true }).click();
  await page.getByText('Générer un média pour SCENE-001', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Description', exact: true }).fill('Lumière douce sur un bol en argile');
  await page.getByRole('checkbox', { name: /J’ai les droits nécessaires/ }).check();
  await page.getByRole('button', { name: 'Préparer sans facturer' }).click();
  await expect(page.getByText(/Disponible dans la bibliothèque/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Autoriser jusqu’à 1 centime(s) USD' }).click();
  await expect(page.getByText(/Disponible dans la bibliothèque/)).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: /Remplacer le visuel principal/ }).click();
  await expect(page.getByRole('button', { name: 'Rendre le master v2' })).toBeVisible();
  const revision = await page.request.get(`${base}/2`);
  expect(revision.ok(), await revision.text()).toBe(true);
  const output = (await revision.json()).spec.scenes[0].layers[0];
  const library = await page.request.get(`/api/contexts/${context.id}/assets`);
  expect((await library.json()).items[0].versions[0].id).toBe(output.versionId);
  await page.getByText('Générer un média pour SCENE-001', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Type', exact: true }).selectOption('video');
  await page.getByRole('textbox', { name: 'Description', exact: true }).fill('Lent mouvement autour du bol');
  await page.getByRole('combobox', { name: /Image de référence/ }).selectOption(output.versionId);
  await page.getByRole('combobox', { name: 'Format du clip' }).selectOption('720:1280');
  await page.getByRole('checkbox', { name: /J’ai les droits nécessaires/ }).check();
  await page.getByRole('button', { name: 'Préparer sans facturer' }).click();
  await page.getByRole('button', { name: 'Autoriser jusqu’à 25 centime(s) USD' }).click();
  await expect(page.getByText(/Disponible dans la bibliothèque/)).toHaveCount(2, { timeout: 25000 });
  await page.getByRole('button', { name: /Remplacer le visuel principal/ }).filter({ visible: true }).first().click();
  const render = page.getByRole('button', { name: 'Rendre le master v3' });
  await expect(render).toBeVisible();
  const placed = await page.request.get(`${base}/3`);
  expect(placed.ok(), await placed.text()).toBe(true);
  const video = (await placed.json()).spec.scenes[0].clip;
  await expect(page.getByRole('combobox', { name: 'Clip de la bibliothèque' })).toHaveValue(video.versionId);
  await render.click();
  const link = page.getByRole('link', { name: 'Exporter le master v3' });
  await expect(link).toBeVisible();
  const exportFile = await page.request.get((await link.getAttribute('href'))!);
  expect(exportFile.ok()).toBe(true);
  expect((await exportFile.body()).subarray(4, 8).toString('ascii')).toBe('ftyp');
});
