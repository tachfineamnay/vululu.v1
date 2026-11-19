import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
test('Calendrier : aperçu approuvé et téléchargement manuel sans publication distante', async ({ page }) => {
  const r = await page.request.post('/api/auth/login', {
    data: { email: process.env.DEMO_EMAIL, password: process.env.DEMO_PASSWORD }
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
  const plannedAt = new Date(Math.floor(Date.now() / 60000) * 60000).toISOString();
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
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/calendar');
  await page.getByRole('button', { name: title, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Publication et reçus' })).toBeVisible();
  const preview = page.getByRole('img', { name: 'Aperçu Instagram, visuel 1' });
  await expect(preview).toBeVisible();
  expect(await preview.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(1080);
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Télécharger le kit manuel', exact: false }).click();
  const d = await download;
  expect(d.suggestedFilename()).toBe('Instagram-v1.zip');
  expect((await fs.readFile((await d.path())!)).subarray(0, 2).toString()).toBe('PK');
  await expect(page.getByRole('button', { name: 'Préparer la programmation' })).toHaveCount(0);
});
