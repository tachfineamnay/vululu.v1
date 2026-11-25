import { test, expect } from '@playwright/test';

/**
 * DSH-04 — 429 « creative_busy » : la limite de concurrence serveur reste à 2 rendus,
 * mais l'interface attend de façon bornée (4 reprises) au lieu d'afficher un échec.
 * Le test force deux refus consécutifs puis laisse passer la requête suivante.
 */
test('aperçu Studio : attente bornée sur 429 creative_busy, sans clic manuel', async ({ page }) => {
  test.setTimeout(180_000);
  const email = process.env.QA_USER_EMAIL ?? process.env.DEMO_EMAIL ?? '';
  const password = process.env.QA_USER_PASSWORD ?? process.env.DEMO_PASSWORD ?? '';
  expect(email.length, 'Compte QA requis').toBeGreaterThan(0);
  await page.context().addCookies([{ name: 'vululu_lang', value: 'fr', url: 'http://127.0.0.1:3190' }]);

  const login = await page.request.post('/api/auth/login', { data: { email, password } });
  expect(login.status(), await login.text()).toBe(200);
  const headers = { 'x-csrf-token': (await login.json()).csrfToken };
  const context = await page.request.post('/api/contexts', {
    headers, data: { name: 'Busy QA ' + Date.now(), description: 'Sonde 429 navigateur' }
  });
  const project = await page.request.post('/api/projects', {
    headers,
    data: { contextId: (await context.json()).context.id, title: 'Busy QA', platform: 'Instagram', format: 'Affiche', objective: 'Sonder la concurrence' }
  });
  const projectId = (await project.json()).project.id as string;
  const spec = {
    schemaVersion: 1, width: 1080, height: 1080, safeArea: 0.05,
    brand: { background: '#101820', accent: '#f5d867' },
    delivery: { kind: 'square', platform: 'Instagram' },
    scenes: [{
      key: 'SCENE-001', seconds: 1,
      layers: [{ type: 'text', role: 'headline', text: 'Sonde 429', x: 0.1, y: 0.1, w: 0.8, h: 0.2, opacity: 1, size: 48, bold: true, color: '#ffffff' }]
    }]
  };
  const created = await page.request.post('/api/projects/' + projectId + '/creative', { headers, data: { expectedVersion: 0, spec } });
  expect(created.status(), await created.text()).toBe(200);

  // Deux refus consécutifs (comme deux créneaux occupés), puis le serveur répond normalement.
  let previewCalls = 0;
  await page.route('**/api/projects/' + projectId + '/creative/preview', async (route) => {
    previewCalls += 1;
    if (previewCalls <= 2) {
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'creative_busy', message: 'Rendu en cours, réessayez.' })
      });
      return;
    }
    await route.continue();
  });

  await page.goto('/projects/' + projectId);
  await page.getByText('Composition et versions', { exact: true }).click();
  const canvas = page.getByTestId('studio-canvas-image');
  await expect(page.getByText(/nouvelle tentative automatique/).first()).toBeVisible({ timeout: 20_000 });
  await expect(canvas).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Aperçu indisponible/)).toHaveCount(0);
  expect(previewCalls).toBeGreaterThanOrEqual(3);
});
