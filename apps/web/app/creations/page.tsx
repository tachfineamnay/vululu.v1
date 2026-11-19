'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, type ProjectBundle, type ProjectSummary } from '../../lib/api';
import {CreativeLibrary} from '../../components/CreativeLibrary';
import {useWorkspace} from '../../components/WorkspacePreferences';
import StudioNav from '../../components/StudioNav';
import CreationDelivery from '../../components/CreationDelivery';

export default function CreationsPage() {
  const {demo,t}=useWorkspace();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [contextId, setContextId] = useState('');
  const [selected, setSelected] = useState('');
  const [bundle, setBundle] = useState<ProjectBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [reading, setReading] = useState(false);
  const [listError, setListError] = useState('');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  useEffect(() => {
    let active = true;
    setLoading(true); setListError('');
    void api<{ items: ProjectSummary[] }>('/api/projects').then(({ items }) => {
      if (!active) return;
      setProjects(items);
      const requested = new URLSearchParams(location.search).get('project');
      setSelected((current) => items.some((item) => item.id === current) ? current : items.find((item) => item.id === requested)?.id ?? items.find((item) => ['review', 'approved', 'transferred'].includes(item.status))?.id ?? items[0]?.id ?? '');
    }).catch((err) => { if (active) setListError(err instanceof Error ? err.message : 'Projets indisponibles.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);
  const refresh = useCallback(async () => {
    if (!selected || !demo) return;
    setReading(true); setError('');
    try { const result = await api<ProjectBundle>('/api/projects/' + encodeURIComponent(selected)); if (selectedRef.current === selected) setBundle(result); }
    catch (err) { if (selectedRef.current === selected) setError(err instanceof Error ? err.message : 'Résultat indisponible.'); }
    finally { if (selectedRef.current === selected) setReading(false); }
  }, [selected,demo]);
  useEffect(() => {
    let active = true;
    if (!selected || !demo) return;
    setReading(true); setError('');
    void api<ProjectBundle>('/api/projects/' + encodeURIComponent(selected)).then((result) => { if (active) setBundle(result); }).catch((err) => { if (active) setError(err instanceof Error ? err.message : 'Résultat indisponible.'); }).finally(() => { if (active) setReading(false); });
    return () => { active = false; };
  }, [selected,demo]);
  const contexts = [...new Map(projects.map((project) => [project.contextId, { id: project.contextId, name: project.context?.name ?? 'Contexte non disponible' }])).values()];
  const visible = projects.filter((project) => !contextId || project.contextId === contextId);
  const current = bundle?.project.id === selected ? bundle : null;
  return <div className="shell" data-vululu-theme="blue"><a className="skip-link" href="#creations-main">{t("Aller au contenu","Skip to content")}</a><StudioNav />
    <main id="creations-main" tabIndex={-1} className="page stack creations-page"><div className="studio-head"><div><p className="eyebrow">{t("Vos résultats","Your results")}</p><h1>{t('Mes créations','My creations')}</h1><p>{t("Retrouvez les versions par contexte et projet. Chaque résultat conserve son approbation et son état de transfert.","Find saved versions by business profile and project, and see which versions have been approved.")}</p></div></div>
      {loading ? <p role="status">{t("Chargement de vos projets…","Loading your projects\u2026")}</p> : listError ? <div><p className="error" role="alert">{listError}</p><button className="btn btn-secondary" type="button" onClick={() => setRetry((value) => value + 1)}>Réessayer les projets</button><Link className="text-link" href="/login">{t("Se connecter","Sign in")}</Link></div> : !projects.length ? <section className="card stack"><h2>{t("Vos créations apparaîtront ici.","Your creations will appear here.")}</h2><p>Commencez par une idée et son contexte, puis préparez un projet.</p><Link className="btn btn-primary" href="/projects/new">{t("Nouveau projet","New project")}</Link></section> : <>
        <section className="card stack" aria-label="Retrouver une création"><div className="two-col"><label className="label">{t("Contexte","Business profile")}<select className="input" data-testid="creation-context" value={contextId} onChange={(event) => { const id = event.target.value; setContextId(id); if (!projects.some((project) => project.id === selected && (!id || project.contextId === id))) setSelected(projects.find((project) => !id || project.contextId === id)?.id ?? ''); }}><option value="">{t("Tous les contextes","All profiles")}</option>{contexts.map((context) => <option key={context.id} value={context.id}>{context.name}</option>)}</select></label><label className="label">{t("Projet","Project")}<select className="input" data-testid="creation-project" value={selected} onChange={(event) => setSelected(event.target.value)}>{visible.map((project) => <option key={project.id} value={project.id}>{project.title} · {project.context?.name ?? 'Contexte non disponible'}</option>)}</select></label></div><p className="hint">Tous vos projets sont consultables, y compris ceux sans résultat ou dont la dernière production a échoué. Le contenu est chargé à la sélection, sans déduire l’existence d’un média du seul statut.</p></section>
        {reading ? <p role="status">Actualisation du résultat…</p> : null}{error ? <div className="stack"><p className="error" role="alert">{error} Le dernier résultat reçu pour ce projet reste consultable ; son état peut avoir évolué.</p><button type="button" className="btn btn-secondary" disabled={reading} onClick={() => void refresh()}>Réessayer le résultat</button></div> : null}
        {!demo && selected && <CreativeLibrary key={selected} id={selected}/>}
        {demo && current ? <><div className="actions"><Link className="text-link" href={'/projects/' + selected}>{t("Reprendre le projet","Resume project")}</Link><button type="button" className="btn btn-ghost" disabled={reading} onClick={() => void refresh()}>Actualiser le résultat</button></div><CreativeLibrary key={current.project.id} id={current.project.id}/>{demo&&<CreationDelivery key={current.project.id} bundle={current} refresh={refresh} blocked={reading || !!error} />}</> : null}
      </>}
    </main></div>;
}
