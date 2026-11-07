import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
import { composeScene } from './sceneComposition';
import { COMPOSITION_VERSION, validTextLayout, type SceneTextLayout } from './textLayout';
export { COMPOSITION_VERSION, type SceneTextLayout } from './textLayout';
export { inspectAsset, type AssetInspection } from './assetInspection';

export type SceneRenderInput = {
  projectId: string;
  artifactRoot: string;
  sceneKey: string;
  position: number;
  title: string;
  description: string;
  brandName: string;
  colorPrimary: string;
  colorSecondary: string;
  version: number;
  instruction?: string;
  width?: number;
  height?: number;
  visualStyle?: 'editorial' | 'minimal' | 'bold';
  direction?: string;
};

export type SceneRenderOutput = {
  textLayout?: SceneTextLayout;
  relativePath: string;
  absolutePath: string;
  checksum: string;
  width: number;
  height: number;
};

export type MasterInput = {
  projectId: string;
  artifactRoot: string;
  version: number;
  scenePaths: string[];
  sceneDurationsSeconds: number[];
};

export type MasterOutput = {
  relativePath: string;
  absolutePath: string;
  checksum: string;
  duration: number;
  expectedDurationSeconds: number;
  videoCodec: string;
  audioCodec: string;
  width: number;
  height: number;
};

export type QaCheck = {
  name: string;
  status: string;
  detail: string;
};

export type QaReport = {
  status: string;
  checks: QaCheck[];
};

function findFfmpeg(): string {
  const configured = process.env.FFMPEG_PATH;
  if (configured && fs.existsSync(configured)) {
    return configured;
  }
  throw new Error('FFMPEG_PATH requis: fournir un binaire FFmpeg complet (libx264, AAC, PNG).');
}

function sha256File(file: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}

function run(exe: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { windowsHide: true });
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
        reject(new Error('Media command failed with code ' + code + ': ' + stderr.slice(0, 2000)));
      }
    });
  });
}

function runCapture(exe: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    child.on('error', reject);
    child.on('close', () => {
      resolve({ stdout, stderr });
    });
  });
}

export async function renderScene(input: SceneRenderInput): Promise<SceneRenderOutput> {
  const width = input.width ?? 1080; const height = input.height ?? 1920;
  if (![width, height].every((n) => Number.isInteger(n) && n >= 64 && n <= 4096 && n % 2 === 0) || width * height > 16_000_000) throw new Error('Dimensions de rendu invalides.');
  const { background, blocks } = await composeScene(input, width, height);
  const pixels = await sharp(background).composite(blocks.map(({ input: data, left, top }) => ({ input: data, left, top }))).png().toBuffer();
  const checksum = crypto.createHash('sha256').update(pixels).digest('hex');
  const projectDir = path.join(input.artifactRoot, input.projectId, 'scenes', input.sceneKey);
  await fsp.mkdir(projectDir, { recursive: true });
  const file = path.join(projectDir, 'v' + input.version + '.png');
  try { await fsp.writeFile(file, pixels, { flag: 'wx' }); }
  catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') || sha256File(file) !== checksum) throw new Error('Conflit de fichier immuable de scène.', { cause: error });
  }
  return { relativePath: toPosix(path.relative(input.artifactRoot, file)), absolutePath: file, checksum, width, height,
    textLayout: { compositionVersion: COMPOSITION_VERSION, complete: true, artifactSha256: checksum, width, height, boxes: blocks.map((block) => block.box) } };
}

async function probe(file: string): Promise<{ duration: number; videoCodec: string; audioCodec: string; width: number; height: number }> {
  const result = await runCapture(findFfmpeg(), ['-hide_banner', '-i', file]);
  const text = result.stdout + String.fromCharCode(10) + result.stderr;
  const lines = text.split(String.fromCharCode(10));
  const durationMatch = text.match(/Duration: ([0-9]+):([0-9]+):([0-9]+)[.]([0-9]+)/);
  let duration = 0;
  if (durationMatch) {
    duration = Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3]) + Number('0.' + durationMatch[4]);
  }
  const videoLine = lines.find((line) => line.includes('Video:'));
  const audioLine = lines.find((line) => line.includes('Audio:'));
  const dimensionMatch = videoLine ? videoLine.match(/[0-9]{3,4}x[0-9]{3,4}/) : null;
  let width = 0;
  let height = 0;
  if (dimensionMatch) {
    const parts = dimensionMatch[0].split('x');
    width = Number(parts[0]);
    height = Number(parts[1]);
  }
  return {
    duration,
    videoCodec: videoLine && videoLine.includes('h264') ? 'h264' : '',
    audioCodec: audioLine && audioLine.includes('aac') ? 'aac' : '',
    width,
    height
  };
}

