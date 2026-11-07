import type { ContextSnapshot } from '@vululu/domain';
import type { ContextAnalyzerPort, ContextProposal } from '@vululu/application';

/** MOCK explicite : aucun SDK, aucune URL consultée, aucune information externe inventée. */
export class DeterministicContextAnalyzer implements ContextAnalyzerPort {
  async propose(context: ContextSnapshot): Promise<ContextProposal> {
    const fields = ['name', 'website', 'description', 'audience', 'tone', 'colorPrimary', 'colorSecondary'] as const;
    const facts = fields.filter((field) => Boolean(context[field])).map((field) => ({ field, value: context[field]! }));
    const hypotheses: ContextProposal['hypotheses'] = [];
    if (!context.audience?.trim()) hypotheses.push({ field: 'audience', value: 'Public intéressé par cette offre, à préciser', reason: 'Exemple générique de démo ; aucune étude de clientèle effectuée.' });
    if (!context.tone?.trim()) hypotheses.push({ field: 'tone', value: 'Clair, accessible et chaleureux', reason: 'Exemple de ton proposé pour la démo, à adapter à votre marque.' });
    return { mode: 'MOCK', provider: 'context-demo-v1', websiteFetched: false, facts, hypotheses };
  }
}
