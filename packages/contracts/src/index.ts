import { z } from 'zod';

export const platformSchema = z.enum(['TikTok', 'Instagram', 'LinkedIn']);
export const formatSchema = z.enum(['Affiche', 'Carrousel', 'Video', 'Reel', 'Motion']);

export const campaignInputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).default('')
});
export const campaignAssignmentSchema = z.object({ campaignId: z.string().min(1).max(128).nullable() });

export const assetUploadSchema = z.object({
  assetId: z.string().min(1).max(128).optional(),
  name: z.string().trim().min(2).max(160),
  kind: z.enum(['logo', 'image', 'video', 'audio', 'document', 'font']),
  mimeType: z.string().min(1).max(80),
  license: z.enum(['internal', 'commercial', 'unknown']),
  provenance: z.string().trim().min(3).max(1000)
}).strict();
export const assetSelectionSchema = z.object({
  usage: z.enum(['organic', 'sponsored']).default('organic'),
  versionIds: z.array(z.string().min(1).max(128)).max(20)
}).strict();

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export const contextInputSchema = z.object({
  name: z.string().min(2).max(160),
  website: z.string().max(2048).optional().default(''),
  description: z.string().min(5).max(8000),
  audience: z.string().max(2000).optional().default(''),
  tone: z.string().max(1000).optional().default(''),
  colorPrimary: z.string().regex(/^#(?:[a-f0-9]{3}|[a-f0-9]{6})$/i).optional().default('#6C5CE7'),
  colorSecondary: z.string().regex(/^#(?:[a-f0-9]{3}|[a-f0-9]{6})$/i).optional().default('#00D2FF')
});
export const contextReviewInputSchema = z.object({ content: contextInputSchema, expectedVersion: z.number().int().min(0), confirmed: z.literal(true) }).strict();

export const sceneDurationSchema = z.number().int().min(1).max(15);

export const projectInputSchema = z.object({
  contextId: z.string().min(1),
  title: z.string().min(2),
  platform: platformSchema,
  format: formatSchema,
  objective: z.string().min(2),
  sceneDurationSeconds: sceneDurationSchema.default(2)
});

export const productionSettingsInputSchema = z.object({
  schemaVersion: z.literal(1).optional(), profileVersion: z.literal('v1-demo-2026-11-04').optional(),
  ratio: z.enum(['9:16', '4:5', '1:1', '16:9']).optional(),
  defaultSceneDurationSeconds: sceneDurationSchema.optional(), visualStyle: z.enum(['editorial', 'minimal', 'bold']).optional(),
  direction: z.string().max(1000).optional(), maxMockCents: z.number().int().min(0).max(100000).optional(),
  audio: z.object({ voiceVersionId: z.string().min(1).max(128).nullable().optional(), musicVersionId: z.string().min(1).max(128).nullable().optional(), spokenText: z.string().max(2000).optional(), voiceGainDb: z.number().min(-24).max(6).optional(), musicGainDb: z.number().min(-36).max(0).optional(), ducking: z.boolean().optional() }).strict().optional()
}).strict();
export type ProductionSettingsInput = z.infer<typeof productionSettingsInputSchema>;
export type ProductionSettings = Required<Omit<ProductionSettingsInput, 'audio'>> & { audio: Required<NonNullable<ProductionSettingsInput['audio']>> };
export const briefConfirmationSchema = z.object({ version: z.number().int().positive(), checksum: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const briefInputSchema = z.object({
  objective: z.string().min(2),
  audience: z.string().min(2),
  tone: z.string().min(2),
  cta: z.string().min(2),
  platform: platformSchema,
  format: formatSchema,
  settings: productionSettingsInputSchema.optional()
});

export const messageInputSchema = z.object({
  content: z.string().min(1).max(2000)
});

export const correctionInputSchema = z.object({
  instruction: z.string().min(3).max(500)
});

export const sceneDurationInputSchema = z.object({
  durationSeconds: sceneDurationSchema
});

export const approvalInputSchema = z.object({
  artifactVersionId: z.string().min(1),
  checksum: z.string().min(8)
});

export type Platform = z.infer<typeof platformSchema>;
export type ProjectFormat = z.infer<typeof formatSchema>;
export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: string;
};

export * from './admin';
