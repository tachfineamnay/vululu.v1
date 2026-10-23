import { test, expect, Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
test.setTimeout(300000);

const demoEmail = process.env.V0_DEMO_EMAIL || 'demo@vululu.local';
const demoPassword = process.env.V0_DEMO_PASSWORD || 'vululu-demo';

async function login(page: Page) {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1200);
  await page.locator('[data-testid=login-email]').fill(demoEmail);
  await page.locator('[data-testid=login-password]').fill(demoPassword);
  await page.locator('[data-testid=login-submit]').click();
  await expect(page).toHaveURL(/\/$/);
}

async function fetchBundle(page: Page, projectId: string) {
  const bundle = await page.evaluate(async (id: string) => {
    const response = await fetch('/api/projects/' + id);
    if (!response.ok) {
      const text = await response.text();
      throw new Error('Bundle failed: ' + response.status + ' id=' + id + ' body=' + text.slice(0, 300));
    }
    return response.json();
  }, projectId);
  return bundle as any;
}

test('verticale V0 complete', async ({ page }) => {
  const stamp = Date.now().toString();
  const contextName = 'Contexte E2E ' + stamp;
  const projectTitle = 'Campagne E2E ' + stamp;

  await login(page);
  await page.locator('[data-testid=new-context]').click();
  await expect(page).toHaveURL(/\/contexts\/new$/);

  await page.locator('[data-testid=context-name]').fill(contextName);
  await page.locator('[data-testid=context-website]').fill('https://example.com');
  await page.locator('[data-testid=context-description]').fill('Contexte de test E2E pour la verticale V0.');
  await page.locator('[data-testid=context-audience]').fill('Createurs francais');
  await page.locator('[data-testid=context-tone]').fill('Premium, direct, chaleureux');
  await page.locator('[data-testid=context-submit]').click();
  await expect(page).toHaveURL(/\/$/);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(600);

  await page.locator('[data-testid=new-project]').click();
  await expect(page).toHaveURL(/\/projects\/new$/);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
  await page.locator('[data-testid=project-context]').selectOption({ label: contextName });
  await page.locator('[data-testid=project-title]').fill(projectTitle);
  await page.locator('[data-testid=project-platform]').selectOption('Instagram');
  await page.locator('[data-testid=project-format]').selectOption('Video');
  await page.locator('[data-testid=project-objective]').fill('Faire connaitre la nouvelle offre et donner envie de decouvrir la marque.');
  await page.locator('[data-testid=project-submit]').click();
  await page.waitForURL((url) => url.pathname.startsWith('/projects/') && !url.pathname.endsWith('/new'), { timeout: 30000 });

  const projectId = page.url().split('/').filter(Boolean).pop() as string;
  console.log('PROJECT_ID=' + projectId);
  await expect(page.locator('[data-testid=project-title-heading]')).toHaveText(projectTitle);

  await page.locator('[data-testid=brief-objective]').fill('Faire connaitre la nouvelle offre');
  await page.locator('[data-testid=brief-audience]').fill('Createurs francais');
  await page.locator('[data-testid=brief-tone]').fill('Premium et direct');
  await page.locator('[data-testid=brief-cta]').fill('Decouvrir la collection');
  await page.locator('[data-testid=brief-save]').click();
  await expect(page.locator('[data-testid=storyboard-generate]')).toBeEnabled();

  await page.locator('[data-testid=storyboard-generate]').click();
  await expect(page.locator('[data-testid=scene-SCENE-001]')).toBeVisible();
  await expect(page.locator('[data-testid=scene-SCENE-005]')).toBeVisible();

  await page.locator('[data-testid=produce]').click();
  await expect(page.locator('[data-testid=status-badge]')).toHaveText('Aperçu pret', { timeout: 240000 });
  await expect(page.locator('[data-testid=master-video]')).toBeVisible();

  const before = await fetchBundle(page, projectId);
  expect(before.scenes.length).toBe(5);
  expect(before.master.version).toBe(1);
  expect(before.master.qaStatus).toBe('PASS');

  const checksumsBefore: Record<string, string> = {};
  for (const scene of before.scenes) {
    checksumsBefore[scene.sceneKey] = scene.versions[0].checksum;
  }

  const videoDuration = await page.locator('[data-testid=master-video]').evaluate((element) => {
    const video = element as HTMLVideoElement;
    return video.duration;
  });
  expect(videoDuration).toBeGreaterThan(0);

  await page.locator('[data-testid=correct-input]').fill('Rends le produit plus visible et garde le personnage.');
  await page.locator('[data-testid=correct-submit]').click();
  await expect(page.locator('[data-testid=master-version]')).toHaveText('Master v2', { timeout: 240000 });
  await expect(page.locator('[data-testid=status-badge]')).toHaveText('Aperçu pret', { timeout: 240000 });

  const after = await fetchBundle(page, projectId);
  const checksumsAfter: Record<string, string> = {};
  for (const scene of after.scenes) {
    checksumsAfter[scene.sceneKey] = scene.versions[0].checksum;
  }

  expect(after.master.version).toBe(2);
  expect(after.master.qaStatus).toBe('PASS');
  expect(after.masterVersions.length).toBeGreaterThanOrEqual(2);
  expect(checksumsAfter['SCENE-003']).not.toBe(checksumsBefore['SCENE-003']);
  expect(checksumsAfter['SCENE-001']).toBe(checksumsBefore['SCENE-001']);
  expect(checksumsAfter['SCENE-002']).toBe(checksumsBefore['SCENE-002']);
  expect(checksumsAfter['SCENE-004']).toBe(checksumsBefore['SCENE-004']);
  expect(checksumsAfter['SCENE-005']).toBe(checksumsBefore['SCENE-005']);

  await page.locator('[data-testid=approve]').click();
  await expect(page.locator('[data-testid=approval-status]')).toBeVisible();
  await page.locator('[data-testid=transfer]').click();
  await expect(page.locator('[data-testid=transfer-status]')).toContainText('acknowledged', { timeout: 20000 });

  const finalBundle = await fetchBundle(page, projectId);
  expect(finalBundle.master.approval).toBeTruthy();
  expect(finalBundle.master.approval.transfer.status).toBe('acknowledged');
  expect(finalBundle.master.approval.transfer.provider).toBe('postiz-mock');
  expect(finalBundle.master.qaStatus).toBe('PASS');

  const pngChecks = finalBundle.master.qaReport.checks.filter((check: any) => check.name.startsWith('png '));
  expect(pngChecks.length).toBe(5);
  for (const check of pngChecks) {
    expect(check.status).toBe('PASS');
    expect(check.detail).toBe('1080x1920');
  }

  await page.reload();
  await expect(page.locator('[data-testid=master-video]')).toBeVisible();
  await expect(page.locator('[data-testid=transfer-status]')).toContainText('acknowledged');
});
