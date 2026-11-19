import { expect, test } from '@playwright/test';
for (const blocked of [false, true])
  test(`Mobile Studio: ${blocked ? 'renderer unavailable' : 'A2UI ready'}, undo and redo`, async ({
    page
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const login = await page.request.post('/api/auth/login', {
      data: { email: process.env.DEMO_EMAIL, password: process.env.DEMO_PASSWORD }
    });
    expect(login.ok()).toBe(true);
    const headers = { 'x-csrf-token': (await login.json()).csrfToken };
    async function post(url: string, data: object) {
      const r = await page.request.post(url, { headers, data });
      expect(r.ok(), await r.text()).toBe(true);
      return r.json();
    }
    const { context } = await post('/api/contexts', {
        name: 'Atelier',
        description: 'Atelier de découverte.'
      }),
      { project } = await post('/api/projects', {
        contextId: context.id,
        title: 'Visiter',
        objective: 'Informer',
        platform: 'Instagram',
        format: 'Video'
      });
    const base = `/api/projects/${project.id}/creative`;
    const spec = {
      schemaVersion: 1,
      width: 480,
      height: 640,
      safeArea: 0.05,
      brand: { background: '#333333', accent: '#ffffff' },
      scenes: [1, 2, 3].map((n) => ({
        key: `SCENE-00${n}`,
        seconds: 1,
        layers: [
          {
            type: 'text',
            role: 'cta',
            text: 'Visiter',
            x: 0.1,
            y: 0.6,
            w: 0.8,
            h: 0.2,
            opacity: 1,
            bold: true,
            color: '#ffffff',
            size: 24
          }
        ]
      }))
    };
    await post(base, { expectedVersion: 0, spec });
    let rejected = 0;
    if (blocked)
      await page.route('**/_next/static/**/*.js*', async (route) => {
        const response = await route.fetch();
        if ((await response.text()).includes('https://vululu.invalid/catalog/creative-v1')) {
          rejected++;
          await route.abort();
        } else await route.fulfill({ response });
      });
    await page.goto('/projects/' + project.id);
    await page.getByText('Composition et versions', { exact: true }).click();
    await page
      .getByLabel('Demande en langage naturel')
      .fill('Change the CTA and color of scene two without modifying the other scenes.');
    await page.getByRole('button', { name: 'Prévisualiser la demande' }).click();
    await page.getByLabel('Nouveau CTA').fill('Réserver');
    await page.getByRole('button', { name: 'Comparer les modifications' }).click();
    if (blocked) {
      await expect.poll(() => rejected).toBeGreaterThan(0);
      await expect(page.getByRole('region', { name: 'Révision A2UI' })).toHaveCount(0);
    } else {
      await expect(page.getByRole('region', { name: 'Révision A2UI' })).toBeVisible();
      await page.getByLabel('Utiliser les contrôles natifs').check();
      await expect(page.getByRole('region', { name: 'Révision A2UI' })).toHaveCount(0);
    }
    await page.getByRole('button', { name: 'Approuver cette modification' }).click();
    await expect(page.getByRole('heading', { name: 'Actions ciblées · SCENE-002' })).toBeVisible();
    await page.getByRole('button', { name: 'Annuler la révision' }).click();
    await page.getByRole('button', { name: 'Rétablir la révision' }).click();
    await expect
      .poll(async () => {
        const rows = await (await page.request.get(base)).json();
        return rows[0].version;
      })
      .toBe(4);
    const rev = async (v: number) => (await (await page.request.get(base + '/' + v)).json()).spec;
    expect(await rev(3)).toEqual(await rev(1));
    expect(await rev(4)).toEqual(await rev(2));
  });
