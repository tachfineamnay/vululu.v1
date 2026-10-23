import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { assembleMaster, renderScene, runQa } from '../packages/media/src/index';

const root = path.join(process.cwd(), '.v0', 'test-media-' + Date.now());
const projectId = 'test-media-project';

describe('Media V0', () => {
  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('renders five PNG scenes and a readable MP4 master', async () => {
    const outputs = [];
    for (let index = 1; index <= 5; index += 1) {
      const output = await renderScene({
        projectId,
        artifactRoot: root,
        sceneKey: 'SCENE-00' + index,
        position: index,
        title: 'Scene ' + index,
        description: 'Description de test pour la scene ' + index,
        brandName: 'Vululu Test',
        colorPrimary: '#6C5CE7',
        colorSecondary: '#00D2FF',
        version: 1
      });
      expect(output.width).toBe(1080);
      expect(output.height).toBe(1920);
      expect(output.checksum.length).toBe(64);
      outputs.push(output);
    }

    const master = await assembleMaster({
      projectId,
      artifactRoot: root,
      version: 1,
      scenePaths: outputs.map((output) => output.absolutePath)
    });

    expect(master.videoCodec).toBe('h264');
    expect(master.audioCodec).toBe('aac');
    expect(master.width).toBe(1080);
    expect(master.height).toBe(1920);
    expect(master.duration).toBeGreaterThanOrEqual(8);

    const qa = await runQa(outputs, master);
    expect(qa.status).toBe('PASS');
    expect(qa.checks.length).toBeGreaterThanOrEqual(9);
  });
});
