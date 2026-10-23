import { z } from 'zod';

export const platformSchema = z.enum(['TikTok', 'Instagram', 'LinkedIn']);
export const formatSchema = z.enum(['Affiche', 'Carrousel', 'Video', 'Reel', 'Motion']);

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

export const projectInputSchema = z.object({
  contextId: z.string().min(1),
  title: z.string().min(2),
  platform: platformSchema,
  format: formatSchema,
  objective: z.string().min(2)
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
