import { z } from 'zod';
import { editorialRecipe, type MarketingContext, type Recipe } from '@vululu/contracts';
import { fallback } from './editorial';
// Deliberately do not pass a DB record, a transcript or a document to an adapter.
// Provider may pick among editorial angles/channels only. No prose crosses this boundary.
export function modelInput(c: MarketingContext) {
  return {
    task: 'weekly-recipe-v1' as const,
    sectorHint: c.sectorHint,
    preferredChannel: c.platform,
    professionalReview: c.regulated,
    occupiedWeekdays: c.plan.map((p) => new Date(p.date).getUTCDay()),
    audience: c.audienceHint,
    tone: c.toneHint,
    goal: c.goalHint,
    hasAudience: c.audienceDeclared,
    hasTone: c.toneDeclared
  };
}
export interface LlmProvider {
  generate(
    input: ReturnType<typeof modelInput>,
    options: { signal: AbortSignal; maxCostCents: number; idempotencyKey: string }
  ): Promise<unknown>;
}
const response = z.discriminatedUnion('status', [
  z.object({ status: z.literal('complete'), recipe: z.unknown(), costCents: z.int().nonnegative() }).strict(),
  z
    .object({ status: z.enum(['refused', 'truncated', 'unavailable']), costCents: z.int().nonnegative() })
    .strict()
]);
export const offline: LlmProvider = {
  async generate() {
    return { status: 'unavailable', costCents: 0 };
  }
};
export type Decision = {
  recipe: Recipe;
  origin: 'provider' | 'fallback';
  reason: string;
  costCents: number | null;
};
export async function decide(
  c: MarketingContext,
  provider: LlmProvider,
  options: { signal: AbortSignal; maxCostCents: number; idempotencyKey: string },
  timeoutMs = 15000
): Promise<Decision> {
  const base = { recipe: fallback(c), origin: 'fallback' as const };
  const signal = AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)]);
  let abort: () => void = () => {};
  try {
    signal.throwIfAborted();
    const stopped = new Promise<never>((_, reject) => {
      abort = () => reject(Error('deadline'));
      signal.addEventListener('abort', abort, { once: true });
    });
    const raw = await Promise.race([provider.generate(modelInput(c), { ...options, signal }), stopped]);
    const r = response.safeParse(raw);
    if (r.success && r.data.costCents > options.maxCostCents)
      return { ...base, reason: 'over_budget_receipt', costCents: r.data.costCents };
    if (!r.success) return { ...base, reason: 'invalid_receipt', costCents: null };
    const { costCents, status } = r.data;
    if (status !== 'complete') return { ...base, reason: status, costCents };
    const recipe = editorialRecipe.safeParse(r.data.recipe);
    return recipe.success
      ? { recipe: recipe.data, origin: 'provider', reason: 'validated', costCents }
      : { ...base, reason: 'invalid_recipe', costCents };
  } catch {
    return { ...base, reason: signal.aborted ? 'deadline' : 'provider_error', costCents: null };
  } finally {
    signal.removeEventListener('abort', abort);
  }
}
