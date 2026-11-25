import { expect, test } from '@playwright/test';
test('Studio : une proposition réglementée nécessite une relecture et reste disponible après reconnexion', async ({
  page
}) => {
  const login = async () => {
    const r = await page.request.post('/api/auth/login', {
      data: {
        email: process.env.DEMO_EMAIL,
        password: process.env.DEMO_PASSWORD
      }
    });
    expect(r.status()).toBe(200);
    return { 'x-csrf-token': (await r.json()).csrfToken };
  };
  const headers = await login();
  async function post(url: string, data: object) {
    const r = await page.request.post(url, { headers, data });
    expect(r.ok(), await r.text()).toBe(true);
    return r.json();
  }
  const { context } = await post('/api/contexts', {
      name: 'Cabinet Rivage',
      description: 'Activité de psychothérapie.'
    }),
    { project } = await post('/api/projects', {
      contextId: context.id,
      title: 'Présenter le cabinet',
      objective: 'Informer',
      platform: 'LinkedIn',
      format: 'Affiche'
    });
  await post('/api/calendar/offers', {
    contextId: context.id,
    name: 'Entretien individuel',
    confirmed: true
  });
  const assetsDecision = await page.request.post('/api/projects/' + project.id + '/assets/confirm', {
    headers,
    data: { noAssets: true }
  });
  expect(assetsDecision.status()).toBe(200);
  await page.goto('/projects/' + project.id);
  const title = page.getByText('Assistant marketing · plan de la semaine', {
    exact: true
  });
  await title.click();
  await page.getByRole('button', { name: 'Créer un brouillon local' }).click();
  const panel = page
    .locator('details')
    .filter({
      has: page.getByRole('heading', { name: 'Faits issus de vos données' })
    })
    .first();
  await expect(
    panel.getByRole('heading', { name: 'Suggestions éditoriales' })
  ).toBeVisible();
  const approve = panel.getByRole('button', {
    name: 'Approuver ce plan uniquement'
  });
  await expect(approve).toBeDisabled();
  await panel
    .getByLabel('J’ai vérifié les règles professionnelles applicables.')
    .check();
  await approve.click();
  await expect(panel.getByText(/· Approuvé$/)).toBeVisible();
  const projectUrl = page.url();
  await page.context().clearCookies();
  await login();
  await page.goto(projectUrl);
  await title.click();
  await expect(panel.getByText(/· Approuvé$/)).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await panel.evaluate((el) => el.getBoundingClientRect().right <= innerWidth)
  ).toBe(true);
});
