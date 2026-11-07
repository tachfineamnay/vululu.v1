import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { expect, it } from 'vitest';
import { renderScene, assembleMaster, runQa } from '../packages/media/src/index';

const root = path.resolve('.v1/responsive-layout');
const base = { artifactRoot: root, sceneKey: 'SCENE-001', position: 1, title: 'Une collection à découvrir', description: 'Une démonstration claire, complète et accessible.', brandName: 'Atelier démo', colorPrimary: '#ffffff', colorSecondary: '#ffff00', version: 1 };
it('rend toute la fin du texte au-dela des quatre premieres lignes', async () => {
  const description = 'Un projet fictif à découvrir avec tous ses détails. '.repeat(10);
  const a = await renderScene({ ...base, projectId: 'complete-' + crypto.randomUUID(), description: description + 'Conclusion A.', width: 1080, height: 1350 });
  const b = await renderScene({ ...base, projectId: 'complete-' + crypto.randomUUID(), description: description + 'Conclusion B.', width: 1080, height: 1350 });
  expect(a.checksum).not.toBe(b.checksum);
});
it.each([{ width: 1080, height: 1920 }, { width: 1080, height: 1350 }, { width: 1080, height: 1080 }, { width: 1920, height: 1080 }])('compose les zones a la taille native $width x $height', async ({ width, height }) => {
  const result = await renderScene({ ...base, projectId: 'ratio-' + crypto.randomUUID(), width, height });
  const layout = result.textLayout!;
  expect(layout).toMatchObject({ compositionVersion: 'v1-demo-layout-2026-11-05', complete: true, artifactSha256: result.checksum, width, height });
  expect(layout.boxes.map((box: { field: string }) => box.field)).toEqual(['brand', 'title', 'description', 'label']);
  for (const box of layout.boxes) {
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width); expect(box.y + box.height).toBeLessThanOrEqual(height);
    expect(box.fontSize).toBeGreaterThanOrEqual(box.minFontSize); expect(box.contentSha256).toMatch(/^[a-f0-9]{64}$/);
  }
  const title = layout.boxes.find((box: { field: string }) => box.field === 'title');
  const description = layout.boxes.find((box: { field: string }) => box.field === 'description');
  if (width > height) expect(title.x + title.width).toBeLessThanOrEqual(description.x);
  else expect(title.y + title.height).toBeLessThanOrEqual(description.y);
});
it('refuse un texte impossible a composer sans creer de PNG', async () => {
  const projectId = 'overflow-' + crypto.randomUUID();
  await expect(renderScene({ ...base, projectId, description: Array.from({ length: 150 }, () => 'Une ligne.').join('\n'), width: 1080, height: 1080 })).rejects.toMatchObject({ code: 'media_text_overflow' });
  await expect(fs.access(path.join(root, projectId, 'scenes', base.sceneKey, 'v1.png'))).rejects.toMatchObject({ code: 'ENOENT' });
});
it('verifie l audit lie au PNG et refuse une provenance de disposition alteree', async () => {
  const projectId = 'audit-' + crypto.randomUUID();
  const scene = await renderScene({ ...base, projectId });
  const master = await assembleMaster({ projectId, artifactRoot: root, version: 1, scenePaths: [scene.absolutePath], sceneDurationsSeconds: [0.5] });
  const altered = { ...scene, textLayout: { ...scene.textLayout!, artifactSha256: '0'.repeat(64) } };
  const qa = await runQa([altered], master);
  expect(qa.status).toBe('FAIL');
  expect(qa.checks.some((check) => check.name.startsWith('text layout') && check.status === 'FAIL')).toBe(true);
});
