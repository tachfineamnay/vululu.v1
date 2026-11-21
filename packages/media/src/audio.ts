import type { SubtitleCue, SubtitleStyle } from '@vululu/contracts';

/**
 * P09B — audio déterministe : mixage FFmpeg, sous-titres ASS/SRT, extraction M4A et
 * normalisation d'entrée ASR. Aucune invention : chaque fonction produit soit des
 * arguments FFmpeg vérifiables, soit un fichier réellement encodé.
 */

export type MediaRun = (args: string[]) => Promise<string>;

export type AudioMixTrack = {
  path: string;
  kind: 'voiceover' | 'music' | 'sfx';
  gain: number;
  start: number;
  fadeIn?: number;
  fadeOut?: number;
  ducking?: boolean;
};

const fixed = (value: number, digits = 3) => Math.max(0, value).toFixed(digits);

/**
 * Filtre de mixage : trim borné à la durée du master, gain linéaire, fondus, décalage
 * timeline, bus voix et bus musique; le bus musique est atténué par sidechaincompress
 * quand une voix off et le ducking sont présents. Sortie PCM 48 kHz stéréo.
 */
export function buildMixArgs(tracks: AudioMixTrack[], durationSeconds: number, out: string): string[] {
  if (!tracks.length) throw new Error('audio_tracks_required');
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error('audio_duration_invalid');
  const input: string[] = [];
  const filters: string[] = [];
  const voices: string[] = [];
  const beds: string[] = [];
  let ducking = false;
  tracks.forEach((track, index) => {
    input.push('-i', track.path);
    const start = Math.min(Math.max(0, track.start), Math.max(0, durationSeconds - 0.1));
    const length = Math.max(0.1, durationSeconds - start);
    const chain = [`atrim=0:${fixed(length)}`, 'asetpts=PTS-STARTPTS', `volume=${fixed(track.gain)}`];
    if (track.fadeIn && track.fadeIn > 0) chain.push(`afade=t=in:st=0:d=${fixed(Math.min(track.fadeIn, length))}`);
    if (track.fadeOut && track.fadeOut > 0)
      chain.push(`afade=t=out:st=${fixed(Math.max(0, length - track.fadeOut))}:d=${fixed(Math.min(track.fadeOut, length))}`);
    chain.push(`adelay=${Math.round(start * 1000)}|${Math.round(start * 1000)}`);
    filters.push(`[${index}:a]${chain.join(',')}[t${index}]`);
    if (track.kind === 'voiceover') voices.push(`[t${index}]`);
    else {
      beds.push(`[t${index}]`);
      if (track.ducking) ducking = true;
    }
  });
  const bus = (labels: string[], name: string) => {
    if (labels.length === 1) filters.push(`${labels[0]}anull[${name}]`);
    else filters.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0:dropout_transition=0[${name}]`);
    return `[${name}]`;
  };
  if (voices.length && beds.length) {
    const voice = bus(voices, 'voicebus');
    const bed = bus(beds, 'musicbus');
    if (ducking) {
      filters.push(`${voice}asplit=2[voiceMix][voiceSide]`);
      filters.push(`${bed}[voiceSide]sidechaincompress=threshold=0.05:ratio=8:attack=20:release=300[musicDucked]`);
      filters.push('[voiceMix][musicDucked]amix=inputs=2:normalize=0:dropout_transition=0[aout]');
    } else filters.push(`${voice}${bed}amix=inputs=2:normalize=0:dropout_transition=0[aout]`);
  } else if (voices.length) filters.push(`${bus(voices, 'voicebus')}anull[aout]`);
  else filters.push(`${bus(beds, 'musicbus')}anull[aout]`);
  return [
    '-loglevel', 'error', '-y', ...input,
    '-filter_complex', filters.join(';'),
    '-map', '[aout]',
    '-t', fixed(durationSeconds),
    '-ar', '48000',
    '-ac', '2',
    '-c:a', 'pcm_s16le',
    out
  ];
}

export async function mixTracks(input: {
  tracks: AudioMixTrack[];
  durationSeconds: number;
  out: string;
  run: MediaRun;
}): Promise<{ out: string; tracks: number }> {
  await input.run(buildMixArgs(input.tracks, input.durationSeconds, input.out));
  return { out: input.out, tracks: input.tracks.length };
}

const assClock = (seconds: number) => {
  const centis = Math.max(0, Math.round(seconds * 100));
  const hours = Math.floor(centis / 360000);
  const minutes = Math.floor(centis / 6000) % 60;
  const secs = Math.floor(centis / 100) % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centis % 100).padStart(2, '0')}`;
};

/** Couleur ASS &HAABBGGRR (alpha inversé), jamais une couleur inventée hors contrat. */
const assColour = (hex: string, opacity = 1) => {
  const value = hex.replace('#', '');
  const r = value.slice(0, 2).toUpperCase();
  const g = value.slice(2, 4).toUpperCase();
  const b = value.slice(4, 6).toUpperCase();
  const a = Math.round((1 - Math.min(1, Math.max(0, opacity))) * 255).toString(16).padStart(2, '0').toUpperCase();
  return `&H${a}${b}${g}${r}`;
};

const alignment = (position: SubtitleStyle['position'], align: SubtitleStyle['align']) => {
  const row = position === 'top' ? 7 : position === 'center' ? 4 : 1;
  return row + (align === 'left' ? 0 : align === 'center' ? 1 : 2);
};

/**
 * Sous-titres ASS d'une scène : les repères sont ramenés au temps local de la scène
 * (le filtre ass s'applique à chaque partie vidéo). Le texte est déjà validé sans
 * accolades, barres obliques inverses ni caractères de contrôle.
 */
export function buildAssText(input: {
  cues: SubtitleCue[];
  style: SubtitleStyle;
  width: number;
  height: number;
  safeArea: number;
  sceneStart: number;
  sceneEnd: number;
}): string {
  const { style } = input;
  const span = Math.max(0.1, input.sceneEnd - input.sceneStart);
  const margin = Math.round(input.safeArea * input.width);
  const marginV = Math.round(input.safeArea * input.height + style.size * 0.6);
  // Style purement positionnel (aucune ambiguïté de parsing libass) :
  // BorderStyle 3 = cartouche opaque, 1 = contour simple.
  const borderStyle = style.background ? 3 : 1;
  const outline = style.background ? 10 : 2;
  const outlineColour = style.background ? assColour(style.background) : '&H80000000';
  const lines = input.cues
    .map((cue) => {
      const start = Math.max(0, cue.start - input.sceneStart);
      const end = Math.min(span, cue.end - input.sceneStart);
      return { start, end, text: cue.text };
    })
    .filter((cue) => cue.end - cue.start >= 0.2)
    .sort((left, right) => left.start - right.start);
  if (!lines.length) return '';
  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${input.width}`,
    `PlayResY: ${input.height}`,
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,Arial,${style.size},${assColour(style.color, style.opacity)},&H000000FF,${outlineColour},${outlineColour},${style.bold ? -1 : 0},0,0,0,100,100,0,0,${borderStyle},${outline},0,${alignment(style.position, style.align)},${margin},${margin},${marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...lines.map((cue) => `Dialogue: 0,${assClock(cue.start)},${assClock(cue.end)},Default,,0,0,0,,${cue.text}`),
    ''
  ].join('\n');
}

/** SRT lisible par les lecteurs vidéo et les plateformes (horodatage absolu). */
export function buildSrtText(cues: SubtitleCue[]): string {
  const srtClock = (seconds: number) => {
    const millis = Math.max(0, Math.round(seconds * 1000));
    const hours = Math.floor(millis / 3600000);
    const minutes = Math.floor(millis / 60000) % 60;
    const secs = Math.floor(millis / 1000) % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis % 1000).padStart(3, '0')}`;
  };
  return [...cues]
    .sort((left, right) => left.start - right.start)
    .map((cue, index) => `${index + 1}\n${srtClock(cue.start)} --> ${srtClock(cue.end)}\n${cue.text}\n`)
    .join('\n');
}

/** Extraction de la piste audio du master approuvé, sans réencodage (AAC/M4A). */
export function buildAudioExportArgs(master: string, out: string): string[] {
  return ['-loglevel', 'error', '-y', '-i', master, '-vn', '-map', '0:a:0', '-c:a', 'copy', '-movflags', '+faststart', out];
}

/** Entrée ASR normalisée : mono 16 kHz PCM, bornée à la durée de la vidéo. */
export function buildAsrNormalizeArgs(input: string, out: string, maxSeconds: number): string[] {
  return [
    '-loglevel', 'error', '-y', '-i', input,
    '-t', fixed(Math.max(0.5, maxSeconds)),
    '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', out
  ];
}

export async function extractAudio(input: { master: string; out: string; run: MediaRun }): Promise<string> {
  await input.run(buildAudioExportArgs(input.master, input.out));
  return input.out;
}

export async function normalizeForAsr(input: {
  source: string;
  out: string;
  maxSeconds: number;
  run: MediaRun;
}): Promise<string> {
  await input.run(buildAsrNormalizeArgs(input.source, input.out, input.maxSeconds));
  return input.out;
}
