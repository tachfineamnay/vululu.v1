'use client';

import {useWorkspace} from '../components/WorkspacePreferences';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type ProjectSummary, type SessionUser } from '../lib/api';
import { projectProgress, projectFormatLabels } from '../lib/projectPresentation';
import { WeeklyReminder } from '../components/WeeklyReminder';
import StudioNav from '../components/StudioNav';

export default function DashboardPage() {
  const {t}=useWorkspace();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    void api<{ user: SessionUser }>('/api/auth/me').then(async (me) => {
      if (!active) return;
      setUser(me.user);
      const data = await api<{ items: ProjectSummary[] }>('/api/projects');
      if (active) setProjects(data.items);
    }).catch((e) => { if (active) setError(e instanceof Error ? e.message : 'Chargement impossible.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);
  async function logout() {
    setLeaving(true); setError('');
    try { await api('/api/auth/logout', { method: 'POST' }); router.push('/login'); }
    catch { setError('La déconnexion n’a pas été confirmée. Réessayez.'); setLeaving(false); }
  }
  return <div className="shell" data-vululu-theme="blue">
    <a className="skip-link" href="#projects-main">{t("Aller au contenu","Skip to content")}</a>
    <StudioNav><div className="topbar-actions">
      {user?.role==='support'&&<Link href="/support">{t("Assistance clients","Customer support")}</Link>}
      {user?.role === 'super_admin' ? <Link className="text-link" href="/admin" data-testid="admin-link">Administration</Link> : null}
      <span className="muted small">{user?.name}</span><button type="button" className="btn btn-ghost" disabled={leaving} onClick={logout}>{leaving ? 'Déconnexion…' : 'Sortir'}</button>
    </div></StudioNav>
    <main id="projects-main" tabIndex={-1} className="page stack" data-testid="projects-page">
      {user && <WeeklyReminder/>}
      <section className="studio-head"><div><p className="eyebrow">{t("Votre atelier","Your workspace")}</p><h1>{t("Mes projets","My projects")}</h1><p className="muted">{t("Retrouvez votre travail ou donnez forme à une nouvelle idée.","Continue a project or start a new idea.")}</p></div><Link className="btn btn-primary" data-testid="new-project" href="/projects/new">{t("Nouveau projet","New project")}</Link></section>
      {loading ? <p role="status">{t("Chargement de vos projets…","Loading your projects\u2026")}</p> : null}
      {error ? <div className="stack"><p className="error" role="alert">{error}</p><div className="actions"><button type="button" className="btn btn-secondary" onClick={() => setRetry((n) => n + 1)}>{t("Réessayer","Retry")}</button>{!user ? <Link className="text-link" href="/login">{t("Se connecter","Sign in")}</Link> : null}</div></div> : null}
      {!loading && !error && !projects.length ? <section className="card empty-state"><h2>{t("Votre premier projet commence ici.","Start your first project here.")}</h2><p className="muted">{t("Décrivez votre idée, choisissez vos références et votre destination. Les réglages détaillés viendront ensuite.","Describe your idea, choose a profile and select a destination. You can refine the details later.")}</p><Link className="btn btn-secondary" href="/projects/new">{t("Créer un projet","Create a project")}</Link></section> : null}
      {!loading && !error && projects.length ? <ul className="project-index" aria-label="Vos projets">{projects.map((project) => {
        const progress = projectProgress(project.status);
        return <li key={project.id}><article className="card stack" data-testid={'project-summary-' + project.id}>
          <div className="project-summary-head"><div><p className="eyebrow">{project.context?.name || 'Contexte non disponible'}</p><h2><Link href={'/projects/' + encodeURIComponent(project.id)}>{project.title}</Link></h2></div><p className="project-state">{progress.label}</p></div>
          <dl className="detail-list"><div><dt>{t("Résultat recherché","Desired outcome")}</dt><dd className="context-copy">{project.objective}</dd></div><div><dt>Destination</dt><dd>{project.platform} · {projectFormatLabels[project.format] ?? project.format}</dd></div></dl>
          <p className="hint">Prochaine action : {progress.next}.</p><Link className="btn btn-secondary" href={'/projects/' + encodeURIComponent(project.id)} aria-label={'Reprendre ' + project.title}>{t("Reprendre le projet","Resume project")}</Link>
        </article></li>;
      })}</ul> : null}
      <footer className="context-section actions"><Link className="text-link" href="/contexts" data-testid="manage-contexts">{t("Marques et références","Business profiles")}</Link><Link className="text-link" href="/contexts/new" data-testid="new-context">{t("Créer un contexte","Create a business profile")}</Link></footer>
    </main>
  </div>;
}
