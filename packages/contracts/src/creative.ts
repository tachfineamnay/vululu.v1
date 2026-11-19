import { z } from 'zod';
import { platformSchema } from './channels';
export const outputKind = z.enum(['square', 'portrait', 'story', 'carousel', 'short']);
export type OutputKind = z.infer<typeof outputKind>;
export const outputSize: Record<OutputKind, [number, number]> = {
  square: [1080, 1080],
  portrait: [1080, 1350],
  story: [1080, 1920],
  carousel: [1080, 1350],
  short: [1080, 1920]
};
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
export const creativeLayer = z.discriminatedUnion('type', [
  z.object({
    ...box,
    type: z.literal('image'),
    versionId: z.string().min(1).max(128),
    fit: z.enum(['cover', 'contain']),
    gravity: z.enum(['centre', 'north', 'south', 'east', 'west'])
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
    color
  })
]);
export const creativeSpec = z
  .object({
    schemaVersion: z.literal(1),
    delivery: delivery.optional(),
    width: z.int().min(320).max(1920).multipleOf(2),
    height: z.int().min(320).max(1920).multipleOf(2),
    brand: z.object({ background: color, accent: color }),
    safeArea: unit.max(0.2),
    scenes: z
      .array(
        z.object({
          key: z.string().regex(/^SCENE-\d{3,8}$/),
          seconds: z.number().min(0.5).max(30).multipleOf(0.5),
          clip: z
            .object({ versionId: mediaId, start: z.number().min(0).max(600), height: unit.min(0.1) })
            .optional(),
          layers: z.array(creativeLayer).min(1).max(16)
        })
      )
      .min(1)
  })
  .superRefine((s, ctx) => {
    const invalid = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (new Set(s.scenes.map((v) => v.key)).size !== s.scenes.length) invalid('Identifiants de scène répétés.');
    if (s.scenes.reduce((n, v) => n + v.seconds, 0) > 180) invalid('Durée totale maximale : 180 secondes.');
    if (s.delivery) {
      const [w, h] = outputSize[s.delivery.kind];
      if (s.width !== w || s.height !== h) invalid('Dimensions incompatibles avec le format.');
      if (
        s.delivery.kind !== 'short' &&
        (s.delivery.audio || s.delivery.transition || s.scenes.some((scene) => scene.clip))
      )
        invalid('Audio et clips nécessitent une vidéo courte.');
      if (s.delivery.kind !== 'short' && s.delivery.kind !== 'carousel' && s.scenes.length !== 1)
        invalid('Une seule image par publication.');
    } else if (s.scenes.some((scene) => scene.clip)) invalid('Sélectionnez le format vidéo courte.');
    for (const scene of s.scenes)
      for (const l of scene.layers) {
        if (l.type === 'text' && l.minSize && l.minSize > l.size)
          invalid('Corps minimal supérieur au corps souhaité.');
        const m = l.type === 'text' ? s.safeArea : 0;
        if (l.x < m || l.y < m || l.x + l.w > 1 - m + 1e-8 || l.y + l.h > 1 - m + 1e-8)
          invalid('Calque hors cadre ou texte hors zone sûre.');
      }
  });
export type CreativeSpec = z.infer<typeof creativeSpec>;
export type CreativeLayer = z.infer<typeof creativeLayer>;
export const creativeWrite = z.object({ expectedVersion: z.int().nonnegative(), spec: creativeSpec });
