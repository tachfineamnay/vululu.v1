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
  z.strictObject({ ...common, kind: z.literal('creative'), scope: actionScope }),
  z.strictObject({ ...common, kind: z.literal('brainstorm'), offerId: z.string().min(1).max(128).nullable() })
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

/** Résultat structuré du brainstorming : pistes créatives (suggestions) et décisions (faits confirmés par l'utilisateur). */
export const brainstormAngle = z.strictObject({
  title: z.string().trim().min(2).max(120),
  reasoning: z.string().trim().min(2).max(450),
  premise: z.string().trim().min(2).max(450),
  assets: z.array(z.string().trim().min(1).max(160)).max(12)
});
export const brainstormDecision = z.strictObject({
  fact: z.string().trim().min(2).max(300),
  source: z.literal('user')
});
export const brainstormOutput = z.strictObject({
  schemaVersion: z.literal(1),
  ack: z.string().trim().min(1).max(600),
  questions: z.array(z.string().trim().min(2).max(220)).max(5),
  angles: z.array(brainstormAngle).max(4),
  decisions: z.array(brainstormDecision).max(8)
});
export type BrainstormAngle = z.infer<typeof brainstormAngle>;
export type BrainstormDecision = z.infer<typeof brainstormDecision>;
export type BrainstormOutput = z.infer<typeof brainstormOutput>;
