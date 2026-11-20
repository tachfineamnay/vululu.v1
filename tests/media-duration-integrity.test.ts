import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { afterAll, describe, expect, it } from 'vitest';
import {
  MASTER_DURATION_TOLERANCE_FRAMES,
  MASTER_FRAME_RATE,
  assembleMaster,
  masterDurationTolerance,
  renderScene,
  runQa,
  type MasterOutput,
  type SceneRenderOutput
} from '../packages/media/src/index';

/**
 * FIX01 — integration reelle FFmpeg/ffprobe.
 *
 * Aucune metadonnee simulee n est utilisee pour prouver la duree : chaque
 * master produit est re-sonde par un binaire ffprobe independant
 * (`-count_frames`), et les assertions portent sur les flux reellement encodes.
 */
const root = path.join(process.cwd(), '.v0', 'test-media-integrity-' + Date.now());

function findFfprobe(): string {
  const configured = process.env.FFPROBE_PATH;
  if (configured && fs.existsSync(configured)) {
    return configured;
  }
  const nextToFfmpeg = process.env.FFMPEG_PATH
    ? path.join(path.dirname(process.env.FFMPEG_PATH), 'ffprobe')
    : '';
  if (nextToFfmpeg && fs.existsSync(nextToFfmpeg)) {
    return nextToFfmpeg;
  }
  return 'ffprobe';
}

function ffprobe(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(findFfprobe(), args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error('ffprobe failed with code ' + code + ': ' + stderr.slice(0, 2000)));
      }
    });
  });
}

type ProbeStream = {
  codec_type?: string;
  codec_name?: string;
  duration?: string;
  nb_read_frames?: string;
  width?: number;
  height?: number;
};
type ProbeResult = { streams?: ProbeStream[]; format?: { duration?: string } };

async function probeWithFfprobe(file: string): Promise<{
  duration: number;
  formatDuration: number;
  video: ProbeStream;
  audio: ProbeStream | undefined;
  frames: number;
}> {
  const raw = await ffprobe([
    '-v',
    'error',
    '-count_frames',
    '-show_entries',
    'stream=codec_type,codec_name,duration,nb_read_frames,width,height:format=duration',
    '-of',
    'json',
    file
  ]);
  const parsed = JSON.parse(raw) as ProbeResult;
  const streams = parsed.streams ?? [];
  const video = streams.find((stream) => stream.codec_type === 'video') ?? {};
  const audio = streams.find((stream) => stream.codec_type === 'audio');
  return {
    duration: Number(video.duration ?? 0),
    formatDuration: Number(parsed.format?.duration ?? 0),
    video,
    audio,
    frames: Number(video.nb_read_frames ?? 0)
  };
}

async function renderScenes(projectId: string, durations: number[]): Promise<SceneRenderOutput[]> {
  const outputs: SceneRenderOutput[] = [];
  for (const [index, seconds] of durations.entries()) {
    outputs.push(
      await renderScene({
        projectId,
        artifactRoot: root,
        sceneKey: 'SCENE-00' + (index + 1),
        position: index + 1,
        title: 'Scene ' + (index + 1),
        description: 'Description de test duree ' + seconds + 's',
        brandName: 'Vululu Test',
        colorPrimary: '#6C5CE7',
        colorSecondary: '#00D2FF',
        version: 1
      })
    );
  }
  return outputs;
}

const oneFrame = 1 / MASTER_FRAME_RATE;

const cases: { name: string; durations: number[]; expected: number }[] = [
  { name: '1 scene de 3s', durations: [3], expected: 3 },
  { name: '2 scenes 2s + 3s', durations: [2, 3], expected: 5 },
  { name: '2 scenes 4s + 4s', durations: [4, 4], expected: 8 },
  { name: '3 scenes inegales 1s + 2.5s + 4s', durations: [1, 2.5, 4], expected: 7.5 },
  { name: '5 scenes de 2s (regression V0)', durations: [2, 2, 2, 2, 2], expected: 10 }
];

