import path from 'node:path';
import fsp from 'node:fs/promises';
import type { MasterInput } from './index';

/**
 * Recadrage d'un clip : couverture (remplir le cadre) ou contenance, avec un point de
 * mire vertical. Les valeurs par defaut reproduisent le cadrage centre historique.
 */
export function clipCrop(
  width: number,
  height: number,
  opts: { fit?: 'cover' | 'contain'; focusY?: number } = {}
) {
  const focus = Math.min(1, Math.max(0, opts.focusY ?? 0.5));
  if (opts.fit === 'contain')
    return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)*${focus},setsar=1`;
  return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}:(iw-${width})/2:(ih-${height})*${focus},setsar=1`;
}

/**
 * Encode chaque scene puis concatene. Les sous-titres sont fournis comme documents ASS
 * (pas comme chemins) : ils sont ecrits dans le dossier des parties et references par un
 * nom relatif, ce qui evite tout echappement de chemin Windows dans filter_complex.
 */
export async function encodeMotion(
  input: MasterInput,
  motion: NonNullable<MasterInput['motion']>,
  frameDir: string,
  file: string,
  expectedDurationSeconds: number,
  run: (args: string[], cwd?: string) => Promise<string>
) {
  // P12-07 — géométrie invalide = échec explicite avant FFmpeg : un clip sans hauteur exploitable
  // produisait sinon « Invalid too big or non positive size for width/height » côté encodeur.
  const even = (value: number) => Number.isInteger(value) && value >= 2 && value <= 4096 && value % 2 === 0;
  if (!even(motion.width) || !even(motion.height))
    throw new Error('media_motion_geometry_invalid: canvas non entier, impair ou hors bornes.');
  motion.clips.forEach((clip, index) => {
    if (clip && !even(clip.height))
      throw new Error('media_motion_geometry_invalid: hauteur de clip invalide pour la scène ' + (index + 1) + '.');
    if (clip && (!Number.isFinite(clip.start) || clip.start < 0))
      throw new Error('media_motion_geometry_invalid: point de départ de clip invalide pour la scène ' + (index + 1) + '.');
  });
  const list: string[] = [];
  for (const [i, image] of input.scenePaths.entries()) {
    const clip = motion.clips[i],
      seconds = input.sceneDurationsSeconds[i];
    const subtitle = motion.subtitles?.[i];
    // Un document ASS par scene : les reperes sont deja ramenes au temps local de la scene.
    if (subtitle) await fsp.writeFile(path.join(frameDir, `part-${i}.ass`), subtitle, 'utf8');
    const inputs = clip
      ? ['-ss', String(clip.start), '-protocol_whitelist', 'file,pipe', '-i', clip.path, '-i', clip.overlay]
      : ['-loop', '1', '-i', image];
    const filters =
      (clip
        ? `[0:v]${clipCrop(motion.width, clip.height, { fit: clip.fit, focusY: clip.focusY })},pad=${motion.width}:${motion.height}:0:0[b];[b][1:v]overlay=0:0,`
        : '[0:v]') +
      'fps=30,setsar=1' +
      (subtitle ? `,ass=filename=part-${i}.ass` : '') +
      ((motion.sceneDip?.[i] ?? motion.dip) ? `,fade=t=in:d=0.12,fade=t=out:st=${seconds - 0.12}:d=0.12` : '') +
      '[out]';
    await run(
      [
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
        motion.preset ?? 'veryfast',
        '-pix_fmt',
        'yuv420p',
        path.join(frameDir, `part-${i}.mp4`)
      ],
      frameDir
    );
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
