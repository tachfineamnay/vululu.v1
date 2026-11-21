/**
 * P12-06 — politique d'acceptation d'une recommandation d'outil par l'agent.
 *
 * Module pur (aucun import runtime) : c'est la règle unique appliquée par la route agent ET par le
 * broker. L'agent peut recommander ; il ne peut ni choisir un outil non exposé, ni un outil dont
 * l'action est réservée à l'utilisateur, ni un outil borné à une révision précise (l'agent ne
 * connaît pas de révision autorisée).
 */

export type ProposalToolPolicy = {
  hasParams: boolean;
  agentProposable: boolean;
  scope: 'project' | 'assets' | 'revision' | string;
};

export type ProposalCheck = { ok: true } | { ok: false; code: string; message: string };

export function checkAgentProposal(tool: string, policy: ProposalToolPolicy | null): ProposalCheck {
  if (!policy) return { ok: false, code: 'tool_unknown', message: 'Outil inconnu du registre fermé.' };
  if (!policy.hasParams || policy.agentProposable === false)
    return {
      ok: false,
      code: 'tool_not_proposable',
      message: 'Cet outil n’est pas proposable par l’agent : il reste une action explicite de l’utilisateur.'
    };
  if (policy.scope === 'revision')
    return {
      ok: false,
      code: 'agent_scope_unsupported',
      message: 'Une recommandation d’agent ne peut pas cibler une révision précise.'
    };
  return { ok: true };
}
