import { expect, test, type Page } from '@playwright/test';

const adminEmail = process.env.V0_DEMO_EMAIL || 'demo@vululu.local';
const adminPassword = process.env.V0_DEMO_PASSWORD || 'vululu-demo';
const apiBase = process.env.API_BASE_URL || 'http://127.0.0.1:3101';
const stamp = Date.now();
const invitedEmail = 'invite-admin-' + stamp + '@vululu.local';
const invitedPassword = 'invite-admin-password-' + stamp;

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.locator('[data-testid=login-email]').fill(email);
  await page.locator('[data-testid=login-password]').fill(password);
  await page.locator('[data-testid=login-submit]').click();
  await expect(page).not.toHaveURL(/\/login/);
}

test.describe('Admin Vululu — super_admin, refus user et navigation', () => {
  test('le super_admin utilise toutes les sections et un user est refuse', async ({ page, browser, context }) => {
    test.setTimeout(300000);

    await login(page, adminEmail, adminPassword);
    await page.goto('/admin');

    await expect(page.getByRole('heading', { name: "Vue d'ensemble", level: 1 })).toBeVisible({ timeout: 120000 });
    await expect(page.getByTestId('admin-nav-overview')).toBeVisible();

    const sections: Array<[string, string]> = [
      ['utilisateurs', 'Utilisateurs'],
      ['agents', 'Agents'],
      ['fournisseurs', 'Fournisseurs'],
      ['jobs', 'Jobs'],
      ['audit', 'Audit'],
      ['couts', 'Couts'],
      ['reglages', 'Reglages'],
      ['overview', "Vue d'ensemble"]
    ];
    for (const [key, label] of sections) {
      await page.getByTestId('admin-nav-' + key).click();
      await expect(page.getByRole('heading', { name: label, level: 1 })).toBeVisible({ timeout: 120000 });
    }

    // Création d'une invitation depuis l'UI : le jeton n'est affiché qu'une fois.
    await page.getByTestId('admin-nav-utilisateurs').click();
    await expect(page.getByRole('heading', { name: 'Utilisateurs', level: 1 })).toBeVisible({ timeout: 120000 });
    await page.locator('#tab-invitations').click();
    await page.locator('#invitation-email').fill(invitedEmail);
    await page.getByRole('button', { name: "Creer l'invitation" }).click();
    const tokenLocator = page.getByTestId('invitation-token');
    await expect(tokenLocator).toBeVisible({ timeout: 60000 });
    const invitationToken = (await tokenLocator.textContent())?.trim() ?? '';
    expect(invitationToken.length).toBeGreaterThan(16);

    // Activation du compte invité via l'API (aucune UI d'activation en V1).
    const activation = await context.request.post(apiBase + '/api/auth/activate', {
      data: { token: invitationToken, password: invitedPassword, name: 'Invite Admin' }
    });
    expect(activation.status()).toBe(201);

    // Un compte user ne doit jamais accéder à /admin ni aux routes admin.
    const userContext = await browser.newContext({ baseURL: 'http://127.0.0.1:3100' });
    const userPage = await userContext.newPage();
    await login(userPage, invitedEmail, invitedPassword);
    await userPage.goto('/admin');
    await expect(userPage.getByRole('heading', { name: 'Accès refusé', level: 1 })).toBeVisible({ timeout: 120000 });
    const forbidden = await userContext.request.get(apiBase + '/api/admin/overview');
    expect(forbidden.status()).toBe(403);
    await userContext.close();
  });

  test('la navigation admin reste utilisable sur mobile', async ({ page }) => {
    test.setTimeout(240000);
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page, adminEmail, adminPassword);
    await page.goto('/admin');
    await expect(page.getByTestId('admin-nav-overview')).toBeVisible({ timeout: 120000 });
    await page.getByTestId('admin-nav-couts').click();
    await expect(page.getByRole('heading', { name: 'Couts', level: 1 })).toBeVisible({ timeout: 120000 });
  });
});
