import { z } from 'zod';
import { actionScope, creativeChange } from './creativeAction';
import { marketingWeek } from './marketing';

const common = {
  requestId: z.uuid(), parentId: z.uuid().optional(),
  prompt: z.string().trim().min(3).max(1200),
  engine: z.enum(['offline', 'ai'])
};
export const assistantRequest = z.discriminatedUnion('kind', [
  z.strictObject({ ...common, kind: z.literal('marketing'), offerId: z.string().min(1).max(128), week: marketingWeek, regulated: z.boolean() }),
  z.strictObject({ ...common, kind: z.literal('creative'), scope: actionScope })
]);
export const assistantCopy = z.strictObject({
  campaign: z.string().trim().min(1).max(120),
  strategy: z.string().trim().min(1).max(450),
  posts: z.array(z.strictObject({
    headline: z.string().trim().min(1).max(200),
    caption: z.string().trim().min(1).max(900),
    cta: z.string().trim().min(1).max(120),
    storyboard: z.array(z.strictObject({ shot: z.string().trim().min(1).max(220), onScreen: z.string().trim().min(1).max(200) })).length(3)
  })).length(3)
});
export const assistantEdit = z.strictObject({ changes: z.array(creativeChange).min(1).max(8) });
export const assistantApproval = z.strictObject({ digest: z.string().regex(/^[a-f0-9]{64}$/), factsReviewed: z.literal(true), professionalReview: z.boolean() });
export type AssistantRequest = z.infer<typeof assistantRequest>;
export type AssistantCopy = z.infer<typeof assistantCopy>;
