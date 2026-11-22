import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * DSH-03 — Studio éditable réel sur la pile QA (web 3190, API 3191, worker Hatchet).
 *
 * Couvre les correctifs P09 de la PR #29 dans un vrai navigateur : ordre de peinture des calques,
 * ajout de calques texte, inspecteur borné, timeline (durée, ajout/retrait de scène), aperçus de
 * scène partagés malgré une piste audio plus longue, sous-titres bornés, piste audio réelle,
 * enregistrement d'une révision valide, rendu vidéo local, approbation et exports (PNG, MP4, SRT, M4A).
 * Aucun fournisseur payant, aucune publication.
 */
const stamp = Date.now();
const email = process.env.QA_USER_EMAIL ?? process.env.DEMO_EMAIL ?? '';
const password = process.env.QA_USER_PASSWORD ?? process.env.DEMO_PASSWORD ?? '';

function wavBuffer(seconds = 2, rate = 8000): Buffer {
  const frames = seconds * rate;
  const data = Buffer.alloc(frames * 2);
  for (let index = 0; index < frames; index += 1) {
    data.writeInt16LE(Math.round(12000 * Math.sin((2 * Math.PI * 440 * index) / rate)), index * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

test('Studio QA : calques, inspecteur, timeline, aperçus, sous-titres, audio, rendu et exports', async ({ page }) => {
  test.setTimeout(600_000);
  expect(email.length, 'Compte QA requis (QA_USER_EMAIL/DEMO_EMAIL)').toBeGreaterThan(0);
  expect(password.length, 'Mot de passe QA requis').toBeGreaterThan(0);
  await page.context().addCookies([{ name: 'vululu_lang', value: 'fr', url: 'http://127.0.0.1:3190' }]);

  const login = await page.request.post('/api/auth/login', { data: { email, password } });
  expect(login.status(), await login.text()).toBe(200);
  const headers = { 'x-csrf-token': (await login.json()).csrfToken };

  const contextResponse = await page.request.post('/api/contexts', {
    headers,
    data: { name: 'Studio QA ' + stamp, description: 'Identité de recette Studio, données fictives.', tone: 'Direct' }
  });
  expect(contextResponse.status()).toBe(201);
  const { context } = await contextResponse.json();

  const projectResponse = await page.request.post('/api/projects', {
    headers,
    data: {
      contextId: context.id, title: 'Studio QA ' + stamp, objective: 'Présenter une activité locale',
      platform: 'Instagram', format: 'Video'
    }
  });
  expect(projectResponse.status()).toBe(201);
  const { project } = await projectResponse.json();

  // Ressource audio réelle importée dans la bibliothèque de la marque (fichier WAV déterministe).
  const audioDir = path.resolve('.v1/qa-studio');
  await fs.mkdir(audioDir, { recursive: true });
  const audioPath = path.join(audioDir, 'qa-music-' + stamp + '.wav');
  await fs.writeFile(audioPath, wavBuffer());
  const audioName = 'Musique QA ' + stamp;
  await page.goto('/assets?context=' + encodeURIComponent(context.id));
  await page.getByText('Ajouter un fichier ou une version', { exact: true }).click();
  await page.getByLabel('Type d’actif').selectOption({ label: 'Audio' });
  await page.getByLabel('Nom de la version', { exact: true }).fill(audioName);
  await page.getByLabel('Fichier', { exact: true }).setInputFiles(audioPath);
  await page.getByLabel('Droits déclarés').selectOption('commercial');
  await page.getByLabel('Provenance et autorisation').fill('Fixture audio déterministe, recette QA autorisée.');
  await page.getByRole('button', { name: 'Importer et vérifier', exact: true }).click();
  await expect(page.locator('.toast--success')).toContainText('Version 1 importée et vérifiée.', { timeout: 60_000 });

  // Composition initiale : deux scènes vidéo, deux calques texte dans la première scène.
  const textLayer = (role: string, text: string, y: number) => ({
    type: 'text', role, text, x: 0.1, y, w: 0.8, h: 0.15, opacity: 1, bold: role !== 'body',
    color: '#ffffff', size: role === 'headline' ? 48 : 28
  });
  const spec = {
    schemaVersion: 1, width: 1080, height: 1920, safeArea: 0.05,
    brand: { background: '#101820', accent: '#f5d867' },
    delivery: { kind: 'short', platform: 'Instagram' },
    scenes: [
      { key: 'SCENE-001', seconds: 1, background: '#101820', layers: [textLayer('headline', 'Titre QA', 0.1), textLayer('cta', 'Découvrir', 0.7)] },
      { key: 'SCENE-002', seconds: 2, background: '#101820', layers: [textLayer('body', 'Deuxième plan QA', 0.4)] }
    ]
  };
  const created = await page.request.post('/api/projects/' + project.id + '/creative', { headers, data: { expectedVersion: 0, spec } });
  expect(created.status(), await created.text()).toBe(200);

  await page.goto('/projects/' + project.id);
  await page.getByText('Composition et versions', { exact: true }).click();
  const panel = page.locator('details').filter({ has: page.locator('summary', { hasText: /^Composition et versions$/ }) });
  await expect(panel.getByRole('combobox', { name: 'Timeline' })).toBeVisible();

  // 1. Ordre de peinture : la liste affiche le calque le plus haut en premier (dernier indice peint).
  // Liste de l'inspecteur uniquement : le canvas expose les mêmes libellés pour ses zones cliquables.
  const layerList = panel.locator('ol.studio-layer-list');
  const layerButtons = layerList.getByRole('button', { name: /^Calque \d+ · texte/ });
  await expect(layerButtons).toHaveCount(2);
  await layerButtons.first().click();
  await expect(panel.getByText(/Calque 2 sur 2 · Texte/)).toBeVisible();
  await expect(panel.locator('.studio-layer-row[data-selected="true"]')).toHaveCount(1);

  // 2. Ajout d'un calque texte : libellé non vide, sélectionné, zone sûre respectée à l'enregistrement.
  await panel.getByRole('button', { name: 'Ajouter un calque texte · Titre', exact: true }).click();
  await expect(layerButtons).toHaveCount(3);
  await layerButtons.first().click();
  await expect(panel.getByRole('textbox', { name: /Texte à l/ })).not.toHaveValue('');
  await panel.getByRole('textbox', { name: /Texte à l/ }).fill('Titre QA édité');
  await panel.getByLabel('Corps (10 à 240)', { exact: true }).fill('56');
  await panel.getByLabel('X (0 à 1)', { exact: true }).fill('0.12');
  await panel.getByLabel('Y (0 à 1)', { exact: true }).fill('0.2');
  await expect(panel.getByLabel('Corps (10 à 240)', { exact: true })).toHaveValue('56');

  // 3. Timeline : durée de scène bornée, total recalculé, ajout puis retrait de scène.
  await panel.getByRole('button', { name: /^Sélectionner la scène 2/ }).click();
  const sceneDuration = panel.getByRole('spinbutton', { name: /Durée de la scène 2/ });
  await sceneDuration.fill('2.5');
  await expect(panel.getByText(/Durée totale : 3,5 s/).first()).toBeVisible();
  const timeline = panel.getByRole('region', { name: 'Timeline des scènes' });
  await timeline.getByRole('button', { name: 'Ajouter une scène', exact: true }).click();
  await expect(panel.getByRole('button', { name: /^Sélectionner la scène 3/ })).toBeVisible();
  await timeline.getByRole('button', { name: 'Retirer la scène', exact: true }).click();
  await expect(panel.getByRole('button', { name: /^Sélectionner la scène 3/ })).toHaveCount(0);

  // 4. Sous-titres : ajout non vide, bornes start/end, puis aperçu de scène avec une piste plus longue.
  await panel.getByRole('heading', { name: 'Sous-titres', exact: true }).scrollIntoViewIfNeeded();
  await panel.getByRole('button', { name: 'Ajouter un sous-titre', exact: true }).click();
  const cueText = panel.getByLabel('Texte du sous-titre 1');
  await expect(cueText).not.toHaveValue('');
  await cueText.fill('Sous-titre QA');
  await panel.getByLabel('Début du sous-titre 1 en secondes').fill('0');
  await panel.getByLabel('Fin du sous-titre 1 en secondes').fill('3.5');
  await expect(panel.getByLabel('Fin du sous-titre 1 en secondes')).toHaveValue('3.5');

  // 5. Audio : piste réelle depuis la bibliothèque, volume borné.
  await panel.getByRole('heading', { name: 'Audio', exact: true }).scrollIntoViewIfNeeded();
  await panel.getByLabel('Ressource audio').selectOption({ index: 1 });
  await panel.getByRole('button', { name: 'Ajouter une piste', exact: true }).click();
  await expect(panel.locator('ol.studio-audio-tracks').getByText('Piste 1 · Musique', { exact: true })).toBeVisible();
  // Le curseur est normalisé (0 à 1) même si son libellé parle de pourcentage.
  await expect(panel.getByLabel('Volume de la piste 1 en pourcentage')).toHaveValue('0.8');

  // Aperçu de la scène 1 (1 s) alors qu'un sous-titre court sur 3,5 s : l'audio ne doit pas
  // invalider la spec réduite envoyée au serveur (correctif P09 n°2).
  // Les aperçus automatiques de l'éditeur partagent un quota de 10 rendus/minute par compte :
  // on attend la fin de la fenêtre avant l'aperçu explicite et avant le rendu final.
  await page.waitForTimeout(65_000);
  await panel.getByRole('button', { name: /^Sélectionner la scène 1/ }).click();
  const previewResponse = page.waitForResponse(
    (response) => response.url().includes('/creative/preview') && response.request().method() === 'POST'
  );
  await panel.getByRole('button', { name: 'Prévisualiser la scène', exact: true }).click();
  expect((await previewResponse).status()).toBe(200);
  await expect(panel.getByRole('img', { name: 'Aperçu exact de la scène SCENE-001' })).toBeVisible();
  await expect(panel.getByText(/dépasse la durée/i)).toHaveCount(0);

  // 6. Réduire les durées retire le sous-titre devenu hors durée et l'annonce, sans casser la spec.
  await panel.getByLabel('Début du sous-titre 1 en secondes').fill('2.5');
  await panel.getByLabel('Fin du sous-titre 1 en secondes').fill('3.5');
  await panel.getByRole('button', { name: /^Sélectionner la scène 2/ }).click();
  await panel.getByRole('spinbutton', { name: /Durée de la scène 2/ }).fill('0.5');
  await panel.getByRole('button', { name: /^Sélectionner la scène 1/ }).click();
  await panel.getByRole('spinbutton', { name: /Durée de la scène 1/ }).fill('0.5');
  await expect(panel.getByText(/sous-titre\(s\) retiré/i).first()).toBeVisible();
  await expect(panel.getByText(/Durée totale : 1 s/).first()).toBeVisible();

  // Un repère court dans la nouvelle durée permet de vérifier l'export SRT après approbation.
  await panel.getByRole('button', { name: 'Ajouter un sous-titre', exact: true }).click();
  await panel.getByLabel('Texte du sous-titre 1').fill('Sous-titre QA');
  await panel.getByLabel('Début du sous-titre 1 en secondes').fill('0');
  await panel.getByLabel('Fin du sous-titre 1 en secondes').fill('0.5');
  // Sans cette case, le serveur rend la vidéo sans sous-titres et refuse l'export SRT.
  await panel.getByLabel('Afficher les sous-titres dans la vidéo rendue').check();

  await panel.getByRole('button', { name: 'Enregistrer une nouvelle révision', exact: true }).click();
  await expect(panel.getByText(/Révision v\d+ · brouillon/).first()).toBeVisible();
  const history = await (await page.request.get('/api/projects/' + project.id + '/creative')).json();
  const revision = history[0].version as number;
  const saved = await (await page.request.get('/api/projects/' + project.id + '/creative/' + revision)).json();
  const savedTexts = saved.spec.scenes.flatMap((scene: { layers: Array<{ type: string; text?: string }> }) =>
    scene.layers.filter((layer) => layer.type === 'text').map((layer) => layer.text));
  expect(savedTexts).toContain('Titre QA édité');
  expect(saved.spec.audio.tracks).toHaveLength(1);
  expect(saved.spec.audio.subtitles.cues).toHaveLength(1);
  expect(saved.spec.audio.subtitles.cues[0].end).toBeLessThanOrEqual(1 + 1e-6);
  expect(saved.spec.audio.subtitles.cues[0].text).toBe('Sous-titre QA');
  expect(saved.spec.audio.subtitles.enabled).toBe(true);
  expect(saved.spec.scenes.reduce((sum: number, scene: { seconds: number }) => sum + scene.seconds, 0)).toBeCloseTo(1, 5);

  // 7. Rendu vidéo local, approbation exacte, puis exports réels (PNG, MP4, SRT, M4A).
  await page.waitForTimeout(65_000);
  await panel.getByRole('button', { name: new RegExp('^Rendre le master v') }).click();
  const approve = panel.getByRole('button', { name: 'Approuver cette version', exact: true });
  await expect(approve).toBeEnabled({ timeout: 180_000 });
  await approve.click();
  await expect(panel.getByRole('button', { name: 'Version approuvée', exact: true })).toBeDisabled();

  const sceneExport = panel.getByRole('link', { name: 'Exporter la scène SCENE-001', exact: true });
  const [sceneDownload] = await Promise.all([page.waitForEvent('download'), sceneExport.click()]);
  const scenePath = await sceneDownload.path();
  expect(scenePath).toBeTruthy();
  const sceneBytes = await fs.readFile(scenePath!);
  expect(sceneBytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

  const masterLink = panel.getByRole('link', { name: new RegExp('^Exporter le master v' + revision) });
  const [masterDownload] = await Promise.all([page.waitForEvent('download'), masterLink.click()]);
  const masterPath = await masterDownload.path();
  expect(masterPath).toBeTruthy();
  const masterBytes = await fs.readFile(masterPath!);
  expect(masterBytes.length).toBeGreaterThan(1024);
  expect(masterBytes.subarray(4, 8).toString()).toBe('ftyp');

  const srtLink = panel.getByRole('link', { name: 'Sous-titres (SRT)', exact: true });
  const [srtDownload] = await Promise.all([page.waitForEvent('download'), srtLink.click()]);
  const srtPath = await srtDownload.path();
  expect(srtPath).toBeTruthy();
  const srt = await fs.readFile(srtPath!, 'utf8');
  expect(srt).toContain('Sous-titre QA');
  expect(srt).toMatch(/00:00:0[0-9],\d{3} --> 00:00:0[0-9],\d{3}/);

  const m4aLink = panel.getByRole('link', { name: 'Exporter la piste audio (M4A)', exact: true });
  const [m4aDownload] = await Promise.all([page.waitForEvent('download'), m4aLink.click()]);
  const m4aPath = await m4aDownload.path();
  expect(m4aPath).toBeTruthy();
  expect((await fs.readFile(m4aPath!)).length).toBeGreaterThan(1024);

  // 8. Persistance : après rechargement, la révision courante reste approuvée et exportable.
  await page.reload();
  await page.getByText('Composition et versions', { exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Version approuvée', exact: true })).toBeDisabled();
  await expect(panel.getByRole('link', { name: 'Sous-titres (SRT)', exact: true })).toBeVisible();
});
