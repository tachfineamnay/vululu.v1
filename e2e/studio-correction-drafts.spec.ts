import { expect, test, type Page } from '@playwright/test';

const settings = { schemaVersion: 1, profileVersion: 'v1-demo-2026-11-04', ratio: '9:16', defaultSceneDurationSeconds: 5, visualStyle: 'editorial', direction: '', maxMockCents: 1000, audio: { voiceVersionId: null, musicVersionId: null, spokenText: '', voiceGainDb: -3, musicGainDb: -18, ducking: true } };
const checksum = 'a'.repeat(64);
const scenes = [
  { id: 'scene-a', sceneKey: 'SCENE-001', position: 1, title: 'Scène A', description: 'Début', durationSeconds: 4, usesBriefDuration: false, characterKey: null, versions: [{ id: 'image-a', version: 1, imagePath: 'a', checksum: 'a', createdAt: '2026-11-06T00:00:00Z' }] },
  { id: 'scene-b', sceneKey: 'SCENE-002', position: 2, title: 'Scène B', description: 'Suite', durationSeconds: 7, usesBriefDuration: false, characterKey: null, versions: [{ id: 'image-b', version: 1, imagePath: 'b', checksum: 'b', createdAt: '2026-11-06T00:00:00Z' }] }
];
const legacyDraft = { schemaVersion: 1, baseVersion: 1, baseChecksum: checksum, objective: 'Présenter une activité', audience: 'Public', tone: 'Clair', cta: 'Découvrir', settings, briefEdited: false, correction: 'Ancienne instruction', correctionScene: 'SCENE-002', correctionEdited: true, chatInput: '' };

async function mockStudio(page: Page) {
  const state = { owner: 'compte-1', failCorrection: true, scenesAvailable: true, sceneBTitle: 'Scène B', proposalMessage: false, dialogCount: 0, correctionGate: null as Promise<void> | null };
  const brief = { id: 'brief', objective: legacyDraft.objective, audience: 'Public', tone: 'Clair', cta: 'Découvrir', platform: 'Instagram', format: 'Video', version: 1, revisions: [{ id: 'revision', version: 1, checksum, createdAt: '2026-11-06T00:00:00Z' }], confirmedVersion: 1, confirmedChecksum: checksum, settings };
  const context = { id: 'contexte', name: 'Contexte de recette', description: 'Fictif', audience: null, tone: null, website: null, colorPrimary: '#2347BE', colorSecondary: '#F5D867' };
  const master = { id: 'master', version: 1, masterPath: 'master', checksum: 'master-checksum', qaStatus: 'PASS', qaReport: { checks: [] }, approval: null, createdAt: '2026-11-06T00:00:00Z' };
  const plan = { mode: 'MOCK', executionMode: 'local', briefVersion: 1, checksum: 'plan', ready: true, sceneCount: 2, durationSeconds: 11, ratio: '9:16', pricing: { estimatedCents: 0, maxPossibleCents: 0, ceilingCents: 1000 }, steps: [], issues: [] };
  const proposal = { schemaVersion: 1, mode: 'MOCK', kind: 'correction', baseBriefVersion: 1, sceneKey: 'SCENE-002', sceneVersion: 1, sceneChecksum: 'b', masterVersion: 1, masterChecksum: 'master-checksum', instruction: 'Proposition pour B' };
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: { user: { id: state.owner } } });
    const projectMatch = path.match(/^\/api\/projects\/(projet-[12])$/);
    if (projectMatch) {
      const project = { id: projectMatch[1], title: 'Projet de recette', status: 'review', platform: 'Instagram', format: 'Video', objective: brief.objective, sceneDurationSeconds: 5, contextId: context.id, storyboardBriefVersion: 1 };
      return route.fulfill({ json: { project, context, brief, scenes: state.scenesAvailable ? scenes.map((scene) => scene.sceneKey === 'SCENE-002' ? { ...scene, title: state.sceneBTitle } : scene) : [], master, masterVersions: [master], messages: state.proposalMessage ? [{ id: 'message-test', role: 'assistant', content: 'Proposition de correction', createdAt: '2026-11-06T00:00:00Z', proposal }] : [], characters: [], job: null, jobRun: null, costs: { totalCents: 0, events: 0, mode: 'MOCK' } } });
    }
    if (path.endsWith('/production-plan')) return route.fulfill({ json: { plan } });
    if (path.endsWith('/image')) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="18" />' });
    if (path.endsWith('/correct') && route.request().method() === 'POST') {
      if (state.correctionGate) await state.correctionGate;
      return state.failCorrection ? route.fulfill({ status: 503, json: { message: 'Correction indisponible' } }) : route.fulfill({ json: {} });
    }
    return route.fulfill({ status: 404, json: { message: 'Route de test indisponible' } });
  });
  page.on('dialog', (dialog) => { state.dialogCount += 1; void dialog.accept(); });
  return state;
}

