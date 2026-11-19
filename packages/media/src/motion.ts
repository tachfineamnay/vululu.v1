import path from 'node:path';
import fsp from 'node:fs/promises';
import type { MasterInput } from './index';
export function clipCrop(width: number, height: number) {
  return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1`;
}
export async function encodeMotion(
  input: MasterInput,
  motion: NonNullable<MasterInput['motion']>,
  frameDir: string,
  file: string,
  expectedDurationSeconds: number,
  run: (args: string[]) => Promise<string>
) {
  const list: string[] = [];
  for (const [i, image] of input.scenePaths.entries()) {
    const clip = motion.clips[i],
      seconds = input.sceneDurationsSeconds[i];
    const inputs = clip
      ? ['-ss', String(clip.start), '-protocol_whitelist', 'file,pipe', '-i', clip.path, '-i', clip.overlay]
      : ['-loop', '1', '-i', image];
    const filters =
      (clip
        ? `[0:v]${clipCrop(motion.width, clip.height)},pad=${motion.width}:${motion.height}:0:0[b];[b][1:v]overlay=0:0,`
        : '[0:v]') +
      'fps=30,setsar=1' +
      (motion.dip ? `,fade=t=in:d=0.12,fade=t=out:st=${seconds - 0.12}:d=0.12` : '') +
      '[out]';
    await run([
      '-loglevel',
      'error',
      '-y',
      ...inputs,
      '-filter_complex_threads',
      '2',
      '-filter_complex',
      filters,
      '-map',
      '[out]',
      '-t',
      String(seconds),
      '-an',
      '-threads',
      '2',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-pix_fmt',
      'yuv420p',
      path.join(frameDir, `part-${i}.mp4`)
    ]);
    list.push(`file 'part-${i}.mp4'`);
  }
  const concat = path.join(frameDir, 'parts.txt');
  await fsp.writeFile(concat, list.join('\n'));
  await run([
    '-loglevel',
    'error',
    '-y',
    '-f',
    'concat',
    '-safe',
    '1',
    '-i',
    concat,
    ...(motion.audio
      ? ['-protocol_whitelist', 'file,pipe', '-i', motion.audio.path, '-af', `volume=${motion.audio.gain},apad`]
      : ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo']),
    '-map',
    '0:v',
    '-map',
    '1:a',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-t',
    String(expectedDurationSeconds),
    '-movflags',
    '+faststart',
    file
  ]);
}
