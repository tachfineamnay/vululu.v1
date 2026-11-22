'use client';

import Link from 'next/link';
import { availableFormats, productionFormats, type ProductionFormat } from '@vululu/contracts';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type BrandContext, type CampaignSummary, type ProjectSummary, type SessionUser, postJson } from '../../../lib/api';
import {
  emptyProjectDraft, entryStepComplete, projectPlatforms, restoreProjectDraft,
  type ProjectDraft, type ProjectPlatform
} from '../../../lib/projectPresentation';
import { useUnsavedChanges } from '../../../lib/useUnsavedChanges';
import { useWorkspace } from '../../../components/WorkspacePreferences';
import StudioNav from '../../../components/StudioNav';
import CampaignJourney from '../../../components/CampaignJourney';

const channelCopy: Record<ProjectPlatform, [string, string]> = {
  Instagram: ['Photos, stories, carrousels et vidéos courtes.', 'Photos, stories, carousels and short videos.'],
  TikTok: ['Vidéos courtes verticales.', 'Short vertical videos.'],
  LinkedIn: ['Publications et carrousels professionnels.', 'Professional posts and carousels.']
};
const formatCopy: Record<ProductionFormat, [string, string]> = {
  Affiche: ['Une image carrée pour le fil.', 'A square image for the feed.'],
  Story: ['Une image verticale plein écran.', 'A full-screen vertical image.'],
  Carrousel: ['Plusieurs pages à faire défiler.', 'Several pages to swipe through.'],
  Reel: ['Une vidéo courte verticale.', 'A short vertical video.'],
  Video: ['Une vidéo montée en plusieurs scènes.', 'A video assembled from several scenes.']
};
const fileLabels: Record<string, string> = { png: 'PNG', mp4: 'MP4', zip: 'ZIP' };
const defaultSteps = ['Votre objectif', 'Canal et format', 'Votre identité', 'Vérification'];

