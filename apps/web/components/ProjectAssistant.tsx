'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { ActionPreview, AssistantCopy, AssistantRequest, CreativeSpec } from '@vululu/contracts';
import { api, postJson } from '../lib/api';
import { useWorkspace } from './WorkspacePreferences';

type Draft = {
  copy?: AssistantCopy; facts?: { source: string; value: string }[]; unknowns?: string[]; review?: string[];
  slots?: { day: string | null; platform: string }[]; regulated?: boolean; clarification?: string; preview?: ActionPreview;
};
type Turn = { id: string; parentId: string | null; request: AssistantRequest; result: Draft | null; digest: string | null;
  origin: string | null; reason: string | null; approvedAt: string | null;
  operation: { id: string; state: string; digest: string; maxCents: number } | null };
type Offer = { id: string; contextId: string; name: string };
const waiting = new Set(['QUEUED', 'CLAIMED']);
function monday() {
  const today = new Date();
  today.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7));
  return today.toISOString().slice(0, 10);
}

export function ProjectAssistant({ projectId, contextId, creativeHead }: { projectId: string; contextId: string; creativeHead?: number }) {
  const { t } = useWorkspace();
  const base = `/api/projects/${encodeURIComponent(projectId)}`;
  const endpoint = `${base}/assistant`;
  const [open, setOpen] = useState(false);
  const [model, setModel] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [selectedId, select] = useState('');
  const [parentId, setParent] = useState<string>();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [offerId, setOffer] = useState('');
  const [week, setWeek] = useState(monday);
  const [kind, setKind] = useState<'marketing' | 'creative'>('marketing');
  const [source, setSource] = useState<{ version: number; spec: CreativeSpec }>();
  const [sceneKey, setScene] = useState('');
  const [prompt, setPrompt] = useState('');
  const [engine, setEngine] = useState<'offline' | 'ai'>('offline');
  const [regulated, setRegulated] = useState(false);
  const [facts, setFacts] = useState(false);
  const [professional, setProfessional] = useState(false);
  const [edit, setEdit] = useState<AssistantCopy>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [reload, setReload] = useState(0);
  const selected = turns.find((turn) => turn.id === selectedId);
  const result = selected?.result;
  const op = selected?.operation;
  const pending = !!op && waiting.has(op.state);
  const queued = turns.some((item) => item.operation && waiting.has(item.operation.state));
  const [renderPreview, setRenderPreview] = useState<string>();

  useEffect(() => {
    if (!open) return;
    let alive = true, timer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      try {
        const data = await api<{ model: string | null; turns: Turn[] }>(endpoint);
        if (!alive) return;
        setModel(data.model); setTurns(data.turns);
        if (data.turns.some((turn) => turn.operation && waiting.has(turn.operation.state))) timer = setTimeout(load, 2400);
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : 'Assistant indisponible.'); }
    }
    void load();
    return () => { alive = false; clearTimeout(timer); };
  }, [open, endpoint, reload]);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const requested = new URLSearchParams(location.search).get('offer');
    void api<Offer[]>('/api/calendar/offers').then((data) => {
      if (!alive) return;
      const own = data.filter((o) => o.contextId === contextId);
      setOffers(own); setOffer((before) => own.some((o) => o.id === before) ? before : own.find((o) => o.id === requested)?.id ?? own[0]?.id ?? '');
    }).catch((e: Error) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [open, contextId]);
  useEffect(() => {
    if (!open || kind !== 'creative') return;
    let alive = true;
    setSource(undefined);
    void api<{ version: number }[]>(`${base}/creative`).then(async ([head]) => {
      if (!head || !alive) return;
      const latest = await api<{ version: number; spec: CreativeSpec }>(`${base}/creative/${head.version}`);
      if (!alive) return;
      setSource(latest); setScene((key) => latest.spec.scenes.some((s) => s.key === key) ? key : latest.spec.scenes[0].key);
    }).catch((e: Error) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [open, kind, base, creativeHead, reload]);
  useEffect(() => () => { if (renderPreview) URL.revokeObjectURL(renderPreview); }, [renderPreview]);

  function choose(id: string) {
    select(id); setEdit(undefined); setFacts(false); setProfessional(false); setNote(''); setRenderPreview(undefined);
  }
  function replace(turn: Turn) { setTurns((current) => [turn, ...current.filter((item) => item.id !== turn.id)]); }
  async function act(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(''); setNote('');
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : t('Action impossible.', 'Action failed.')); }
    finally { setBusy(false); }
  }
  function propose(event: FormEvent) {
    event.preventDefault();
    void act(async () => {
      const common = { requestId: crypto.randomUUID(), parentId, prompt, engine };
      const input: AssistantRequest | undefined = kind === 'marketing'
        ? { ...common, kind, offerId, week, regulated }
        : source && { ...common, kind, scope: { target: { projectId, sceneKey }, expectedRevision: source.version } };
      if (!input) return;
      const turn = await postJson<Turn>(endpoint, input);
      replace(turn); choose(turn.id); setPrompt(''); setParent(undefined);
    });
  }
  function follow(turn: Turn) {
    const request = turn.request;
    setKind(request.kind); setParent(turn.id); setPrompt('');
    if (request.kind === 'marketing') { setOffer(request.offerId); setWeek(request.week); setRegulated(request.regulated); }
    else setScene(request.scope.target.sceneKey);
    document.getElementById('assistant-prompt')?.focus();
  }
  function saveCopy(event: FormEvent) {
    event.preventDefault();
    if (!selected || !edit) return;
    void act(async () => {
      const turn = await postJson<Turn>(`${endpoint}/${selected.id}/edit`, { requestId: crypto.randomUUID(), copy: edit });
      replace(turn); choose(turn.id);
    });
  }
  function approveCopy() {
    if (!selected?.digest || !facts) return;
    void act(async () => {
      replace(await postJson<Turn>(`${endpoint}/${selected.id}/approve`, { digest: selected.digest, factsReviewed: true, professionalReview: professional }));
      setNote(t('Brouillon approuvé. Rien n’a été publié.', 'Draft approved. Nothing was published.'));
    });
  }
  function approveBudget() {
    if (!op) return;
    void act(async () => {
      const updated = await postJson<NonNullable<Turn['operation']>>(`/api/execution/${op.id}/approve`, { digest: op.digest });
      setTurns((current) => current.map((turn) => turn.operation?.id === op.id ? { ...turn, operation: updated } : turn));
      setReload((value) => value + 1);
    });
  }
  function apply(preview: ActionPreview) {
    void act(async () => {
      await postJson(`${base}/creative/actions/apply`, { action: preview.action, digest: preview.digest, surface: preview.surface, approved: true });
      setReload((value) => value + 1);
      setNote(t('Modification enregistrée dans une nouvelle révision de composition.', 'The edit was saved as a new composition revision.'));
    });
  }
  async function visualPreview(preview: ActionPreview) {
    await act(async () => {
      if (!source || source.version !== preview.action.expectedRevision) return;
      const { apiResponse } = await import('../lib/api');
      const payload = { ...source.spec, scenes: [preview.after] };
      const response = await apiResponse(`${base}/creative/preview`, { method: 'POST', body: JSON.stringify(payload) });
      setRenderPreview(URL.createObjectURL(await response.blob()));
    });
  }
  const labels: Record<string, string> = {
    ai: t('Suggestion IA', 'AI suggestion'), fallback: t('Repli hors ligne', 'Offline fallback'),
    offline: t('Brouillon hors ligne', 'Offline draft'), edited: t('Révision manuelle', 'Manual revision')
  };
  const text = (field: 'campaign' | 'strategy', value: string) => setEdit((before) => before ? { ...before, [field]: value } : before);
  const updatePost = (index: number, patch: Partial<AssistantCopy['posts'][number]>) => setEdit((before) => before ? {
    ...before, posts: before.posts.map((post, i) => i === index ? { ...post, ...patch } : post)
  } : before);

  return <details className="card stack project-assistant" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>{t('Assistant de campagne et composition', 'Campaign and creative assistant')}</summary>
    {open && <div className="stack">
      <p className="muted">{t('Décrivez votre objectif ou une modification. Les suggestions ne sont ni des faits ni des publications.', 'Describe an objective or an edit. Suggestions are not facts and nothing is published.')}</p>
      <form className="stack" onSubmit={propose}>
        <label className="label">{t('Type de demande', 'Request type')}<select className="input" value={kind} onChange={(e) => { setKind(e.target.value as typeof kind); setParent(undefined); }}>
          <option value="marketing">{t('Campagne et plan de la semaine', 'Campaign and weekly plan')}</option>
          <option value="creative">{t('Modifier une scène enregistrée', 'Edit a saved scene')}</option>
        </select></label>
        {kind === 'marketing' ? <>
          <label className="label">{t('Offre confirmée', 'Confirmed offer')}<select className="input" value={offerId} required onChange={(e) => { setOffer(e.target.value); setParent(undefined); }}>
            <option value="">—</option>{offers.map((offer) => <option key={offer.id} value={offer.id}>{offer.name}</option>)}
          </select></label>
          {!offers.length && <a href={`/contexts/offers/new?context=${encodeURIComponent(contextId)}`}>{t('Ajouter une offre', 'Add an offer')}</a>}
          <label className="label">{t('Semaine du lundi (UTC)', 'Week starting Monday (UTC)')}<input className="input" type="date" value={week} onChange={(e) => setWeek(e.target.value)} required /></label>
          <label><input type="checkbox" checked={regulated} onChange={(e) => setRegulated(e.target.checked)} /> {t('Activité réglementée', 'Regulated business')}</label>
        </> : <>
          {!source && <p>{t('Enregistrez une révision dans Composition, puis actualisez les sources.', 'Save a composition revision, then refresh sources.')}</p>}
          <button type="button" className="btn btn-secondary" onClick={() => setReload((value) => value + 1)}>{t('Actualiser les sources', 'Refresh sources')}</button>
          {source && <label className="label">{t('Scène ciblée', 'Target scene')} · v{source.version}<select className="input" value={sceneKey} onChange={(e) => { setScene(e.target.value); setParent(undefined); }}>
            {source.spec.scenes.map((scene, i) => <option key={scene.key} value={scene.key}>{i + 1} · {scene.key}</option>)}
          </select></label>}
        </>}
        {parentId && <div className="account-links"><span>{t('Suite de la suggestion sélectionnée', 'Following up on the selected suggestion')}</span><button type="button" onClick={() => setParent(undefined)}>{t('Nouvelle conversation', 'New conversation')}</button></div>}
        <label className="label" htmlFor="assistant-prompt">{t('Votre demande', 'Your request')}</label>
        <textarea id="assistant-prompt" className="input" value={prompt} onChange={(e) => setPrompt(e.target.value)} minLength={3} maxLength={1200} required
          placeholder={kind === 'marketing' ? t('Prépare une campagne pour faire découvrir mon offre aux débutants.', 'Draft a campaign introducing my offer to beginners.') : t('Rends le CTA plus chaleureux et utilise un fond bleu nuit.', 'Make the CTA warmer and use a midnight-blue background.')} />
        <label className="label">{t('Mode', 'Mode')}<select className="input" value={engine} onChange={(e) => setEngine(e.target.value as typeof engine)}>
          <option value="offline">{t('Hors ligne · sans frais', 'Offline · no charge')}</option><option value="ai" disabled={!model}>{model ?? t('IA non configurée ou non autorisée', 'AI not configured or not authorized')}</option>
        </select></label>
        {engine === 'offline' && <p className="hint">{kind === 'marketing' ? t('Le mode local utilise votre offre et votre profil, sans interpréter la demande libre.', 'Offline mode uses your offer and profile without interpreting free-form requests.') : t('En mode local, utilisez une commande explicite, par exemple : CTA "Parlons de votre projet" ; couleur #225588.', 'Offline mode expects explicit commands, e.g. CTA "Let’s talk about your project" ; color #225588.')}</p>}
        {engine === 'ai' && <p className="hint">{t('Après votre accord, la demande, le profil d’activité et les extraits de cette conversation seront transmis à Vertex AI. N’ajoutez pas de données sensibles.', 'After you approve, the request, business profile and excerpts from this conversation go to Vertex AI. Do not include sensitive data.')}</p>}
        <button className="btn btn-primary" disabled={busy || (engine === 'ai' && !model) || (kind === 'marketing' ? !offerId : !source)}>{engine === 'ai' ? t('Préparer une demande IA', 'Prepare AI request') : t('Créer un brouillon hors ligne', 'Create offline draft')}</button>
      </form>
      {turns.length > 0 && <label className="label">{t('Historique des brouillons', 'Draft history')}<select className="input" value={selectedId} onChange={(e) => choose(e.target.value)}>
        <option value="">{t('Sélectionner un brouillon', 'Select a draft')}</option>
        {turns.map((turn) => <option key={turn.id} value={turn.id}>{labels[turn.origin ?? ''] ?? turn.operation?.state} · {turn.request.prompt.slice(0, 75)}</option>)}
      </select></label>}
      {op?.state === 'PROPOSED' && <div className="stack"><p>{t('Plafond avant inférence :', 'Inference cap:')} {op.maxCents} ¢</p><button type="button" className="btn btn-primary" disabled={busy} onClick={approveBudget}>{t('Autoriser la génération IA', 'Authorize AI generation')}</button></div>}
      {pending && <p role="status">{t('Génération en file ou en cours…', 'Generation is queued or running…')}</p>}
      {op?.state === 'UNKNOWN' && <p role="status">{t('Le coût doit être rapproché ; cette demande ne sera pas relancée automatiquement.', 'Cost needs reconciliation; this request will not be retried automatically.')}</p>}
      {!result && op?.state === 'CANCELLED' && <p>{t('Demande annulée. Essayez le mode hors ligne.', 'Request cancelled. Try offline mode.')}</p>}
      {queued && <button type="button" className="btn btn-secondary" onClick={() => setReload((value) => value + 1)}>{t('Actualiser les demandes', 'Refresh requests')}</button>}
      {result && selected && <section className="stack" aria-label={t('Aperçu du brouillon', 'Draft preview')}>
        <p className="eyebrow">{labels[selected.origin ?? '']}{selected.approvedAt ? ` · ${t('Approuvé', 'Approved')}` : ''}</p>
        {selected.origin === 'fallback' && <p className="hint">{t('L’IA n’a pas fourni de suggestion exploitable ; voici la version locale.', 'AI did not return a usable suggestion; here is the local result.')}</p>}
        {result.clarification && <p>{result.clarification}</p>}
        {result.copy && <>
          <details><summary>{t('Faits déclarés et points à vérifier', 'Declared facts and checks')}</summary>
            <ul>{result.facts?.map((fact, index) => <li key={index}>{fact.value} <small>({fact.source})</small></li>)}{result.unknowns?.map((item) => <li key={item}>{item}</li>)}{result.review?.map((item) => <li key={item}>{item}</li>)}</ul>
          </details>
          <h3>{result.copy.campaign}</h3><p>{result.copy.strategy}</p>
          <ol className="stack">{result.copy.posts.map((post, index) => <li key={index}>
            <small>{result.slots?.[index]?.day ?? t('À planifier', 'Unscheduled')} · {result.slots?.[index]?.platform}</small>
            <h4>{post.headline}</h4><p>{post.caption}</p><p><strong>CTA:</strong> {post.cta}</p>
            <details><summary>Storyboard</summary><ol>{post.storyboard.map((frame, i) => <li key={i}>{frame.shot} — {frame.onScreen}</li>)}</ol></details>
          </li>)}</ol>
          {!edit && <button type="button" className="btn btn-secondary" onClick={() => setEdit(structuredClone(result.copy!))}>{t('Modifier le texte', 'Edit copy')}</button>}
          {edit && <form className="stack" onSubmit={saveCopy}>
            <label className="label">{t('Titre de campagne', 'Campaign title')}<input className="input" value={edit.campaign} maxLength={120} required onChange={(e) => text('campaign', e.target.value)} /></label>
            <label className="label">{t('Stratégie', 'Strategy')}<textarea className="input" value={edit.strategy} maxLength={450} required onChange={(e) => text('strategy', e.target.value)} /></label>
            {edit.posts.map((post, index) => <fieldset key={index} className="stack"><legend>{t('Publication', 'Post')} {index + 1}</legend>
              <label className="label">{t('Accroche', 'Headline')}<input className="input" required maxLength={200} value={post.headline} onChange={(e) => updatePost(index, { headline: e.target.value })} /></label>
              <label className="label">{t('Légende', 'Caption')}<textarea className="input" required maxLength={900} value={post.caption} onChange={(e) => updatePost(index, { caption: e.target.value })} /></label>
              <label className="label">CTA<input className="input" required maxLength={120} value={post.cta} onChange={(e) => updatePost(index, { cta: e.target.value })} /></label>
              <details><summary>{t('Modifier le storyboard', 'Edit storyboard')}</summary>{post.storyboard.map((frame, i) => <div className="stack" key={i}>
                <label className="label">{t('Plan', 'Shot')} {i + 1}<input className="input" required maxLength={220} value={frame.shot} onChange={(e) => updatePost(index, { storyboard: post.storyboard.map((f, j) => j === i ? { ...f, shot: e.target.value } : f) })} /></label>
                <label className="label">{t('Texte écran', 'On-screen text')} {i + 1}<input className="input" required maxLength={200} value={frame.onScreen} onChange={(e) => updatePost(index, { storyboard: post.storyboard.map((f, j) => j === i ? { ...f, onScreen: e.target.value } : f) })} /></label>
              </div>)}</details>
            </fieldset>)}
            <button className="btn btn-primary" disabled={busy}>{t('Enregistrer une nouvelle révision', 'Save a new revision')}</button>
            <button className="btn btn-secondary" type="button" onClick={() => setEdit(undefined)}>{t('Annuler', 'Cancel')}</button>
          </form>}
          {!edit && !selected.approvedAt && <>
            <label><input type="checkbox" checked={facts} onChange={(e) => setFacts(e.target.checked)} /> {t('J’ai vérifié les faits et le texte de ce brouillon.', 'I reviewed the facts and copy in this draft.')}</label>
            {result.regulated && <label><input type="checkbox" checked={professional} onChange={(e) => setProfessional(e.target.checked)} /> {t('La relecture professionnelle a été effectuée.', 'Professional review is complete.')}</label>}
            <button type="button" className="btn btn-primary" disabled={busy || !facts || (!!result.regulated && !professional)} onClick={approveCopy}>{t('Approuver ce brouillon', 'Approve this draft')}</button>
          </>}
        </>}
        {result.preview && <>
          <p>{result.preview.action.target.sceneKey} · v{result.preview.action.expectedRevision} → {t('position proposée', 'proposed position')} {result.preview.position}</p>
          <ul>{result.preview.action.changes.map((change, index) => <li key={index}>{change.operation}: {Object.values(change.parameters).join(' · ')}</li>)}</ul>
          <details><summary>{t('Avant / après (texte)', 'Before / after (text)')}</summary>
            <p>{result.preview.before.layers.flatMap((layer) => layer.type === 'text' ? [layer.text] : []).join(' · ')}</p>
            <p>{result.preview.after.layers.flatMap((layer) => layer.type === 'text' ? [layer.text] : []).join(' · ')}</p>
          </details>
          {source && source.version === result.preview.action.expectedRevision ? <>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void visualPreview(result.preview!)}>{t('Aperçu visuel', 'Visual preview')}</button>
            {renderPreview && <img className="assistant-preview" src={renderPreview} alt={t('Aperçu de la scène proposée', 'Preview of proposed scene')} />}
            <label><input type="checkbox" checked={facts} onChange={(e) => setFacts(e.target.checked)} /> {t('J’ai vérifié les modifications proposées.', 'I reviewed the proposed changes.')}</label>
            <button type="button" className="btn btn-primary" disabled={busy || !facts} onClick={() => apply(result.preview!)}>{t('Confirmer et appliquer', 'Confirm and apply')}</button>
          </> : <p className="hint">{t('Actualisez la composition et préparez une nouvelle proposition pour appliquer un changement.', 'Refresh the composition and prepare a fresh suggestion before applying.')}</p>}
        </>}
        <button type="button" className="btn btn-secondary" onClick={() => follow(selected)}>{t('Poursuivre cette demande', 'Continue this request')}</button>
      </section>}
      {error && <p className="error" role="alert">{error}</p>}{note && <p role="status">{note}</p>}
    </div>}
  </details>;
}