test('A → B → A, requête ciblée et conservation après échec', async ({ page }) => {
  test.setTimeout(60000);
  const state = await mockStudio(page);
  await page.goto('/projects/projet-1');
  const input = page.getByTestId('correct-input');
  await input.fill('Instruction pour A');
  await page.getByTestId('scene-SCENE-002').click();
  await expect(input).toHaveValue('');
  await input.fill('Instruction pour B');
  await page.getByTestId('scene-SCENE-001').click();
  await expect(input).toHaveValue('Instruction pour A');
  await page.getByTestId('scene-SCENE-002').click();
  await expect(input).toHaveValue('Instruction pour B');
  await expect(page.getByTestId('correct-submit')).toContainText('Scène B');
  await expect(page.getByTestId('correct-submit')).toContainText('SCENE-002');

  const request = page.waitForRequest((value) => value.method() === 'POST' && value.url().includes('/correct'));
  await page.getByTestId('correct-submit').click();
  const sent = await request;
  expect(new URL(sent.url()).pathname).toBe('/api/projects/projet-1/scenes/SCENE-002/correct');
  expect(sent.postDataJSON()).toEqual({ instruction: 'Instruction pour B' });
  await expect(page.getByTestId('studio-error')).toContainText('Correction indisponible');
  await expect(page.getByTestId('scene-SCENE-002')).toHaveAttribute('aria-pressed', 'true');
  await expect(input).toHaveValue('Instruction pour B');
  await expect(page.getByTestId('scene-preview')).toHaveAttribute('src', '/api/projects/projet-1/scenes/SCENE-002/image?v=1');
  await expect(page.getByTestId('master-version')).toHaveText('Master v1');

  await page.reload();
  await expect(page.getByTestId('scene-SCENE-002')).toHaveAttribute('aria-pressed', 'true');
  await expect(input).toHaveValue('Instruction pour B');
  await page.getByTestId('scene-SCENE-001').click();
  await expect(input).toHaveValue('Instruction pour A');
  await page.getByTestId('scene-SCENE-002').click();
  state.failCorrection = false;
  let releaseCorrection!: () => void;
  state.correctionGate = new Promise<void>((resolve) => { releaseCorrection = resolve; });
  const retry = page.waitForRequest((value) => value.method() === 'POST' && value.url().endsWith('/SCENE-002/correct'));
  await page.getByTestId('correct-submit').click();
  expect((await retry).postDataJSON()).toEqual({ instruction: 'Instruction pour B' });
  await page.getByTestId('scene-SCENE-001').click();
  await expect(input).toHaveValue('Instruction pour A');
  releaseCorrection();
  await expect(page.getByTestId('toast')).toContainText('Correction de SCENE-002');
  await expect(input).toHaveValue('Instruction pour A');
  const previousDialogs = state.dialogCount;
  await page.getByTestId('nav-home').click();
  await expect.poll(() => state.dialogCount).toBeGreaterThan(previousDialogs);
});

