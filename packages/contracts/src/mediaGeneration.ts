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
