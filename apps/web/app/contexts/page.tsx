'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, type BrandContext, type ProjectSummary } from '../../lib/api';
import StudioNav from '../../components/StudioNav';
import ContextReviewPanel from '../../components/ContextReviewPanel';

export default function ContextsPage() {
  const [items, setItems] = useState<BrandContext[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectError, setProjectError] = useState('');
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    void api<{ items: BrandContext[] }>('/api/contexts').then((data) => {
      if (!active) return;
      setItems(data.items);
      const requested = new URLSearchParams(window.location.search).get('context');
      setSelectedId(data.items.find((c) => c.id === requested)?.id || data.items[0]?.id || '');
    }).catch((err) => { if (active) setError(err instanceof Error ? err.message : 'Chargement impossible.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);
  useEffect(() => {
    let active = true;
    setProjectsLoading(true);
    void api<{ items: ProjectSummary[] }>('/api/projects').then((data) => { if (active) { setProjects(data.items); setProjectError(''); } })
      .catch(() => { if (active) setProjectError('Les projets associés ne sont pas accessibles. Retrouvez-les depuis Mes projets.'); })
      .finally(() => { if (active) setProjectsLoading(false); });
    return () => { active = false; };
  }, [retry]);
  const selected = items.find((item) => item.id === selectedId) || null;
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');
  const filtered = items.filter((item) => normalize([item.name, item.description, item.audience].join(' ')).includes(normalize(query.trim())));
  function select(id: string) {
    if (id === selectedId || (dirty && !window.confirm('Vos modifications ne sont pas enregistrées. Changer de contexte ?'))) return;
    setDirty(false); setSelectedId(id);
    const url = new URL(window.location.href); url.searchParams.set('context', id); window.history.replaceState(null, '', url);
  }
  return <div className="shell" data-vululu-theme="blue">
    <a className="skip-link" href="#contexts-main">Aller au contenu</a>
    <StudioNav />
    <main id="contexts-main" tabIndex={-1} className="page" data-testid="contexts-page">
      <section className="studio-head"><div><p className="eyebrow">Votre bibliothèque de contextes</p><h1>Marques et références</h1><p className="muted">Une marque, votre activité ou un univers créatif. Rassemblez ce que Vululu doit connaître pour vos prochains projets.</p></div><Link className="btn btn-primary" href="/contexts/new" data-testid="contexts-new">Nouveau contexte</Link></section>
      {loading ? <p className="muted" role="status">Chargement des contextes…</p> : null}
      {error ? <div className="stack"><p className="error" role="alert">{error}</p><button className="btn btn-secondary" type="button" onClick={() => setRetry((n) => n + 1)}>Réessayer</button><Link href="/login?next=/contexts" className="text-link">Se connecter</Link></div> : null}
      {!loading && !error && !items.length ? <section className="card empty-state" data-testid="contexts-empty"><p className="eyebrow">Pour votre premier projet</p><h2>Vos idées ont un point de départ.</h2><p className="muted">Donnez un nom et une courte description à votre marque, activité ou univers. Vous pourrez ajouter vos références ensuite.</p><Link className="btn btn-primary" href="/contexts/new">Créer mon premier contexte</Link></section> : null}
      {!loading && !error && items.length ? <div className="contexts-layout">
        <section className="card stack" aria-labelledby="contexts-list-heading"><div className="section-head"><h2 id="contexts-list-heading">Vos contextes</h2><span className="muted small">{items.length}</span></div>
          <label className="label" htmlFor="context-search">Retrouver un contexte</label><input id="context-search" className="input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nom, activité ou public" />
          <p className="hint" role="status">{filtered.length} résultat{filtered.length > 1 ? 's' : ''}</p>
          <ul className="contexts-list" data-testid="contexts-list">{filtered.map((context) => <li key={context.id}><button type="button" className={'context-card' + (context.id === selectedId ? ' is-active' : '')} disabled={busy} data-testid={'context-card-' + context.id} onClick={() => select(context.id)} aria-pressed={context.id === selectedId} aria-controls="context-detail"><span><strong>{context.name}</strong><span className="muted small context-excerpt">{context.description}</span></span></button></li>)}</ul>
          {!filtered.length ? <div className="stack"><p>Aucun contexte ne correspond à cette recherche.</p><button type="button" className="btn btn-secondary" onClick={() => setQuery('')}>Effacer la recherche</button></div> : null}
        </section>
        <section id="context-detail" className="card stack" aria-labelledby="context-detail-heading" data-testid="context-detail">
          {selected ? <>
            <ContextReviewPanel key={selected.id} contextId={selected.id} onBusy={setBusy} onDirty={setDirty} onSaved={(value) => setItems((current) => current.map((item) => item.id === value.id ? value : item))} />
            <section className="context-section stack" aria-label="Projets de ce contexte"><h3>Projets associés</h3>{projectsLoading ? <p role="status">Chargement des projets associés…</p> : projectError ? <p className="hint">{projectError}</p> : projects.some((p) => p.contextId === selected.id) ? <ul className="context-projects">{projects.filter((p) => p.contextId === selected.id).map((p) => <li key={p.id}><Link href={'/projects/' + encodeURIComponent(p.id)}>{p.title}</Link></li>)}</ul> : <p className="muted">Aucun projet associé. Votre contexte est prêt pour un premier brief.</p>}
              <Link className="btn btn-secondary" href={'/projects/new?context=' + encodeURIComponent(selected.id)}>Créer un projet avec ce contexte</Link>
            </section>
          </> : <h2 id="context-detail-heading">Sélectionnez un contexte</h2>}
        </section>
      </div> : null}
    </main>
  </div>;
}
