import { expect, test } from '@playwright/test';
for (const width of [390, 768, 1024, 1440])
  test(`public guide and invitation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/catalog');
    await expect(page.getByRole('heading', { name: 'Guide de création' })).toBeVisible();
    await page.getByLabel('Language / Langue').selectOption('en');
    await expect(page.getByRole('heading', { name: 'Creation guide' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`guide-en-${width}.png`) });
    await page.getByRole('link', { name: 'Test release terms' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.goto('/activate');
    await page.getByLabel('Invitation code').focus();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Name', { exact: true })).toBeFocused();
  });
for (const lang of ['fr', 'en'])
  test(`non-demo ${lang}: profile to approved poster`, async ({ page, context, baseURL }) => {
    const en = lang === 'en';
    await context.addCookies([{ name: 'vululu_lang', value: lang, url: baseURL! }]);
    test.skip(
      process.env.APP_ENV !== 'production' || process.env.DEMO_MODE === '1',
      'Run only against a disposable non-demo acceptance environment',
    );
    expect((await page.request.get('/api/ready')).status()).toBe(200);
    expect(
      (
        await page.request.post('/api/auth/login', {
          data: { email: process.env.DEMO_EMAIL, password: process.env.DEMO_PASSWORD },
        })
      ).status(),
    ).toBe(200);
    await page.goto('/projects/new');
    await page.getByTestId('project-title').fill('QA poster');
    await page.getByTestId('project-objective').fill('Prepare a poster');
    await page.getByTestId('project-next').click();
    await page
      .getByRole('link', {
        name: en ? 'Create a profile and return here' : 'Créer un contexte et revenir ici',
      })
      .click();
    await page.getByTestId('context-name').fill('QA profile');
    await page.getByTestId('context-description').fill('Isolated release check');
    await page.getByTestId('context-submit').click();
    await page.getByTestId('project-next').click();
    await page.getByTestId('project-format').selectOption('Affiche');
    await page.getByTestId('project-next').click();
    await page.getByTestId('project-submit').click();
    await expect(page.getByTestId('project-title-heading')).toHaveText('QA poster');
    await expect(page.getByTestId('produce')).toHaveCount(0);
    await expect(page.getByTestId('postiz-mock-banner')).toHaveCount(0);
    await page.getByRole('button', { name: en ? 'Open composition' : 'Ouvrir la composition' }).click();
    await expect(page.locator('#composition-heading')).toBeFocused();
    await page
      .getByRole('button', { name: en ? 'Save new revision' : 'Enregistrer une nouvelle révision' })
      .click();
    await page.getByRole('button', { name: en ? 'Render master v1' : 'Rendre le master v1' }).click();
    await page.getByRole('button', { name: en ? 'Approve this version' : 'Approuver cette version' }).click();
    await expect(
      page.getByRole('button', { name: en ? 'Version approved' : 'Version approuvée' }),
    ).toBeDisabled();
    const id = new URL(page.url()).pathname.split('/').pop();
    await page.goto('/creations?project=' + id);
    const exportLink = page.getByRole('link', {
      name: en ? 'Download approved version' : 'Exporter la version approuvée',
    });
    const response = await page.request.get((await exportLink.getAttribute('href'))!);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/png');
  });
