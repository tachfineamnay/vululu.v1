'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, patchJson, postJson, ProjectBundle, type ProductionPlanView, type MessageProposal } from '../lib/api';
import StudioNav from './StudioNav';
import ConversationProposalCard from './ConversationProposalCard';
import { useUnsavedChanges } from '../lib/useUnsavedChanges';
import ProjectJourney from './ProjectJourney';
import CreationDelivery from './CreationDelivery';
import { matchesStudioRevision, readStudioDraft, type StudioDraft } from '../lib/studioDraft';

const statusLabels: Record<string, string> = {
  draft: 'Brouillon',
  brief_ready: 'Brief pret',
  storyboard_ready: 'Storyboard pret',
  producing: 'Production en cours',
  review: 'Aperçu pret',
  approved: 'Master approuve',
  transferred: 'Transfert mock confirme',
  failed: 'Erreur',
  cancelled: 'Annule'
};
const ratioLabels: Record<string, string> = { '9:16': 'Vidéo verticale · 9:16', '4:5': 'Portrait · 4:5', '1:1': 'Carré · 1:1', '16:9': 'Paysage · 16:9' };

const stepLabels: Record<string, string> = {
  snapshot: 'Capture des paramètres',
  'correct-scene': 'Correction de la scène',
  'validate-snapshot': 'Validation du snapshot',
  'resolve-capabilities': 'Resolution des capacites',
  'render-scenes': 'Rendu des scènes',
  'assemble-master': 'Assemblage du master',
  qa: 'Controle qualite',
  finalize: 'Finalisation / provenance',
  approval: 'Approbation durable',
  transfer: 'Transfert Postiz MOCK',
  pending: 'En attente'
};

function statusLabel(status: string): string {
  return statusLabels[status] || status;
}

function stepLabel(name: string): string {
  return stepLabels[name] || name;
}

function shortChecksum(value: string): string {
  if (!value) return '';
  return value.length <= 16 ? value : value.slice(0, 14) + '...';
}

