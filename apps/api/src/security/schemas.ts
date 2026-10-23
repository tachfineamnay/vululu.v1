import { z } from 'zod';

export const ROLE_VALUES = ['user', 'super_admin'] as const;
export const roleSchema = z.enum(ROLE_VALUES);

export const invitationInputSchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  role: roleSchema.default('user')
});

export const activationInputSchema = z.object({
  token: z.string().min(16).max(512),
  password: z.string().min(8).max(200),
  name: z.string().trim().min(2).max(120)
});

export type Role = (typeof ROLE_VALUES)[number];
export type InvitationInput = z.infer<typeof invitationInputSchema>;
export type ActivationInput = z.infer<typeof activationInputSchema>;
