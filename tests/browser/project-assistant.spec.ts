import { expect, test } from '@playwright/test';

test('previews and approves marketing copy and a scoped creative revision with a mocked provider', async ({ page }) => {
  const login = await page.request.post('/api/auth/login', { data: {
    email: `${process.env.F02_BROWSER_ACCOUNT}@assistant-browser.example`, password: process.env.F02_BROWSER_PASSWORD
  } });
  expect(login.ok()).toBe(true);
  const headers = { 'x-csrf-token': (await login.json()).csrfToken };
  async function post(path: string, data: unknown) {
    const response = await page.request.post(path, { data, headers });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  }
  const { context } = await post('/api/contexts', { name: 'Atelier Terre Brune', description: 'Atelier de poterie pour débutants.' });
  const { project } = await post('/api/projects', { contextId: context.id, title: 'Campagne atelier', objective: 'Présenter le tournage', platform: 'Instagram', format: 'Video' });
  await post('/api/calendar/offers', { contextId: context.id, name: 'Initiation au tournage', confirmed: true });
  const base = `/api/projects/${project.id}`;
  await post(`${base}/creative`, { expectedVersion: 0, spec: { schemaVersion: 1, width: 1080, height: 1080,
    brand: { background: '#ffffff', accent: '#225588' }, safeArea: 0.05, scenes: [{ key: 'SCENE-001', seconds: 2,
      layers: [{ type: 'text', role: 'cta', text: 'Contactez-nous', x: 0.1, y: 0.1, w: 0.8, h: 0.2, opacity: 1, size: 48, color: '#111111', bold: false }] }] } });
  await page.goto(`/projects/${project.id}`);
  await page.getByText('Assistant de campagne et composition', { exact: true }).click();
  const panel = page.locator('.project-assistant');
  await panel.getByRole('combobox', { name: 'Mode', exact: true }).selectOption('ai');
  await panel.getByLabel('Votre demande').fill('Prépare une campagne pour faire découvrir le tournage aux débutants.');
  await panel.getByRole('button', { name: 'Préparer une demande IA' }).click();
  await expect(panel.getByText('Plafond avant inférence :')).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Le geste et la matière' })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Autoriser la génération IA' }).click();
  await expect(panel.getByRole('heading', { name: 'Le geste et la matière' })).toBeVisible();
  await panel.getByText('Faits déclarés et points à vérifier', { exact: true }).click();
  await expect(panel.getByText(/Initiation au tournage/).last()).toBeVisible();
  await panel.getByRole('button', { name: 'Modifier le texte' }).click();
  await panel.getByLabel('Titre de campagne').fill('Un geste à découvrir');
  await panel.getByRole('button', { name: 'Enregistrer une nouvelle révision' }).click();
  await expect(panel.getByRole('heading', { name: 'Un geste à découvrir' })).toBeVisible();
  const approve = panel.getByRole('button', { name: 'Approuver ce brouillon' });
  await expect(approve).toBeDisabled();
  await panel.getByLabel('J’ai vérifié les faits et le texte de ce brouillon.').check();
  await approve.click();
  await expect(panel.getByText('Révision manuelle · Approuvé')).toBeVisible();
  await panel.getByRole('combobox', { name: 'Type de demande' }).selectOption('creative');
  await expect(panel.getByLabel(/Scène ciblée/)).toBeVisible();
  await panel.getByLabel('Votre demande').fill('Rends mon appel à l’action plus chaleureux.');
  await panel.getByRole('button', { name: 'Préparer une demande IA' }).click();
  await panel.getByRole('button', { name: 'Autoriser la génération IA' }).click();
  await expect(panel.getByText('cta: Parlons de votre projet')).toBeVisible();
  await panel.getByLabel('J’ai vérifié les modifications proposées.').check();
  await panel.getByRole('button', { name: 'Confirmer et appliquer' }).click();
  await expect(panel.getByText('Modification enregistrée dans une nouvelle révision de composition.')).toBeVisible();
  const revision = await page.request.get(`${base}/creative/2`);
  expect((await revision.json()).spec.scenes[0].layers[0].text).toBe('Parlons de votre projet');
  const element = panel;
  expect(await element.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
});
