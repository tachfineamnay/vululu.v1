import type { CreativeSpec, SubtitleCue } from '@vululu/contracts';

/**
 * P09B — règles locales des sous-titres, alignées sur `subtitleCue` du contrat serveur :
 * `0 <= start <= 179.5`, `0.5 <= end <= 180`, `end > start + 0.2`, texte non vide.
 * Les helpers gardent une composition valide à chaque frappe au lieu de laisser la
 * sauvegarde échouer sur une erreur de contrat.
 */

export type Subtitles = NonNullable<NonNullable<CreativeSpec['audio']>['subtitles']>;

export const MAX_CUES = 200;
export const MAX_CUE_TEXT = 200;
export const MAX_CUE_START = 179.5;
export const MAX_CUE_END = 180;
export const MIN_CUE_WINDOW = 0.2;
/** Texte proposé à la création : jamais un sous-titre vide, le contrat refuse `min(1)`. */
export const CUE_PLACEHOLDER = 'Sous-titre';

const round = (value: number, digits = 3) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/** Une fin de sous-titre ne peut pas dépasser la durée réelle de la vidéo. */
export function cueEndLimit(totalSeconds: number): number {
  return round(Math.min(MAX_CUE_END, totalSeconds));
}

/**
 * Applique une nouvelle valeur à `start` ou `end` en ajustant l'autre borne si nécessaire.
 * Le résultat respecte toujours la fenêtre minimale du contrat.
 */
export function setCueTime(
  cue: SubtitleCue,
  key: 'start' | 'end',
  value: number,
  totalSeconds: number
): SubtitleCue {
  const endLimit = cueEndLimit(totalSeconds);
  const safeEnd = Math.max(0.5, endLimit);
  if (!Number.isFinite(value)) return cue;
  if (key === 'start') {
    const start = round(Math.max(0, Math.min(value, Math.min(MAX_CUE_START, safeEnd - 0.3))));
    const end = cue.end > start + MIN_CUE_WINDOW ? round(Math.min(cue.end, safeEnd)) : round(Math.min(safeEnd, start + 0.5));
    return { ...cue, start, end };
  }
  const end = round(Math.max(0.5, Math.min(value, safeEnd)));
  const start =
    cue.start < end - MIN_CUE_WINDOW ? round(Math.min(cue.start, MAX_CUE_START)) : round(Math.max(0, Math.min(end - 0.5, MAX_CUE_START)));
  return { ...cue, start, end };
}

/**
 * Ajoute un sous-titre après le dernier repère existant. `null` quand la durée restante
 * ne permet pas une fenêtre exploitable : l'appelant affiche alors un message explicite.
 */
export function appendCue(cues: SubtitleCue[], totalSeconds: number): SubtitleCue[] | null {
  if (cues.length >= MAX_CUES) return null;
  const endLimit = cueEndLimit(totalSeconds);
  // Premier créneau libre d'au moins 0,5 s : les repères ne se chevauchent jamais.
  let cursor = 0;
  let slot: { start: number; limit: number } | null = null;
  for (const cue of [...cues].sort((left, right) => left.start - right.start)) {
    if (cue.start - cursor >= 0.5) {
      slot = { start: cursor, limit: cue.start };
      break;
    }
    cursor = Math.max(cursor, cue.end);
  }
  if (!slot && endLimit - cursor >= 0.5) slot = { start: cursor, limit: endLimit };
  if (!slot) return null;
  const start = round(Math.max(0, slot.start));
  const end = round(Math.min(slot.limit, start + 2));
  if (end - start <= MIN_CUE_WINDOW) return null;
  return [...cues, { start, end, text: CUE_PLACEHOLDER }];
}