test('reprise du format existant et isolation par compte et projet', async ({ page }) => {
  test.setTimeout(60000);
  const state = await mockStudio(page);
  await page.goto('/projects/projet-1');
  await page.evaluate((draft) => sessionStorage.setItem('vululu:studio-draft:v1:compte-1:projet-1', JSON.stringify(draft)), legacyDraft);
  await page.reload();
  const input = page.getByTestId('correct-input');
  await expect(page.getByTestId('scene-SCENE-002')).toHaveAttribute('aria-pressed', 'true');
  await expect(input).toHaveValue('Ancienne instruction');
  await page.getByTestId('scene-SCENE-001').click();
  await expect(input).toHaveValue('');
  await input.fill('Brouillon du premier projet');
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('vululu:studio-draft:v1:compte-1:projet-1') ?? '')).toContain('Brouillon du premier projet');
  await page.goto('/projects/projet-2');
  await expect(input).toHaveValue('');
  await input.fill('Brouillon du second projet');
  await page.goto('/projects/projet-1');
  await expect(input).toHaveValue('Brouillon du premier projet');
  await page.getByTestId('scene-SCENE-002').click();
  await expect(input).toHaveValue('Ancienne instruction');
  state.owner = 'compte-2';
  await page.reload();
  await expect(input).toHaveValue('');
  state.owner = 'compte-1';
  await page.reload();
  await expect(input).toHaveValue('Ancienne instruction');
  await page.getByTestId('scene-SCENE-001').click();
  await expect(input).toHaveValue('Brouillon du premier projet');
});

test('un ancien brouillon associé à la scène par défaut reprend sur cette scène seulement', async ({ page }) => {
  test.setTimeout(60000);
  await mockStudio(page);
  await page.goto('/projects/projet-1');
  await page.evaluate((draft) => sessionStorage.setItem('vululu:studio-draft:v1:compte-1:projet-1', JSON.stringify({ ...draft, correctionScene: '' })), legacyDraft);
  await page.reload();
  await expect(page.getByTestId('scene-SCENE-001')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('correct-input')).toHaveValue('Ancienne instruction');
  await page.getByTestId('scene-SCENE-002').click();
  await expect(page.getByTestId('correct-input')).toHaveValue('');
  await page.getByTestId('scene-SCENE-001').click();
  await expect(page.getByTestId('correct-input')).toHaveValue('Ancienne instruction');
});

test('une ancienne instruction sans scène reste récupérable et ne remplace aucun brouillon', async ({ page }) => {
  test.setTimeout(60000);
  const state = await mockStudio(page);
  state.scenesAvailable = false;
  await page.goto('/projects/projet-1');
  await page.evaluate((draft) => sessionStorage.setItem('vululu:studio-draft:v1:compte-1:projet-1', JSON.stringify({ ...draft, correctionScene: '' })), legacyDraft);
  await page.reload();
  const input = page.getByTestId('correct-input');
  await expect(input).toHaveValue('Ancienne instruction');
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('vululu:studio-draft:v1:compte-1:projet-1') ?? '')).toContain('unassignedCorrection');
  state.scenesAvailable = true;
  await page.reload();
  await expect(input).toHaveValue('');
  const pending = page.locator('.studio-inspector').locator('details').filter({ hasText: 'Instruction non attribuée' });
  await pending.locator('summary').click();
  await expect(pending).toContainText('Ancienne instruction');
  await input.fill('Instruction déjà présente');
  const assign = pending.getByRole('button', { name: 'Attribuer à « Scène A »', exact: true });
  await expect(assign).toBeDisabled();
  await input.fill('');
  await assign.click();
  await expect(input).toHaveValue('Ancienne instruction');
  await page.getByTestId('scene-SCENE-002').click();
  await expect(input).toHaveValue('');
  await page.reload();
  await page.getByTestId('scene-SCENE-001').click();
  await expect(input).toHaveValue('Ancienne instruction');
});

