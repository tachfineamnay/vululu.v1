import { test, expect, Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });
test.setTimeout(300000);

const demoEmail = process.env.V0_DEMO_EMAIL || 'demo@vululu.local';
const demoPassword = process.env.V0_DEMO_PASSWORD || 'vululu-demo';
const captureStudio = process.env.CAPTURE_STUDIO === '1';

async function shot(page: Page, name: string): Promise<void> {
  if (!captureStudio) return;
  await page.screenshot({ path: 'docs/reports/studio-v1-captures/' + name + '.png', fullPage: true });
}

async function login(page: Page) {
  await page.goto('/login');
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Mot de passe')).toBeVisible();
  await page.getByLabel('Email').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Mot de passe')).toBeFocused();
  await page.waitForTimeout(500);
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

test('verticale Studio V1 complete (deterministe, correction ciblee, MOCK)', async ({ page }) => {
  const stamp = Date.now().toString();
  const contextName = 'Contexte E2E ' + stamp;
  const projectTitle = 'Campagne E2E ' + stamp;

  await login(page);

  await shot(page, '01-dashboard');
  await page.getByTestId('nav-catalog').click();
  await expect(page.getByTestId('catalog-page')).toBeVisible();
  await shot(page, '02-catalog');
  await expect(page.getByTestId('format-Video')).toContainText('DISPONIBLE');
  await expect(page.getByTestId('format-Affiche')).toContainText('NON IMPLEMENTE');
  await expect(page.getByTestId('capability-audio')).toContainText('NON CONNECTE');
  await page.getByTestId('nav-assets').click();
  await expect(page.getByTestId('assets-page')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Actifs de marque', exact: true })).toBeVisible();
  await page.getByTestId('nav-home').click();
  await expect(page.getByTestId('new-context')).toBeVisible();

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

  await page.getByTestId('nav-contexts').click();
  await expect(page.getByTestId('contexts-page')).toBeVisible();
  await expect(page.getByTestId('contexts-list')).toContainText(contextName);
  await shot(page, '03-contexts');
  await expect(page.getByTestId('context-detail')).toContainText(contextName);
  await page.getByTestId('nav-home').click();
  await expect(page.getByTestId('new-project')).toBeVisible();

  await page.locator('[data-testid=new-project]').click();
  await expect(page).toHaveURL(/\/projects\/new$/);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
  await page.locator('[data-testid=project-context]').selectOption({ label: contextName });
  await page.locator('[data-testid=project-title]').fill(projectTitle);
  await page.locator('[data-testid=project-platform]').selectOption('Instagram');
  await page.locator('[data-testid=project-format]').selectOption('Video');
  await page.locator('[data-testid=project-scene-duration]').selectOption('2');
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
  await expect(page.getByTestId('toast')).toContainText('Brief enregistre', { timeout: 15000 });
  await page.getByTestId('brief-confirm').click();
  await expect(page.getByTestId('toast')).toContainText('Version exacte du brief confirmée');
  await expect(page.locator('[data-testid=storyboard-generate]')).toBeEnabled();

  await page.locator('[data-testid=storyboard-generate]').click();
  await expect(page.locator('[data-testid=scene-SCENE-001]')).toBeVisible();
  await expect(page.locator('[data-testid=scene-SCENE-005]')).toBeVisible();
  await expect(page.locator('[data-testid=duration-summary]')).toHaveText('5 scenes / 10 s');

  await page.locator('[data-testid=produce]').click();
  await expect(page.locator('[data-testid=status-badge]')).toHaveText('Aperçu pret', { timeout: 240000 });
  await expect(page.locator('[data-testid=master-video]')).toBeVisible();
  await expect(page.getByTestId('deterministic-banner')).toContainText('aucune IA generative');
  await expect(page.getByTestId('postiz-mock-banner')).toContainText('Postiz MOCK');
  await expect(page.getByTestId('costs-mode')).toContainText('Couts MOCK');
  await expect(page.getByTestId('job-steps')).toContainText('Rendu des 5 scenes');
  await expect(page.getByTestId('job-steps')).toContainText('Assemblage du master');
  await expect(page.getByTestId('job-steps')).toContainText('Controle qualite');
  await expect(page.getByTestId('provenance')).toContainText('Deterministe');
  await shot(page, '04-studio-production');

  const before = await fetchBundle(page, projectId);
  expect(before.scenes.length).toBe(5);
  expect(before.master.version).toBe(1);
  expect(before.master.qaStatus).toBe('PASS');

  const checksumsBefore: Record<string, string> = {};
  const sceneIdsBefore: Record<string, string> = {};
  for (const scene of before.scenes) {
    checksumsBefore[scene.sceneKey] = scene.versions[0].checksum;
    sceneIdsBefore[scene.sceneKey] = scene.id;
  }
  const characterIdBefore = before.characters[0].id;
  expect(before.brief.revisions.length).toBe(1);

  // HTMLVideoElement.duration vaut NaN tant que les metadonnees ne sont pas
  // chargees (readyState < HAVE_METADATA). Attendre explicitement ce chargement
  // evite une course de test observee selon la temperature des caches navigateur.
  const masterVideo = page.locator('[data-testid=master-video]');
  await expect
    .poll(async () => masterVideo.evaluate((element) => (element as HTMLVideoElement).readyState), {
      timeout: 30000
    })
    .toBeGreaterThanOrEqual(1);
  const videoDuration = await masterVideo.evaluate((element) => {
    const video = element as HTMLVideoElement;
    return video.duration;
  });
  expect(videoDuration).toBeGreaterThanOrEqual(9);
  expect(videoDuration).toBeLessThanOrEqual(11);
  const masterUrl = await masterVideo.evaluate((element) => (element as HTMLVideoElement).currentSrc);
  const range = await page.request.get(masterUrl, { headers: { Range: 'bytes=0-31' } });
  expect(range.status()).toBe(206);
  expect(range.headers()['content-range']).toMatch(/^bytes 0-31\/\d+$/);
  expect((await range.body()).length).toBe(32);
  const byteLength = Number(range.headers()['content-range'].split('/')[1]);
  expect((await page.request.get(masterUrl, { headers: { Range: `bytes=${byteLength}-` } })).status()).toBe(416);

  await page.locator('[data-testid=approve]').click();
  await expect(page.locator('[data-testid=approval-status]')).toBeVisible();

  await page.locator('[data-testid=correct-scene]').selectOption('SCENE-002');
  await page.locator('[data-testid=correct-input]').fill('Rends le produit plus visible et garde le personnage.');
  await page.locator('[data-testid=correct-submit]').click();
  await expect(page.locator('[data-testid=master-version]')).toHaveText('Master v2', { timeout: 240000 });
  await expect(page.locator('[data-testid=status-badge]')).toHaveText('Aperçu pret', { timeout: 240000 });
  await expect(page.locator('[data-testid=scene-versions-SCENE-002]')).toContainText('v2');
  await page.locator('[data-testid=compare-version]').selectOption('1');
  await expect(page.getByTestId('master-video-compare')).toBeVisible();
  await shot(page, '05-studio-comparison');

  const after = await fetchBundle(page, projectId);
  const checksumsAfter: Record<string, string> = {};
  for (const scene of after.scenes) {
    checksumsAfter[scene.sceneKey] = scene.versions[0].checksum;
  }

  expect(after.master.version).toBe(2);
  expect(after.master.qaStatus).toBe('PASS');
  expect(after.masterVersions.length).toBeGreaterThanOrEqual(2);
  expect(checksumsAfter['SCENE-002']).not.toBe(checksumsBefore['SCENE-002']);
  expect(checksumsAfter['SCENE-001']).toBe(checksumsBefore['SCENE-001']);
  expect(checksumsAfter['SCENE-003']).toBe(checksumsBefore['SCENE-003']);
  expect(checksumsAfter['SCENE-004']).toBe(checksumsBefore['SCENE-004']);
  expect(checksumsAfter['SCENE-005']).toBe(checksumsBefore['SCENE-005']);
  for (const scene of after.scenes) {
    expect(scene.id).toBe(sceneIdsBefore[scene.sceneKey]);
  }
  expect(after.characters[0].id).toBe(characterIdBefore);

  expect(after.master.approval).toBeNull();
  const invalidatedMaster = after.masterVersions.find((version: any) => version.version === 1);
  expect(invalidatedMaster.approval).toBeTruthy();
  expect(invalidatedMaster.approval.invalidatedAt).toBeTruthy();

  const transferAttempt = await page.evaluate(async (targetId: string) => {
    const csrf = document.cookie
      .split('; ')
      .find((part) => part.startsWith('vululu_csrf='));
    const token = csrf ? decodeURIComponent(csrf.slice('vululu_csrf='.length)) : '';
    const response = await fetch('/api/projects/' + targetId + '/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': token },
      body: '{}'
    });
    return { status: response.status, body: await response.json() };
  }, projectId);
  expect(transferAttempt.status).toBe(400);
  expect(transferAttempt.body.message).toContain('approuve');

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
    expect(check.detail).toContain('1080x1920');
    expect(check.detail).toContain('checksum OK');
  }

  await page.reload();
  await expect(page.locator('[data-testid=master-video]')).toBeVisible();
  await expect(page.locator('[data-testid=transfer-status]')).toContainText('acknowledged');

  await page.getByRole('button', { name: 'Sortir' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/projects/' + projectId);
  await expect(page).toHaveURL(/\/login$/);
});
