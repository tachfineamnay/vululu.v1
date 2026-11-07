'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import StudioNav from '../../components/StudioNav';
import { api, postJson, type CampaignSummary, type ProjectSummary } from '../../lib/api';

type CampaignDetail = { campaign: CampaignSummary; projects: Array<Pick<ProjectSummary, 'id' | 'title' | 'platform' | 'format' | 'status' | 'contextId' | 'campaignId'>> };

export default function CampaignsPage() {
  const [items, setItems] = useState<CampaignSummary[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    let active = true;
    void Promise.all([api<{ items: CampaignSummary[] }>('/api/campaigns'), api<{ items: ProjectSummary[] }>('/api/projects')])
      .then(([campaigns, creations]) => {
        if (!active) return;
        setItems(campaigns.items); setProjects(creations.items);
        setSelectedId(new URLSearchParams(window.location.search).get('campaign') || campaigns.items[0]?.id || '');
      })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : 'Chargement impossible.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    setLoadingDetail(true); setDetail(null);
    void api<CampaignDetail>('/api/campaigns/' + encodeURIComponent(selectedId))
      .then((data) => { if (active) setDetail(data); })
      .catch((err) => { if (active) setError(err instanceof Error ? err.message : 'Campagne indisponible.'); })
      .finally(() => { if (active) setLoadingDetail(false); });
    return () => { active = false; };
  }, [selectedId]);

  function selectCampaign(id: string) {
    setSelectedId(id); setProjectId(''); setError(''); setFeedback('');
    window.history.replaceState(null, '', '/campaigns?campaign=' + encodeURIComponent(id));
  }

  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setFeedback('');
    try {
      const { campaign } = await postJson<{ campaign: CampaignSummary }>('/api/campaigns', { name, description });
      setItems((current) => [campaign, ...current]); setName(''); setDescription('');
      selectCampaign(campaign.id); setFeedback('Campagne créée.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Création impossible.'); }
    finally { setBusy(false); }
  }

  async function assign(id: string, campaignId: string | null) {
    setBusy(true); setError(''); setFeedback('');
    try {
      await api('/api/projects/' + encodeURIComponent(id) + '/campaign', { method: 'PUT', body: JSON.stringify({ campaignId }) });
      setProjects((current) => current.map((project) => project.id === id ? { ...project, campaignId } : project));
      setDetail(await api<CampaignDetail>('/api/campaigns/' + encodeURIComponent(selectedId)));
      setProjectId(''); setFeedback(campaignId ? 'Projet rattaché.' : 'Projet retiré de la campagne.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Affectation impossible.'); }
    finally { setBusy(false); }
  }

  const candidates = projects.filter((project) => project.campaignId !== selectedId);

  return (
    <div className="shell campaigns-page" data-vululu-theme="blue">
      <a className="skip-link" href="#campaigns-main">Aller au contenu</a>
      <StudioNav><Link href="/projects/new" className="btn btn-secondary btn-small">Nouvelle création</Link></StudioNav>
      <main id="campaigns-main" tabIndex={-1} className="page">
        <section className="studio-head">
          <div><p className="eyebrow">Vos opérations créatives</p><h1>Campagnes</h1><p className="muted">Regroupez vos projets pour retrouver les créations d’une même opération.</p></div>
        </section>
        {error ? <p className="error" role="alert">{error}</p> : null}
        {feedback ? <p className="toast toast--success" role="status">{feedback}</p> : null}
        {loading ? <p className="muted" role="status">Chargement des campagnes…</p> : null}
        <div className="contexts-layout">
          <section className="card stack" aria-labelledby="campaign-list-heading">
            <h2 id="campaign-list-heading">Mes campagnes</h2>
            {!loading && items.length === 0 ? <p className="muted">Aucune campagne. Créez le premier regroupement.</p> : null}
            <div className="contexts-list">
              {items.map((campaign) => (
                <button type="button" key={campaign.id} className={'context-card' + (selectedId === campaign.id ? ' is-active' : '')} aria-pressed={selectedId === campaign.id} disabled={busy} onClick={() => selectCampaign(campaign.id)}>
                  <strong>{campaign.name}</strong>
                </button>
              ))}
            </div>
            <form className="stack" onSubmit={create}>
              <h3>Nouvelle campagne</h3>
              <label className="label">Nom de la campagne<input className="input" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={160} required /></label>
              <label className="label">Description<textarea className="input textarea" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} /></label>
              <button type="submit" className="btn btn-primary" disabled={busy || loading}>{busy ? 'Enregistrement…' : 'Créer la campagne'}</button>
            </form>
          </section>
          <section className="card stack" aria-busy={loadingDetail} aria-label="Contenu de la campagne">
            {loadingDetail ? <p className="muted" role="status">Chargement de la campagne…</p> : null}
            {!selectedId ? <p className="muted">Sélectionnez une campagne pour retrouver ses projets.</p> : null}
            {detail ? (
              <>
                <h2>{detail.campaign.name}</h2>
                {detail.campaign.description ? <p className="muted">{detail.campaign.description}</p> : null}
                <h3>Projets rattachés</h3>
                {detail.projects.length === 0 ? <p className="muted">Aucun projet dans cette campagne.</p> : (
                  <ul className="list campaign-projects">
                    {detail.projects.map((project) => (
                      <li className="campaign-project" key={project.id}>
                        <div><Link className="text-link" href={'/projects/' + encodeURIComponent(project.id)}>{project.title}</Link><p className="muted small">{project.platform} / {project.format}</p></div>
                        <button type="button" className="btn btn-ghost btn-small" disabled={busy} aria-label={'Retirer ' + project.title + ' de la campagne'} onClick={() => void assign(project.id, null)}>Retirer</button>
                      </li>
                    ))}
                  </ul>
                )}
                <form className="stack" onSubmit={(event) => { event.preventDefault(); if (projectId) void assign(projectId, selectedId); }}>
                  <label className="label">Projet à rattacher
                    <select className="input" value={projectId} onChange={(event) => setProjectId(event.target.value)} required disabled={busy || candidates.length === 0}>
                      <option value="">Sélectionner un projet</option>
                      {candidates.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
                    </select>
                  </label>
                  <p className="hint">Un projet appartient à une seule campagne. Le rattacher ici le déplace depuis son éventuelle campagne actuelle.</p>
                  <button type="submit" className="btn btn-secondary" disabled={busy || !projectId}>Rattacher le projet</button>
                </form>
              </>
            ) : null}
          </section>
        </div>
      </main>
    </div>
  );
}
