import { z } from 'zod';
export const mediaKind = z.enum(['image', 'video']);
const base = {
  schemaVersion: z.literal(1),
  requestId: z.uuid(),
  revision: z.int().positive(),
  sceneKey: z.string().regex(/^SCENE-\d{3,8}$/),
  prompt: z
    .string()
    .trim()
    .min(3)
    .max(900)
    .refine((s) => !/[\p{Cc}\p{Cf}]/u.test(s), 'Texte simple requis.'),
  rightsConfirmed: z.literal(true)
};
export const mediaRequest = z.discriminatedUnion('kind', [
  z.strictObject({ ...base, kind: z.literal('image'), size: z.literal('1024:1024') }),
  z.strictObject({
    ...base,
    kind: z.literal('video'),
    size: z.enum(['1280:720', '720:1280']),
    seconds: z.literal(5),
    referenceVersion: z.string().min(1).max(128)
  })
]);
export type MediaRequest = z.infer<typeof mediaRequest>;

/**
 * P07 — édition d'image à partir d'une ressource existante (ou génération sans source).
 * Le contrat ne contient ni URL ni chemin : seuls des identifiants de versions contrôlées.
 */
export const imageEditOperation = z.enum(['generate', 'edit', 'replace-background', 'remove-object', 'variation', 'enhance']);
export type ImageEditOperation = z.infer<typeof imageEditOperation>;
export const imageAspectRatio = z.enum(['1:1', '4:5', '9:16', '16:9']);
export type ImageAspectRatio = z.infer<typeof imageAspectRatio>;
export const imageEditRequest = z.strictObject({
  requestId: z.uuid(),
  operation: imageEditOperation,
  sourceVersionId: z.string().min(1).max(128).nullable(),
  maskVersionId: z.string().min(1).max(128).nullable().default(null),
  prompt: z.string().trim().min(3).max(1200).refine((s) => !/[\p{Cc}\p{Cf}]/u.test(s), 'Texte simple requis.'),
  aspectRatio: imageAspectRatio.default('1:1'),
  preserveSubject: z.boolean().default(false),
  rightsConfirmed: z.literal(true)
}).superRefine((value, ctx) => {
  if (value.operation === 'generate' && value.sourceVersionId !== null)
    ctx.addIssue({ code: 'custom', path: ['sourceVersionId'], message: 'Une génération ne prend pas d’image source.' });
  if (value.operation !== 'generate' && !value.sourceVersionId)
    ctx.addIssue({ code: 'custom', path: ['sourceVersionId'], message: 'Cette opération exige une image source.' });
  if (value.maskVersionId && value.operation === 'generate')
    ctx.addIssue({ code: 'custom', path: ['maskVersionId'], message: 'Un masque exige une image source.' });
});
export type ImageEditRequest = z.infer<typeof imageEditRequest>;
export const imageEditApply = z.strictObject({
  expectedRevision: z.int().positive(),
  sceneKey: z.string().regex(/^SCENE-\d{3,8}$/).optional(),
  fit: z.enum(['cover', 'contain']).default('cover')
});
export type ImageEditApply = z.infer<typeof imageEditApply>;
export type MediaCapability = {
  schemaVersion: 1;
  kind: MediaRequest['kind'];
  provider: string;
  model: string;
  sizes: readonly string[];
  seconds: readonly number[];
  requiresReference: boolean;
  maxCents: number;
  availability: 'disabled' | 'missing_credential' | 'configured';
};
