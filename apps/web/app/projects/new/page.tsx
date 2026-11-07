'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type BrandContext, type ProjectSummary, type SessionUser, postJson } from '../../../lib/api';
import { emptyProjectDraft, restoreProjectDraft, type ProjectDraft } from '../../../lib/projectPresentation';
import { useUnsavedChanges } from '../../../lib/useUnsavedChanges';
import StudioNav from '../../../components/StudioNav';

const steps = ['Votre idée', 'Vos références', 'Votre destination', 'Votre création'];
const formats: Record<string, string> = { Video: 'Vidéo multiscène', Reel: 'Vidéo verticale (Reel)', Affiche: 'Image unique', Carrousel: 'Carrousel', Motion: 'Motion design' };
const availableFormats: Record<ProjectDraft['platform'], string[]> = { Instagram: ['Video', 'Reel', 'Affiche', 'Carrousel'], TikTok: ['Video', 'Reel', 'Motion'], LinkedIn: ['Video', 'Affiche', 'Carrousel'] };

export default function NewProjectPage() {
  const router = useRouter();
  const [contexts, setContexts] = useState<BrandContext[]>([]);
  const [draft, setDraft] = useState<ProjectDraft>(emptyProjectDraft);
  const [storageKey, setStorageKey] = useState('');
  const [persisted, setPersisted] = useState(false);
  const [restored, setRestored] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [retry, setRetry] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const hasInput = !!(draft.title || draft.objective);
  useUnsavedChanges(!saved && !persisted && hasInput);
  useEffect(() => {
    let active = true;
    setLoading(true); setLoadError('');
    void Promise.all([api<{ user: SessionUser }>('/api/auth/me'), api<{ items: BrandContext[] }>('/api/contexts')]).then(([me, data]) => {
      if (!active) return;
      const key = 'vululu:new-project:v1:' + me.user.id;
      let previous: ProjectDraft | null = null;
      try { previous = restoreProjectDraft(sessionStorage.getItem(key)); } catch { /* Le formulaire reste utilisable sans stockage navigateur. */ }
      const requested = new URLSearchParams(window.location.search).get('context');
      const chosen = data.items.find((context) => context.id === requested)?.id || data.items.find((context) => context.id === previous?.contextId)?.id || '';
      const next = { ...(previous ?? emptyProjectDraft), contextId: chosen };
      if (requested && requested !== previous?.contextId && previous?.title && previous.objective) next.step = 1;
      if (!next.title.trim() || !next.objective.trim()) next.step = 0;
      else if (!chosen && next.step > 1) next.step = 1;
      setContexts(data.items); setDraft(next); setRestored(!!previous?.title); setStorageKey(key);
    }).catch((e) => { if (active) setLoadError(e instanceof Error ? e.message : 'Chargement des références impossible.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);
  useEffect(() => {
    if (!storageKey || loading || saved) return;
    try { sessionStorage.setItem(storageKey, JSON.stringify(draft)); setPersisted(true); }
    catch { setPersisted(false); }
  }, [draft, storageKey, loading, saved]);
  const context = contexts.find((item) => item.id === draft.contextId);
  const vertical = draft.platform !== 'LinkedIn';
  function edit<K extends keyof ProjectDraft>(field: K, value: ProjectDraft[K]) { setDraft((current) => ({ ...current, [field]: value })); setError(''); }
  function move(step: number) { setDraft((current) => ({ ...current, step })); setError(''); requestAnimationFrame(() => heading.current?.focus()); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    if (draft.step < 3) { move(draft.step + 1); return; }
    if (draft.title.trim().length < 2 || draft.objective.trim().length < 2) { move(0); setError('Renseignez un nom et un résultat recherché d’au moins deux caractères.'); return; }
    if (!context) { move(1); setError('Choisissez un contexte accessible pour ce projet.'); return; }
    setBusy(true); setError('');
    try {
      const result = await postJson<{ project: ProjectSummary }>('/api/projects', { contextId: draft.contextId, title: draft.title.trim(), objective: draft.objective.trim(), platform: draft.platform, format: draft.format, sceneDurationSeconds: draft.sceneDurationSeconds });
      setSaved(true);
      try { sessionStorage.removeItem(storageKey); } catch { /* La création serveur reste confirmée même si le stockage local est indisponible. */ }
      router.push('/projects/' + result.project.id);
    } catch (err) { setError(err instanceof Error ? err.message : 'Création impossible.'); }
    finally { setBusy(false); }
  }
  return <div className="shell" data-vululu-theme="blue">
    <a className="skip-link" href="#project-start-main">Aller au contenu</a>
    <StudioNav><Link href="/" className="text-link">Retour aux projets</Link></StudioNav>
    <main id="project-start-main" tabIndex={-1} className="page project-start stack">
      <p className="eyebrow">Nouveau projet</p><h1>De votre idée à votre création</h1>
      {loading ? <p role="status">Chargement de vos références et du brouillon de cet onglet…</p> : loadError ? <div className="stack"><p className="error" role="alert">{loadError}</p><button type="button" className="btn btn-secondary" onClick={() => setRetry((n) => n + 1)}>Réessayer</button><Link className="text-link" href="/login?next=/projects/new">Se connecter</Link></div> : <>
        <nav aria-label="Démarrage de la création"><ol className="creation-steps">{steps.map((label, index) => <li key={label}><button type="button" className="step-button" aria-current={draft.step === index ? 'step' : undefined} disabled={busy || index > draft.step} onClick={() => move(index)}><span className="step-number">{index + 1}</span>{label}</button></li>)}</ol></nav>
        <p className="hint" role="status" data-testid="project-draft-status">{persisted ? (restored ? 'Brouillon repris et conservé dans cet onglet.' : 'Brouillon conservé dans cet onglet.') : 'Brouillon non sauvegardé : le stockage de cet onglet est indisponible.'} Il n’est pas encore enregistré sur le serveur. Fermer cet onglet peut l’effacer.</p>
        <form ref={form} className="card stack" onSubmit={submit} aria-busy={busy}>
          <h2 ref={heading} tabIndex={-1}>{steps[draft.step]}</h2>
          {draft.step === 0 ? <>
            <p className="muted">Qu’aimeriez-vous préparer et dans quel but ? Vous pourrez préciser le brief ensuite.</p>
            <label className="label" htmlFor="project-title">Nom du projet</label><input id="project-title" className="input" data-testid="project-title" value={draft.title} onChange={(e) => edit('title', e.target.value)} minLength={2} maxLength={160} required disabled={busy} />
            <label className="label" htmlFor="project-objective">Résultat recherché</label><textarea id="project-objective" className="input textarea" data-testid="project-objective" value={draft.objective} onChange={(e) => edit('objective', e.target.value)} minLength={2} maxLength={8000} required disabled={busy} aria-describedby="idea-help" />
            <p className="hint" id="idea-help">Par exemple : expliquer une nouvelle offre, raconter un projet ou présenter votre univers. Aucun modèle IA ni flow à choisir.</p>
          </> : draft.step === 1 ? <>
            <p className="muted">Réutilisez une marque, une activité ou un univers créatif. Un contexte est requis par cette version ; un logo et un site ne le sont pas.</p>
            {contexts.length ? <><label className="label" htmlFor="project-context">Contexte du projet</label><select id="project-context" className="input" data-testid="project-context" value={draft.contextId} required disabled={busy} onChange={(e) => edit('contextId', e.target.value)}><option value="">Choisir un contexte</option>{contexts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{context ? <div className="context-completeness stack"><strong>{context.name}</strong><p className="context-copy">{context.description}</p><p className="hint">Le contexte sera figé au lancement de la production. Aucun fichier de sa bibliothèque n’est sélectionné automatiquement.</p></div> : null}</> : <p>Vous n’avez pas encore de contexte. Un nom et une courte description suffisent pour en créer un.</p>}
            <Link className="text-link" href="/contexts/new?returnTo=project">Créer un contexte et revenir ici</Link>
            <p className="hint">Les ressources, les droits et l’usage sponsorisé peuvent être précisés dans le projet après sa création. L’usage initial est organique.</p>
          </> : draft.step === 2 ? <>
            <p className="muted">Où utiliserez-vous la création ? La plateforme et le format sont nécessaires à l’enregistrement. Le cadrage détaillé reste modifiable dans le brief.</p>
            <div className="two-col"><label className="label">Plateforme<select className="input" data-testid="project-platform" value={draft.platform} disabled={busy} onChange={(e) => edit('platform', e.target.value as ProjectDraft['platform'])}><option>Instagram</option><option>TikTok</option><option>LinkedIn</option></select></label>
            <label className="label">Format<select className="input" data-testid="project-format" value={draft.format} disabled={busy} onChange={(e) => edit('format', e.target.value as 'Video')}>{availableFormats[draft.platform].map((format) => <option key={format} value={format} disabled={format !== 'Video'}>{formats[format]}{format !== 'Video' ? ' — production indisponible' : ''}</option>)}</select></label></div>
            <figure className="format-preview"><div className={'format-frame ' + (vertical ? 'format-frame--vertical' : 'format-frame--square')}><span>{vertical ? 'Vidéo verticale' : 'Vidéo carrée'}</span></div><figcaption><strong>{vertical ? 'Portrait plein écran' : 'Cadre carré'}</strong><p className="hint">Aperçu du cadre initial, aucun média généré. {vertical ? '1080 × 1920 px · 9:16' : '1080 × 1080 px · 1:1'}. Les autres cadrages autorisés se règlent dans le brief.</p></figcaption></figure>
            <p className="hint">La vidéo multiscène est le seul format de production qualifié ici. « Vidéo verticale (Reel) » désigne un autre format, encore indisponible au lancement.</p>
            <details><summary>Durée et réglages différables</summary><label className="label">Durée initiale par scène<select className="input" data-testid="project-scene-duration" value={draft.sceneDurationSeconds} disabled={busy} onChange={(e) => edit('sceneDurationSeconds', Number(e.target.value))}>{[1,2,3,5,10,15].map((seconds) => <option key={seconds} value={seconds}>{seconds} secondes</option>)}</select></label><p className="hint">Valeur initiale : 2 secondes. Durée, direction artistique, public, ton et appel à l’action pourront être revus dans le brief.</p></details>
          </> : <>
            <p className="muted">Enregistrez le projet pour préparer son brief. Cette action ne lance aucune génération.</p>
            <dl className="detail-list"><div><dt>Nom</dt><dd>{draft.title}</dd></div><div><dt>Résultat recherché</dt><dd className="context-copy">{draft.objective}</dd></div><div><dt>Références</dt><dd>{context?.name || 'Contexte à choisir'}</dd></div><div><dt>Destination initiale</dt><dd>{draft.platform} · Vidéo multiscène · usage organique</dd></div></dl>
            <p className="context-completeness">Avant toute production : enregistrer et relire le brief, consulter les livrables et l’estimation qualifiée, puis confirmer sa version exacte et son plafond. Les montants de démonstration sont MOCK.</p>
          </>}
          {error ? <div className="error" data-testid="project-error" role="alert"><p>{error}</p><p>Enregistrement non confirmé. Votre saisie est conservée ; vous pouvez corriger ou réessayer.</p></div> : null}
          <div className="actions">{draft.step > 0 ? <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => move(draft.step - 1)}>Étape précédente</button> : null}
            <button type="submit" className="btn btn-primary" data-testid={draft.step === 3 ? 'project-submit' : 'project-next'} disabled={busy || (draft.step === 1 && !contexts.length)}>{busy ? 'Enregistrement…' : draft.step === 3 ? 'Enregistrer le projet et ouvrir le brief' : 'Passer à ' + steps[draft.step + 1].toLocaleLowerCase('fr')}</button>
          </div>
        </form>
      </>}
    </main>
  </div>;
}
