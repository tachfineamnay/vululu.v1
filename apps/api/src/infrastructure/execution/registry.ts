import { z } from 'zod';
// Version is part of each immutable tool identity. No dynamic URLs, secrets, prompts or provider selection.
import { caps } from '../mediaGeneration/providers';
export const tools = {
  'media.image@1': { provider: caps.image.provider, action: 'GENERATE', maxCents: caps.image.maxCents },
  'media.video@1': { provider: caps.video.provider, action: 'GENERATE', maxCents: caps.video.maxCents },
  'assistant.draft@1': { provider: 'vertex-gemini@1', action: 'GENERATE', maxCents: 8 },
  'marketing.plan@1': { provider: 'editorial-recipe@1', action: 'GENERATE', maxCents: 8 },
  'postiz.schedule@1': { provider: 'postiz@1', action: 'WRITE/PUBLISH', maxCents: 0 },
  'postiz.cancel@1': { provider: 'postiz@1', action: 'WRITE/PUBLISH', maxCents: 0 },
  'studio.inspect@1': { provider: 'studio@1', action: 'READ', maxCents: 0 },
  'studio.render@1': { provider: 'studio@1', action: 'GENERATE', maxCents: 0 },
  'sandbox.generate@1': { provider: 'sandbox@1', action: 'GENERATE', maxCents: 10 },
  'sandbox.publish@1': { provider: 'sandbox@1', action: 'WRITE/PUBLISH', maxCents: 4 }
} as const;
export type Tool = keyof typeof tools;
export const toolSchema = z.enum(Object.keys(tools) as [Tool, ...Tool[]]);
export const proposal = z.object({ key: z.uuid(), tool: toolSchema, revision: z.int().positive() }).strict();
export interface EnginePort {
  invoke(
    job: { id: string; accountId: string; projectId: string; tool: Tool; revision: number; maxCents: number },
    signal: AbortSignal
  ): Promise<{ costCents: number } | { pendingMedia: true }>;
}


/**
 * Catalogue réellement proposable à un compte d'exécution.
 *
 * Un outil n'est exposé que si le compte est actif et que sa politique de
 * périmètre l'autorise : le catalogue ne doit jamais proposer une opération que
 * `propose()` refusera ensuite avec 403 `tool_disabled`.
 */
export function catalogForAccount(
  account: { enabled: boolean; tools: readonly string[] } | null,
  options: { demoDisabled: boolean }
): Record<string, (typeof tools)[Tool]> {
  const permitted = new Set(account && account.enabled ? account.tools : []);
  return Object.fromEntries(
    (Object.entries(tools) as [Tool, (typeof tools)[Tool]][]).filter(
      ([key]) => permitted.has(key) && (!options.demoDisabled || !key.startsWith('sandbox.'))
    )
  );
}
