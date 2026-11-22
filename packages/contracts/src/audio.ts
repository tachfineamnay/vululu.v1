import { z } from 'zod';

/**
 * P09B — contrats audio de l'atelier.
 * Aucune URL, aucun chemin, aucun identifiant fournisseur : uniquement des versions
 * d'assets contrôlées, des pistes, des sous-titres et des demandes d'outil bornées.
 */

/** Langues réellement proposées par les fournisseurs configurés (liste fermée). */
export const audioLanguage = z.enum(['fr-FR', 'en-US', 'es-ES', 'de-DE', 'ar-MA', 'pt-BR']);
export type AudioLanguage = z.infer<typeof audioLanguage>;

const hex = z.string().regex(/^#[0-9a-f]{6}$/i);
const unit = z.number().min(0).max(1);
const mediaId = z.string().min(1).max(128);
/** Identifiant de voix fournisseur : forme stricte, liste blanche côté serveur. */
export const voiceId = z.string().regex(/^[A-Za-z][A-Za-z0-9-]{2,40}$/);

export const audioTrackKind = z.enum(['voiceover', 'music', 'sfx']);
export type AudioTrackKind = z.infer<typeof audioTrackKind>;

/** Piste audio placée sur la timeline du master (origine = début de la vidéo). */
export const audioTrack = z.strictObject({
  id: z.uuid(),
  kind: audioTrackKind,
  versionId: mediaId,
  /** Début sur la timeline, en secondes. */
  start: z.number().min(0).max(179.5),
  /** Volume linéaire 0..1 (1 = source inchangée). */
  gain: unit,
  fadeIn: z.number().min(0).max(3).default(0),
  fadeOut: z.number().min(0).max(3).default(0),
  /** Atténuation automatique des musiques sous une voix off (mixage local FFmpeg). */
  ducking: z.boolean().optional()
});
export type AudioTrack = z.infer<typeof audioTrack>;

/** Sous-titre horodaté sur la timeline ; le texte ne peut pas injecter de balises ASS. */
export const subtitleCue = z
  .strictObject({
    start: z.number().min(0).max(179.5),
    end: z.number().min(0.5).max(180),
    // eslint-disable-next-line no-control-regex -- Refus explicite des contrôles et des balises ASS.
    text: z.string().trim().min(1).max(200).refine((value) => !/[\\{}]|[\u0000-\u001f\u007f]/.test(value),
      'Texte de sous-titre non pris en charge (accolades, barres obliques inverses ou caractères de contrôle).')
  })
  .refine((cue) => cue.end > cue.start + 0.2, { message: 'La fin du sous-titre doit suivre son début.', path: ['end'] });
export type SubtitleCue = z.infer<typeof subtitleCue>;

export const subtitleStyle = z.strictObject({
  size: z.int().min(12).max(96),
  color: hex,
  background: hex.optional(),
  opacity: unit,
  position: z.enum(['bottom', 'center', 'top']),
  align: z.enum(['left', 'center', 'right']),
  bold: z.boolean()
});
export type SubtitleStyle = z.infer<typeof subtitleStyle>;

/** Style appliqué quand la composition n'en fournit pas (ancienne révision, import). */
export const defaultSubtitleStyle: SubtitleStyle = {
  size: 42,
  color: '#ffffff',
  opacity: 1,
  position: 'bottom',
  align: 'center',
  bold: false
};

export const audioSpec = z.strictObject({
  tracks: z.array(audioTrack).max(4).default([]),
  subtitles: z
    .strictObject({
      enabled: z.boolean().default(false),
      language: audioLanguage.default('fr-FR'),
      cues: z.array(subtitleCue).max(200).default([]),
      style: subtitleStyle.optional()
    })
    .optional()
});
export type AudioSpec = z.infer<typeof audioSpec>;

/** Transcription : ressource audio confirmée de la marque, langue demandée, droits attestés. */
export const audioTranscribeRequest = z.strictObject({
  requestId: z.uuid(),
  revision: z.int().positive(),
  sourceVersionId: mediaId,
  language: audioLanguage,
  rightsConfirmed: z.literal(true)
});
export type AudioTranscribeRequest = z.infer<typeof audioTranscribeRequest>;

/** Synthèse vocale : texte fourni par l'utilisateur, voix du catalogue fournisseur. */
export const audioTtsRequest = z.strictObject({
  requestId: z.uuid(),
  revision: z.int().positive(),
  text: z.string().trim().min(1).max(1200),
  language: audioLanguage,
  voice: voiceId,
  rightsConfirmed: z.literal(true)
});
export type AudioTtsRequest = z.infer<typeof audioTtsRequest>;

/** Application d'une transcription : remplace ou complète les sous-titres existants. */
export const audioTranscribeApply = z.strictObject({
  expectedRevision: z.int().positive(),
  mode: z.enum(['replace', 'append']).default('replace')
});
export type AudioTranscribeApply = z.infer<typeof audioTranscribeApply>;

/** Application d'une voix off : nouvelle piste de la timeline (jamais un écrasement). */
export const audioTtsApply = z.strictObject({
  expectedRevision: z.int().positive(),
  start: z.number().min(0).max(179.5).default(0),
  gain: unit.default(0.9)
});
export type AudioTtsApply = z.infer<typeof audioTtsApply>;

export const transcriptionSegment = z.strictObject({
  start: z.number().min(0).max(180),
  end: z.number().min(0).max(180),
  text: z.string().trim().min(1).max(200)
});
export type TranscriptionSegment = z.infer<typeof transcriptionSegment>;

/** Sortie normalisée d'un fournisseur de transcription (validée avant stockage). */
export const transcriptionResult = z.strictObject({
  language: audioLanguage,
  segments: z.array(transcriptionSegment).max(200),
  provider: z.string().min(1).max(80),
  model: z.string().min(1).max(120)
});
export type TranscriptionResult = z.infer<typeof transcriptionResult>;
