'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { AssistantRequest, BrainstormAngle, BrainstormOutput } from '@vululu/contracts';
import { api, postJson } from '../lib/api';
import { useWorkspace } from './WorkspacePreferences';

type Result = (BrainstormOutput & { clarification?: string }) | null;
type Turn = {
  id: string; parentId: string | null; createdAt: string; request: AssistantRequest; result: Result;
  origin: string | null; reason: string | null;
  operation: { id: string; state: string; digest: string; maxCents: number } | null;
};
type Offer = { id: string; contextId: string; name: string };
const waiting = new Set(['QUEUED', 'CLAIMED']);

const originLabels: Record<string, [string, string]> = {
  ai: ['Suggestion IA', 'AI suggestion'],
  offline: ['Brouillon hors ligne', 'Offline draft'],
  fallback: ['Repli hors ligne', 'Offline fallback'],
  edited: ['Révision manuelle', 'Manual revision']
};

/** Brainstorming créatif multi-tours, ancré dans l'objectif, le canal, le format, l'identité et les ressources confirmées. */
export default function BrainstormPanel({ projectId, contextId }: { projectId: string; contextId: string }) {
  const { t } = useWorkspace();
  const base = '/api/projects/' + encodeURIComponent(projectId);
  const endpoint = base + '/assistant';
  const [model, setModel] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [offerId, setOffer] = useState('');
  const [prompt, setPrompt] = useState('');
  const [parentId, setParent] = useState<string>();
  const [engine, setEngine] = useState<'offline' | 'ai'>('offline');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [offersFailed, setOffersFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const queued = turns.some((turn) => turn.operation && waiting.has(turn.operation.state));

  useEffect(() => {
    let alive = true, timer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      try {
        const data = await api<{ model: string | null; turns: Turn[] }>(endpoint);
        if (!alive) return;
        setLoadFailed(false); setModel(data.model);
        setTurns(data.turns.filter((turn) => turn.request.kind === 'brainstorm'));
        if (data.turns.some((turn) => turn.request.kind === 'brainstorm' && turn.operation && waiting.has(turn.operation.state))) timer = setTimeout(load, 2400);
      } catch (e) { if (alive) setLoadFailed(true); if (alive) setError(e instanceof Error ? e.message : 'assistant_unavailable'); }
    }
    void load();
    return () => { alive = false; clearTimeout(timer); };
  }, [endpoint, reload]);
  useEffect(() => {
    let alive = true;
    void api<Offer[]>('/api/calendar/offers').then((data) => {
      if (!alive) return;
      setOffersFailed(false); setOffers(data.filter((offer) => offer.contextId === contextId));
    }).catch(() => { if (alive) setOffersFailed(true); });
    return () => { alive = false; };
  }, [contextId]);

  const thread = [...turns].sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));
  async function act(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(''); setNote('');
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : t('Action impossible.', 'Action failed.')); }
    finally { setBusy(false); }
  }
  function send(promptText: string, parent: string | undefined) {
    if (promptText.trim().length < 3) return;
    void act(async () => {
      const request: AssistantRequest = { kind: 'brainstorm', requestId: crypto.randomUUID(), parentId: parent,
        prompt: promptText.trim(), engine, offerId: offerId || null };
      const turn = await postJson<Turn>(endpoint, request);
      setTurns((current) => [turn, ...current.filter((item) => item.id !== turn.id)]);
      setPrompt(''); setParent(undefined); setReload((value) => value + 1);
      setNote(engine === 'offline' ? t('Brouillon hors ligne enregistré.', 'Offline draft saved.') : t('Demande IA enregistrée. Rien n’a été publié.', 'AI request saved. Nothing was published.'));
    });
  }
  function submit(event: FormEvent) { event.preventDefault(); send(prompt, parentId); }
  function followUp(parent: Turn, verb: string, angle?: BrainstormAngle) {
    setParent(parent.id);
    setPrompt(angle ? verb + ' la piste « ' + angle.title + ' »' : verb + ' la réponse ci-dessus');
    document.getElementById('brainstorm-prompt')?.focus();
  }
  function answer(question: string, parent: Turn) { setParent(parent.id); setPrompt(question); document.getElementById('brainstorm-prompt')?.focus(); }
  function approveBudget(turn: Turn) {
    if (!turn.operation) return;
    void act(async () => {
      const updated = await postJson<NonNullable<Turn['operation']>>('/api/execution/' + encodeURIComponent(turn.operation!.id) + '/approve', { digest: turn.operation!.digest });
      setTurns((current) => current.map((item) => item.id === turn.id ? { ...item, operation: updated } : item));
      setReload((value) => value + 1);
      setNote(t('Autorisation enregistrée. La génération va démarrer.', 'Authorization saved. Generation will start.'));
    });
  }

  return <section className="card stack brainstorm-panel" data-vululu-theme="blue" data-testid="brainstorm-panel" aria-labelledby="brainstorm-heading">
    <div className="section-head">
      <div>
        <p className="eyebrow">{t('Étape brainstorming', 'Brainstorming step')}</p>
        <h2 id="brainstorm-heading">{t('Brainstorming créatif', 'Creative brainstorming')}</h2>
      </div>
    </div>
    <p className="muted">{t('Décrivez votre objectif ou posez une question. Vululu vous propose des pistes créatives motivées, pose les questions utiles et retient vos décisions. Les pistes sont des suggestions, jamais des faits ; rien n’est publié.', 'Describe your objective or ask a question. Vululu proposes reasoned creative angles, asks useful questions and remembers your decisions. Angles are suggestions, never facts; nothing is published.')}</p>
    <form className="stack" onSubmit={submit} aria-busy={busy}>
      <label className="label" htmlFor="brainstorm-offer">{t('Offre retenue (facultatif)', 'Selected offer (optional)')}</label>
      <select id="brainstorm-offer" className="input" value={offerId} disabled={busy} onChange={(e) => setOffer(e.target.value)}>
        <option value="">{t('Aucune offre pour l’instant', 'No offer for now')}</option>
        {offers.map((offer) => <option key={offer.id} value={offer.id}>{offer.name}</option>)}
      </select>
      <label className="label" htmlFor="brainstorm-prompt">{t('Votre message', 'Your message')}</label>
      <textarea id="brainstorm-prompt" className="input textarea" value={prompt} onChange={(e) => setPrompt(e.target.value)} minLength={3} maxLength={1200} required disabled={busy}
        placeholder={t('Par exemple : je veux faire découvrir mon offre à des débutants, sans jargon.', 'For example: I want to introduce my offer to beginners, without jargon.')} />
      {parentId && <div className="account-links"><span>{t('Suite d’une réponse précédente', 'Following up on a previous answer')}</span><button type="button" onClick={() => setParent(undefined)}>{t('Nouvelle conversation', 'New conversation')}</button></div>}
      <label className="label">{t('Mode', 'Mode')}<select className="input" value={engine} onChange={(e) => setEngine(e.target.value as 'offline' | 'ai')}>
        <option value="offline">{t('Hors ligne · sans frais', 'Offline · no charge')}</option>
        <option value="ai" disabled={!model}>{model ?? t('IA non configurée ou non autorisée', 'AI not configured or authorized')}</option>
      </select></label>
      {!model && <p className="hint">{t('La génération IA nécessite un fournisseur configuré et une autorisation de compte. Le mode hors ligne reste disponible et ne simule pas une intelligence.', 'AI requires a configured provider and account authorization. Offline mode stays available and does not pretend to be intelligent.')}</p>}
      {engine === 'ai' && <p className="hint">{t('Après votre accord, la demande, l’identité confirmée, l’offre retenue et les noms de ressources seront transmis à Vertex AI. N’ajoutez pas de données sensibles.', 'After you approve, the request, confirmed identity, selected offer and asset names go to Vertex AI. Do not include sensitive data.')}</p>}
      <button className="btn btn-primary" data-testid="brainstorm-send" disabled={busy || prompt.trim().length < 3 || (engine === 'ai' && !model)}>{busy ? t('Enregistrement…', 'Saving…') : engine === 'ai' ? t('Préparer une réponse IA', 'Prepare AI reply') : t('Obtenir un brouillon hors ligne', 'Get offline draft')}</button>
    </form>
    {loadFailed ? <div className="error" role="alert"><p>{t('Chargement de la conversation impossible.', 'The conversation could not be loaded.')}</p><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setReload((value) => value + 1)}>{t('Réessayer', 'Retry')}</button></div> : null}
    {error ? <div className="error" role="alert"><p>{error}</p><p className="hint">{t('La conversation enregistrée reste intacte ; corrigez et réessayez.', 'The saved conversation is untouched; correct and retry.')}</p></div> : null}
    {offersFailed ? <p className="hint" role="status">{t('Offres indisponibles : le brainstorming avance sans offre.', 'Offers unavailable: brainstorming proceeds without an offer.')}</p> : null}
    {note ? <p className="hint" role="status">{note}</p> : null}
    {queued ? <p role="status">{t('Génération en file ou en cours…', 'Generation is queued or running…')} <button type="button" className="btn btn-secondary btn-small" onClick={() => setReload((value) => value + 1)}>{t('Actualiser', 'Refresh')}</button></p> : null}
    {!thread.length ? <div className="empty-state stack" data-testid="brainstorm-empty">
      <h3>{t('Aucun échange pour l’instant', 'No exchange yet')}</h3>
      <p className="muted">{t('Commencez par décrire ce que vous voulez obtenir. Votre objectif, votre canal, votre format et vos ressources confirmées alimenteront la conversation.', 'Start by describing what you want to achieve. Your objective, channel, format and confirmed assets feed the conversation.')}</p>
    </div> : <ol className="brainstorm-thread" aria-label={t('Conversation', 'Conversation')}>
      {thread.map((turn) => <li key={turn.id} className="card stack brainstorm-turn" data-testid={'brainstorm-turn-' + turn.id}>
        <div className="brainstorm-prompt"><span className="eyebrow">{t('Vous', 'You')}</span><p>{turn.request.prompt}</p></div>
        {turn.operation?.state === 'PROPOSED' && <div className="stack"><p>{t('Plafond avant inférence :', 'Inference cap:')} {turn.operation.maxCents} ¢</p><button type="button" className="btn btn-primary btn-small" disabled={busy} onClick={() => void approveBudget(turn)}>{t('Autoriser la génération IA', 'Authorize AI generation')}</button></div>}
        {turn.operation?.state === 'UNKNOWN' && <p role="status">{t('Le coût doit être rapproché ; cette demande ne sera pas relancée automatiquement.', 'Cost needs reconciliation; this request will not be retried automatically.')}</p>}
        {turn.operation && waiting.has(turn.operation.state) ? <p role="status">{t('En attente de génération…', 'Waiting for generation…')}</p> : turn.result ? <div className="stack">
          <p className="eyebrow">{t(originLabels[turn.origin ?? 'offline'][0], originLabels[turn.origin ?? 'offline'][1])}</p>
          {turn.origin === 'fallback' && <p className="hint">{t('L’IA n’a pas fourni de suggestion exploitable ; voici le repli local.', 'AI did not return a usable suggestion; here is the local fallback.')}</p>}
          {turn.result.clarification ? <p>{turn.result.clarification}</p> : null}
          {turn.result.ack ? <p className="context-copy">{turn.result.ack}</p> : null}
          {turn.result.questions?.length ? <div className="stack"><h3>{t('Questions utiles', 'Useful questions')}</h3><ul className="list">{turn.result.questions.map((question, index) => <li key={index}><button type="button" className="text-link" onClick={() => answer(question, turn)}>{question}</button></li>)}</ul></div> : null}
          {turn.result.decisions?.length ? <div className="stack"><h3>{t('Vos décisions retenues', 'Your remembered decisions')}</h3><ul className="list">{turn.result.decisions.map((decision, index) => <li key={index}><span className="pill">{t('Confirmé', 'Confirmed')}</span> {decision.fact}</li>)}</ul></div> : null}
          {turn.result.angles?.length ? <div className="stack"><h3>{t('Pistes créatives (suggestions)', 'Creative angles (suggestions)')}</h3>
            <div className="brainstorm-angles">{turn.result.angles.map((angle, index) => <article key={index} className="card stack brainstorm-angle">
              <h4>{angle.title}</h4>
              <p className="muted">{angle.reasoning}</p>
              <p className="context-copy">{angle.premise}</p>
              {angle.assets?.length ? <p className="hint">{t('Ressources : ', 'Assets: ')}{angle.assets.join(', ')}</p> : null}
              <div className="actions">
                <button type="button" className="btn btn-ghost btn-small" onClick={() => followUp(turn, t('Affine', 'Refine'), angle)}>{t('Affiner', 'Refine')}</button>
                <button type="button" className="btn btn-ghost btn-small" onClick={() => followUp(turn, t('Conteste', 'Challenge'), angle)}>{t('Contester', 'Challenge')}</button>
                <button type="button" className="btn btn-ghost btn-small" onClick={() => followUp(turn, t('Rejette', 'Reject'), angle)}>{t('Rejeter', 'Reject')}</button>
                <button type="button" className="btn btn-ghost btn-small" onClick={() => followUp(turn, t('Combine', 'Combine'), angle)}>{t('Combiner', 'Combine')}</button>
              </div>
            </article>)}</div>
            <p className="hint">{t('Ces pistes structurées serviront de candidates de directions artistiques à l’étape suivante.', 'These structured angles will serve as art-direction candidates in the next step.')}</p>
          </div> : null}
          <button type="button" className="btn btn-secondary btn-small" onClick={() => followUp(turn, t('Poursuis', 'Continue'))}>{t('Poursuivre cette conversation', 'Continue this conversation')}</button>
        </div> : <p>{t('Réponse non disponible.', 'No reply available.')}</p>}
      </li>)}
    </ol>}
  </section>;
}
