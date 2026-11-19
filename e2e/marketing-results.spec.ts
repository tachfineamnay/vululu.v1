import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
test('C11 · historique et semaine suivante sans publier ni dupliquer', async ({ page }) => {
  const auth = await page.request.post('/api/auth/login', {
    data: { email: process.env.DEMO_EMAIL, password: process.env.DEMO_PASSWORD },
  });
  expect(auth.status()).toBe(200);
  const headers = { 'x-csrf-token': (await auth.json()).csrfToken };
  async function post(url: string, data: object) {
    const r = await page.request.post(url, { headers, data });
    expect(r.ok(), await r.text()).toBe(true);
    return r.json();
  }
  const suffix = randomUUID().slice(0, 8);
  const ctx = (
    await post('/api/contexts', {
      name: 'Atelier ' + suffix,
      description: 'Fixture C11',
      audience: 'Amateurs',
    })
  ).context.id;
  const p = (
    await post('/api/projects', {
      contextId: ctx,
      title: 'Collection ' + suffix,
      platform: 'LinkedIn',
      format: 'Affiche',
      objective: 'Expliquer le savoir-faire',
    })
  ).project.id;
  const campaign = (await post('/api/campaigns', { name: 'Série ' + suffix })).campaign.id;
  expect(
    (
      await page.request.put('/api/projects/' + p + '/campaign', { headers, data: { campaignId: campaign } })
    ).ok(),
  ).toBe(true);
  const name = 'Initiation ' + suffix,
    o = (await post('/api/calendar/offers', { contextId: ctx, name, confirmed: true })).id;
  for (let i = 1; i <= 3; i++)
    await post('/api/calendar', {
      id: randomUUID(),
      requestId: randomUUID(),
      expectedVersion: 0,
      data: {
        title: `Sujet ${suffix} ${i}`,
        audience: 'Amateurs',
        objective: 'Présenter',
        offerId: o,
        projectId: p,
        campaignId: campaign,
        status: 'IDEA',
        archived: false,
        timeZone: 'UTC',
        plannedAt: new Date(Math.floor(Date.now() / 60000) * 60000 - (4 - i) * 86400000).toISOString(),
        variants: [{ platform: 'LinkedIn', format: 'Affiche', caption: 'Fixture éditoriale', cta: 'Lire' }],
      },
    });
  await page.goto('/results');
  await expect(page.getByRole('listitem').filter({ hasText: 'Sujet ' + suffix })).toHaveCount(3);
  await expect(
    page.getByText('Une publication confirmée n’est pas une conversion.', { exact: false }),
  ).toBeVisible();
  const card = page.getByRole('article').filter({ has: page.getByText(name, { exact: true }) });
  await expect(card).toContainText(`Sujet ${suffix} 3`);
  await card.getByRole('link', { name: 'Préparer une idée' }).click();
  await expect(page.getByRole('button', { name: new RegExp('Une question sur ' + name) })).toBeVisible();
  await page.goto('/results');
  await card.getByRole('link', { name: 'Préparer le plan dans le Studio' }).click();
  await expect(page.getByRole('combobox', { name: 'Offre confirmée', exact: true })).toHaveValue(o);
  const next = new Date();
  next.setUTCDate(next.getUTCDate() + 7 - ((next.getUTCDay() + 6) % 7));
  await expect(page.getByLabel('Semaine du lundi (UTC)')).toHaveValue(next.toISOString().slice(0, 10));
  await page.getByRole('button', { name: 'Créer un brouillon local' }).click();
  await expect(page.getByRole('heading', { name: /Plan du .*v1/ })).toBeVisible();
  await page.goto('/results');
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Plan préparé : Collection ' + suffix }),
  ).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Sujet ' + suffix })).toHaveCount(3);
});
