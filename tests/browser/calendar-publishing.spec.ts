import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
test('Calendar: associate a mocked channel, approve and reconcile a schedule, then download the manual TikTok kit', async ({ page }) => {
  const r = await page.request.post('/api/auth/login', {
    data: { email: `${process.env.F04_BROWSER_ACCOUNT}@publishing-browser.example`, password: process.env.F04_BROWSER_PASSWORD }
  });
  expect(r.status()).toBe(200);
  const headers = { 'x-csrf-token': (await r.json()).csrfToken };
  async function post(url: string, data: object) {
    const response = await page.request.post(url, { headers, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  }
  const title = 'Atelier ' + crypto.randomUUID().slice(0, 8),
    { context } = await post('/api/contexts', {
      name: title,
      description: 'Cours de dessin pour les débutants.'
    });
  const { project } = await post('/api/projects', {
      contextId: context.id,
      title,
      platform: 'Instagram',
      format: 'Affiche',
      objective: 'Découverte'
    }),
    offer = await post('/api/calendar/offers', { contextId: context.id, name: 'Cours', confirmed: true });
  const itemId = crypto.randomUUID();
  let version = 0;
  const plannedAt = new Date(Math.floor(Date.now() / 60000) * 60000 + 60 * 60000).toISOString();
  for (const status of ['IDEA', 'DRAFT', 'READY_FOR_REVIEW', 'APPROVED'])
    await post('/api/calendar', {
      id: itemId,
      requestId: crypto.randomUUID(),
      expectedVersion: version++,
      data: {
        title,
        plannedAt,
        timeZone: 'UTC',
        audience: 'Équipes',
        objective: 'Découverte',
        archived: false,
        projectId: project.id,
        campaignId: null,
        offerId: offer.id,
        status,
        variants: [
          { platform: 'Instagram', format: 'Affiche', caption: 'Invitation à l’atelier', cta: 'Réserver' }
        ]
      }
    });
  const base = `/api/projects/${project.id}/creative`;
  await post(base, {
    expectedVersion: 0,
    spec: {
      schemaVersion: 1,
      width: 1080,
      height: 1080,
      safeArea: 0.05,
      brand: { background: '#123456', accent: '#ffffff' },
      delivery: { kind: 'square', platform: 'Instagram', calendar: { itemId, version } },
      scenes: [
        {
          key: 'SCENE-001',
          seconds: 1,
          layers: [
            {
              type: 'text',
              role: 'headline',
              size: 60,
              text: title,
              color: '#ffffff',
              bold: true,
              x: 0.1,
              y: 0.3,
              w: 0.8,
              h: 0.3,
              opacity: 1
            }
          ]
        }
      ]
    }
  });
  const m = await post(base + '/1/render', {});
  await post(base + '/1/approve', { checksum: m.approvalSha256 });
  await page.goto('/calendar');
  await page.getByText('Comptes de publication', { exact: true }).click();
  await page.getByLabel('Clé API Postiz').fill(process.env.F04_BROWSER_ACCOUNT!);
  await page.getByRole('button', { name: 'Charger mes comptes Postiz' }).click();
  await page.getByRole('combobox', { name: 'Compte à associer ou renouveler' }).selectOption('fixture-page');
  await page.getByRole('button', { name: 'Associer ce compte' }).click();
  await expect(page.locator('li').filter({ hasText: /Facebook · Connecté à Vululu/ })).toBeVisible();
  await page.getByText('Comptes de publication', { exact: true }).click();
  await page.getByRole('button', { name: title, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Publication et reçus' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Réseau destinataire' }).selectOption('Facebook');
  await expect(page.getByRole('img', { name: 'Aperçu Facebook, visuel 1' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Compte destinataire' }).selectOption({ label: 'Atelier (MOCK)' });
  await page.getByRole('button', { name: 'Préparer la programmation' }).click();
  await expect(page.getByText(/reçu de soumission : fixture-schedule/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Autoriser la programmation v1 sur Atelier (MOCK)' }).click();
  await expect.poll(async () => {
    await page.getByRole('button', { name: 'Actualiser les reçus' }).click();
    return page.getByText(/reçu de soumission : fixture-schedule/).count();
  }, { intervals: [500, 1000] }).toBe(1);
  await page.getByRole('button', { name: 'Vérifier chez Postiz' }).click();
  await expect(page.getByText(/Publication confirmée/)).toBeVisible();
  await page.getByRole('combobox', { name: 'Réseau destinataire' }).selectOption('TikTok');
  await expect(page.getByText('Réseau ou format en publication manuelle.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Préparer la programmation' })).toHaveCount(0);
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Télécharger le kit manuel', exact: false }).click();
  const d = await download;
  expect(d.suggestedFilename()).toBe('TikTok-v1.zip');
  expect((await fs.readFile((await d.path())!)).subarray(0, 2).toString()).toBe('PK');
});
