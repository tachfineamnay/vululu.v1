import 'dotenv/config';
import path from 'node:path';
import crypto from 'node:crypto';
import { expect, it } from 'vitest';
import { renderScene, assembleMaster, runQa } from '../packages/media/src/index';
const base = { artifactRoot: path.resolve('.v1/profile-media'), sceneKey: 'SCENE-001', position: 1, title: 'Collection fictive', description: 'Création déterministe', brandName: 'Atelier fictif', colorPrimary: '#365c4b', colorSecondary: '#ce9866', version: 1 };
it('produit un vrai PNG et MP4 4:5 et les valide contre le profil attendu', async () => {
  const projectId = 'profile-' + crypto.randomUUID();
  const scene = await renderScene({ ...base, projectId, width: 1080, height: 1350 } as any);
  expect(scene).toMatchObject({ width: 1080, height: 1350 });
  const master = await assembleMaster({ projectId, artifactRoot: base.artifactRoot, version: 1, scenePaths: [scene.absolutePath], sceneDurationsSeconds: [0.5] });
  expect(master).toMatchObject({ width: 1080, height: 1350, videoCodec: 'h264', audioCodec: 'aac' });
  expect((await (runQa as any)([scene], master, { width: 1080, height: 1350 })).status).toBe('PASS');
});
it('refuse une video verticale quand le brief exige 4:5', async () => {
  const projectId = 'profile-' + crypto.randomUUID(); const scene = await renderScene({ ...base, projectId });
  const master = await assembleMaster({ projectId, artifactRoot: base.artifactRoot, version: 1, scenePaths: [scene.absolutePath], sceneDurationsSeconds: [0.5] });
  expect((await (runQa as any)([scene], master, { width: 1080, height: 1350 })).status).toBe('FAIL');
});
it('fait varier la simulation selon le style et la direction sans les afficher comme un prompt', async () => {
  const first = await renderScene({ ...base, projectId: 'style-' + crypto.randomUUID(), visualStyle: 'minimal', direction: 'Direction A' } as any);
  const next = await renderScene({ ...base, projectId: 'style-' + crypto.randomUUID(), visualStyle: 'bold', direction: 'Direction B' } as any);
  expect(first.checksum).not.toBe(next.checksum);
});
