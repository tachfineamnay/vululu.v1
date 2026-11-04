import type { ContextRevision, ContextSnapshot } from '@vululu/domain';
import type { ContextRecord } from './ports';

export type ContextReviewRecord = { context: ContextRecord; revisions: ContextRevision[] };
export type ContextProposal = {
  mode: 'MOCK'; provider: 'context-demo-v1'; websiteFetched: false;
  facts: Array<{ field: keyof ContextSnapshot; value: string }>;
  hypotheses: Array<{ field: 'audience' | 'tone'; value: string; reason: string }>;
};
export interface ContextAnalyzerPort { propose(context: ContextSnapshot): Promise<ContextProposal> }
export interface ContextReviewStore {
  getOwned(contextId: string, userId: string): Promise<ContextReviewRecord | null>;
  saveOwned(input: { contextId: string; userId: string; expectedVersion: number; content: ContextSnapshot; revision: ContextRevision }): Promise<{ changed: boolean }>;
}