function formatDate(value: string | undefined | null): string {
  if (!value) return 'date inconnue';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

type ToastState = { id: number; message: string; tone: 'success' | 'error' } | null;

export default function ProjectStudio({ id }: { id: string }) {
  const router = useRouter();
  const [bundle, setBundle] = useState<ProjectBundle | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState<ToastState>(null);
  const [chatInput, setChatInput] = useState('');
  const [correction, setCorrection] = useState('');
  const [correctionScene, setCorrectionScene] = useState('');
  const [correctionEdited, setCorrectionEdited] = useState(false);
  const [briefObjective, setBriefObjective] = useState('');
  const [briefAudience, setBriefAudience] = useState('');
  const [briefTone, setBriefTone] = useState('');
  const [briefCta, setBriefCta] = useState('');
  const [briefEdited, setBriefEdited] = useState(false);
  useUnsavedChanges(briefEdited || correctionEdited || !!chatInput.trim());
  const [draftKey, setDraftKey] = useState('');
  const [draftStored, setDraftStored] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftConflict, setDraftConflict] = useState<StudioDraft | null>(null);
  const draftBase = useRef<{ version: number | null; checksum: string | null }>({ version: null, checksum: null });
  const ownerRef = useRef<Promise<{ user: { id: string } }> | null>(null);
  const [productionSettings, setProductionSettings] = useState<import('@vululu/contracts').ProductionSettings | null>(null);
  const [plan, setPlan] = useState<ProductionPlanView | null>(null);
  const [planError, setPlanError] = useState('');
  const [refreshingPlan, setRefreshingPlan] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const planBriefVersion = bundle?.brief?.version;
  const planDurationKey = bundle?.scenes.map((scene) => `${scene.durationSeconds}:${scene.usesBriefDuration}`).join(',');
  const settingsLoaded = useRef(false);
  const briefLoaded = useRef(false);
  const initialWorkFocused = useRef(false);
  const preparationInitiallyOpen = useRef<boolean | null>(null);
  const bundleRef = useRef<ProjectBundle | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actionInFlight = useRef(false);
  const correctionRef = useRef<HTMLInputElement | null>(null);
  const briefObjectiveRef = useRef<HTMLInputElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const messageCount = bundle?.messages.length ?? 0;

  function restoreInputs(draft: StudioDraft) {
    setBriefObjective(draft.objective); setBriefAudience(draft.audience); setBriefTone(draft.tone); setBriefCta(draft.cta); setProductionSettings(draft.settings);
    setBriefEdited(draft.briefEdited); setCorrection(draft.correction); setCorrectionScene(draft.correctionScene); setCorrectionEdited(draft.correctionEdited); setChatInput(draft.chatInput); setDraftRestored(true);
  }

  useEffect(() => {
    if (!draftKey || !productionSettings || !briefLoaded.current || draftConflict) return;
    try {
      if (briefEdited || correction.trim() || chatInput.trim()) {
        const draft: StudioDraft = { schemaVersion: 1, baseVersion: draftBase.current.version, baseChecksum: draftBase.current.checksum, objective: briefObjective, audience: briefAudience, tone: briefTone, cta: briefCta, settings: productionSettings, briefEdited, correction, correctionScene, correctionEdited, chatInput };
        const encoded = JSON.stringify(draft);
        if (!readStudioDraft(encoded)) throw new Error('Brouillon local hors limites.');
        sessionStorage.setItem(draftKey, encoded);
      } else sessionStorage.removeItem(draftKey);
      setDraftStored(true);
    } catch { setDraftStored(false); }
  }, [draftKey, productionSettings, briefEdited, briefObjective, briefAudience, briefTone, briefCta, correction, correctionScene, correctionEdited, chatInput, draftConflict]);

  useEffect(() => {
    if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [messageCount]);

  useEffect(() => {
    if (!planBriefVersion) return;
    let cancelled = false;
    setPlan(null); setPlanError('');
    void api<{ plan: ProductionPlanView }>('/api/projects/' + id + '/production-plan').then((result) => {
      if (!cancelled) setPlan(result.plan);
    }).catch((err: unknown) => { if (!cancelled) setPlanError(err instanceof Error ? err.message : 'Plan indisponible.'); });
    return () => { cancelled = true; };
  }, [id, planBriefVersion, planDurationKey]);

  function notify(message: string, tone: 'success' | 'error' = 'success'): void {
    setToast({ id: Date.now(), message, tone });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4200);
  }

  const load = useCallback(async () => {
    try {
      ownerRef.current ??= api<{ user: { id: string } }>('/api/auth/me');
      const [data, me] = await Promise.all([api<ProjectBundle>('/api/projects/' + id), ownerRef.current]);
      bundleRef.current = data;
      setBundle(data);
      if (!settingsLoaded.current) {
        setProductionSettings(data.brief?.settings ?? { schemaVersion: 1, profileVersion: 'v1-demo-2026-11-04', ratio: data.project.platform === 'LinkedIn' ? '1:1' : '9:16', defaultSceneDurationSeconds: data.project.sceneDurationSeconds, visualStyle: 'editorial', direction: '', maxMockCents: 1000, audio: { voiceVersionId: null, musicVersionId: null, spokenText: '', voiceGainDb: -3, musicGainDb: -18, ducking: true } });
        settingsLoaded.current = true;
      }
      setRefreshError('');
      if (!briefLoaded.current) {
        setBriefObjective(data.brief?.objective ?? data.project.objective);
        setBriefAudience(data.brief?.audience ?? data.context.audience ?? '');
        setBriefTone(data.brief?.tone ?? data.context.tone ?? '');
        setBriefCta(data.brief?.cta ?? '');
        const base = { version: data.brief?.version ?? null, checksum: data.brief?.revisions.find((revision) => revision.version === data.brief?.version)?.checksum ?? null };
        draftBase.current = base;
        const key = 'vululu:studio-draft:v1:' + me.user.id + ':' + id;
        try {
          const previous = readStudioDraft(sessionStorage.getItem(key));
          if (previous && matchesStudioRevision(previous, base.version, base.checksum)) restoreInputs(previous);
          else if (previous) setDraftConflict(previous);
        } catch { /* Le formulaire et la protection de sortie restent disponibles. */ }
        setDraftKey(key);
        briefLoaded.current = true;
      }
    } catch (err) {
      ownerRef.current = null;
      const message = err instanceof Error ? err.message : 'Projet introuvable.';
      if (!bundleRef.current) setError(message);
      else setRefreshError(message);
      if (message.toLowerCase().includes('session')) router.push('/login');
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    void load();
    pollRef.current = setInterval(() => { void load(); }, 1500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [load]);

  useEffect(() => {
    if (loading || !bundle || initialWorkFocused.current) return;
    initialWorkFocused.current = true;
    if (window.location.hash) return;
    if (bundle.master) document.getElementById('preview-heading')?.focus();
    else if (!bundle.brief && bundle.project.status === 'draft') document.getElementById('brief-heading')?.focus();
  }, [loading, bundle]);

  async function runAction(name: string, action: () => Promise<unknown>, successMessage?: string) {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setBusy(name);
    setError('');
    try {
      await action();
      await load();
      if (successMessage) notify(successMessage);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Action impossible.';
      setError(message);
      notify(message, 'error');
    } finally {
      actionInFlight.current = false;
      setBusy('');
    }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!chatInput.trim()) return;
    const content = chatInput.trim();
    await runAction('chat', async () => { await postJson('/api/projects/' + id + '/messages', { content }); setChatInput(''); }, 'Message envoye a Vululu.');
  }

  async function saveBrief(event: FormEvent) {
    event.preventDefault();
    if (!bundle) return;
    await runAction('brief', async () => {
      const result = await patchJson<{ brief: NonNullable<ProjectBundle['brief']> }>('/api/projects/' + id + '/brief', {
      objective: briefObjective,
      audience: briefAudience,
      tone: briefTone,
      cta: briefCta,
      platform: bundle.project.platform,
      format: bundle.project.format,
      ...(productionSettings ? { settings: productionSettings } : {})
      });
      if (result.brief.settings) setProductionSettings(result.brief.settings);
      draftBase.current = { version: result.brief.version, checksum: result.brief.revisions.find((revision) => revision.version === result.brief.version)?.checksum ?? null };
      setDraftConflict(null);
      setBriefEdited(false);
    }, 'Brief enregistre. Une nouvelle revision est conservee.');
  }

  async function generateStoryboard() {
    await runAction('storyboard', () => postJson('/api/projects/' + id + '/storyboard', {}), 'Storyboard genere.');
  }

  async function confirmBrief() {
    if (!bundle?.brief) return;
    const revision = bundle.brief.revisions.find((value) => value.version === bundle.brief!.version);
    if (!revision) return;
    await runAction('brief-confirm', async () => {
      await reviewCurrentPlan();
      return postJson('/api/projects/' + id + '/brief/confirm', { version: revision.version, checksum: revision.checksum });
    }, 'Version exacte du brief confirmée.');
  }

  async function reviewCurrentPlan() {
    const result = await api<{ plan: ProductionPlanView }>('/api/projects/' + id + '/production-plan');
    setPlan(result.plan); setPlanError('');
    if (!result.plan.ready) throw new Error(result.plan.issues[0]?.message ?? 'Ce plan ne peut pas être lancé.');
    if (!plan || result.plan.checksum !== plan.checksum) throw new Error('Le plan a évolué. Relisez-le avant de confirmer ou de lancer la production.');
  }

  async function refreshPlan() {
    setRefreshingPlan(true);
    try {
      const result = await api<{ plan: ProductionPlanView }>('/api/projects/' + id + '/production-plan');
      setPlan(result.plan); setPlanError('');
    } catch (err) { setPlanError(err instanceof Error ? err.message : 'Plan indisponible.'); }
    finally { setRefreshingPlan(false); }
  }

  async function produce() {
    await runAction('produce', async () => { await reviewCurrentPlan(); return postJson('/api/projects/' + id + '/produce', {}); }, 'Production lancee. Suivez les etapes ci-dessous.');
  }

  async function correctScene() {
    const sceneKey = bundle?.scenes.find((scene) => scene.sceneKey === correctionScene)?.sceneKey ?? bundle?.scenes[0]?.sceneKey;
    if (!sceneKey || !correction.trim()) return;
    await runAction('correct', async () => {
      await postJson('/api/projects/' + id + '/scenes/' + sceneKey + '/correct', { instruction: correction.trim() });
      setCorrectionEdited(false);
    }, 'Correction de ' + sceneKey + ' lancee. Le master precedent est conserve.');
  }

  async function updateDuration(sceneKey: string, durationSeconds: number | null) {
    await runAction('duration', () => patchJson('/api/projects/' + id + '/scenes/' + sceneKey, durationSeconds === null ? { useBriefDuration: true } : { durationSeconds }), 'Durée de ' + sceneKey + ' mise à jour.');
  }

  async function logout() {
    try { await api('/api/auth/logout', { method: 'POST' }); router.push('/login'); }
    catch { setError('La déconnexion n’a pas été confirmée. Vos saisies sont conservées ; réessayez.'); }
  }

  if (loading) {
    return <div className="shell"><main className="page"><p className="muted" role="status">Chargement du studio...</p></main></div>;
  }

  if (!bundle) {
    return (
      <div className="shell">
        <main className="page narrow">
          <h1>Studio indisponible</h1>
          <p className="error" role="alert">{error || 'Projet introuvable.'}</p>
          <Link href="/" className="btn btn-secondary">Retour a l accueil</Link>
        </main>
      </div>
    );
  }

  const briefConfirmed = Boolean(bundle.brief && bundle.brief.confirmedVersion === bundle.brief.version && bundle.brief.confirmedChecksum === bundle.brief.revisions.find((value) => value.version === bundle.brief!.version)?.checksum);
  const canonical = (value: unknown) => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item);
  const briefDirty = Boolean(bundle.brief && (briefObjective !== bundle.brief.objective || briefAudience !== bundle.brief.audience || briefTone !== bundle.brief.tone || briefCta !== bundle.brief.cta || canonical(productionSettings) !== canonical(bundle.brief.settings)));
  const hasUnsavedBrief = bundle.brief ? briefDirty : Boolean(briefObjective || briefAudience || briefTone || briefCta);
  const draftValues = { objective: briefObjective, audience: briefAudience, tone: briefTone, cta: briefCta };
  function proposalIsCurrent(proposal: MessageProposal) {
    if (!bundle || proposal.schemaVersion !== 1 || proposal.mode !== 'MOCK' || proposal.baseBriefVersion !== (bundle.brief?.version ?? null)) return false;
    if (proposal.kind === 'brief') {
      const revision = bundle.brief?.revisions.find((value) => value.version === bundle.brief?.version);
      return proposal.baseBriefChecksum === (revision?.checksum ?? null)
        && (proposal.sources.objective !== 'project' || proposal.fields.objective === bundle.project.objective.trim())
        && (['audience', 'tone'] as const).every((field) => proposal.sources[field] !== 'context' || proposal.fields[field] === bundle.context[field]?.trim());
    }
    const version = bundle.scenes.find((scene) => scene.sceneKey === proposal.sceneKey)?.versions[0];
    return version?.version === proposal.sceneVersion && version?.checksum === proposal.sceneChecksum && bundle.master?.version === proposal.masterVersion && bundle.master?.checksum === proposal.masterChecksum;
  }
  function proposalBlockedReason(proposal: MessageProposal) {
    if (!proposalIsCurrent(proposal)) return 'Proposition ancienne : demandez-en une nouvelle après relecture.';
    if (hasUnsavedBrief && proposal.kind === 'correction') return 'Enregistrez votre brouillon avant de préparer une correction.';
    if (proposal.kind === 'brief' && !(['objective', 'audience', 'tone', 'cta'] as const).some((field) => (!hasUnsavedBrief || proposal.sources[field] === 'user' || !draftValues[field].trim()) && draftValues[field] !== proposal.fields[field])) return 'Le brouillon reprend déjà ces valeurs.';
    if (bundle?.project.status === 'producing') return 'Une production est en cours. Reprenez cette proposition après sa fin.';
    return busy ? 'Une action est en cours.' : undefined;
  }
  function applyProposal(proposal: MessageProposal) {
    const blocked = proposalBlockedReason(proposal); if (blocked) { notify(blocked, 'error'); return; }
    if (proposal.kind === 'brief') {
      const take = (field: keyof typeof draftValues, value: string) => !hasUnsavedBrief || proposal.sources[field] === 'user' || !value.trim() ? proposal.fields[field] : value;
      setBriefEdited(true);
      setBriefObjective((value) => take('objective', value)); setBriefAudience((value) => take('audience', value)); setBriefTone((value) => take('tone', value)); setBriefCta((value) => take('cta', value));
      briefObjectiveRef.current?.focus(); notify('Proposition reprise dans le brouillon. Relisez et enregistrez cette version.');
    } else {
      setCorrectionScene(proposal.sceneKey); setCorrection(proposal.instruction); setCorrectionEdited(true); correctionRef.current?.focus(); notify('Correction préremplie. Relisez la scène et le master avant le lancement.');
    }
  }
  const planReady = !planError && plan?.ready && plan.briefVersion === bundle.brief?.version;
  const activeRun = ['queued', 'running', 'waiting_approval', 'recovery_pending'].includes(bundle.jobRun?.status ?? '');
  const canProduce = !!plan && bundle.scenes.length === plan.sceneCount && briefConfirmed && bundle.project.storyboardBriefVersion === bundle.brief?.version && planReady && !briefDirty && !busy && !activeRun && bundle.project.status !== 'producing';
  const job = bundle.job;
  const totalDurationSeconds = bundle.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
  const selectedScene = bundle.scenes.find((scene) => scene.sceneKey === correctionScene) || bundle.scenes[0] || null;
  if (preparationInitiallyOpen.current === null) preparationInitiallyOpen.current = !bundle.brief;

  return (
    <div className="shell project-studio-shell" data-vululu-theme="blue">
      <a className="skip-link" href="#studio-main">Aller au contenu</a>
      <aside className="studio-sidebar" aria-label="Navigation de l’atelier">
        <Link href="/" className="brand" aria-label="Vululu, mes projets">vululu</Link>
        <StudioNav primaryOnly />
        <button className="btn btn-ghost" onClick={logout}>Sortir</button>
      </aside>
      <main id="studio-main" tabIndex={-1} className="page studio-page">
        <section className="studio-head">
          <div>
            <p className="eyebrow">Studio V1 / {bundle.context.name} / {bundle.project.platform} / {bundle.project.format}</p>
            <h1 data-testid="project-title-heading">{bundle.project.title}</h1>
            <p className="muted">{bundle.project.objective}</p>
            <Link className="text-link" href={'/contexts?context=' + encodeURIComponent(bundle.context.id)}>Contexte : {bundle.context.name}</Link>
            {bundle.master ? <a className="btn btn-secondary" href="#preview-heading">Versions et téléchargement</a> : <a className="btn btn-secondary" href="#storyboard-heading">Voir les scènes</a>}
          </div>
          <div className="studio-head-actions"><span className={'badge status-' + bundle.project.status} data-testid="status-badge">{statusLabel(bundle.project.status)}</span><button className="btn btn-primary" data-testid="produce" onClick={produce} disabled={!canProduce || busy === 'produce'}>Produire la création</button></div>
        </section>

        <div className="studio-banners" aria-label="Limites du prototype">
          <span className="studio-banner studio-banner--info" data-testid="deterministic-banner">
            Rendu deterministe Sharp/FFmpeg — aucune IA generative
          </span>
          <span className="studio-banner studio-banner--warn" data-testid="postiz-mock-banner">
            Postiz MOCK — aucun reseau, aucune publication
          </span>
          <span className="studio-banner studio-banner--warn" data-testid="costs-mode">
            Couts MOCK — {bundle.costs.totalCents} cents simules / {bundle.costs.events} evenement(s)
          </span>
        </div>

        <div className="studio-live" aria-live="polite">
          {toast ? (
            <p className={'toast toast--' + toast.tone} role="status" data-testid="toast">{toast.message}</p>
          ) : null}
          {error ? <p className="error" role="alert" data-testid="studio-error">{error}</p> : null}
          {refreshError ? <div role="alert" className="error"><p>Actualisation impossible : {refreshError} Le dernier résultat reçu reste affiché ; son état peut avoir évolué.</p><button className="btn btn-secondary" type="button" onClick={() => void load()}>Réessayer l’actualisation</button></div> : null}
        </div>

        <div className="studio-workspace">
          <CreationDelivery bundle={bundle} refresh={load} blocked={Boolean(busy) || briefEdited || briefDirty || !!refreshError} correct={() => correctionRef.current?.focus()} scenes={<>
          <section className="studio-scenes" aria-labelledby="storyboard-heading">
            <div className="section-head"><h2 id="storyboard-heading">Scènes</h2><span className="muted small">{bundle.scenes.length} scène(s) · {totalDurationSeconds} s</span></div>
            {bundle.scenes.length ? <div className="studio-scene-strip" aria-label="Choisir une scène">
              {bundle.scenes.map((scene) => <button type="button" key={scene.id} data-testid={'scene-' + scene.sceneKey} className="studio-scene-choice" aria-pressed={selectedScene?.id === scene.id} onClick={() => { setCorrectionScene(scene.sceneKey); setCorrectionEdited(!!correction.trim()); }}>
                {scene.versions.length ? <img alt="" src={'/api/projects/' + id + '/scenes/' + scene.sceneKey + '/image?v=' + scene.versions[0].version} /> : <span className="scene-placeholder">En attente</span>}
                <span><strong>{scene.title}</strong><small>{scene.sceneKey} · {scene.durationSeconds} s</small></span>
              </button>)}
            </div> : <p className="hint">Le storyboard apparaîtra après la préparation du brief.</p>}
          <div className="actions">
            <span className="pill" data-testid="duration-summary">{bundle.scenes.length} scenes / {totalDurationSeconds} s</span>
            {job ? <span className="muted small" data-testid="job-status">{job.status} / {job.step} / {job.progress}%</span> : null}
          </div>
          {job && job.progress > 0 && job.progress < 100 ? (
            <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={job.progress}><div className="progress-bar" style={{ width: job.progress + '%' }} /></div>
          ) : null}
          {job && job.error ? <p className="error" role="alert">{job.error}</p> : null}

          </section></>} />

        <aside className="card studio-inspector stack" aria-labelledby="correction-heading">
          <div><p className="eyebrow">Scène sélectionnée</p><h2 id="correction-heading" tabIndex={-1}>{selectedScene ? selectedScene.title : 'Réglages de scène'}</h2></div>
          {selectedScene ? <>
            <p className="hint">{selectedScene.sceneKey} · {selectedScene.description}</p>
            <label className="label">Durée de la scène
              <select className="input" data-testid={'duration-' + selectedScene.sceneKey} value={selectedScene.durationSeconds} onChange={(event) => updateDuration(selectedScene.sceneKey, Number(event.target.value))} disabled={Boolean(busy) || bundle.project.status === 'producing'}>
                {Array.from({ length: 15 }, (_, index) => index + 1).map((seconds) => <option key={seconds} value={seconds}>{seconds} s</option>)}
              </select>
            </label>
            <p className="hint" data-testid={'duration-origin-' + selectedScene.sceneKey}>{selectedScene.usesBriefDuration === true ? 'Suit la durée du brief à la régénération.' : selectedScene.usesBriefDuration === false ? 'Durée personnalisée, conservée à la régénération.' : 'Durée historique, conservée à la régénération.'}</p>
            {selectedScene.usesBriefDuration !== true ? <button type="button" className="btn btn-ghost" data-testid={'duration-reset-' + selectedScene.sceneKey} onClick={() => updateDuration(selectedScene.sceneKey, null)} disabled={Boolean(busy) || !bundle.brief || briefDirty || bundle.project.status === 'producing'}>Suivre la durée du brief</button> : null}
            <label className="label">Instruction de correction
              <input ref={correctionRef} className="input" data-testid="correct-input" maxLength={500} value={correction} onChange={(event) => { setCorrection(event.target.value); setCorrectionEdited(true); }} disabled={Boolean(busy)} />
            </label>
            <button className="btn btn-secondary" data-testid="correct-submit" onClick={correctScene} disabled={Boolean(busy) || !selectedScene.versions.length || !bundle.master || !briefConfirmed || briefDirty || bundle.project.status === 'producing' || correction.trim().length < 3}>Corriger {selectedScene.sceneKey}</button>
            <p className="hint">Une version rendue, un master et un brief confirmé sont nécessaires. La correction utilise le plafond MOCK enregistré et crée une nouvelle version.</p>
            <details><summary>Versions et détails de la scène</summary><div className="scene-versions" data-testid={'scene-versions-' + selectedScene.sceneKey}>
              {selectedScene.versions.length ? selectedScene.versions.map((version) => <span className="scene-version" key={version.id}>v{version.version} / {shortChecksum(version.checksum)} / {formatDate(version.createdAt)}</span>) : <span className="hint">Aucune version rendue.</span>}
            </div></details>
          </> : <><p className="hint">Créez le storyboard pour sélectionner et régler une scène. Vous pouvez préparer votre instruction dès maintenant.</p><label className="label">Instruction de correction<input ref={correctionRef} className="input" data-testid="correct-input" maxLength={500} value={correction} onChange={(event) => { setCorrection(event.target.value); setCorrectionEdited(true); }} disabled={Boolean(busy)} /></label><button className="btn btn-secondary" data-testid="correct-submit" disabled>Correction indisponible</button></>}
        </aside>
        </div>
        <details id="studio-preparation" className="studio-preparation" open={preparationInitiallyOpen.current || Boolean(draftConflict) || undefined} onToggle={(event) => { preparationInitiallyOpen.current = event.currentTarget.open; }}>
          <summary>Préparer le brief et le storyboard</summary>
        <div className="studio-grid">
          <section className="card brief-entry" data-vululu-theme="blue" aria-labelledby="brief-heading">
            <p className="eyebrow">Votre idée → Vos références → Votre destination → Votre création</p>
            <div className="section-head">
              <h2 id="brief-heading" tabIndex={-1}>Préparer et valider le brief</h2>
              <span className="muted small">{bundle.brief ? 'Version ' + bundle.brief.version + ' / ' + bundle.brief.revisions.length + ' revision(s)' : 'A preparer'}</span>
            </div>
            <p className="hint">L’idée et les informations disponibles du contexte sont préremplies. Public, ton et appel à l’action restent nécessaires pour enregistrer le brief. Aucun choix de modèle ou de flow requis.</p>
            <p className="hint" role="status">{briefEdited ? 'Modifications du brief non enregistrées.' : bundle.brief ? 'Brief enregistré sur le serveur. Relisez sa version avant confirmation.' : 'Projet enregistré ; brief à compléter et enregistrer.'}</p>
            <p className="hint" data-testid="studio-draft-status" role="status">{draftStored ? (briefEdited || correction.trim() || chatInput.trim() ? (draftRestored ? 'Saisies locales reprises et conservées dans cet onglet.' : 'Saisies locales conservées dans cet onglet.') : 'Conservation locale active dans cet onglet.') : 'Conservation dans l’onglet indisponible : enregistrez le brief avant de quitter.'} Cette copie locale n’est pas une révision serveur ; fermer l’onglet peut l’effacer.</p>
            {draftConflict ? <div className="context-completeness stack" role="alert"><p>Un brouillon local repose sur une autre version du brief. Il n’a pas été appliqué à la version serveur actuelle. Reprenez-le explicitement ou enregistrez votre formulaire courant pour le remplacer.</p><details><summary>Consulter la saisie locale précédente</summary><dl className="journey-data"><dt>Objectif</dt><dd>{draftConflict.objective}</dd><dt>Public</dt><dd>{draftConflict.audience}</dd><dt>Ton</dt><dd>{draftConflict.tone}</dd><dt>Appel à l’action</dt><dd>{draftConflict.cta}</dd><dt>Correction</dt><dd>{draftConflict.correction}</dd><dt>Message non envoyé</dt><dd>{draftConflict.chatInput}</dd></dl></details><button className="btn btn-secondary" type="button" onClick={() => { preparationInitiallyOpen.current = true; restoreInputs(draftConflict); setBriefEdited(true); setDraftConflict(null); }}>Reprendre ces saisies comme brouillon à relire</button></div> : null}
            <form className="stack" onSubmit={saveBrief} onChange={() => setBriefEdited(true)}>
              <label className="label">Objectif
                <input ref={briefObjectiveRef} className="input" data-testid="brief-objective" value={briefObjective} onChange={(event) => setBriefObjective(event.target.value)} placeholder="Faire connaitre l offre" required disabled={Boolean(busy)} />
              </label>
              <label className="label">Audience
                <input className="input" data-testid="brief-audience" value={briefAudience} onChange={(event) => setBriefAudience(event.target.value)} placeholder="Createurs, jeunes actifs..." required disabled={Boolean(busy)} />
              </label>
              <label className="label">Ton
                <input className="input" data-testid="brief-tone" value={briefTone} onChange={(event) => setBriefTone(event.target.value)} placeholder="Premium, direct..." required disabled={Boolean(busy)} />
              </label>
              <label className="label">Appel a action
                <input className="input" data-testid="brief-cta" value={briefCta} onChange={(event) => setBriefCta(event.target.value)} placeholder="Decouvrir la collection" required disabled={Boolean(busy)} />
              </label>
              {productionSettings ? <fieldset className="stack production-profile" id="project-destination"><legend>Cadrage et réglages de production</legend>
                <label className="label">Cadrage de la vidéo<select aria-label="Ratio de sortie" className="input" value={productionSettings.ratio} disabled={Boolean(busy)} onChange={(e) => setProductionSettings({ ...productionSettings, ratio: e.target.value as typeof productionSettings.ratio })}>{(bundle.project.platform === 'TikTok' ? ['9:16'] : bundle.project.platform === 'LinkedIn' ? ['1:1', '16:9'] : ['9:16', '4:5', '1:1']).map((ratio) => <option key={ratio} value={ratio}>{ratioLabels[ratio] ?? ratio}</option>)}</select></label>
                <details data-testid="advanced-production"><summary>Style et direction simulés · réglages avancés</summary><div className="stack">
                <label className="label">Style de simulation<select aria-label="Style de simulation" className="input" value={productionSettings.visualStyle} disabled={Boolean(busy)} onChange={(e) => setProductionSettings({ ...productionSettings, visualStyle: e.target.value as typeof productionSettings.visualStyle })}><option value="editorial">Éditorial</option><option value="minimal">Minimal</option><option value="bold">Contrasté</option></select></label>
                <label className="label">Direction artistique simulée<textarea aria-label="Direction artistique simulée" className="input" value={productionSettings.direction} maxLength={1000} disabled={Boolean(busy)} onChange={(e) => setProductionSettings({ ...productionSettings, direction: e.target.value })} /></label>
                <p className="hint">La direction fait varier le décor de façon déterministe. Aucun modèle IA n’interprète le texte.</p>
                </div></details>
                <label className="label">Durée par défaut d’une scène (secondes)<input className="input" type="number" min={1} max={15} value={productionSettings.defaultSceneDurationSeconds} disabled={Boolean(busy)} onChange={(e) => setProductionSettings({ ...productionSettings, defaultSceneDurationSeconds: Number(e.target.value) })} /></label>
                <label className="label">Plafond du run en centimes MOCK<input className="input" type="number" min={0} max={100000} step={1} value={productionSettings.maxMockCents} disabled={Boolean(busy)} onChange={(e) => setProductionSettings({ ...productionSettings, maxMockCents: Number(e.target.value) })} /></label>
                <p className="hint">Voix et musique : fichiers et mix en cours de qualification. Cette tranche produit une piste silencieuse.</p>
              </fieldset> : null}
              <button className="btn btn-secondary" data-testid="brief-save" type="submit" disabled={Boolean(busy)}>
                {bundle.brief ? 'Enregistrer une nouvelle révision' : 'Enregistrer le brouillon du brief'}
              </button>
            </form>
            {bundle.brief ? <section className="production-plan stack" aria-labelledby="production-plan-heading" data-testid="production-plan">
              <h3 id="production-plan-heading">Plan et estimation MOCK</h3>
              <button className="btn btn-ghost btn-small" type="button" disabled={Boolean(busy) || refreshingPlan} onClick={() => void refreshPlan()}>Recalculer le plan</button>
              {briefDirty ? <p className="hint">Enregistrez vos modifications pour actualiser ce plan.</p> : null}
              {planError ? <p className="error" role="alert">{planError}</p> : plan ? <>
                <p><strong>{bundle.project.format === 'Video' ? 'Livrables prévus : aperçus des scènes, montage vidéo MP4 et rapport de contrôle qualité.' : 'Livrables indisponibles : la production de ce format n’est pas encore qualifiée.'}</strong></p>
                <p>{plan.sceneCount} scènes · {plan.durationSeconds} s · {plan.ratio}</p>
                <p data-testid="plan-estimate">Estimation indicative : {plan.pricing.estimatedCents} centimes MOCK. Plafond du brief : {plan.pricing.ceilingCents} centimes MOCK.</p>
                <p className="hint">{plan.executionMode === 'local' ? 'Rendu local sans invocation fournisseur.' : 'Routage simulé avec fallback admissible. Maximum du scénario : ' + plan.pricing.maxPossibleCents + ' centimes MOCK.'} Aucun paiement réel.</p>
                <ol>{plan.steps.map((step) => <li key={step.key}>{stepLabel(step.key)}<span className="hint">{step.dependsOn.length ? ' — après ' + step.dependsOn.map(stepLabel).join(', ') : ' — début du plan'}</span></li>)}</ol>
                {!plan.ready ? <ul role="alert">{plan.issues.map((issue) => <li key={issue.code}>{issue.message}</li>)}</ul> : null}
              </> : <p role="status">Calcul du plan…</p>}
            </section> : null}
            {bundle.brief ? <div className="stack"><p className="hint">{briefConfirmed ? 'Version exacte confirmée.' : 'Relisez le plan et cette version puis confirmez le brief et son plafond avant le lancement.'}{briefDirty ? ' Enregistrez d’abord vos modifications.' : ''}</p><button type="button" className="btn btn-secondary" data-testid="brief-confirm" disabled={briefConfirmed || briefDirty || Boolean(busy) || !planReady || !bundle.brief.revisions.length} onClick={confirmBrief}>Confirmer la version {bundle.brief.version} du brief et son plafond</button></div> : null}
            {bundle.brief && bundle.brief.revisions.length > 0 ? (
              <details className="history-details">
                <summary>Historique des revisions ({bundle.brief.revisions.length})</summary>
                <ul className="history-list">
                  {bundle.brief.revisions.map((revision) => (
                    <li key={revision.id}>
                      <span className="pill">v{revision.version}</span>
                      <span className="muted small">{formatDate(revision.createdAt)} / {shortChecksum(revision.checksum)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            <button className="btn btn-primary full-width" data-testid="storyboard-generate" onClick={generateStoryboard} disabled={!briefConfirmed || briefDirty || Boolean(busy) || activeRun || bundle.project.status === 'producing'}>
              Générer le storyboard
            </button>
          </section>
          <details className="card chat-card" data-testid="studio-assistance"><summary>Assistance MOCK facultative</summary>
            <div className="section-head">
              <h2 id="chat-heading">Conversation avec Vululu</h2>
              <span className="pill">Simulation MOCK</span>
            </div>
            <div className="messages" ref={messagesRef}>
              {bundle.messages.length === 0 ? (
                <div className="message assistant">
                  <span className="message-role">Vululu</span>
                  <p>Simulation MOCK : je peux proposer un brief à relire ou préparer une correction par Scene ID. Commencez par une proposition ou déclarez Objectif:, Audience:, Ton: et CTA: dans le message.</p>
                </div>
              ) : bundle.messages.map((message) => (
                <div className={'message ' + message.role} key={message.id}>
                  <span className="message-role">{message.role === 'assistant' ? 'Vululu' : 'Toi'}</span>
                  <p>{message.content}</p>
                  {message.proposal ? <ConversationProposalCard messageId={message.id} proposal={message.proposal} blockedReason={proposalBlockedReason(message.proposal)} preserveDraft={hasUnsavedBrief} onApply={applyProposal} /> : null}
                </div>
              ))}
            </div>
            <div className="conversation-actions">
              <button type="button" className="btn btn-ghost" disabled={Boolean(busy)} onClick={() => runAction('chat', () => postJson('/api/projects/' + id + '/messages', { content: '/brief' }))}>Proposer un brief MOCK</button>
              <button type="button" className="btn btn-ghost" disabled={Boolean(busy)} onClick={() => runAction('chat', () => postJson('/api/projects/' + id + '/messages', { content: '/aide' }))}>Aide à la conversation</button>
            </div>
            <form className="composer" onSubmit={sendMessage}>
              <label className="label sr-only" htmlFor="chat-input-field">Message a Vululu</label>
              <textarea id="chat-input-field" className="input" data-testid="chat-input" aria-describedby="chat-format-help" maxLength={2000} rows={3} value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder={'Objectif: …\nAudience: …\nTon: …\nCTA: …'} disabled={Boolean(busy)} />
              <button className="btn btn-secondary" data-testid="chat-send" type="submit" disabled={Boolean(busy)}>Envoyer</button>
            </form>
            <p className="hint" id="chat-format-help">Scénarios MOCK : /brief, /aide ou SCENE-003: votre instruction. Les propositions préremplissent les formulaires après votre clic.</p>
          </details>

        </div>


        </details>
        <details className="studio-preparation"><summary>Parcours et plan de production</summary>
        <ProjectJourney bundle={bundle} plan={plan} planError={planError} briefDirty={briefEdited || briefDirty} refreshing={refreshingPlan} refresh={() => void refreshPlan()} />


        </details>
      </main>
    </div>
  );
}
