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
  name: z.string().min(2),
  website: z.string().optional().default(''),
  description: z.string().min(5),
  audience: z.string().optional().default(''),
  tone: z.string().optional().default(''),
  colorPrimary: z.string().optional().default('#6C5CE7'),
  colorSecondary: z.string().optional().default('#00D2FF')
});

export const sceneDurationSchema = z.number().int().min(1).max(15);

export const projectInputSchema = z.object({
  contextId: z.string().min(1),
  title: z.string().min(2),
  platform: platformSchema,
  format: formatSchema,
  objective: z.string().min(2),
  sceneDurationSeconds: sceneDurationSchema.default(2)
});

export const briefInputSchema = z.object({
  objective: z.string().min(2),
  audience: z.string().min(2),
  tone: z.string().min(2),
  cta: z.string().min(2),
  platform: platformSchema,
  format: formatSchema
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
