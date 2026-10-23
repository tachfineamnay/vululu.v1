'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, BrandContext, ProjectSummary, postJson } from '../../../lib/api';

export default function NewProjectPage() {
  const router = useRouter();
  const [contexts, setContexts] = useState<BrandContext[]>([]);
  const [contextId, setContextId] = useState('');
  const [title, setTitle] = useState('Campagne de lancement');
  const [platform, setPlatform] = useState('Instagram');
  const [format, setFormat] = useState('Video');
  const [objective, setObjective] = useState('Faire connaitre la nouvelle offre et donner envie de decouvrir la marque.');
  const [sceneDurationSeconds, setSceneDurationSeconds] = useState(2);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const data = await api<{ items: BrandContext[] }>('/api/contexts');
        setContexts(data.items);
        if (data.items.length > 0) {
          setContextId(data.items[0].id);
        }
      } catch {
        router.push('/login');
      }
    }
    void load();
  }, [router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await postJson<{ project: ProjectSummary }>('/api/projects', {
        contextId,
        title,
        platform,
        format,
        objective,
        sceneDurationSeconds
      });
      router.push('/projects/' + result.project.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Creation impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/" className="brand"><span className="brand-mark small">V</span><span>Vululu AI</span></Link>
        <Link href="/" className="text-link">Retour</Link>
      </header>
      <main className="page narrow">
        <p className="eyebrow">Nouvelle creation</p>
        <h1>Une campagne, cinq scenes</h1>
        <p className="lead">Choisis un contexte existant. Vululu preparera le brief, le storyboard et le master.</p>
        {contexts.length === 0 ? (
          <div className="card">
            <p className="muted">Aucun contexte disponible.</p>
            <Link href="/contexts/new" className="btn btn-primary">Creer un contexte</Link>
          </div>
        ) : (
          <form className="card stack" onSubmit={submit}>
            <label className="label">Contexte
              <select className="input" data-testid="project-context" value={contextId} onChange={(event) => setContextId(event.target.value)} required>
                {contexts.map((context) => (
                  <option key={context.id} value={context.id}>{context.name}</option>
                ))}
              </select>
            </label>
            <label className="label">Titre du projet
              <input className="input" data-testid="project-title" value={title} onChange={(event) => setTitle(event.target.value)} required />
            </label>
            <div className="two-col">
              <label className="label">Plateforme
                <select className="input" data-testid="project-platform" value={platform} onChange={(event) => setPlatform(event.target.value)}>
                  <option>TikTok</option>
                  <option>Instagram</option>
                  <option>LinkedIn</option>
                </select>
              </label>
              <label className="label">Format
                <select className="input" data-testid="project-format" value={format} onChange={(event) => setFormat(event.target.value)}>
                  <option>Affiche</option>
                  <option>Carrousel</option>
                  <option>Video</option>
                  <option>Reel</option>
                  <option>Motion</option>
                </select>
              </label>
            </div>
            <label className="label">Objectif
              <textarea className="input textarea" data-testid="project-objective" value={objective} onChange={(event) => setObjective(event.target.value)} required />
            </label>
            <label className="label">Rythme de production
              <select className="input" data-testid="project-scene-duration" value={sceneDurationSeconds} onChange={(event) => setSceneDurationSeconds(Number(event.target.value))}>
                <option value={2}>Smoke — 2 s par scene (10 s au total)</option>
                <option value={10}>Cible — 10 s par scene (50 s au total)</option>
              </select>
            </label>
            {error ? <p className="error" data-testid="project-error">{error}</p> : null}
            <button className="btn btn-primary" data-testid="project-submit" type="submit" disabled={busy}>
              {busy ? 'Creation...' : 'Ouvrir le studio'}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}