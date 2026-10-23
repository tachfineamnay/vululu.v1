import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import sharp from 'sharp';

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
};

export type SceneRenderOutput = {
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

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrap(value: string, maxChars: number): string[] {
  const words = value.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxChars && current.length > 0) {
      lines.push(current.trim());
      current = word;
    } else {
      current = (current + ' ' + word).trim();
    }
  }
  if (current.length > 0) {
    lines.push(current.trim());
  }
  return lines.slice(0, 4);
}

function normalizeColor(value: string, fallback: string): string {
  if (value.startsWith('#') && (value.length === 7 || value.length === 4)) {
    return value;
  }
  return fallback;
}

function svgForScene(input: SceneRenderInput): string {
  const primary = normalizeColor(input.colorPrimary, '#6C5CE7');
  const secondary = normalizeColor(input.colorSecondary, '#00D2FF');
  const accent = input.version > 1 ? secondary : primary;
  const titleLines = wrap(input.title, 22);
  const descLines = wrap(input.description, 34);
  const parts: string[] = [];
  parts.push('<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">');
  parts.push('<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="' + primary + '"/><stop offset="100%" stop-color="' + secondary + '"/></linearGradient></defs>');
  parts.push('<rect width="1080" height="1920" fill="#0B1020"/>');
  parts.push('<rect x="0" y="0" width="1080" height="1920" fill="url(#bg)" opacity="0.92"/>');
  parts.push('<circle cx="' + (input.version > 1 ? '860' : '180') + '" cy="260" r="300" fill="' + accent + '" opacity="0.22"/>');
  parts.push('<circle cx="760" cy="1560" r="420" fill="#ffffff" opacity="0.06"/>');
  parts.push('<rect x="72" y="72" width="936" height="1776" rx="40" fill="none" stroke="#ffffff" stroke-opacity="0.25" stroke-width="2"/>');
  parts.push('<text x="112" y="180" fill="#ffffff" font-family="Arial, sans-serif" font-size="32" letter-spacing="6">' + escapeXml(input.brandName.toUpperCase()) + '</text>');
  parts.push('<text x="112" y="250" fill="#ffffff" fill-opacity="0.7" font-family="Arial, sans-serif" font-size="26">' + escapeXml(input.sceneKey) + ' / SCENE ' + input.position + '</text>');
  let titleY = 760;
  for (const line of titleLines) {
    parts.push('<text x="112" y="' + titleY + '" fill="#ffffff" font-family="Arial, sans-serif" font-size="86" font-weight="700">' + escapeXml(line) + '</text>');
    titleY += 104;
  }
  let descY = titleY + 40;
  for (const line of descLines) {
    parts.push('<text x="112" y="' + descY + '" fill="#ffffff" fill-opacity="0.86" font-family="Arial, sans-serif" font-size="34">' + escapeXml(line) + '</text>');
    descY += 48;
  }
  parts.push('<rect x="112" y="1620" width="' + (input.version > 1 ? '420' : '320') + '" height="8" rx="4" fill="#ffffff" fill-opacity="0.8"/>');
  parts.push('<text x="112" y="1710" fill="#ffffff" fill-opacity="0.75" font-family="Arial, sans-serif" font-size="28">VULULU AI — V0</text>');
  if (input.version > 1) {
    parts.push('<text x="112" y="1760" fill="#ffffff" font-family="Arial, sans-serif" font-size="26">VERSION ' + input.version + '</text>');
  }
  parts.push('</svg>');
  return parts.join('');
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
  const projectDir = path.join(input.artifactRoot, input.projectId, 'scenes', input.sceneKey);
  await fsp.mkdir(projectDir, { recursive: true });
  const file = path.join(projectDir, 'v' + input.version + '.png');
  const svg = svgForScene(input);
  await sharp(Buffer.from(svg)).png().toFile(file);
  const metadata = await sharp(file).metadata();
  return {
    relativePath: toPosix(path.relative(input.artifactRoot, file)),
    absolutePath: file,
    checksum: sha256File(file),
    width: metadata.width || 0,
    height: metadata.height || 0
  };
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

export async function runQa(scenes: SceneRenderOutput[], master: MasterOutput): Promise<QaReport> {
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
    const dimensionsOk = width === 1080 && height === 1920;
    const checksumOk = readError === '' && scene.checksum !== '' && checksum === scene.checksum;
    checks.push({
      name: 'png ' + scene.relativePath,
      status: dimensionsOk && checksumOk ? 'PASS' : 'FAIL',
      detail: width + 'x' + height + ' / checksum ' + (checksumOk ? 'OK' : 'MISMATCH') + (readError ? ' / ' + readError : '')
    });
  }
  checks.push({
    name: 'master dimensions',
    status: master.width === 1080 && master.height === 1920 ? 'PASS' : 'FAIL',
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