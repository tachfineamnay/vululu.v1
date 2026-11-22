import { z } from 'zod';
import { platformSchema } from './channels';
import { audioSpec } from './audio';
export const outputKind = z.enum(['square', 'portrait', 'story', 'carousel', 'short', 'landscape']);
export type OutputKind = z.infer<typeof outputKind>;
export const outputSize: Record<OutputKind, [number, number]> = {
  square: [1080, 1080],
  portrait: [1080, 1350],
  story: [1080, 1920],
  carousel: [1080, 1350],
  short: [1080, 1920],
  /** P09A — vidéo multiscène paysage (LinkedIn notamment) ; même pipeline MP4 que la vidéo courte. */
  landscape: [1920, 1080]
};
/** Sorties vidéo : seules elles acceptent clips, transitions, audio et sous-titres. */
export const isVideoOutput = (kind?: OutputKind): boolean => kind === 'short' || kind === 'landscape';
const mediaId = z.string().min(1).max(128);
const delivery = z.object({
  kind: outputKind,
  platform: platformSchema,
  calendar: z.object({ itemId: z.uuid(), version: z.int().positive() }).optional(),
  transition: z.enum(['cut', 'dip']).optional(),
  audio: z.object({ versionId: mediaId, gain: z.number().min(0).max(1) }).optional()
});

// Normalized layer boxes; text must stay inside the canvas safe area. Array order is paint order.
const unit = z.number().min(0).max(1);
const box = { x: unit, y: unit, w: unit.min(0.01), h: unit.min(0.01), opacity: unit };
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const sceneKey = z.string().regex(/^SCENE-\d{3,8}$/);
export const creativeLayer = z.discriminatedUnion('type', [
  z.object({
    ...box,
    type: z.literal('image'),
    versionId: z.string().min(1).max(128),
    fit: z.enum(['cover', 'contain']),
    gravity: z.enum(['centre', 'north', 'south', 'east', 'west']),
    /** Cadrage manuel : zoom 1 = plein cadre, point de mire normalisé. */
    crop: z.object({ zoom: z.number().min(1).max(4), focusX: unit, focusY: unit }).optional()
  }),
  z.object({
    ...box,
    type: z.literal('text'),
    plate: color.optional(),
    minSize: z.int().min(12).max(240).optional(),
    role: z.enum(['headline', 'body', 'cta']),
    text: z.string().trim().min(1).max(2000),
    size: z.int().min(10).max(240),
    bold: z.boolean(),
    family: z.enum(['sans', 'serif', 'monospace']).optional(),
    color,
    /** Alignement horizontal du bloc de texte dans sa boîte. */
    align: z.enum(['left', 'center', 'right']).optional(),
    /** Interligne du texte, en points (0 = interligne de la police). */
    spacing: z.int().min(0).max(200).optional()
  })
]);
export const creativeSpec = z
  .object({
    schemaVersion: z.literal(1),
    delivery: delivery.optional(),
    /** P09B — pistes audio et sous-titres de la timeline vidéo (jamais pour une image). */
    audio: audioSpec.optional(),
    width: z.int().min(320).max(1920).multipleOf(2),
    height: z.int().min(320).max(1920).multipleOf(2),
    brand: z.object({ background: color, accent: color }),
    safeArea: unit.max(0.2),
    scenes: z
      .array(
        z.object({
          key: sceneKey,
          background: color.optional(),
          transition: z.enum(['cut', 'dip']).optional(),
          seconds: z.number().min(0.5).max(30).multipleOf(0.5),
          clip: z
            .object({
              versionId: mediaId,
              start: z.number().min(0).max(600),
              height: unit.min(0.1),
              /** Cadrage : remplir le cadre (cover) ou contenir le clip (contain). Défaut = cover centré. */
              fit: z.enum(['cover', 'contain']).optional(),
              /** Point de mire vertical du recadrage, 0 = haut, 0.5 = centre, 1 = bas. */
              focusY: unit.optional()
            })
            .optional(),
          layers: z.array(creativeLayer).min(1).max(16)
        })
      )
      .min(1)
  })
  .superRefine((s, ctx) => {
    const invalid = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (new Set(s.scenes.map((v) => v.key)).size !== s.scenes.length)
      invalid('Identifiants de scène répétés.');
    if (s.scenes.reduce((n, v) => n + v.seconds, 0) > 180) invalid('Durée totale maximale : 180 secondes.');
    if (s.delivery) {
      const [w, h] = outputSize[s.delivery.kind];
      if (s.width !== w || s.height !== h) invalid('Dimensions incompatibles avec le format.');
      if (
        !isVideoOutput(s.delivery.kind) &&
        (s.delivery.audio || s.delivery.transition || s.scenes.some((scene) => scene.clip))
      )
        invalid('Audio et clips nécessitent une vidéo.');
      if (!isVideoOutput(s.delivery.kind) && s.delivery.kind !== 'carousel' && s.scenes.length !== 1)
        invalid('Une seule image par publication.');
    } else if (s.scenes.some((scene) => scene.clip)) invalid('Sélectionnez le format vidéo.');
    for (const scene of s.scenes)
      if (scene.transition && !(s.delivery && isVideoOutput(s.delivery.kind)))
        invalid('Transition réservée à la vidéo.');
    for (const scene of s.scenes)
      for (const l of scene.layers) {
        if (l.type === 'text' && l.minSize && l.minSize > l.size)
          invalid('Corps minimal supérieur au corps souhaité.');
        const m = l.type === 'text' ? s.safeArea : 0;
        if (l.x < m || l.y < m || l.x + l.w > 1 - m + 1e-8 || l.y + l.h > 1 - m + 1e-8)
          invalid('Calque hors cadre ou texte hors zone sûre.');
      }
    if (s.audio) {
      if (!(s.delivery && isVideoOutput(s.delivery.kind)))
        invalid('Les pistes audio et les sous-titres nécessitent une vidéo.');
      if (new Set(s.audio.tracks.map((track) => track.id)).size !== s.audio.tracks.length)
        invalid('Pistes audio en double.');
      const total = s.scenes.reduce((sum, scene) => sum + scene.seconds, 0);
      for (const track of s.audio.tracks)
        if (track.start >= total) invalid('Une piste audio commence après la fin de la vidéo.');
      for (const cue of s.audio.subtitles?.cues ?? [])
        if (cue.end > total + 1e-6) invalid('Un sous-titre dépasse la durée totale de la vidéo.');
    }
  });