describe('Media FIX01 — duree reelle du master', () => {
  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('expose une tolerance de duree derivee du frame rate', () => {
    expect(MASTER_FRAME_RATE).toBe(30);
    expect(MASTER_DURATION_TOLERANCE_FRAMES).toBeLessThanOrEqual(2);
    expect(masterDurationTolerance()).toBeCloseTo(MASTER_DURATION_TOLERANCE_FRAMES / 30, 6);
    expect(masterDurationTolerance()).toBeLessThan(0.1);
  });

  for (const testCase of cases) {
    it(
      'produit un master de ' + testCase.expected + 's exact (' + testCase.name + ')',
      async () => {
        const projectId = 'fix01-' + testCase.durations.join('-');
        const scenes = await renderScenes(projectId, testCase.durations);
        const master = await assembleMaster({
          projectId,
          artifactRoot: root,
          version: 1,
          scenePaths: scenes.map((scene) => scene.absolutePath),
          sceneDurationsSeconds: testCase.durations
        });

        // 1) metadonnees retournees par le pipeline
        expect(master.expectedDurationSeconds).toBe(testCase.expected);
        expect(Math.abs(master.duration - testCase.expected)).toBeLessThanOrEqual(oneFrame);
        expect(master.videoCodec).toBe('h264');
        expect(master.audioCodec).toBe('aac');
        expect(master.width).toBe(1080);
        expect(master.height).toBe(1920);

        // 2) preuve independante : ffprobe + comptage d images reel
        const probed = await probeWithFfprobe(master.absolutePath);
        expect(probed.video.codec_name).toBe('h264');
        expect(probed.audio?.codec_name).toBe('aac');
        expect(probed.video.width).toBe(1080);
        expect(probed.video.height).toBe(1920);
        expect(Math.abs(probed.duration - testCase.expected)).toBeLessThanOrEqual(oneFrame);
        expect(probed.frames).toBe(Math.round(testCase.expected * MASTER_FRAME_RATE));
        expect(Math.abs(Number(probed.audio?.duration ?? 0) - testCase.expected)).toBeLessThanOrEqual(
          MASTER_DURATION_TOLERANCE_FRAMES / MASTER_FRAME_RATE
        );
        expect(Math.abs(probed.formatDuration - testCase.expected)).toBeLessThanOrEqual(oneFrame);

        // 3) le QA obligatoire valide ce master
        const qa = await runQa(scenes, master);
        expect(qa.status).toBe('PASS');
        const durationCheck = qa.checks.find((check) => check.name === 'master duration');
        expect(durationCheck?.status).toBe('PASS');
      },
      180000
    );
  }

  it('echoue le QA quand la duree reelle ne correspond pas (non-regression du trou de controle)', async () => {
    const durations = [1, 2.5, 4];
    const projectId = 'fix01-qa-duration';
    const scenes = await renderScenes(projectId, durations);
    const master = await assembleMaster({
      projectId,
      artifactRoot: root,
      version: 1,
      scenePaths: scenes.map((scene) => scene.absolutePath),
      sceneDurationsSeconds: durations
    });

    // Simule le master tronque historique : metadata tronquee, fichier reel intact.
    // Le QA doit refuser tout ecart superieur a la tolerance frame-aware.
    const truncated: MasterOutput = { ...master, duration: 4.5 };
    const qaTruncated = await runQa(scenes, truncated);
    expect(qaTruncated.status).toBe('FAIL');
    expect(qaTruncated.checks.find((check) => check.name === 'master duration')?.status).toBe('FAIL');

    const slightlyOff: MasterOutput = { ...master, duration: master.expectedDurationSeconds - 0.2 };
    const qaSlight = await runQa(scenes, slightlyOff);
    expect(qaSlight.status).toBe('FAIL');

    const wrongCodec: MasterOutput = { ...master, videoCodec: 'vp9' };
    expect((await runQa(scenes, wrongCodec)).checks.find((check) => check.name === 'master video codec')?.status).toBe('FAIL');

    const wrongDimensions: MasterOutput = { ...master, width: 1920, height: 1080 };
    expect((await runQa(scenes, wrongDimensions)).checks.find((check) => check.name === 'master dimensions')?.status).toBe('FAIL');

    const tamperedScenes = scenes.map((scene) => ({ ...scene }));
    tamperedScenes[1].checksum = '0'.repeat(64);
    expect((await runQa(tamperedScenes, master)).status).toBe('FAIL');
  });

  it('conserve le master precedent quand un nouveau rendu echoue', async () => {
    const projectId = 'fix01-history';
    const durations = [2, 3];
    const scenes = await renderScenes(projectId, durations);
    const v1 = await assembleMaster({
      projectId,
      artifactRoot: root,
      version: 1,
      scenePaths: scenes.map((scene) => scene.absolutePath),
      sceneDurationsSeconds: durations
    });
    const v1Checksum = v1.checksum;
    const v1Before = await probeWithFfprobe(v1.absolutePath);
    expect(Math.abs(v1Before.duration - 5)).toBeLessThanOrEqual(oneFrame);

    // Rendu invalide : la deuxieme scene est absente -> l assemblage echoue
    // pendant la preparation des images (aucune metadonnee simulee).
    const missing = path.join(root, projectId, 'scene-manquante.png');
    expect(fs.existsSync(missing)).toBe(false);

    await expect(
      assembleMaster({
        projectId,
        artifactRoot: root,
        version: 2,
        scenePaths: [scenes[0].absolutePath, missing],
        sceneDurationsSeconds: durations
      })
    ).rejects.toThrow(/ENOENT|Media command failed/);

    // Le master v1 reste intact, lisible et inchange.
    expect(fs.existsSync(v1.absolutePath)).toBe(true);
    const v1After = await probeWithFfprobe(v1.absolutePath);
    expect(Math.abs(v1After.duration - 5)).toBeLessThanOrEqual(oneFrame);
    const digest = (await import('node:crypto')).createHash('sha256').update(fs.readFileSync(v1.absolutePath)).digest('hex');
    expect(digest).toBe(v1Checksum);
    expect(v1After.frames).toBe(150);
  });

  it('preserve le chemin motion (scenes animes avec fondus) et sa duree', async () => {
    const projectId = 'fix01-motion';
    const durations = [2.5, 3.5];
    const scenes = await renderScenes(projectId, durations);
    const master = await assembleMaster({
      projectId,
      artifactRoot: root,
      version: 1,
      scenePaths: scenes.map((scene) => scene.absolutePath),
      sceneDurationsSeconds: durations,
      motion: {
        width: 1080,
        height: 1920,
        dip: true,
        clips: [undefined, undefined]
      }
    });

    const probed = await probeWithFfprobe(master.absolutePath);
    expect(probed.video.codec_name).toBe('h264');
    expect(probed.audio?.codec_name).toBe('aac');
    expect(Math.abs(probed.duration - 6)).toBeLessThanOrEqual(MASTER_DURATION_TOLERANCE_FRAMES / MASTER_FRAME_RATE);
    expect(Math.abs(probed.formatDuration - 6)).toBeLessThanOrEqual(MASTER_DURATION_TOLERANCE_FRAMES / MASTER_FRAME_RATE);
    expect((await runQa(scenes, master)).status).toBe('PASS');
  });
});
