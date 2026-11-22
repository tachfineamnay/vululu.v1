import type { CreativeSpec } from '@vululu/contracts';

/**
 * P09B — bornes audio de la timeline.
 * Le contrat serveur exige : `start <= 179.5`, une piste commence strictement avant la fin
 * de la vidéo, et un sous-titre se termine avant la durée totale. Ces helpers gardent la
 * composition locale valide quand une durée de scène change : sinon l'aperçu et
 * l'enregistrement échouent avec un message contractuel incompréhensible pour l'utilisateur.
 */

export const MAX_TRACK_START = 179.5;
export const MIN_CUE_WINDOW = 0.2;

const round3 = (value: number) => Math.round(value * 1000) / 1000;

/** Durée totale de la composition (secondes), la même que celle validée par le contrat. */
export function sceneTotalSeconds(spec: Pick<CreativeSpec, 'scenes'>): number {
  return round3(spec.scenes.reduce((sum, scene) => sum + scene.seconds, 0));
}

/**
 * Dernier début de piste admissible : une demi-seconde est réservée pour que la piste
 * commence réellement avant la fin de la vidéo.
 */
export function maxTrackStart(totalSeconds: number): number {
  return round3(Math.max(0, Math.min(MAX_TRACK_START, totalSeconds - 0.5)));
}

export type AudioTrim = {
  spec: CreativeSpec;
  /** Sous-titres retirés parce qu'ils ne tenaient plus dans la durée. */
  removedCues: number;
  /** Pistes dont le début a été ramené dans la nouvelle durée. */
  movedTracks: number;
};

/**
 * Ramène pistes et sous-titres dans la durée totale courante.
 * Renvoie la même référence quand rien ne change : aucun pas d'historique inutile.
 */
export function trimAudioToDuration(
  spec: CreativeSpec,
  totalSeconds = sceneTotalSeconds(spec)
): AudioTrim {
  const audio = spec.audio;
  if (!audio) return { spec, removedCues: 0, movedTracks: 0 };

  const limit = maxTrackStart(totalSeconds);
  let movedTracks = 0;
  let tracksChanged = false;
  const tracks = audio.tracks.map((track) => {
    if (track.start <= limit) return track;
    movedTracks += 1;
    tracksChanged = true;
    return { ...track, start: limit };
  });

  const subtitles = audio.subtitles;
  let removedCues = 0;
  let cuesChanged = false;
  const cues = (subtitles?.cues ?? []).flatMap((cue) => {
    // Un repère qui commence à la fin (ou après) ne peut plus être affiché : il est retiré
    // plutôt que déplacé en arrière, ce qui empilerait deux sous-titres au même instant.
    if (cue.start >= totalSeconds) {
      removedCues += 1;
      cuesChanged = true;
      return [];
    }
    const end = round3(Math.min(cue.end, totalSeconds));
    const start = round3(Math.max(0, Math.min(cue.start, end - 0.5)));
    if (end < 0.5 || end - start <= MIN_CUE_WINDOW) {
      removedCues += 1;
      cuesChanged = true;
      return [];
    }
    if (start === cue.start && end === cue.end) return [cue];
    cuesChanged = true;
    return [{ ...cue, start, end }];
  });

  if (!tracksChanged && !cuesChanged) return { spec, removedCues: 0, movedTracks: 0 };

  return {
    spec: {
      ...spec,
      audio: {
        tracks,
        ...(subtitles ? { subtitles: { ...subtitles, cues } } : {})
      }
    },
    removedCues,
    movedTracks
  };
}

/** Message utilisateur décrivant ce qui a été ajusté, ou chaîne vide. */
export function describeAudioTrim(trim: Pick<AudioTrim, 'removedCues' | 'movedTracks'>): string {
  const parts: string[] = [];
  if (trim.removedCues) parts.push(trim.removedCues + ' sous-titre(s) retiré(s)');
  if (trim.movedTracks) parts.push(trim.movedTracks + ' piste(s) ramenée(s) dans la durée');
  return parts.length
    ? 'Durée raccourcie : ' + parts.join(' · ') + ' pour garder la composition valide.'
    : '';
}