test('un conflit de révision laisse consulter et reprendre toutes les instructions', async ({ page }) => {
  test.setTimeout(60000);
  await mockStudio(page);
  await page.goto('/projects/projet-1');
  const conflicting = { ...legacyDraft, baseChecksum: 'b'.repeat(64), correctionDrafts: { 'SCENE-001': { instruction: 'Correction A à relire', edited: true }, 'SCENE-002': { instruction: 'Correction B à relire', edited: true } }, unassignedCorrection: { instruction: 'Instruction à attribuer', edited: true } };
  await page.evaluate((draft) => sessionStorage.setItem('vululu:studio-draft:v1:compte-1:projet-1', JSON.stringify(draft)), conflicting);
  await page.reload();
  const conflict = page.getByRole('alert').filter({ hasText: 'Un brouillon local repose sur une autre version du brief' });
  await expect(conflict).toBeVisible();
  await conflict.getByText('Consulter la saisie locale précédente', { exact: true }).click();
  await expect(conflict).toContainText('Correction A à relire');
  await expect(conflict).toContainText('Correction B à relire');
  await expect(conflict).toContainText('Instruction à attribuer');
  await conflict.getByRole('button', { name: 'Reprendre ces saisies comme brouillon à relire', exact: true }).click();
  await expect(page.getByTestId('correct-input')).toHaveValue('Correction B à relire');
  await page.getByTestId('scene-SCENE-001').click();
  await expect(page.getByTestId('correct-input')).toHaveValue('Correction A à relire');
  await expect(page.locator('.studio-inspector')).toContainText('Instruction non attribuée');
});

test('le nom complet de la scène reste lisible sans débordement sur mobile', async ({ page }) => {
  test.setTimeout(60000);
  const state = await mockStudio(page);
  state.sceneBTitle = 'Scène' + 'X'.repeat(120);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/projects/projet-1');
  await page.getByTestId('scene-SCENE-002').click();
  await expect(page.getByTestId('correct-submit')).toContainText(state.sceneBTitle);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('une conservation locale indisponible est signalée sans effacer les instructions', async ({ page }) => {
  test.setTimeout(60000);
  await mockStudio(page);
  await page.addInitScript(() => {
    const save = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('vululu:studio-draft:v1:')) throw new Error('Stockage indisponible pour la recette');
      return save.call(this, key, value);
    };
  });
  await page.goto('/projects/projet-1');
  const input = page.getByTestId('correct-input');
  await input.fill('Instruction en mémoire');
  await expect(page.locator('.studio-inspector')).toContainText('Conservation locale indisponible');
  await page.getByTestId('scene-SCENE-002').click();
  await expect(input).toHaveValue('');
  await page.getByTestId('scene-SCENE-001').click();
  await expect(input).toHaveValue('Instruction en mémoire');
  await expect(page.getByTestId('master-version')).toHaveText('Master v1');
});

test('une proposition ne remplace pas une instruction déjà saisie pour sa scène', async ({ page }) => {
  test.setTimeout(60000);
  const state = await mockStudio(page);
  state.proposalMessage = true;
  await page.goto('/projects/projet-1');
  const input = page.getByTestId('correct-input');
  await input.fill('Brouillon A');
  await page.getByTestId('scene-SCENE-002').click();
  await input.fill('Brouillon B');
  await page.locator('#studio-preparation > summary').click();
  await page.getByTestId('studio-assistance').locator('summary').first().click();
  const proposal = page.getByTestId('message-proposal-message-test');
  await expect(proposal).toContainText('Une instruction existe pour cette scène');
  await expect(proposal.getByRole('button', { name: 'Préremplir la correction' })).toBeDisabled();
  await input.fill('');
  await proposal.getByRole('button', { name: 'Préremplir la correction' }).click();
  await expect(input).toHaveValue('Proposition pour B');
  await page.getByTestId('scene-SCENE-001').click();
  await expect(input).toHaveValue('Brouillon A');
});
