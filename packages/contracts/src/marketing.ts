import { z } from 'zod';
import { platformSchema } from './channels';
const text = z.string().trim().min(1).max(1200);
export const marketingWeek = z.iso
  .date()
  .refine((s) => new Date(s + 'T00:00:00Z').getUTCDay() === 1, 'Choisissez un lundi (UTC).');
export const marketingInput = z
  .object({
    offerId: z.string().min(1).max(128),
    week: marketingWeek,
    regulated: z.boolean(),
    requestId: z.uuid()
  })
  .strict();
export const sectors = z.enum(['artisan', 'consultant', 'boutique', 'therapeute', 'formation', 'general']);
const angle = z.enum(['decouverte', 'methode', 'question', 'invitation']);
// The model chooses structure, not factual assertions. No tools, URLs or free-form copy.
export const editorialRecipe = z
  .object({
    days: z
      .array(
        z
          .object({
            angle,
            platform: platformSchema,
            hookStyle: z.enum(['question', 'focus', 'invitation']).optional(),
            ctaStyle: z.enum(['details', 'contact', 'question']).optional(),
            opening: z.enum(['titre', 'gros_plan', 'carte_question']).optional()
          })
          .strict()
      )
      .length(3)
  })
  .strict()
  .refine((v) => new Set(v.days.map((d) => d.angle)).size === 3, 'Trois angles distincts requis.');
export const marketingContext = z
  .object({
    projectId: text,
    contextId: text,
    offerId: text,
    brand: text,
    offer: text,
    week: marketingWeek,
    platform: platformSchema,
    sectorHint: sectors,
    regulated: z.boolean(),
    plan: z.array(z.object({ id: text, version: z.int().positive(), date: z.iso.date() }).strict()).max(100),
    audienceHint: z.enum(['equipes', 'debutants', 'familles', 'non_precise']),
    toneHint: z.enum(['formel', 'chaleureux', 'neutre']),
    goalHint: z.enum(['contact', 'decouverte', 'explication']),
    audienceDeclared: z.boolean(),
    toneDeclared: z.boolean()
  })
  .strict();
export const marketingOutput = z
  .object({
    schemaVersion: z.literal(1),
    facts: z.array(
      z
        .object({ source: z.enum(['BrandContext', 'ConfirmedOffer', 'ContentItem']), id: text, value: text })
        .strict()
    ),
    unknowns: z.array(text),
    review: z.array(text),
    suggestions: z
      .array(
        z
          .object({
            day: z.iso.date().nullable(),
            angle,
            platform: platformSchema,
            idea: text,
            hook: text,
            caption: text,
            cta: text,
            variants: z
              .array(z.object({ platform: platformSchema, caption: text, cta: text }).strict())
              .length(3),
            storyboard: z.array(z.object({ shot: text, onScreen: text }).strict()).length(3)
          })
          .strict()
      )
      .length(3)
  })
  .strict();
export type MarketingContext = z.infer<typeof marketingContext>;
export type MarketingOutput = z.infer<typeof marketingOutput>;
export type Recipe = z.infer<typeof editorialRecipe>;
