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

    const masterSpeed = await assembleMaster({
      projectId,
      artifactRoot: root,
      version: 1,
      scenePaths: outputs.map((output) => output.absolutePath),
      sceneDurationsSeconds: outputs.map(() => 2)
    });

    expect(masterSpeed.videoCodec).toBe('h264');
    expect(masterSpeed.audioCodec).toBe('aac');
    expect(masterSpeed.width).toBe(1080);
    expect(masterSpeed.height).toBe(1920);
    expect(masterSpeed.expectedDurationSeconds).toBe(10);
    expect(masterSpeed.duration).toBeGreaterThanOrEqual(9);

    const qaSpeed = await runQa(outputs, masterSpeed);
    expect(qaSpeed.status).toBe('PASS');
    expect(qaSpeed.checks.length).toBeGreaterThanOrEqual(9);

    const masterTarget = await assembleMaster({
      projectId,
      artifactRoot: root,
      version: 2,
      scenePaths: outputs.map((output) => output.absolutePath),
      sceneDurationsSeconds: outputs.map(() => 10)
    });

    expect(masterTarget.expectedDurationSeconds).toBe(50);
    expect(masterTarget.duration).toBeGreaterThanOrEqual(49);
    expect(masterTarget.videoCodec).toBe('h264');
    expect(masterTarget.audioCodec).toBe('aac');

    const qaTarget = await runQa(outputs, masterTarget);
    expect(qaTarget.status).toBe('PASS');
  });
});
