import { z } from 'zod';

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
    width: z.int().min(320).max(1920).multipleOf(2),
    height: z.int().min(320).max(1920).multipleOf(2),
    brand: z.object({ background: color, accent: color }),
    safeArea: unit.max(0.2),
    scenes: z
      .array(
        z.object({
          key: z.string().regex(/^SCENE-\d{3,8}$/),
          seconds: z.number().min(0.5).max(30).multipleOf(0.5),
          layers: z.array(creativeLayer).min(1).max(16)
        })
      )
      .min(1)
  })
  .superRefine((s, ctx) => {
    const invalid = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (new Set(s.scenes.map((v) => v.key)).size !== s.scenes.length) invalid('Identifiants de scène répétés.');
    if (s.scenes.reduce((n, v) => n + v.seconds, 0) > 180) invalid('Durée totale maximale : 180 secondes.');
    for (const scene of s.scenes)
      for (const l of scene.layers) {
        const m = l.type === 'text' ? s.safeArea : 0;
        if (l.x < m || l.y < m || l.x + l.w > 1 - m + 1e-8 || l.y + l.h > 1 - m + 1e-8)
          invalid('Calque hors cadre ou texte hors zone sûre.');
      }
  });
export type CreativeSpec = z.infer<typeof creativeSpec>;
export type CreativeLayer = z.infer<typeof creativeLayer>;
export const creativeWrite = z.object({ expectedVersion: z.int().nonnegative(), spec: creativeSpec });
