import { clipCrop, encodeMotion } from './motion';
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

/**
 * Frequence de sortie imposee au master : 30 images/s constants.
 * FIX01 : le master est toujours encode en CFR 30 fps, y compris pour les
 * scenes fixes (le demuxer concat n emet qu une image par PNG).
 */
export const MASTER_FRAME_RATE = 30;

/** Tolerance de duree du master, exprimee en images (et non en secondes flottantes). */
export const MASTER_DURATION_TOLERANCE_FRAMES = 2;

/** Tolerance de duree derivee du frame rate du master (30 fps => environ 0.067 s). */
export function masterDurationTolerance(fps: number = MASTER_FRAME_RATE): number {
  if (!Number.isFinite(fps) || fps <= 0) return MASTER_DURATION_TOLERANCE_FRAMES / MASTER_FRAME_RATE;
  return MASTER_DURATION_TOLERANCE_FRAMES / fps;
}

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
  motion?: {
    width: number; height: number; dip: boolean; sceneDip?: boolean[];
    clips: ({ path: string; overlay: string; start: number; height: number } | undefined)[];
    audio?: { path: string; gain: number };
  };
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

/**
 * Tampon de sortie borné pour les processus média.
 *
 * FFmpeg peut écrire des heures de progression sur stderr : sans borne, un
 * rendu long accumule toute la sortie en mémoire. On conserve au plus
 * `STDIO_LIMIT_BYTES` (la fin, la plus utile pour diagnostiquer), et on signale
 * explicitement la troncature au lieu de croître indéfiniment.
 */
export const STDIO_LIMIT_BYTES = 1024 * 1024;

export type BoundedOutput = { text: string; truncated: boolean };

export function appendBounded(current: BoundedOutput, chunk: Buffer | string, limit = STDIO_LIMIT_BYTES): BoundedOutput {
  const combined = Buffer.concat([Buffer.from(current.text, 'utf8'), Buffer.from(chunk.toString(), 'utf8')]);
  if (combined.length <= limit) return { text: combined.toString('utf8'), truncated: current.truncated };
  return { text: combined.subarray(combined.length - limit).toString('utf8'), truncated: true };
}

function collect(child: ReturnType<typeof spawn>): {
  stdout: BoundedOutput;
  stderr: BoundedOutput;
  done: Promise<number>;
} {
  const stdout: BoundedOutput = { text: '', truncated: false };
  const stderr: BoundedOutput = { text: '', truncated: false };
  child.stdout?.on('data', (data: Buffer) => { Object.assign(stdout, appendBounded(stdout, data)); });
  child.stderr?.on('data', (data: Buffer) => { Object.assign(stderr, appendBounded(stderr, data)); });
  const done = new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
  return { stdout, stderr, done };
}

function run(exe: string, args: string[]): Promise<string> {
  const child = spawn(exe, args, { windowsHide: true });
  const { stdout, stderr, done } = collect(child);
  return done.then((code) => {
    if (code !== 0) {
      throw new Error('Media command failed with code ' + code + ': ' + stderr.text.slice(0, 2000) + (stderr.truncated ? ' [sortie tronquée]' : ''));
    }
    return stdout.text;
  });
}

function runCapture(exe: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  const child = spawn(exe, args, { windowsHide: true });
  const { stdout, stderr, done } = collect(child);
  return done.then(() => ({ stdout: stdout.text, stderr: stderr.text }));
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

export async function clipPoster(file: string, start: number, width: number, height: number, out: string) {
  await run(findFfmpeg(), ['-loglevel', 'error', '-y', '-ss', String(start), '-protocol_whitelist', 'file,pipe',
    '-i', file, '-vf', clipCrop(width, height), '-frames:v', '1', out]);
  return fsp.readFile(out);
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
  const file = path.join(masterDir, 'v' + input.version + '.mp4');
  const motion = input.motion;
  if (motion) {
    await encodeMotion(input, motion, frameDir, file, expectedDurationSeconds, args => run(findFfmpeg(), args));
  } else {
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
    // The concat demuxer needs a terminal frame to honor the final still's duration.
    concatLines.push("file '" + toPosix(path.join(frameDir, 'frame-' + input.scenePaths.length + '.png')) + "'");
    const concatPath = path.join(frameDir, 'concat.txt');
    await fsp.writeFile(concatPath, concatLines.join(String.fromCharCode(10)) + String.fromCharCode(10), 'utf8');
    // FIX01 : la duree demandee doit piloter la sortie, pas l inverse.
    // - le demuxer concat n emet qu une image par PNG (PTS espaces de 2 a 4 s) :
    //   sans normalisation, le flux video s arrete a la premiere image ;
    // - `-shortest` coupait la sortie des que le flux le plus court s arretait
    //   (anullsrc infini ou video tronquee), ce qui masquait la troncature ;
    // - `fps=30` + `-fps_mode cfr` repliquent chaque image fixe sur toute sa
    //   duree et produisent une video CFR de duree exacte ;
    // - le mapping explicite garantit une piste audio AAC silencieuse de meme
    //   duree et evite toute selection implicite de flux.
    await run(findFfmpeg(), [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatPath,
      '-f', 'lavfi',
      '-t', String(expectedDurationSeconds),
      '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-vf', 'fps=' + MASTER_FRAME_RATE + ',setsar=1',
      '-fps_mode', 'cfr',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-t', String(expectedDurationSeconds),
      '-movflags', '+faststart',
      file
    ]);
  }
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
  const durationTolerance = masterDurationTolerance(MASTER_FRAME_RATE);
  const durationDelta = Math.abs(master.duration - master.expectedDurationSeconds);
  checks.push({
    name: 'master duration',
    status: durationDelta <= durationTolerance ? 'PASS' : 'FAIL',
    detail:
      master.duration.toFixed(3) +
      's / attendu ' +
      master.expectedDurationSeconds +
      's / ecart ' +
      durationDelta.toFixed(3) +
      's / tolerance ' +
      durationTolerance.toFixed(3) +
      's (' +
      MASTER_DURATION_TOLERANCE_FRAMES +
      ' images a ' +
      MASTER_FRAME_RATE +
      ' fps)'
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

export { creativeFrame, draftThumbnail } from './creativeFrame';

/** Encode the already approved render as a single opaque photo for publishing APIs. */
export function publishingJpeg(png: Buffer) {
  return sharp(png, { limitInputPixels: 4_000_000, failOn: 'warning' })
    .flatten({ background: '#ffffff' }).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toBuffer();
}