export async function assembleMaster(input: MasterInput): Promise<MasterOutput> {
  if (input.scenePaths.length === 0) {
    throw new Error('Au moins une scene est requise pour le master.');
  }
  if (input.scenePaths.length !== input.sceneDurationsSeconds.length) {
    throw new Error('Chaque scene doit avoir une duree.');
  }
  const expectedDurationSeconds = input.sceneDurationsSeconds.reduce((sum, value) => sum + value, 0);
  const masterDir = path.join(input.artifactRoot, input.projectId, 'master');
  const frameDir = path.join(masterDir, 'v' + input.version + '-frames');
  await fsp.mkdir(frameDir, { recursive: true });
  for (let index = 0; index < input.scenePaths.length; index += 1) {
    const target = path.join(frameDir, 'frame-' + (index + 1) + '.png');
    await fsp.copyFile(input.scenePaths[index], target);
  }
  const concatLines: string[] = [];
  for (let index = 0; index < input.scenePaths.length; index += 1) {
    const frame = path.join(frameDir, 'frame-' + (index + 1) + '.png');
    concatLines.push("file '" + toPosix(frame) + "'");
    concatLines.push('duration ' + input.sceneDurationsSeconds[index]);
  }
  const concatPath = path.join(frameDir, 'concat.txt');
  await fsp.writeFile(concatPath, concatLines.join(String.fromCharCode(10)) + String.fromCharCode(10), 'utf8');
  const file = path.join(masterDir, 'v' + input.version + '.mp4');
  await run(findFfmpeg(), [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', concatPath,
    '-f', 'lavfi',
    '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-r', '30',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-shortest',
    file
  ]);
  const meta = await probe(file);
  return {
    relativePath: toPosix(path.relative(input.artifactRoot, file)),
    absolutePath: file,
    checksum: sha256File(file),
    duration: meta.duration,
    expectedDurationSeconds,
    videoCodec: meta.videoCodec,
    audioCodec: meta.audioCodec,
    width: meta.width,
    height: meta.height
  };
}

export async function runQa(scenes: SceneRenderOutput[], master: MasterOutput, expectedDimensions = { width: 1080, height: 1920 }): Promise<QaReport> {
  const checks: QaCheck[] = [];
  for (const scene of scenes) {
    let width = scene.width;
    let height = scene.height;
    let checksum = '';
    let readError = '';
    try {
      const metadata = await sharp(scene.absolutePath).metadata();
      width = metadata.width || 0;
      height = metadata.height || 0;
      checksum = sha256File(scene.absolutePath);
    } catch (error) {
      readError = error instanceof Error ? error.message : 'lecture impossible';
    }
    const dimensionsOk = width === expectedDimensions.width && height === expectedDimensions.height;
    const checksumOk = readError === '' && scene.checksum !== '' && checksum === scene.checksum;
    checks.push({ name: 'text layout ' + scene.relativePath, status: checksumOk && validTextLayout(scene.textLayout, checksum, width, height) ? 'PASS' : 'FAIL', detail: 'Composition complète, zones lisibles et provenance du PNG.' });
    checks.push({
      name: 'png ' + scene.relativePath,
      status: dimensionsOk && checksumOk ? 'PASS' : 'FAIL',
      detail: width + 'x' + height + ' / checksum ' + (checksumOk ? 'OK' : 'MISMATCH') + (readError ? ' / ' + readError : '')
    });
  }
  checks.push({
    name: 'master dimensions',
    status: master.width === expectedDimensions.width && master.height === expectedDimensions.height ? 'PASS' : 'FAIL',
    detail: master.width + 'x' + master.height
  });
  checks.push({
    name: 'master duration',
    status: Math.abs(master.duration - master.expectedDurationSeconds) <= 0.75 ? 'PASS' : 'FAIL',
    detail: master.duration.toFixed(2) + 's / attendu ' + master.expectedDurationSeconds + 's'
  });
  checks.push({
    name: 'master video codec',
    status: master.videoCodec === 'h264' ? 'PASS' : 'FAIL',
    detail: master.videoCodec
  });
  checks.push({
    name: 'master audio codec',
    status: master.audioCodec === 'aac' ? 'PASS' : 'FAIL',
    detail: master.audioCodec
  });
  let masterChecksum: string;
  try {
    masterChecksum = sha256File(master.absolutePath);
  } catch {
    masterChecksum = '';
  }
  checks.push({
    name: 'master checksum',
    status: masterChecksum !== '' && masterChecksum === master.checksum ? 'PASS' : 'FAIL',
    detail: masterChecksum === '' ? 'fichier illisible' : masterChecksum === master.checksum ? 'OK' : 'MISMATCH'
  });
  return {
    status: checks.every((check) => check.status === 'PASS') ? 'PASS' : 'FAIL',
    checks
  };
}
