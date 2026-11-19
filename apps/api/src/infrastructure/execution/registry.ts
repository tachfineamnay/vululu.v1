import { z } from 'zod';
// Version is part of each immutable tool identity. No dynamic URLs, secrets, prompts or provider selection.
export const tools = {
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
  ): Promise<{ costCents: number }>;
}
