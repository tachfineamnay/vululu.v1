'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, patchJson, postJson, MasterVersion, ProjectBundle } from '../lib/api';

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

function statusLabel(status: string): string {
  return statusLabels[status] || status;
}

function shortChecksum(value: string): string {
  if (value.length <= 14) {
    return value;
  }
  return value.slice(0, 12) + '...';
}

function qaChecks(master: MasterVersion | null): Array<{ name: string; status: string; detail: string }> {
  if (!master || !master.qaReport) {
    return [];
  }
  const report = master.qaReport as { checks?: Array<{ name: string; status: string; detail: string }> };
  return report.checks || [];
}

export default function ProjectStudio({ id }: { id: string }) {
  const router = useRouter();
  const [bundle, setBundle] = useState<ProjectBundle | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [correction, setCorrection] = useState('Rends le produit plus visible et garde le personnage.');
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [briefObjective, setBriefObjective] = useState('');
  const [briefAudience, setBriefAudience] = useState('');
  const [briefTone, setBriefTone] = useState('');
  const [briefCta, setBriefCta] = useState('');
  const briefLoaded = useRef(false);
  const bundleRef = useRef<ProjectBundle | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<ProjectBundle>('/api/projects/' + id);
      bundleRef.current = data;
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
      if (!bundleRef.current) {
        setError(message);
      }
      if (message.toLowerCase().includes('session')) {
        router.push('/login');
      }
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    void load();
    pollRef.current = setInterval(() => {
      void load();
    }, 1500);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [load]);

  async function runAction(name: string, action: () => Promise<unknown>) {
    setBusy(name);
    setError('');
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action impossible.');
    } finally {
      setBusy('');
    }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!chatInput.trim()) {
      return;
    }
    const content = chatInput.trim();
    setChatInput('');
    await runAction('chat', () => postJson('/api/projects/' + id + '/messages', { content }));
  }

  async function saveBrief(event: FormEvent) {
    event.preventDefault();
    if (!bundle) {
      return;
    }
    await runAction('brief', () => patchJson('/api/projects/' + id + '/brief', {
      objective: briefObjective,
      audience: briefAudience,
      tone: briefTone,
      cta: briefCta,
      platform: bundle.project.platform,
      format: bundle.project.format
    }));
  }

  async function generateStoryboard() {
    await runAction('storyboard', () => postJson('/api/projects/' + id + '/storyboard', {}));
  }

  async function produce() {
    await runAction('produce', () => postJson('/api/projects/' + id + '/produce', {}));
  }

  async function correctScene() {
    await runAction('correct', () => postJson('/api/projects/' + id + '/scenes/SCENE-003/correct', {
      instruction: correction
    }));
  }

  async function approveMaster() {
    if (!bundle || !bundle.master) {
      return;
    }
    await runAction('approve', () => postJson('/api/projects/' + id + '/approve', {
      artifactVersionId: bundle.master!.id,
      checksum: bundle.master!.checksum
    }));
  }

  async function transferMaster() {
    await runAction('transfer', () => postJson('/api/projects/' + id + '/transfer', {}));
  }

  async function logout() {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore.
    }
    router.push('/login');
  }

  if (loading) {
    return <div className="shell"><main className="page"><p className="muted">Chargement du studio...</p></main></div>;
  }

  if (!bundle) {
    return (
      <div className="shell">
        <main className="page narrow">
          <p className="error">{error || 'Projet introuvable.'}</p>
          <Link href="/" className="btn btn-secondary">Retour</Link>
        </main>
      </div>
    );
  }

  const master = bundle.master;
  const activeVersion = selectedVersion || (master ? master.version : 0);
  const activeMaster = bundle.masterVersions.find((item) => item.version === activeVersion) || master;
  const canProduce = bundle.scenes.length === 5 && !busy;
  const job = bundle.job;
  const checks = qaChecks(master);
  const transferRecord = master && master.approval ? master.approval.transfer : null;

  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/" className="brand"><span className="brand-mark small">V</span><span>Vululu AI</span></Link>
        <div className="topbar-actions">
          <Link className="text-link" href="/">Accueil</Link>
          <button className="btn btn-ghost" onClick={logout}>Sortir</button>
        </div>
      </header>

      <main className="page studio-page">
        <section className="studio-head">
          <div>
            <p className="eyebrow">{bundle.context.name} / {bundle.project.platform} / {bundle.project.format}</p>
            <h1 data-testid="project-title-heading">{bundle.project.title}</h1>
            <p className="muted">{bundle.project.objective}</p>
          </div>
          <span className={'badge status-' + bundle.project.status} data-testid="status-badge">{statusLabel(bundle.project.status)}</span>
        </section>

        {error ? <p className="error" data-testid="studio-error">{error}</p> : null}

        <div className="studio-grid">
          <section className="card chat-card">
            <div className="section-head">
              <h2>Conversation avec Vululu</h2>
              <span className="pill">Interlocutrice unique</span>
            </div>
            <div className="messages">
              {bundle.messages.length === 0 ? (
                <div className="message assistant">
                  <span className="message-role">Vululu</span>
                  <p>Bonjour. Je peux t aider a preparer le brief, produire cinq scenes et corriger la scene 3. Commence par le brief ci-dessous, ou ecris-moi.</p>
                </div>
              ) : (
                bundle.messages.map((message) => (
                  <div className={'message ' + message.role} key={message.id}>
                    <span className="message-role">{message.role === 'assistant' ? 'Vululu' : 'Toi'}</span>
                    <p>{message.content}</p>
                  </div>
                ))
              )}
            </div>
            <form className="composer" onSubmit={sendMessage}>
              <input
                className="input"
                data-testid="chat-input"
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="Ecris a Vululu..."
              />
              <button className="btn btn-secondary" data-testid="chat-send" type="submit" disabled={busy === 'chat'}>Envoyer</button>
            </form>
          </section>

          <section className="card">
            <div className="section-head">
              <h2>Brief</h2>
              <span className="muted small">{bundle.brief ? 'Version ' + bundle.brief.version : 'A preparer'}</span>
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
            <button className="btn btn-primary full-width" data-testid="storyboard-generate" onClick={generateStoryboard} disabled={!bundle.brief || busy === 'storyboard'}>
              Generer le storyboard de 5 scenes
            </button>
          </section>
        </div>

        <section className="card">
          <div className="section-head">
            <h2>Storyboard et production</h2>
            <span className="muted small">{bundle.scenes.length} / 5 scenes</span>
          </div>
          {bundle.scenes.length === 0 ? (
            <p className="muted">Le storyboard apparaitra apres la validation du brief.</p>
          ) : (
            <div className="scene-grid">
              {bundle.scenes.map((scene) => {
                const latest = scene.versions.length > 0 ? scene.versions[0] : null;
                return (
                  <article className="scene-card" data-testid={'scene-' + scene.sceneKey} key={scene.id}>
                    <div className="scene-image-wrap">
                      {latest ? (
                        <img
                          className="scene-image"
                          alt={scene.title}
                          src={'/api/projects/' + id + '/scenes/' + scene.sceneKey + '/image?v=' + latest.version}
                        />
                      ) : (
                        <div className="scene-placeholder">Scene en attente</div>
                      )}
                    </div>
                    <div className="scene-meta">
                      <span className="scene-key">{scene.sceneKey}</span>
                      <strong>{scene.title}</strong>
                      <p className="muted small">{scene.description}</p>
                      {latest ? <span className="pill">v{latest.version} / {shortChecksum(latest.checksum)}</span> : null}
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
            {job ? (
              <span className="muted small" data-testid="job-status">
                {job.status} / {job.step} / {job.progress}%
              </span>
            ) : null}
          </div>
          {job && job.progress > 0 && job.progress < 100 ? (
            <div className="progress"><div className="progress-bar" style={{ width: job.progress + '%' }} /></div>
          ) : null}
          {job && job.error ? <p className="error">{job.error}</p> : null}
        </section>

        {master ? (
          <section className="card studio-card">
            <div className="section-head">
              <h2>Studio et preview</h2>
              <span className="pill" data-testid="master-version">Master v{master.version}</span>
            </div>
            <div className="studio-preview">
              <video
                key={'master-' + activeVersion}
                className="player"
                data-testid="master-video"
                controls
                src={'/api/projects/' + id + '/master?v=' + activeVersion}
              />
              <div className="stack">
                <label className="label">Version du master
                  <select
                    className="input"
                    data-testid="version-select"
                    value={activeVersion}
                    onChange={(event) => setSelectedVersion(Number(event.target.value))}
                  >
                    {bundle.masterVersions.map((version) => (
                      <option key={version.id} value={version.version}>Version {version.version} — {version.qaStatus || 'QA inconnue'}</option>
                    ))}
                  </select>
                </label>
                <p className="muted small">Checksum : {shortChecksum(activeMaster ? activeMaster.checksum : '')}</p>
                <div className="divider" />
                <label className="label">Corriger SCENE-003
                  <input className="input" data-testid="correct-input" value={correction} onChange={(event) => setCorrection(event.target.value)} />
                </label>
                <button className="btn btn-secondary" data-testid="correct-submit" onClick={correctScene} disabled={busy === 'correct'}>
                  Corriger la scene 3
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {master ? (
          <section className="card">
            <div className="section-head">
              <h2>Qualite, approbation et transfert</h2>
              <span className={'badge ' + (master.qaStatus === 'PASS' ? 'status-approved' : 'status-failed')} data-testid="qa-status">
                QA {master.qaStatus || 'NOT_RUN'}
              </span>
            </div>
            <div className="qa-list" data-testid="qa-checks">
              {checks.length === 0 ? <p className="muted">Aucun detail QA disponible.</p> : checks.map((check) => (
                <div className="list-row" key={check.name}>
                  <span className={'dot ' + (check.status === 'PASS' ? 'dot-pass' : 'dot-fail')} />
                  <span>{check.name}</span>
                  <span className="muted small">{check.detail}</span>
                </div>
              ))}
            </div>
            <div className="actions">
              {master.approval ? (
                <span className="pill" data-testid="approval-status">Master approuve / {shortChecksum(master.approval.checksum)}</span>
              ) : (
                <button className="btn btn-primary" data-testid="approve" onClick={approveMaster} disabled={busy === 'approve'}>
                  Valider le master v{master.version}
                </button>
              )}
              {master.approval && !transferRecord ? (
                <button className="btn btn-secondary" data-testid="transfer" onClick={transferMaster} disabled={busy === 'transfer'}>
                  Transferer vers Postiz (mock)
                </button>
              ) : null}
              {transferRecord ? (
                <span className="pill" data-testid="transfer-status">Transfert {transferRecord.status}</span>
              ) : null}
            </div>
            <p className="hint">Postiz est simule localement. Aucun envoi reseau, aucune publication reelle.</p>
          </section>
        ) : null}

        <section className="card">
          <div className="section-head">
            <h2>Historique des masters</h2>
            <span className="muted small">{bundle.masterVersions.length} version(s)</span>
          </div>
          {bundle.masterVersions.length === 0 ? (
            <p className="muted">Aucune version produite.</p>
          ) : (
            <div className="list">
              {bundle.masterVersions.map((version) => (
                <div className="list-row" key={version.id}>
                  <strong>Version {version.version}</strong>
                  <span className="muted small">{version.qaStatus || 'QA inconnue'} / {shortChecksum(version.checksum)}</span>
                  {version.approval ? <span className="pill">Approuvee</span> : <span className="pill">Non approuvee</span>}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
