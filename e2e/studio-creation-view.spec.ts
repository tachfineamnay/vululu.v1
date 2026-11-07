import { expect, test, type Locator } from '@playwright/test';

async function textContrast(locator: Locator): Promise<number> {
  return locator.evaluate((element) => {
    const luminance = (color: string) => {
      const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
      if (!channels || channels.length !== 3) throw new Error('Couleur non reconnue : ' + color);
      const linear = channels.map((value) => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    };
    const style = getComputedStyle(element);
    const foreground = luminance(style.color);
    const background = luminance(style.backgroundColor);
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  });
}

test('les statuts du catalogue restent lisibles sur fond clair', async ({ page }) => {
  await page.goto('/catalog');
  for (const status of ['review', 'approved', 'draft', 'failed']) {
    const badge = page.locator('.badge.status-' + status).first();
    await expect(badge).toBeVisible();
    expect(await textContrast(badge), `Contraste du statut ${status}`).toBeGreaterThanOrEqual(4.5);
  }
});

test('la scène choisie pilote son image et les commandes, et la finalisation reste séparée', async ({ page }) => {
  test.setTimeout(60000);
  const settings = { schemaVersion: 1, profileVersion: 'v1-demo-2026-11-04', ratio: '9:16', defaultSceneDurationSeconds: 5, visualStyle: 'editorial', direction: '', maxMockCents: 1000, audio: { voiceVersionId: null, musicVersionId: null, spokenText: '', voiceGainDb: -3, musicGainDb: -18, ducking: true } };
  const project = { id: 'projet-test', title: 'Projet de recette', status: 'review', platform: 'Instagram', format: 'Video', objective: 'Présenter une activité', sceneDurationSeconds: 5, contextId: 'contexte-test', storyboardBriefVersion: 1 };
  const context = { id: 'contexte-test', name: 'Contexte de recette', description: 'Données de test', audience: null, tone: null, website: null, colorPrimary: '#2347BE', colorSecondary: '#F5D867' };
  const brief = { id: 'brief-test', objective: project.objective, audience: 'Public', tone: 'Clair', cta: 'Découvrir', platform: project.platform, format: project.format, version: 1, revisions: [{ id: 'revision-test', version: 1, checksum: 'brief-checksum', createdAt: '2026-11-06T00:00:00Z' }], confirmedVersion: 1, confirmedChecksum: 'brief-checksum', settings };
  const scenes = [
    { id: 'scene-1', sceneKey: 'SCENE-001', position: 1, title: 'Première scène', description: 'Présentation', durationSeconds: 4, usesBriefDuration: false, characterKey: null, versions: [{ id: 'image-1', version: 1, imagePath: 'image-1', checksum: 'image-1', createdAt: '2026-11-06T00:00:00Z' }] },
    { id: 'scene-2', sceneKey: 'SCENE-002', position: 2, title: 'Deuxième scène', description: 'Détail du produit', durationSeconds: 7, usesBriefDuration: false, characterKey: null, versions: [{ id: 'image-2', version: 2, imagePath: 'image-2', checksum: 'image-2', createdAt: '2026-11-06T00:00:00Z' }] },
    { id: 'scene-3', sceneKey: 'SCENE-003', position: 3, title: 'Troisième scène', description: 'Scène à rendre', durationSeconds: 5, usesBriefDuration: true, characterKey: null, versions: [] }
  ];
  const previousMaster = { id: 'master-test-1', version: 1, masterPath: 'master-test-1', checksum: 'master-checksum-1', qaStatus: 'PASS', qaReport: { checks: [] }, approval: null, createdAt: '2026-11-06T00:00:00Z' };
  const master = { id: 'master-test-2', version: 2, masterPath: 'master-test-2', checksum: 'master-checksum-2', qaStatus: 'PASS', qaReport: { checks: [] }, approval: null as null | { id: string; checksum: string; invalidatedAt: null; createdAt: string; transfer: null | { id: string; provider: string; status: string; externalId: null } }, createdAt: '2026-11-06T00:00:00Z' };
  const plan = { mode: 'MOCK', executionMode: 'local', briefVersion: 1, checksum: 'plan-checksum', ready: true, sceneCount: 3, durationSeconds: 16, ratio: '9:16', pricing: { estimatedCents: 0, maxPossibleCents: 0, ceilingCents: 1000 }, steps: [], issues: [] };
  let masterAvailable = true;
  let sceneImageUnavailable = true;
  const endpoint = '/api/projects/projet-test';
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: { user: { id: 'utilisateur-test' } } });
    if (path === '/api/projects') return route.fulfill({ json: { items: [{ ...project, context }] } });
    if (path === endpoint) return route.fulfill({ json: { project, context, brief, scenes, master: masterAvailable ? master : null, masterVersions: masterAvailable ? [master, previousMaster] : [], messages: [], characters: [], job: null, jobRun: null, costs: { totalCents: 0, events: 0, mode: 'MOCK' } } });
    if (path === endpoint + '/production-plan') return route.fulfill({ json: { plan } });
    if (path.endsWith('/image')) {
      if (path.includes('SCENE-002') && sceneImageUnavailable) return route.fulfill({ status: 503, headers: { 'cache-control': 'no-store' }, body: 'Aperçu temporairement indisponible' });
      const label = path.includes('SCENE-002') ? 'SCÈNE 02' : 'SCÈNE 01';
      return route.fulfill({ contentType: 'image/svg+xml', headers: { 'cache-control': 'no-store' }, body: `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#2347BE"/><rect x="24" y="24" width="272" height="132" rx="8" fill="#172536"/><circle cx="252" cy="63" r="16" fill="#F5D867"/><text x="44" y="82" fill="#FFFFFF" font-size="20" font-family="sans-serif">${label}</text><text x="44" y="108" fill="#FFFFFF" font-size="12" font-family="sans-serif">IMAGE DE RECETTE</text></svg>` });
    }
    if (path === endpoint + '/scenes/SCENE-002' && route.request().method() === 'PATCH') { scenes[1].durationSeconds = route.request().postDataJSON().durationSeconds; return route.fulfill({ json: {} }); }
    if (path === endpoint + '/scenes/SCENE-002/correct' && route.request().method() === 'POST') return route.fulfill({ json: {} });
    if (path === endpoint + '/approve' && route.request().method() === 'POST') { master.approval = { id: 'approval-test', checksum: master.checksum, invalidatedAt: null, createdAt: '2026-11-06T00:00:00Z', transfer: null }; return route.fulfill({ json: {} }); }
    if (path === endpoint + '/transfer' && route.request().method() === 'POST' && master.approval) { master.approval.transfer = { id: 'transfer-test', provider: 'postiz-mock', status: 'acknowledged', externalId: null }; return route.fulfill({ json: {} }); }
    return route.fulfill({ status: 404, json: { message: 'Route de test indisponible' } });
  });

  await page.goto('/projects/projet-test');
  const preview = page.getByTestId('scene-preview');
  const inspector = page.locator('.studio-inspector');
  await expect(page.locator('.studio-head-actions')).toHaveCSS('display', 'flex');
  expect(await textContrast(page.getByTestId('status-badge'))).toBeGreaterThanOrEqual(4.5);
  const pendingThumbnail = page.getByTestId('scene-SCENE-003').getByText('En attente');
  await expect(pendingThumbnail).toHaveCSS('font-size', '14px');
  expect(await textContrast(pendingThumbnail)).toBeGreaterThanOrEqual(4.5);
  await page.getByText('Rendu sans IA générative · Transfert Postiz simulé').click();
  await expect(page.getByTestId('deterministic-banner')).toBeVisible();
  await expect(page.getByTestId('costs-mode')).toContainText('Coûts MOCK');
  await page.getByText('Rendu sans IA générative · Transfert Postiz simulé').click();
  await expect(preview).toHaveAttribute('src', endpoint + '/scenes/SCENE-001/image?v=1');
  await expect(inspector).toContainText('Première scène');
  await page.getByTestId('scene-SCENE-002').click();
  await expect(page.getByText('L’image de cette scène est indisponible.')).toBeVisible();
  await expect(page.getByTestId('scene-SCENE-002')).toHaveAttribute('aria-pressed', 'true');
  await expect(inspector).toContainText('Deuxième scène');
  await expect(page.getByTestId('duration-SCENE-002')).toHaveValue('7');
  await page.getByTestId('correct-input').fill('Modifier le fond');
  await expect(page.getByTestId('master-version')).toHaveText('Master v2');
  sceneImageUnavailable = false;
  const retryPreview = page.getByRole('button', { name: 'Réessayer l’aperçu', exact: true });
  await expect(retryPreview).toBeVisible();
  await retryPreview.press('Enter');
  await expect(preview).toHaveAttribute('src', endpoint + '/scenes/SCENE-002/image?v=2');
  await expect(preview).toHaveJSProperty('naturalWidth', 320);
  await expect(page.getByTestId('correct-input')).toHaveValue('Modifier le fond');
  await page.getByTestId('scene-SCENE-003').click();
  await expect(page.getByTestId('correct-input')).toHaveValue('');
  await expect(page.getByTestId('scene-preview')).toHaveCount(0);
  await expect(page.getByText('Aucune image rendue pour cette scène.')).toBeVisible();
  await page.getByTestId('scene-SCENE-002').click();
  await expect(page.getByTestId('correct-input')).toHaveValue('Modifier le fond');
  const duration = page.waitForRequest((request) => request.url().endsWith('/scenes/SCENE-002') && request.method() === 'PATCH');
  await page.getByTestId('duration-SCENE-002').selectOption('8');
  expect((await duration).postDataJSON()).toEqual({ durationSeconds: 8 });
  await expect(page.getByTestId('duration-SCENE-002')).toHaveValue('8');

  const correction = page.waitForRequest((request) => request.url().endsWith('/scenes/SCENE-002/correct') && request.method() === 'POST');
  await page.getByTestId('correct-submit').click();
  expect((await correction).postDataJSON()).toEqual({ instruction: 'Modifier le fond' });
  await page.getByRole('button', { name: 'Vidéo complète', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Vidéo complète', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('master-video')).toHaveAttribute('src', endpoint + '/master?version=2');
  await page.getByTestId('version-select').selectOption('1');
  await expect(page.getByTestId('master-video')).toHaveAttribute('src', endpoint + '/master?version=1');
  await page.getByTestId('compare-version').selectOption('2');
  await expect(page.getByTestId('master-video-compare')).toHaveAttribute('src', endpoint + '/master?version=2');
  await page.getByTestId('scene-SCENE-002').click();
  await expect(preview).toHaveAttribute('src', endpoint + '/scenes/SCENE-002/image?v=2');
  await expect(page.getByTestId('version-select')).toBeVisible();
  await expect(page.locator('.studio-workspace').getByTestId('qa-status')).toHaveCount(0);
  await page.getByRole('navigation', { name: 'Étapes du projet' }).getByRole('link', { name: 'Finaliser', exact: true }).click();
  await expect(page.getByTestId('studio-finalization').getByTestId('qa-status')).toBeVisible();
  await expect(page.getByTestId('approve')).toBeDisabled();
  await page.getByTestId('version-select').selectOption('2');
  const approval = page.waitForRequest((request) => request.url().endsWith('/approve') && request.method() === 'POST');
  await page.getByTestId('approve').click();
  expect((await approval).postDataJSON()).toEqual({ artifactVersionId: 'master-test-2', checksum: 'master-checksum-2' });
  await expect(page.getByTestId('current-approved-version')).toHaveText('v2');
  await page.getByTestId('transfer').click();
  await expect(page.getByTestId('transfer-status')).toContainText('acknowledged');
  await expect(page.getByTestId('studio-finalization')).toContainText('Un transfert confirmé ne signifie pas publié');

  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Débordement à ${width} px`).toBe(true);
    await page.getByTestId('scene-SCENE-001').focus();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('scene-SCENE-002')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(preview).toHaveAttribute('src', endpoint + '/scenes/SCENE-002/image?v=2');
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('scene-SCENE-003')).toBeFocused();
    await page.keyboard.press('Space');
    await expect(page.getByText('Aucune image rendue pour cette scène.')).toBeVisible();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByTestId('scene-SCENE-002')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(preview).toHaveAttribute('src', endpoint + '/scenes/SCENE-002/image?v=2');
    await expect(page.getByTestId('duration-SCENE-002')).toBeVisible();
  }
  project.status = 'transferred';
  await page.reload();
  await expect(page.getByTestId('status-badge')).toBeVisible();
  expect(await textContrast(page.getByTestId('status-badge'))).toBeGreaterThanOrEqual(4.5);
  await page.goto('/creations');
  await expect(page.getByTestId('master-video')).toHaveAttribute('src', endpoint + '/master?version=2');
  await expect(page.getByTestId('current-approved-version')).toHaveText('v2');
  masterAvailable = false;
  project.status = 'storyboard_ready';
  await page.evaluate(() => sessionStorage.removeItem('vululu:studio-draft:v1:utilisateur-test:projet-test'));
  await page.goto('/projects/projet-test');
  await expect(page.getByTestId('scene-preview')).toHaveAttribute('src', endpoint + '/scenes/SCENE-001/image?v=1');
  await expect(page.getByRole('button', { name: 'Vidéo complète', exact: true })).toBeDisabled();
  await expect(page.getByText('La vidéo complète sera disponible après la production.')).toBeVisible();
});
