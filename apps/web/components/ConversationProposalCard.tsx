import type { MessageProposal } from '../lib/api';

const labels = { objective: 'Objectif', audience: 'Audience', tone: 'Ton', cta: 'Appel à action' };
const sources = { user: 'saisi dans le message', brief: 'brief enregistré', context: 'contexte enregistré', project: 'objectif du projet', example: 'exemple à valider' };

export default function ConversationProposalCard({ messageId, proposal, blockedReason, preserveDraft, onApply }: {
  messageId: string; proposal: MessageProposal; blockedReason?: string; preserveDraft: boolean; onApply: (proposal: MessageProposal) => void;
}) {
  return <div className="message-proposal" data-testid={'message-proposal-' + messageId}>
    {proposal.kind === 'brief' ? <>
      <dl>{(['objective', 'audience', 'tone', 'cta'] as const).map((field) => <div key={field}>
        <dt>{labels[field]}</dt><dd>{proposal.fields[field]}</dd><dd className="hint">{sources[proposal.sources[field]]}</dd>
      </div>)}</dl>
      {proposal.hypotheses.length ? <p className="hint">Exemples à valider : {proposal.hypotheses.map((field) => labels[field]).join(', ')}.</p> : null}
      {preserveDraft ? <p className="hint">Complète les champs vides et reprend les valeurs déclarées dans le message. Les autres saisies du brouillon sont conservées.</p> : null}
    </> : <><p>{proposal.sceneKey} · scène v{proposal.sceneVersion} · master v{proposal.masterVersion}</p><blockquote>{proposal.instruction}</blockquote></>}
    {blockedReason ? <p className="hint">{blockedReason}</p> : null}
    <button type="button" className="btn btn-secondary" disabled={Boolean(blockedReason)} onClick={() => onApply(proposal)}>{proposal.kind === 'brief' ? 'Reprendre ce brief en brouillon' : 'Préremplir la correction'}</button>
  </div>;
}
