import { z } from 'zod';
import { platformSchema, formatSchema } from './channels';

export const stages = [
  'IDEA',
  'DRAFT',
  'READY_FOR_REVIEW',
  'APPROVED',
  'SCHEDULED',
  'PUBLISHED',
  'FAILED'
] as const;
export type Stage = (typeof stages)[number];
export const nextStages: Record<Stage, Stage[]> = {
  IDEA: ['DRAFT'],
  DRAFT: ['READY_FOR_REVIEW'],
  READY_FOR_REVIEW: ['DRAFT', 'APPROVED'],
  APPROVED: ['DRAFT', 'SCHEDULED'],
  SCHEDULED: ['APPROVED', 'PUBLISHED', 'FAILED'],
  FAILED: ['DRAFT'],
  PUBLISHED: []
};
const text = (n: number) => z.string().trim().min(1).max(n);
export const variant = z.object({
  platform: platformSchema,
  format: formatSchema,
  caption: text(2200),
  cta: text(240)
});
export const content = z.object({
  title: text(160),
  offerId: text(128),
  audience: text(2000),
  objective: text(2000),
  campaignId: text(128).nullable(),
  projectId: text(128).nullable(),
  status: z.enum(stages),
  archived: z.boolean(),
  plannedAt: z.iso.datetime().refine((s) => Date.parse(s) % 60000 === 0, 'Précision à la minute requise'),
  timeZone: text(100).refine((s) => {
    try {
      new Intl.DateTimeFormat('fr', { timeZone: s });
      return true;
    } catch {
      return false;
    }
  }),
  variants: z
    .array(variant)
    .min(1)
    .max(3)
    .refine((v) => new Set(v.map((x) => x.platform)).size === v.length)
});
export const calendarMutation = z.object({
  id: z.uuid(),
  requestId: z.uuid(),
  expectedVersion: z.int().nonnegative(),
  data: content
});
export const confirmOffer = z.object({ contextId: text(128), name: text(160), confirmed: z.literal(true) });
export type Content = z.infer<typeof content>;
export type CalendarItem = Content & { id: string; version: number };
export type CalendarMutation = z.infer<typeof calendarMutation>;