export default function NewProjectPage() {
  const { t, locale } = useWorkspace();
  const steps = locale === 'fr' ? defaultSteps : ['Your objective', 'Channel and format', 'Your identity', 'Review'];
  const router = useRouter();
  const [contexts, setContexts] = useState<BrandContext[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [draft, setDraft] = useState<ProjectDraft>(emptyProjectDraft);
  const [storageKey, setStorageKey] = useState('');
  const [persisted, setPersisted] = useState(false);
  const [restored, setRestored] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [campaignFailed, setCampaignFailed] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pendingProjectId, setPendingProjectId] = useState('');
  const [onboarding, setOnboarding] = useState(false);
  const [retry, setRetry] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const hasInput = !!(draft.title || draft.objective || draft.contextId);
  useUnsavedChanges(!saved && !persisted && hasInput);

  useEffect(() => {
    let active = true;
    setLoading(true); setLoadFailed(false); setCampaignFailed(false);
    void Promise.allSettled([
      api<{ user: SessionUser }>('/api/auth/me'),
      api<{ items: BrandContext[] }>('/api/contexts'),
      api<{ items: CampaignSummary[] }>('/api/campaigns')
    ]).then(([meResult, contextResult, campaignResult]) => {
      if (!active) return;
      if (meResult.status === 'rejected' || contextResult.status === 'rejected') {
        setLoadFailed(true);
        return;
      }
      const me = meResult.value;
      const contextData = contextResult.value;
      const campaignItems = campaignResult.status === 'fulfilled' ? campaignResult.value.items : [];
      if (campaignResult.status === 'rejected') setCampaignFailed(true);
      const key = 'vululu:new-project:v1:' + me.user.id;
      let previous: ProjectDraft | null = null;
      try { previous = restoreProjectDraft(sessionStorage.getItem(key)); } catch { /* Le formulaire reste utilisable sans stockage navigateur. */ }
      const query = new URLSearchParams(window.location.search);
      setOnboarding(query.get('onboarding') === '1');
      const requestedContext = query.get('context');
      const requestedCampaign = query.get('campaign');
      const chosenContext = contextData.items.find((item) => item.id === requestedContext)?.id
        || contextData.items.find((item) => item.id === previous?.contextId)?.id || '';
      const chosenCampaign = campaignItems.find((item) => item.id === requestedCampaign)?.id || previous?.campaignId || '';
      const next: ProjectDraft = { ...(previous ?? emptyProjectDraft), contextId: chosenContext, campaignId: chosenCampaign };
      if (requestedContext && requestedContext !== previous?.contextId && entryStepComplete(next)) next.step = 2;
      if (!entryStepComplete(next)) next.step = 0;
      else if (next.step > 2 && !chosenContext) next.step = 2;
      setContexts(contextData.items); setCampaigns(campaignItems); setDraft(next);
      setRestored(!!previous && entryStepComplete(previous)); setStorageKey(key);
    }).catch(() => {
      if (active) setLoadFailed(true);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);

  useEffect(() => {
    if (!storageKey || loading || saved) return;
    try { sessionStorage.setItem(storageKey, JSON.stringify(draft)); setPersisted(true); }
    catch { setPersisted(false); }
  }, [draft, storageKey, loading, saved]);

  const context = contexts.find((item) => item.id === draft.contextId);
  const campaign = campaigns.find((item) => item.id === draft.campaignId);
  const objectiveDone = entryStepComplete(draft);
  const entryPassed = draft.step > 1;
  const assetsHref = context ? '/assets?context=' + encodeURIComponent(context.id) : '/assets';

  function edit<K extends keyof ProjectDraft>(field: K, value: ProjectDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value })); setError('');
  }
  function move(step: number) {
    setDraft((current) => ({ ...current, step: Math.max(0, Math.min(3, step)) })); setError('');
    requestAnimationFrame(() => heading.current?.focus());
  }
  function selectPlatform(platform: ProjectPlatform) {
    const formats = availableFormats[platform] as readonly ProductionFormat[];
    setDraft((current) => ({ ...current, platform, format: formats.includes(current.format) ? current.format : formats[0] }));
    setError('');
  }
  function focusField(id: string) { requestAnimationFrame(() => document.getElementById(id)?.focus()); }
  function nextStep(): boolean {
    if (draft.step === 0) {
      if (draft.title.trim().length < 2) { setError(t('Donnez un nom au projet (deux caractères minimum).', 'Give the project a name (two characters minimum).')); focusField('project-title'); return false; }
      if (draft.objective.trim().length < 2) { setError(t('Décrivez le résultat recherché (deux caractères minimum).', 'Describe the desired outcome (two characters minimum).')); focusField('project-objective'); return false; }
    }
    if (draft.step === 2 && !context) {
      setError(t('Choisissez une identité de marque pour ce projet. Un profil est nécessaire à cette version.', 'Choose a brand identity for this project. A profile is required in this version.'));
      focusField('project-context'); return false;
    }
    move(draft.step + 1); return true;
  }
  function finish(projectId: string) {
    setSaved(true);
    try { sessionStorage.removeItem(storageKey); } catch { /* La création serveur reste confirmée même si le stockage local est indisponible. */ }
    const offer = new URLSearchParams(window.location.search).get('offer');
    router.push('/projects/' + projectId + (offer ? '?offer=' + encodeURIComponent(offer) : ''));
  }
  async function assignCampaign(projectId: string) {
    if (!draft.campaignId) return;
    await api('/api/projects/' + encodeURIComponent(projectId) + '/campaign', { method: 'PUT', body: JSON.stringify({ campaignId: draft.campaignId }) });
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy || pendingProjectId) return;
    if (draft.step < 3) { nextStep(); return; }
    if (!objectiveDone) { move(0); setError(t('Complétez l’objectif et le nom du projet.', 'Complete the objective and project name.')); return; }
    if (!context) { move(2); setError(t('Choisissez une identité de marque accessible pour ce projet.', 'Choose an accessible brand identity for this project.')); return; }
    setBusy(true); setError('');
    try {
      const result = await postJson<{ project: ProjectSummary }>('/api/projects', {
        contextId: draft.contextId, title: draft.title.trim(), objective: draft.objective.trim(),
        platform: draft.platform, format: draft.format, sceneDurationSeconds: draft.sceneDurationSeconds
      });
      if (draft.campaignId) {
        try { await assignCampaign(result.project.id); }
        catch {
          setPendingProjectId(result.project.id);
          setError(t('Le projet a été enregistré, mais son rattachement à la campagne a échoué. Réessayez ou ouvrez le projet sans campagne.', 'The project was saved, but linking it to the campaign failed. Retry or open the project without a campaign.'));
          return;
        }
      }
      finish(result.project.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Création impossible.', 'Creation failed.'));
    } finally { setBusy(false); }
  }
  async function retryCampaignLink() {
    if (!pendingProjectId || busy) return;
    setBusy(true); setError('');
    try { await assignCampaign(pendingProjectId); finish(pendingProjectId); }
    catch (err) { setError((err instanceof Error ? err.message : t('Rattachement impossible.', 'Linking failed.')) + ' ' + t('Le projet reste enregistré.', 'The project remains saved.')); }
    finally { setBusy(false); }
  }

  return <div className="shell" data-vululu-theme="blue">
    <a className="skip-link" href="#project-start-main">{t('Aller au contenu', 'Skip to content')}</a>
    <StudioNav><Link href="/" className="text-link">{t('Retour aux projets', 'Back to projects')}</Link></StudioNav>
    <main id="project-start-main" tabIndex={-1} className="page project-start stack">
      <p className="eyebrow">{onboarding ? t('Bienvenue · Étape 3 sur 3', 'Welcome · Step 3 of 3') : t('Nouvelle campagne', 'New campaign')}</p>
      <h1>{t('De votre objectif à votre création', 'From your objective to your creation')}</h1>
      {loading ? <p role="status">{t('Chargement de vos références et du brouillon de cet onglet…', 'Loading your references and this tab’s draft…')}</p> : loadFailed ? <div className="stack"><p className="error" role="alert">{t('Chargement de vos références impossible.', 'Your references could not be loaded.')}</p><button type="button" className="btn btn-secondary" onClick={() => setRetry((n) => n + 1)}>{t('Réessayer', 'Retry')}</button><Link className="text-link" href="/login?next=/projects/new">{t('Se connecter', 'Sign in')}</Link></div> : <>
        <CampaignJourney
          variant="entry"
          objectiveDone={objectiveDone}
          channelDone={entryPassed}
          formatDone={entryPassed}
          assetsActive={draft.step === 3 && !!context}
          assetsHref={assetsHref}
          assetsHint={t('Après l’enregistrement, ajoutez ou choisissez les photos, le logo et les références de votre client.', 'After saving, add or choose your client’s photos, logo and references.')}
          identityName={context?.name}
          campaignId={draft.campaignId || null}
          campaignName={campaign?.name ?? null}
        />
        <nav aria-label={t('Démarrage de la création', 'Creation start')}><ol className="creation-steps">{steps.map((label, index) => <li key={label}><button type="button" className="step-button" aria-current={draft.step === index ? 'step' : undefined} disabled={busy || index > draft.step} onClick={() => move(index)}><span className="step-number">{index + 1}</span>{label}</button></li>)}</ol></nav>
        <p className="hint" role="status" data-testid="project-draft-status">{persisted ? (restored ? t('Brouillon repris et conservé dans cet onglet.', 'Draft resumed and kept in this tab.') : t('Brouillon conservé dans cet onglet.', 'Draft kept in this tab.')) : t('Brouillon non sauvegardé : le stockage de cet onglet est indisponible.', 'Draft not saved: this tab’s storage is unavailable.')} {t('Il n’est pas encore enregistré sur le serveur. Fermer cet onglet peut l’effacer.', 'It is not saved on the server yet. Closing this tab may erase it.')}</p>
        <form ref={form} className="card stack" onSubmit={submit} aria-busy={busy}>
          <h2 ref={heading} tabIndex={-1}>{steps[draft.step]}</h2>
          {draft.step === 0 ? <>
            <p className="muted">{t('Décrivez ce que vous voulez obtenir, avec vos mots. Vous pourrez préciser le brief ensuite.', 'Describe what you want to achieve, in your own words. You can refine the brief later.')}</p>
            <label className="label" htmlFor="project-objective">{t('Objectif de votre communication', 'Communication objective')}</label>
            <textarea id="project-objective" className="input textarea" data-testid="project-objective" value={draft.objective} onChange={(e) => edit('objective', e.target.value)} minLength={2} maxLength={8000} required disabled={busy} aria-describedby="objective-help" />
            <p className="hint" id="objective-help">{t('Par exemple : faire découvrir une nouvelle offre, annoncer un atelier, remercier des clients ou présenter votre univers. Aucune compétence technique n’est demandée.', 'For example: introduce a new offer, announce a workshop, thank clients or present your world. No technical skill is required.')}</p>
            <label className="label" htmlFor="project-title">{t('Nom du projet', 'Project name')}</label>
            <input id="project-title" className="input" data-testid="project-title" value={draft.title} onChange={(e) => edit('title', e.target.value)} minLength={2} maxLength={160} required disabled={busy} aria-describedby="title-help" />
            <p className="hint" id="title-help">{t('Ce nom vous aide à retrouver le projet. Il n’est pas publié.', 'This name helps you find the project. It is not published.')}</p>
          </> : draft.step === 1 ? <>
            <p className="muted">{t('Choisissez où la création sera utilisée, puis un format compatible. Seuls les formats réellement pris en charge sont proposés.', 'Choose where the creation will be used, then a compatible format. Only supported formats are offered.')}</p>
            <div className="choice-grid" role="group" aria-label={t('Canal', 'Channel')}>
              {projectPlatforms.map((platform) => <button type="button" key={platform} className="choice-card" data-testid={'project-channel-' + platform} aria-pressed={draft.platform === platform} disabled={busy} onClick={() => selectPlatform(platform)}>
                <strong>{platform}</strong>
                <span className="muted small">{t(channelCopy[platform][0], channelCopy[platform][1])}</span>
                <span className="hint">{availableFormats[platform].map((format) => productionFormats[format].label).join(' · ')}</span>
              </button>)}
            </div>
            <div className="choice-grid" role="group" aria-label={t('Format', 'Format')}>
              {(availableFormats[draft.platform] as readonly ProductionFormat[]).map((format) => <button type="button" key={format} className="choice-card" data-testid={'project-format-' + format} aria-pressed={draft.format === format} disabled={busy} onClick={() => edit('format', format)}>
                <strong>{productionFormats[format].label}</strong>
                <span className="muted small">{t(formatCopy[format][0], formatCopy[format][1])}</span>
                <span className="hint">{t('Fichier', 'File')} {fileLabels[productionFormats[format].file] ?? productionFormats[format].file.toUpperCase()}</span>
              </button>)}
            </div>
            <p className="hint">{t('Ces formats se composent dans le Studio à partir de vos ressources. Aucun réglage de fournisseur n’est demandé ici.', 'These formats are composed in the Studio from your assets. No provider setting is requested here.')}</p>
            {productionFormats[draft.format].file === 'mp4' && <details><summary>{t('Durée et réglages différables', 'Duration and optional settings')}</summary><label className="label">{t('Durée initiale par scène', 'Initial duration per scene')}<select className="input" data-testid="project-scene-duration" value={draft.sceneDurationSeconds} disabled={busy} onChange={(e) => edit('sceneDurationSeconds', Number(e.target.value))}>{[1,2,3,5,10,15].map((seconds) => <option key={seconds} value={seconds}>{seconds} {t('secondes', 'seconds')}</option>)}</select></label><p className="hint">{t('Durée, direction artistique, public, ton et appel à l’action pourront être revus dans la composition.', 'Duration, art direction, audience, tone and call to action can be reviewed in the composition.')}</p></details>}
          </> : draft.step === 2 ? <>
            <p className="muted">{t('Réutilisez une marque, une activité ou un univers créatif confirmé. L’identité choisie sera employée pour le brainstorming et les directions artistiques, sans être ressaisie.', 'Reuse a confirmed brand, business or creative universe. The chosen identity will be used for brainstorming and art directions, without retyping it.')}</p>
            {contexts.length ? <>
              <label className="label" htmlFor="project-context">{t('Profil de marque', 'Brand profile')}</label>
              <select id="project-context" className="input" data-testid="project-context" value={draft.contextId} required disabled={busy} onChange={(e) => edit('contextId', e.target.value)}>
                <option value="">{t('Choisir un profil', 'Select a profile')}</option>
                {contexts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              {context ? <div className="context-completeness stack" data-testid="project-context-preview"><strong>{context.name}</strong><p className="context-copy">{context.description}</p>{context.tone ? <p className="hint">{t('Ton : ', 'Tone: ')}{context.tone}</p> : null}{context.audience ? <p className="hint">{t('Public : ', 'Audience: ')}{context.audience}</p> : null}<p className="hint">{t('Cette identité sera réutilisée ; aucun fichier de sa bibliothèque n’est sélectionné automatiquement.', 'This identity will be reused; no file from its library is selected automatically.')}</p></div> : null}
              <Link className="text-link" href="/contexts/new?returnTo=project">{t('Créer un profil et revenir ici', 'Create a profile and return here')}</Link>
            </> : <div className="context-completeness stack" data-testid="project-context-empty">
              <strong>{t('Aucun profil de marque disponible', 'No brand profile available')}</strong>
              <p>{t('Un nom et une courte description suffisent pour créer votre identité. Elle sera réutilisée dans vos prochaines créations.', 'A name and a short description are enough to create your identity. It will be reused in your next creations.')}</p>
              <Link className="btn btn-secondary" href="/contexts/new?returnTo=project">{t('Créer mon profil de marque', 'Create my brand profile')}</Link>
            </div>}
          </> : <>
            <p className="muted">{t('Vérifiez les informations avant d’enregistrer. Cette action ne lance ni génération, ni publication.', 'Review the information before saving. This action starts neither generation nor publication.')}</p>
            <dl className="detail-list">
              <div><dt>{t('Nom', 'Name')}</dt><dd>{draft.title}</dd></div>
              <div><dt>{t('Objectif', 'Objective')}</dt><dd className="context-copy">{draft.objective}</dd></div>
              <div><dt>{t('Canal', 'Channel')}</dt><dd>{draft.platform}</dd></div>
              <div><dt>{t('Format', 'Format')}</dt><dd>{productionFormats[draft.format].label} · {fileLabels[productionFormats[draft.format].file] ?? productionFormats[draft.format].file.toUpperCase()}</dd></div>
              <div><dt>{t('Identité', 'Identity')}</dt><dd>{context?.name || t('À choisir', 'To choose')}</dd></div>
            </dl>
            <div className="stack">
              <label className="label" htmlFor="project-campaign">{t('Campagne (facultatif)', 'Campaign (optional)')}</label>
              {campaignFailed ? <div className="error" role="alert"><p>{t('Vos campagnes sont momentanément indisponibles. Vous pouvez enregistrer le projet sans campagne.', 'Your campaigns are temporarily unavailable. You can save the project without a campaign.')}</p><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setRetry((n) => n + 1)}>{t('Réessayer', 'Retry')}</button></div> : null}
              {campaigns.length ? <select id="project-campaign" className="input" data-testid="project-campaign" value={draft.campaignId} disabled={busy} onChange={(e) => edit('campaignId', e.target.value)}>
                <option value="">{t('Aucune campagne', 'No campaign')}</option>
                {campaigns.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select> : <p className="hint">{t('Aucune campagne pour l’instant. Vous pouvez enregistrer le projet puis en créer une.', 'No campaign yet. You can save the project then create one.')}</p>}
              <Link className="text-link" href="/campaigns">{t('Gérer les campagnes', 'Manage campaigns')}</Link>
            </div>
            <p className="hint">{t('Prochaine étape : vos ressources (photos, logo, références). Le brainstorming ne démarre pas avant.', 'Next step: your assets (photos, logo, references). Brainstorming does not start before.')}</p>
          </>}
          {pendingProjectId ? <div className="error" role="alert" data-testid="project-campaign-error"><p>{error}</p><div className="actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void retryCampaignLink()}>{t('Réessayer le rattachement', 'Retry linking')}</button><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => finish(pendingProjectId)}>{t('Ouvrir le projet sans campagne', 'Open the project without a campaign')}</button></div></div>
            : error ? <div className="error" data-testid="project-error" role="alert"><p>{error}</p><p>{t('Enregistrement non confirmé. Votre saisie est conservée ; vous pouvez corriger ou réessayer.', 'Saving not confirmed. Your input is kept; you can correct it or retry.')}</p></div> : null}
          <div className="actions">
            {draft.step > 0 ? <button type="button" className="btn btn-ghost" disabled={busy || !!pendingProjectId} onClick={() => move(draft.step - 1)}>{t('Étape précédente', 'Previous step')}</button> : null}
            <button type="submit" className="btn btn-primary" data-testid={draft.step === 3 ? 'project-submit' : 'project-next'} disabled={busy || !!pendingProjectId || (draft.step === 2 && !contexts.length)}>{busy ? t('Enregistrement…', 'Saving…') : draft.step === 3 ? t('Enregistrer le projet et ouvrir le Studio', 'Save project and open the Studio') : t('Passer à ', 'Continue to ') + steps[draft.step + 1].toLocaleLowerCase(locale)}</button>
          </div>
        </form>
      </>}
    </main>
  </div>;
}
