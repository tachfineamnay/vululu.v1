'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, BrandContext, ProjectSummary, SessionUser } from '../lib/api';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [contexts, setContexts] = useState<BrandContext[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const me = await api<{ user: SessionUser }>('/api/auth/me');
        setUser(me.user);
        const contextData = await api<{ items: BrandContext[] }>('/api/contexts');
        setContexts(contextData.items);
        const projectData = await api<{ items: ProjectSummary[] }>('/api/projects');
        setProjects(projectData.items);
      } catch {
        router.push('/login');
      }
    }
    void load();
  }, [router]);

  async function logout() {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore logout errors.
    }
    router.push('/login');
  }

  const latestProject = projects[0];

  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/" className="brand">
          <span className="brand-mark small">V</span>
          <span>Vululu AI</span>
        </Link>
        <div className="topbar-actions">
          <span className="muted">{user ? user.name : ''}</span>
          <button className="btn btn-ghost" onClick={logout}>Sortir</button>
        </div>
      </header>

      <main className="page">
        <section className="hero">
          <p className="eyebrow">V0 — Studio vertical</p>
          <h1>Bonjour. Je suis Vululu.</h1>
          <p className="lead">
            Cree un contexte de marque, prepare un brief et laisse-moi produire un master video de cinq scenes.
          </p>
          <div className="hero-actions">
            <Link className="btn btn-primary" data-testid="new-context" href="/contexts/new">Creer un contexte</Link>
            <Link className="btn btn-secondary" data-testid="new-project" href="/projects/new">Nouvelle creation</Link>
          </div>
        </section>

        {error ? <p className="error">{error}</p> : null}

        <div className="dashboard-grid">
          <section className="card">
            <div className="section-head">
              <h2>Contextes de marque</h2>
              <Link className="text-link" href="/contexts/new">Ajouter</Link>
            </div>
            {contexts.length === 0 ? (
              <p className="muted">Aucun contexte. Commence par une fiche de marque reutilisable.</p>
            ) : (
              <div className="list">
                {contexts.map((context) => (
                  <div className="list-row" key={context.id}>
                    <span className="color-dot" style={{ background: context.colorPrimary }} />
                    <div>
                      <strong>{context.name}</strong>
                      <p className="muted small">{context.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <div className="section-head">
              <h2>Creations recentes</h2>
              <Link className="text-link" href="/projects/new">Nouvelle</Link>
            </div>
            {projects.length === 0 ? (
              <p className="muted">Aucune creation. Un contexte suffit pour lancer la premiere verticale.</p>
            ) : (
              <div className="list">
                {projects.map((project) => (
                  <Link className="list-row project-row" key={project.id} href={'/projects/' + project.id}>
                    <div>
                      <strong>{project.title}</strong>
                      <p className="muted small">{project.platform} / {project.format}</p>
                    </div>
                    <span className={'badge status-' + project.status}>{project.status}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="card next-step">
          <div>
            <p className="eyebrow">Prochaine action</p>
            <h2>{latestProject ? 'Reprendre ' + latestProject.title : 'Lancer la premiere creation'}</h2>
            <p className="muted">
              {latestProject
                ? 'Ouvre le studio pour suivre la production, corriger la scene 3 et valider le master.'
                : 'Choisis un contexte, remplis le brief, puis lance les cinq scenes.'}
            </p>
          </div>
          <Link className="btn btn-primary" href={latestProject ? '/projects/' + latestProject.id : '/projects/new'}>
            Ouvrir le studio
          </Link>
        </section>
      </main>
    </div>
  );
}