export type CreativeSpec = z.infer<typeof creativeSpec>;
export type CreativeLayer = z.infer<typeof creativeLayer>;
export const creativeWrite = z.object({ expectedVersion: z.int().nonnegative(), spec: creativeSpec });

/** P08 — applique une ressource de marque existante à un calque image (nouvelle révision, jamais d'écrasement). */
export const creativeAssetApply = z.strictObject({
  expectedRevision: z.int().nonnegative(),
  versionId: mediaId,
  sceneKey: sceneKey.optional(),
  layerIndex: z.int().min(0).max(15).optional(),
  fit: z.enum(['cover', 'contain']).default('cover')
});
export type CreativeAssetApply = z.infer<typeof creativeAssetApply>;

/** Direction artistique : brouillon CreativeRevision enrichi (ADR-0035), jamais une approbation. */
export const creativeDirectionInput = z.strictObject({
  requestId: z.uuid(),
  mode: z.enum(['generate', 'refine', 'alternative', 'combine']),
  brainstormTurnId: z.uuid().optional(),
  baseVersion: z.int().positive().optional(),
  combineFrom: z.array(z.int().positive()).min(2).max(3).optional()
});
export type CreativeDirectionInput = z.infer<typeof creativeDirectionInput>;
export const directionDecisionInput = z.strictObject({ decision: z.enum(['retained', 'rejected']) });
export type DirectionDecision = z.infer<typeof directionDecisionInput>['decision'];
/**
 * P12-05 — sélection explicite d'une direction artistique retenue.
 * `expectedSelection` porte l'état observé par le client (null = aucune sélection) : une sélection
 * concurrente échoue en 409 au lieu d'écraser silencieusement le choix d'un autre onglet.
 */
export const directionSelectionInput = z.strictObject({
  version: z.int().positive(),
  expectedSelection: z.int().positive().nullable()
});
export type DirectionSelectionInput = z.infer<typeof directionSelectionInput>;
