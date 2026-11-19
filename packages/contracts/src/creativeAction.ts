import { z } from 'zod';
const key = z.string().regex(/^SCENE-\d{3,8}$/),
  color = z.string().regex(/^#[\da-f]{6}$/i),
  text = z.string().trim().min(1).max(2000);
const layer = z.int().min(0).max(15);
export const creativeChange = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('text'), parameters: z.strictObject({ layer, text }) }),
  z.strictObject({ operation: z.literal('cta'), parameters: z.strictObject({ text }) }),
  z.strictObject({ operation: z.literal('color'), parameters: z.strictObject({ background: color }) }),
  z.strictObject({
    operation: z.literal('replace'),
    parameters: z.strictObject({ layer, versionId: z.string().min(1).max(128) })
  }),
  z.strictObject({
    operation: z.literal('crop'),
    parameters: z.strictObject({
      layer,
      fit: z.enum(['cover', 'contain']),
      gravity: z.enum(['centre', 'north', 'south', 'east', 'west'])
    })
  }),
  z.strictObject({
    operation: z.literal('duration'),
    parameters: z.strictObject({ seconds: z.number().min(0.5).max(30).multipleOf(0.5) })
  }),
  z.strictObject({
    operation: z.literal('transition'),
    parameters: z.strictObject({ style: z.enum(['cut', 'dip']) })
  }),
  z.strictObject({
    operation: z.literal('move'),
    parameters: z.strictObject({ position: z.int().min(1).max(360) })
  })
]);
export const actionScope = z.strictObject({
  target: z.strictObject({ projectId: z.string().min(1).max(128), sceneKey: key }),
  expectedRevision: z.int().positive()
});
export const creativeAction = actionScope.extend({
  schemaVersion: z.literal(1),
  changes: z.array(creativeChange).min(1).max(8),
  authorization: z.literal('project-owner:confirm'),
  estimatedCostCents: z.literal(0)
});
// Closed protocol subset. The server owns all labels, handlers and routing.
export const reviewSurface = z.strictObject({
  version: z.literal('v0.9'),
  updateComponents: z.strictObject({
    surfaceId: z.literal('creative-review'),
    components: z.tuple([z.strictObject({ id: z.literal('root'), component: z.literal('CreativeReview') })])
  })
});
export const creativeReview = reviewSurface.parse({
  version: 'v0.9',
  updateComponents: {
    surfaceId: 'creative-review',
    components: [{ id: 'root', component: 'CreativeReview' }]
  }
});
export const creativeApproval = z.strictObject({
  action: creativeAction,
  surface: reviewSurface,
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  approved: z.literal(true)
});
export type CreativeAction = z.infer<typeof creativeAction>;
export type CreativeChange = z.infer<typeof creativeChange>;
export type ActionPreview = {
  action: CreativeAction;
  surface: typeof creativeReview;
  digest: string;
  before: import('./creative').CreativeSpec['scenes'][number];
  after: import('./creative').CreativeSpec['scenes'][number];
  position: number;
};
