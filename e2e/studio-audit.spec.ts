import { test, expect } from '@playwright/test';

test('audit : retour arrière, copie locale du Studio, conflit de révision, erreurs et chargement', async ({ page }) => {
  await page.goto('/login'); await page.getByLabel('Email', { exact: true }).fill(process.env.DEMO_EMAIL!); await page.getByLabel('Mot de passe', { exact: true }).fill(process.env.DEMO_PASSWORD!); await page.getByTestId('login-submit').click(); await expect(page).toHaveURL(/\/$/);
  const csrf = await page.evaluate(() => decodeURIComponent(document.cookie.split('; ').find((part) => part.startsWith('vululu_csrf='))?.split('=')[1] ?? ''));
  const headers = { 'x-csrf-token': csrf };
  const cr = await page.request.post('/api/contexts', { headers, data: { name: 'Audit ' + Date.now(), description: 'Univers fictif pour audit de résilience' } }); expect(cr.status()).toBe(201); const { context } = await cr.json();
  const title = 'Audit saisies ' + Date.now();
  const pr = await page.request.post('/api/projects', { headers, data: { contextId: context.id, title, objective: 'Présenter une activité', platform: 'Instagram', format: 'Video' } }); expect(pr.status()).toBe(201); const { project } = await pr.json(); const endpoint = '/api/projects/' + project.id;
  await page.reload(); await page.getByRole('link', { name: title, exact: true }).click(); await expect(page).toHaveURL(new RegExp('/projects/' + project.id));
  await expect(page.getByTestId('correct-submit')).toBeDisabled(); await expect(page.getByTestId('correct-submit')).not.toContainText('SCENE-003');
  await expect(page.getByTestId('advanced-production')).not.toHaveAttribute('open'); await expect(page.getByTestId('studio-assistance')).not.toHaveAttribute('open');
  await page.getByTestId('brief-audience').fill('Public à conserver'); await page.getByTestId('brief-tone').fill('Clair et direct'); await page.getByTestId('brief-cta').fill('Découvrir cette activité');
  await page.getByTestId('advanced-production').locator('summary').press('Enter'); await page.getByLabel('Direction artistique simulée', { exact: true }).fill('Direction à conserver');
  await page.getByTestId('studio-assistance').locator('summary').press('Enter'); await page.getByTestId('chat-input').fill('Message non envoyé'); await page.getByTestId('correct-input').fill('Correction en préparation');
  await expect(page.getByTestId('studio-draft-status')).toContainText('conservées dans cet onglet');
  await page.goBack(); await expect(page).toHaveURL(/\/$/); await page.goForward();
  await expect(page.getByTestId('brief-audience')).toHaveValue('Public à conserver'); await expect(page.getByTestId('correct-input')).toHaveValue('Correction en préparation');
  await expect(page.getByTestId('studio-draft-status')).toContainText('reprises');
  await page.getByTestId('studio-assistance').locator('summary').click(); await expect(page.getByTestId('chat-input')).toHaveValue('Message non envoyé');
  await page.getByTestId('advanced-production').locator('summary').click(); await expect(page.getByLabel('Direction artistique simulée', { exact: true })).toHaveValue('Direction à conserver');
  page.on('dialog', (dialog) => dialog.accept());
  const serverBrief = { objective: 'Nouvelle idée serveur', audience: 'Public serveur', tone: 'Sobre', cta: 'Voir le projet', platform: 'Instagram', format: 'Video' };
  expect((await page.request.patch(endpoint + '/brief', { headers, data: serverBrief })).status()).toBe(200);
  await page.reload(); await expect(page.getByTestId('brief-audience')).toHaveValue('Public serveur'); await expect(page.getByRole('main')).toContainText('brouillon local repose sur une autre version');
  await page.getByRole('button', { name: 'Reprendre ces saisies comme brouillon à relire', exact: true }).click(); await expect(page.getByTestId('brief-audience')).toHaveValue('Public à conserver');
  expect((await (await page.request.get(endpoint)).json()).brief.audience).toBe('Public serveur');
  let releaseSave!: () => void; const savingGate = new Promise<void>((resolve) => { releaseSave = resolve; });
  await page.route('**' + endpoint + '/brief', async (route) => { await savingGate; await route.fulfill({ status: 503, json: { message: 'Sauvegarde indisponible pour la recette' } }); });
  await page.getByTestId('brief-save').click();
  try { await expect(page.getByTestId('brief-audience')).toBeDisabled(); await expect(page.getByTestId('brief-save')).toBeDisabled(); await expect(page.getByTestId('correct-input')).toBeDisabled(); }
  finally { releaseSave(); }
  await expect(page.getByTestId('studio-error')).toContainText('Sauvegarde indisponible'); await expect(page.getByTestId('brief-audience')).toHaveValue('Public à conserver');
  await page.unroute('**' + endpoint + '/brief'); await page.getByTestId('brief-save').click(); await expect(page.getByTestId('project-journey').getByTestId('journey-state-brief')).toHaveText('Version 2 à confirmer');
  for (const width of [1440,1024,768,390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'débordement à ' + width).toBe(true);
    expect(await page.locator('.project-topbar').evaluate((e) => getComputedStyle(e).position)).toBe('relative');
  }
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**' + endpoint, async (route) => { await gate; await route.continue(); });
  try { await page.reload({ waitUntil: 'domcontentloaded' }); await expect(page.getByRole('status')).toContainText('Chargement du studio'); }
  finally { release(); }
  await expect(page.getByTestId('brief-audience')).toHaveValue('Public à conserver'); await page.unroute('**' + endpoint);
});
