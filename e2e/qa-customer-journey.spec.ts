import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { renderScene } from '../packages/media/src/index';

/**
 * Parcours client réel DSH-02B sur la pile QA (web 3190, API 3191, worker et python-tools
 * déjà démarrés). Chaque étape passe par l'interface et les API réelles de l'application :
 * aucun fournisseur payant, aucune publication, aucune donnée simulée côté serveur.
 *
 * Étapes couvertes : connexion et déconnexion, identité de marque, campagne, projet,
 * import et confirmation de ressource, brainstorming hors ligne, directions artistiques,
 * édition Studio, rendu média local, revue et approbation, téléchargement de l'artefact,
 * persistance après rechargement.
 */
/**
 * Ouvre « Composition et versions » de façon idempotente : après un rechargement, la direction
 * choisie peut arriver après le premier clic et remonter l'éditeur (fermeture du détail).
 */
async function openComposition(page: Page): Promise<void> {
  const summary = page.getByText('Composition et versions', { exact: true });
  const timeline = page.getByRole('combobox', { name: 'Timeline' });
  await expect(async () => {
    if (!(await timeline.isVisible().catch(() => false))) await summary.click();
    await expect(timeline).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
}

const stamp = Date.now();
const email = process.env.QA_USER_EMAIL ?? process.env.DEMO_EMAIL ?? '';
const password = process.env.QA_USER_PASSWORD ?? process.env.DEMO_PASSWORD ?? '';

test('parcours client QA : de la connexion au livrable approuvé, puis déconnexion', async ({ page }) => {
  test.setTimeout(600_000);
  expect(email.length, 'Compte QA requis (QA_USER_EMAIL/DEMO_EMAIL)').toBeGreaterThan(0);
  expect(password.length, 'Mot de passe QA requis (QA_USER_PASSWORD/DEMO_PASSWORD)').toBeGreaterThan(0);
  await page.context().addCookies([{ name: 'vululu_lang', value: 'fr', url: 'http://127.0.0.1:3190' }]);

  // 1. Connexion réelle (session cookie + CSRF émis par l'API).
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrer dans le studio' }).click();
  await expect(page).toHaveURL(/\/$/);

  // 2. Création de l'identité de marque via le formulaire.
  const contextName = 'Identité QA ' + stamp;
  await page.goto('/contexts/new');
  await page.getByTestId('context-name').fill(contextName);
  await page.getByTestId('context-description').fill('Identité de recette QA, sans donnée réelle.');
  await page.getByText('Préciser le public et le ton (facultatif)', { exact: true }).click();
  await page.getByTestId('context-audience').fill('Indépendants fictifs de recette');
  await page.getByTestId('context-tone').fill('Direct et chaleureux');
  await page.getByTestId('context-submit').click();
  await expect(page).toHaveURL(/\/contexts\?context=/);
  const contextId = new URL(page.url()).searchParams.get('context')!;
  expect(contextId.length).toBeGreaterThan(0);

  // 3. Création d'une campagne persistante.
  const campaignName = 'Campagne QA ' + stamp;
  await page.goto('/campaigns');
  await page.getByLabel('Nom de la campagne').fill(campaignName);
  await page.getByLabel('Description', { exact: true }).fill('Campagne de recette QA.');
  await page.getByRole('button', { name: 'Créer la campagne', exact: true }).click();
  await expect(page.getByRole('heading', { name: campaignName, exact: true })).toBeVisible();

  // 4. Création du projet (objectif, canal, format, identité, campagne).
  const projectTitle = 'Projet QA ' + stamp;
  await page.goto('/projects/new');
  await page.getByTestId('project-title').fill(projectTitle);
  await page.getByTestId('project-objective').fill('Faire découvrir une offre locale, sans jargon.');
  await page.getByTestId('project-next').click();
  await page.getByTestId('project-channel-Instagram').click();
  await page.getByTestId('project-format-Affiche').click();
  await page.getByTestId('project-next').click();
  await page.getByTestId('project-context').selectOption(contextId);
  await page.getByTestId('project-next').click();
  await expect(page.getByTestId('project-campaign')).toBeVisible();
  await page.getByTestId('project-campaign').selectOption({ label: campaignName });
  await page.getByTestId('project-submit').click();
  // « new » est exclu : la route /projects/new ne doit pas être prise pour un projet enregistré.
  await page.waitForURL((url) => /^\/projects\/(?!new$)[A-Za-z0-9]+$/.test(url.pathname), { timeout: 30_000 });
  const projectId = new URL(page.url()).pathname.split('/').filter(Boolean).pop()!;
  await expect(page.getByTestId('project-title-heading')).toHaveText(projectTitle);

  // 5. Import réel d'une ressource locale dans la bibliothèque du contexte.
  const assetName = 'Visuel QA ' + stamp;
  const file = await renderScene({
    projectId: 'e2e-qa-' + stamp,
    artifactRoot: path.resolve('.v1/e2e-qa-assets'),
    sceneKey: 'SCENE-001',
    position: 1,
    title: 'Une collection à découvrir',
    description: 'Céramiques artisanales · recette QA',
    brandName: 'Atelier QA',
    colorPrimary: '#365c4b',
    colorSecondary: '#ce9866',
    version: 1
  });
  await page.goto('/assets?context=' + encodeURIComponent(contextId));
  await page.getByText('Ajouter un fichier ou une version', { exact: true }).click();
  await page.getByLabel('Nom de la version', { exact: true }).fill(assetName);
  await page.getByLabel('Fichier', { exact: true }).setInputFiles(file.absolutePath);
  await page.getByLabel('Droits déclarés').selectOption('commercial');
  await page.getByLabel('Provenance et autorisation').fill('Fixture originale déterministe, recette QA autorisée.');
  await page.getByRole('button', { name: 'Importer et vérifier', exact: true }).click();
  await expect(page.locator('.toast--success')).toContainText('Version 1 importée et vérifiée.');
  await expect(page.getByRole('img', { name: assetName, exact: true })).toBeVisible();

  // 6. Sélection puis confirmation explicite de la ressource pour le projet.
  await page.goto('/projects/' + projectId);
  const assetsStep = page.getByTestId('assets-step');
  await expect(assetsStep).toBeVisible();
  await assetsStep.getByLabel('Utiliser la version 1').check();
  await page.getByTestId('assets-confirm').click();
  await expect(page.getByTestId('assets-decision-status')).toContainText('Ressources confirmées');
  await expect(page.getByTestId('brainstorm-locked')).toHaveCount(0);

  // 7. Brainstorming hors ligne (aucun fournisseur IA, aucune publication).
  await page.getByLabel('Votre message').fill(
    'Je veux faire découvrir mon atelier à des débutants, avec une promesse simple et sans jargon.'
  );
  await page.getByTestId('brainstorm-send').click();
  const turn = page.getByTestId(/^brainstorm-turn-/).first();
  await expect(turn).toBeVisible();
  await expect(turn).toContainText('Je veux faire découvrir mon atelier');
  await expect(turn.getByRole('heading', { name: 'Pistes créatives (suggestions)' })).toBeVisible();

  // 8. Directions artistiques générées localement, puis choix humain persisté.
  await page.getByTestId('directions-generate').click();
  await expect(page.getByTestId('direction-1')).toBeVisible();
  await page.getByTestId('direction-choose-1').click();
  await expect(page.getByTestId('direction-chosen')).toBeVisible();
  const directions = await (await page.request.get('/api/projects/' + projectId + '/creative/directions')).json();
  expect(directions.selectedVersion).toBe(1);

  // 9. Édition Studio : modifier un calque texte, prévisualiser, enregistrer une révision.
  await expect(page.getByTestId('direction-chosen')).toBeVisible();
  await openComposition(page);
  const composition = page.getByRole('combobox', { name: 'Timeline' });
  await expect(composition).toBeVisible();
  const textLayer = page.getByRole('button', { name: /^Calque \d+ · texte/ }).first();
  await textLayer.click();
  await page.getByRole('textbox', { name: /Texte à l/ }).fill('Réserver en atelier');
  // Les aperçus automatiques de l'éditeur partagent un quota de 10 rendus/minute par compte :
  // on laisse la fenêtre se réinitialiser avant l'aperçu explicite et le rendu qui suit.
  await page.waitForTimeout(65_000);
  await page.getByRole('button', { name: 'Prévisualiser la scène' }).click();
  // Le canvas affiche l'aperçu exact rendu par le serveur (même moteur que le master).
  // L'éditeur demande plusieurs aperçus natifs : un 429 « rendu en cours » est possible, et le
  // bouton « Actualiser l'aperçu » est l'action prévue par l'interface pour réessayer.
  const previewImage = page.getByRole('img', { name: /Aperçu exact de la scène SCENE-/ });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (await previewImage.first().isVisible().catch(() => false)) break;
    await page.getByRole('button', { name: 'Actualiser l’aperçu' }).click().catch(() => undefined);
    await page.waitForTimeout(4000);
  }
  await expect(previewImage.first()).toBeVisible();
  await page.getByRole('button', { name: 'Enregistrer une nouvelle révision' }).click();
  await expect(page.getByText(/Révision v\d+ · brouillon/).first()).toBeVisible();
  const history = await (await page.request.get('/api/projects/' + projectId + '/creative')).json();
  const savedSpec = await (await page.request.get('/api/projects/' + projectId + '/creative/' + history[0].version)).json();
  const savedTexts = savedSpec.spec.scenes.flatMap((scene: { layers: Array<{ type: string; text?: string }> }) =>
    scene.layers.filter((layer) => layer.type === 'text').map((layer) => layer.text)
  );
  expect(savedTexts).toContain('Réserver en atelier');

  // 10. Rendu média local par le worker, puis revue et approbation exacte.
  const renderButton = page.getByRole('button', { name: /^Rendre le master v\d+/ });
  await expect(renderButton).toBeVisible();
  const revisionRow = await (await page.request.get('/api/projects/' + projectId + '/creative')).json();
  const revision = revisionRow[0].version as number;
  await renderButton.click();
  const approve = page.getByRole('button', { name: 'Approuver cette version' });
  await expect(approve).toBeEnabled({ timeout: 180_000 });
  await approve.click();
  await expect(page.getByRole('button', { name: 'Version approuvée' })).toBeDisabled();
  const exportLink = page.getByRole('link', { name: new RegExp('^Exporter le master v' + revision) });
  await expect(exportLink).toBeVisible();

  // 11. Téléchargement de l'artefact et vérification du checksum serveur.
  const approved = await (await page.request.get('/api/projects/' + projectId + '/creative/' + revision)).json();
  // approvalSha256 couvre la liste (sceneKey, sha256) des cadres ; le fichier master porte son
  // propre sha256. Les deux sont recomposés ici depuis les octets téléchargés.
  const framesDigest = createHash('sha256')
    .update(JSON.stringify(approved.manifest.frames.map((frame: { sceneKey: string; sha256: string }) => [frame.sceneKey, frame.sha256])))
    .digest('hex');
  expect(framesDigest).toBe(approved.manifest.approvalSha256);
  const [download] = await Promise.all([page.waitForEvent('download'), exportLink.click()]);
  // Nom réel servi par l'API creative export : creation-v<version>.<extension>.
  expect(download.suggestedFilename()).toBe('creation-v' + revision + '.png');
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  const bytes = await fs.readFile(downloadPath!);
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(approved.manifest.master.sha256);
  if (typeof approved.manifest.master.size === 'number') expect(bytes.length).toBe(approved.manifest.master.size);

  // 12. Persistance : après rechargement, la direction choisie et l'approbation restent serveur.
  await page.reload();
  // Après édition, le pointeur serveur est sur la nouvelle révision du Studio, pas sur la
  // direction d'origine : le badge « direction choisie » ne s'applique plus (vérifié via l'API).
  await openComposition(page);
  await expect(page.getByRole('button', { name: 'Version approuvée' })).toBeDisabled();
  const after = await (await page.request.get('/api/projects/' + projectId + '/creative/directions')).json();
  // Éditer la direction choisie déplace le pointeur serveur sur la nouvelle révision : la
  // direction d'origine reste dans l'historique et l'approbation reste attachée à la version exacte.
  expect(after.selectedVersion).toBe(revision);
  expect(after.directions.some((direction: { version: number }) => direction.version === 1)).toBe(true);

  // 13. Déconnexion réelle : la session est fermée côté serveur.
  await page.getByRole('button', { name: 'Sortir' }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await page.request.get('/api/auth/me')).status()).toBe(401);
});
