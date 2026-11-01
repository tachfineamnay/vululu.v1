'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, patchJson, postJson, MasterVersion, ProjectBundle } from '../lib/api';
import StudioNav from './StudioNav';

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

const stepLabels: Record<string, string> = {
  'validate-snapshot': 'Validation du snapshot',
  'resolve-capabilities': 'Resolution des capacites',
  'render-scenes': 'Rendu des 5 scenes',
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

function qaChecks(master: MasterVersion | null): Array<{ name: string; status: string; detail: string }> {
  if (!master || !master.qaReport) return [];
  const report = master.qaReport as { checks?: Array<{ name: string; status: string; detail: string }> };
  return report.checks || [];
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
  const [correction, setCorrection] = useState('Rends le produit plus visible et garde le personnage.');
  const [correctionScene, setCorrectionScene] = useState('SCENE-003');
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [compareVersion, setCompareVersion] = useState<number | null>(null);
  const [briefObjective, setBriefObjective] = useState('');
  const [briefAudience, setBriefAudience] = useState('');
  const [briefTone, setBriefTone] = useState('');
  const [briefCta, setBriefCta] = useState('');
  const briefLoaded = useRef(false);
  const bundleRef = useRef<ProjectBundle | null>(null);
  const lastMasterVersionRef = useRef<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const correctionRef = useRef<HTMLInputElement | null>(null);

  function notify(message: string, tone: 'success' | 'error' = 'success'): void {
    setToast({ id: Date.now(), message, tone });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4200);
  }

  const load = useCallback(async () => {
    try {
      const data = await api<ProjectBundle>('/api/projects/' + id);
      bundleRef.current = data;
      const nextMasterVersion = data.master ? data.master.version : null;
      if (lastMasterVersionRef.current !== null && nextMasterVersion !== null && lastMasterVersionRef.current !== nextMasterVersion) {
        setSelectedVersion(null);
        setCompareVersion(null);
      }
      lastMasterVersionRef.current = nextMasterVersion;
      setBundle(data);
      setError('');
      if (!briefLoaded.current && data.brief) {
        setBriefObjective(data.brief.objective);
        setBriefAudience(data.brief.audience);
        setBriefTone(data.brief.tone);
        setBriefCta(data.brief.cta);
        briefLoaded.current = true;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Projet introuvable.';
      if (!bundleRef.current) setError(message);
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

  async function runAction(name: string, action: () => Promise<unknown>, successMessage?: string) {
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
      setBusy('');
    }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!chatInput.trim()) return;
    const content = chatInput.trim();
    setChatInput('');
    await runAction('chat', () => postJson('/api/projects/' + id + '/messages', { content }), 'Message envoye a Vululu.');
  }

  async function saveBrief(event: FormEvent) {
    event.preventDefault();
    if (!bundle) return;
    await runAction('brief', () => patchJson('/api/projects/' + id + '/brief', {
      objective: briefObjective,
      audience: briefAudience,
      tone: briefTone,
      cta: briefCta,
      platform: bundle.project.platform,
      format: bundle.project.format
    }), 'Brief enregistre. Une nouvelle revision est conservee.');
  }

  async function generateStoryboard() {
    await runAction('storyboard', () => postJson('/api/projects/' + id + '/storyboard', {}), 'Storyboard de 5 scenes genere.');
  }

  async function produce() {
    await runAction('produce', () => postJson('/api/projects/' + id + '/produce', {}), 'Production lancee. Suivez les etapes ci-dessous.');
  }

  async function correctScene() {
    const sceneKey = correctionScene;
    await runAction('correct', () => postJson('/api/projects/' + id + '/scenes/' + sceneKey + '/correct', {
      instruction: correction
    }), 'Correction de ' + sceneKey + ' lancee. Le master precedent est conserve.');
  }

  async function updateDuration(sceneKey: string, durationSeconds: number) {
    await runAction('duration', () => patchJson('/api/projects/' + id + '/scenes/' + sceneKey, {
      durationSeconds
    }), 'Duree de ' + sceneKey + ' mise a jour.');
  }

  async function approveMaster(version: MasterVersion) {
    await runAction('approve', () => postJson('/api/projects/' + id + '/approve', {
      artifactVersionId: version.id,
      checksum: version.checksum
    }), 'Version exacte approuvee (v' + version.version + ').');
  }

  async function transferMaster() {
    await runAction('transfer', () => postJson('/api/projects/' + id + '/transfer', {}), 'Transfert Postiz MOCK soumis.');
  }

  async function logout() {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    router.push('/login');
  }

  function focusCorrection(sceneKey: string): void {
    setCorrectionScene(sceneKey);
    correctionRef.current?.focus();
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

  const master = bundle.master;
  const activeVersion = selectedVersion || (master ? master.version : 0);
  const activeMaster = bundle.masterVersions.find((item) => item.version === activeVersion) || master;
  const effectiveCompareVersion = compareVersion || (bundle.masterVersions.find((item) => item.version !== activeVersion) || master)?.version || null;
  const canProduce = bundle.scenes.length === 5 && !busy;
  const job = bundle.job;
  const jobRun = bundle.jobRun;
  const checks = qaChecks(activeMaster);
  const approval = activeMaster ? activeMaster.approval : null;
  const approvalValid = Boolean(approval && !approval.invalidatedAt);
  const transferRecord = approval && !approval.invalidatedAt ? approval.transfer : null;
  const totalDurationSeconds = bundle.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
  const isLatestMaster = Boolean(master && activeMaster && activeMaster.version === master.version);
  const selectedScene = bundle.scenes.find((scene) => scene.sceneKey === correctionScene) || bundle.scenes[0] || null;

  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/" className="brand"><span className="brand-mark small">V</span><span>Vululu AI</span></Link>
        <StudioNav />
        <div className="topbar-actions">
          <span className="muted small studio-context-label">{bundle.context.name}</span>
          <button className="btn btn-ghost" onClick={logout}>Sortir</button>
        </div>
      </header>

      <main className="page studio-page">
        <section className="studio-head">
          <div>
            <p className="eyebrow">Studio V1 / {bundle.context.name} / {bundle.project.platform} / {bundle.project.format}</p>
            <h1 data-testid="project-title-heading">{bundle.project.title}</h1>
            <p className="muted">{bundle.project.objective}</p>
          </div>
          <span className={'badge status-' + bundle.project.status} data-testid="status-badge">{statusLabel(bundle.project.status)}</span>
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
        </div>

        <div className="studio-grid">
          <section className="card chat-card" aria-labelledby="chat-heading">
            <div className="section-head">
              <h2 id="chat-heading">Conversation avec Vululu</h2>
              <span className="pill">Reponses deterministes</span>
            </div>
            <div className="messages">
              {bundle.messages.length === 0 ? (
                <div className="message assistant">
                  <span className="message-role">Vululu</span>
                  <p>Bonjour. Je peux preparer le brief, produire cinq scenes deterministes et corriger n importe quelle scene. Commence par le brief ci-dessous, ou ecris-moi.</p>
                </div>
              ) : bundle.messages.map((message) => (
                <div className={'message ' + message.role} key={message.id}>
                  <span className="message-role">{message.role === 'assistant' ? 'Vululu' : 'Toi'}</span>
                  <p>{message.content}</p>
                </div>
              ))}
            </div>
            <form className="composer" onSubmit={sendMessage}>
              <label className="label sr-only" htmlFor="chat-input-field">Message a Vululu</label>
              <input id="chat-input-field" className="input" data-testid="chat-input" value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder="Ecris a Vululu..." />
              <button className="btn btn-secondary" data-testid="chat-send" type="submit" disabled={busy === 'chat'}>Envoyer</button>
            </form>
          </section>

          <section className="card" aria-labelledby="brief-heading">
            <div className="section-head">
              <h2 id="brief-heading">Brief versionne</h2>
              <span className="muted small">{bundle.brief ? 'Version ' + bundle.brief.version + ' / ' + bundle.brief.revisions.length + ' revision(s)' : 'A preparer'}</span>
            </div>
            <form className="stack" onSubmit={saveBrief}>
              <label className="label">Objectif
                <input className="input" data-testid="brief-objective" value={briefObjective} onChange={(event) => setBriefObjective(event.target.value)} placeholder="Faire connaitre l offre" required />
              </label>
              <label className="label">Audience
                <input className="input" data-testid="brief-audience" value={briefAudience} onChange={(event) => setBriefAudience(event.target.value)} placeholder="Createurs, jeunes actifs..." required />
              </label>
              <label className="label">Ton
                <input className="input" data-testid="brief-tone" value={briefTone} onChange={(event) => setBriefTone(event.target.value)} placeholder="Premium, direct..." required />
              </label>
              <label className="label">Appel a action
                <input className="input" data-testid="brief-cta" value={briefCta} onChange={(event) => setBriefCta(event.target.value)} placeholder="Decouvrir la collection" required />
              </label>
              <button className="btn btn-secondary" data-testid="brief-save" type="submit" disabled={busy === 'brief'}>
                {bundle.brief ? 'Mettre a jour le brief' : 'Preparer le brief'}
              </button>
            </form>
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
            <button className="btn btn-primary full-width" data-testid="storyboard-generate" onClick={generateStoryboard} disabled={!bundle.brief || busy === 'storyboard'}>
              Generer le storyboard de 5 scenes
            </button>
          </section>
        </div>

        <section className="card" aria-labelledby="storyboard-heading">
          <div className="section-head">
            <h2 id="storyboard-heading">Storyboard et production</h2>
            <span className="muted small">{bundle.scenes.length} / 5 scenes</span>
          </div>
          {bundle.scenes.length === 0 ? (
            <p className="muted">Le storyboard apparaitra apres la preparation du brief.</p>
          ) : (
            <div className="scene-grid">
              {bundle.scenes.map((scene) => {
                const latest = scene.versions.length > 0 ? scene.versions[0] : null;
                return (
                  <article className="scene-card" data-testid={'scene-' + scene.sceneKey} key={scene.id}>
                    <div className="scene-image-wrap">
                      {latest ? (
                        <img className="scene-image" alt={'Scene ' + scene.sceneKey + ' : ' + scene.title} src={'/api/projects/' + id + '/scenes/' + scene.sceneKey + '/image?v=' + latest.version} />
                      ) : (
                        <div className="scene-placeholder">Scene en attente</div>
                      )}
                    </div>
                    <div className="scene-meta">
                      <span className="scene-key">{scene.sceneKey}</span>
                      <strong>{scene.title}</strong>
                      <p className="muted small">{scene.description}</p>
                      <label className="label duration-label">Duree
                        <select className="input duration-select" data-testid={'duration-' + scene.sceneKey} value={scene.durationSeconds} onChange={(event) => updateDuration(scene.sceneKey, Number(event.target.value))} disabled={busy !== '' || bundle.project.status === 'producing'}>
                          <option value={2}>2 s</option>
                          <option value={5}>5 s</option>
                          <option value={10}>10 s</option>
                        </select>
                      </label>
                      <div className="scene-actions">
                        <button type="button" className="btn btn-ghost btn-small" data-testid={'correct-scene-' + scene.sceneKey} onClick={() => focusCorrection(scene.sceneKey)}>
                          Corriger cette scene
                        </button>
                        {latest ? <span className="pill">v{latest.version}</span> : null}
                      </div>
                      <div className="scene-versions" data-testid={'scene-versions-' + scene.sceneKey}>
                        {scene.versions.length === 0 ? (
                          <span className="muted small">Aucune version rendue.</span>
                        ) : scene.versions.slice(0, 3).map((version) => (
                          <span className="scene-version" key={version.id}>
                            v{version.version} / {shortChecksum(version.checksum)} / {formatDate(version.createdAt)}
                          </span>
                        ))}
                        {scene.versions.length > 1 ? <span className="muted small">Les versions precedentes sont conservees.</span> : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          <div className="actions">
            <button className="btn btn-primary" data-testid="produce" onClick={produce} disabled={!canProduce || busy === 'produce'}>
              Produire les 5 scenes
            </button>
            <span className="pill" data-testid="duration-summary">{bundle.scenes.length} scenes / {totalDurationSeconds} s</span>
            {job ? <span className="muted small" data-testid="job-status">{job.status} / {job.step} / {job.progress}%</span> : null}
          </div>
          {job && job.progress > 0 && job.progress < 100 ? (
            <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={job.progress}><div className="progress-bar" style={{ width: job.progress + '%' }} /></div>
          ) : null}
          {job && job.error ? <p className="error" role="alert">{job.error}</p> : null}
        </section>

        <section className="card" aria-labelledby="job-heading">
          <div className="section-head">
            <h2 id="job-heading">Suivi des etapes du job</h2>
            <span className="muted small">{jobRun ? jobRun.orchestrator || 'local' : 'aucun run'}</span>
          </div>
          <div className="timeline" data-testid="job-steps">
            {!jobRun || jobRun.steps.length === 0 ? (
              <p className="muted">Aucune etape enregistree pour ce projet.</p>
            ) : jobRun.steps.map((step) => (
              <div className={'timeline-step status-' + step.status} key={step.name}>
                <span className={'dot ' + (step.status === 'succeeded' ? 'dot-pass' : step.status === 'failed' ? 'dot-fail' : 'dot-pending')} aria-hidden="true" />
                <div>
                  <strong>{stepLabel(step.name)}</strong>
                  <span className="muted small"> {step.status}</span>
                  {step.attempts > 0 ? <span className="muted small"> / {step.attempts} tentative(s)</span> : null}
                  {step.error ? <p className="error small">{step.error}</p> : null}
                </div>
                <span className="muted small">{formatDate(step.finishedAt || step.startedAt)}</span>
              </div>
            ))}
          </div>
          {jobRun ? (
            <p className="hint">Trace : {jobRun.traceId || 'non exposee'} / workflow : {jobRun.workflowRunId || 'local'} / statut run : {jobRun.status}</p>
          ) : null}
          <p className="hint">Pause, annulation et relance ne sont pas proposees : l API ne garantit pas l arret du rendu ni un remboursement. Aucun cout IA reel n est engage (MOCK).</p>
        </section>

        <section className="card" aria-labelledby="correction-heading">
          <div className="section-head">
            <h2 id="correction-heading">Correction ciblee par Scene ID</h2>
            <span className="pill">Toutes les scenes autorisees</span>
          </div>
          <div className="correction-grid">
            <label className="label">Scene a corriger
              <select className="input" data-testid="correct-scene" value={correctionScene} onChange={(event) => setCorrectionScene(event.target.value)} disabled={busy === 'correct'}>
                {bundle.scenes.map((scene) => (
                  <option key={scene.id} value={scene.sceneKey}>{scene.sceneKey} — {scene.title}</option>
                ))}
              </select>
            </label>
            <label className="label correction-instruction">Instruction de correction
              <input ref={correctionRef} className="input" data-testid="correct-input" value={correction} onChange={(event) => setCorrection(event.target.value)} />
            </label>
            <button className="btn btn-secondary" data-testid="correct-submit" onClick={correctScene} disabled={busy === 'correct' || !selectedScene}>
              Corriger {correctionScene}
            </button>
          </div>
          <p className="hint">La correction ne relance que la scene ciblee et les etapes dependantes ; les autres scenes et les versions precedentes sont conservees. Une nouvelle version invalide l approbation precedente.</p>
        </section>

        {master ? (
          <section className="card studio-card" aria-labelledby="preview-heading">
            <div className="section-head">
              <h2 id="preview-heading">Preview, provenance et comparaison</h2>
              <span className="pill" data-testid="master-version">Master v{activeVersion}</span>
            </div>
            <div className="studio-preview">
              <div className="compare-grid">
                <div>
                  <p className="small-label">Version affichee</p>
                  <select className="input" data-testid="version-select" value={activeVersion} onChange={(event) => { setSelectedVersion(Number(event.target.value)); setCompareVersion(null); }}>
                    {bundle.masterVersions.map((version) => (
                      <option key={version.id} value={version.version}>Version {version.version} — {version.qaStatus || 'QA inconnue'}</option>
                    ))}
                  </select>
                  <video key={'master-' + activeVersion} className="player" data-testid="master-video" controls aria-label={'Master version ' + activeVersion} src={'/api/projects/' + id + '/master?v=' + activeVersion} />
                </div>
                <div>
                  <p className="small-label">Version de comparaison</p>
                  {bundle.masterVersions.length > 1 ? (
                    <>
                      <select className="input" data-testid="compare-version" value={effectiveCompareVersion || ''} onChange={(event) => setCompareVersion(Number(event.target.value))}>
                        {bundle.masterVersions.map((version) => (
                          <option key={version.id} value={version.version}>Version {version.version} — {version.qaStatus || 'QA inconnue'}</option>
                        ))}
                      </select>
                      <video key={'compare-' + effectiveCompareVersion} className="player" data-testid="master-video-compare" controls aria-label={'Master de comparaison version ' + effectiveCompareVersion} src={'/api/projects/' + id + '/master?v=' + effectiveCompareVersion} />
                    </>
                  ) : (
                    <p className="muted">Une seule version : la comparaison devient disponible apres une correction.</p>
                  )}
                </div>
              </div>
            </div>
            <div className="provenance-grid" data-testid="provenance">
              <div><span className="small-label">Version</span><strong>v{activeVersion}</strong></div>
              <div><span className="small-label">Checksum</span><code className="mono small">{shortChecksum(activeMaster ? activeMaster.checksum : '')}</code></div>
              <div><span className="small-label">QA</span><strong>{activeMaster ? activeMaster.qaStatus || 'NOT_RUN' : 'aucune'}</strong></div>
              <div><span className="small-label">Rendu</span><strong>Deterministe (Sharp/FFmpeg)</strong></div>
              <div><span className="small-label">Produit le</span><strong>{formatDate(activeMaster ? activeMaster.createdAt : null)}</strong></div>
              <div><span className="small-label">Approbation</span><strong>{approvalValid ? 'exacte v' + (activeMaster ? activeMaster.version : '') : 'non approuvee'}</strong></div>
            </div>
          </section>
        ) : null}

        {activeMaster ? (
          <section className="card" aria-labelledby="qa-heading">
            <div className="section-head">
              <h2 id="qa-heading">Qualite, approbation et transfert</h2>
              <span className={'badge ' + (activeMaster.qaStatus === 'PASS' ? 'status-approved' : 'status-failed')} data-testid="qa-status">
                QA {activeMaster.qaStatus || 'NOT_RUN'}
              </span>
            </div>
            <div className="qa-list" data-testid="qa-checks">
              {checks.length === 0 ? <p className="muted">Aucun detail QA disponible.</p> : checks.map((check) => (
                <div className="list-row" key={check.name}>
                  <span className={'dot ' + (check.status === 'PASS' ? 'dot-pass' : 'dot-fail')} aria-hidden="true" />
                  <span>{check.name}</span>
                  <span className="muted small">{check.detail}</span>
                </div>
              ))}
            </div>
            <p className="hint">QA technique (dimensions, codecs, duree, checksums). Les droits de licence et la conformite creative ne sont pas encore verifies automatiquement.</p>
            <div className="actions">
              {approvalValid ? (
                <span className="pill" data-testid="approval-status">Master approuve v{activeMaster.version} / {shortChecksum(approval ? approval.checksum : '')}</span>
              ) : (
                <>
                  {approval && approval.invalidatedAt ? <span className="pill" data-testid="approval-invalidated">Approbation invalidee par une nouvelle version</span> : null}
                  <button className="btn btn-primary" data-testid="approve" onClick={() => approveMaster(activeMaster)} disabled={busy === 'approve' || !isLatestMaster}>
                    Valider le master v{activeMaster.version}
                  </button>
                  {!isLatestMaster ? <span className="muted small">Selectionnez la version courante pour approuver.</span> : null}
                </>
              )}
              {approvalValid && !transferRecord ? (
                <button className="btn btn-secondary" data-testid="transfer" onClick={transferMaster} disabled={busy === 'transfer' || !isLatestMaster}>
                  Transferer vers Postiz (mock)
                </button>
              ) : null}
              {transferRecord ? <span className="pill" data-testid="transfer-status">Transfert MOCK {transferRecord.status} / {transferRecord.provider}</span> : null}
            </div>
            <p className="hint">Postiz est simule localement (provider postiz-mock). Aucun envoi reseau, aucune publication reelle ; transfere ne signifie pas publie.</p>
          </section>
        ) : null}

        <section className="card" aria-labelledby="history-heading">
          <div className="section-head">
            <h2 id="history-heading">Historique des masters</h2>
            <span className="muted small">{bundle.masterVersions.length} version(s)</span>
          </div>
          {bundle.masterVersions.length === 0 ? (
            <p className="muted">Aucune version produite.</p>
          ) : (
            <div className="history-table-wrap">
              <table className="history-table">
                <caption className="sr-only">Historique des masters avec QA, approbation et transfert</caption>
                <thead>
                  <tr><th scope="col">Version</th><th scope="col">QA</th><th scope="col">Checksum</th><th scope="col">Approbation</th><th scope="col">Transfert</th><th scope="col">Date</th><th scope="col">Actions</th></tr>
                </thead>
                <tbody>
                  {bundle.masterVersions.map((version) => (
                    <tr key={version.id}>
                      <th scope="row">v{version.version}</th>
                      <td>{version.qaStatus || 'NOT_RUN'}</td>
                      <td><code className="mono small">{shortChecksum(version.checksum)}</code></td>
                      <td>{version.approval ? (version.approval.invalidatedAt ? 'invalidee' : 'approuvee') : 'non approuvee'}</td>
                      <td>{version.approval && version.approval.transfer ? version.approval.transfer.provider + ' / ' + version.approval.transfer.status : '—'}</td>
                      <td>{formatDate(version.createdAt)}</td>
                      <td className="history-actions">
                        <button type="button" className="btn btn-ghost btn-small" onClick={() => { setSelectedVersion(version.version); }}>Afficher</button>
                        {bundle.masterVersions.length > 1 ? <button type="button" className="btn btn-ghost btn-small" onClick={() => setCompareVersion(version.version)}>Comparer</button> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
