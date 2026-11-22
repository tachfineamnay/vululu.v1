'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, type CampaignSummary } from '../lib/api';
import { campaignJourneyKeys, campaignJourneyStates, type CampaignJourneyKey, type CampaignJourneyState } from '../lib/projectPresentation';
import { useWorkspace } from './WorkspacePreferences';

const labels: Record<CampaignJourneyKey, [string, string]> = {
  objective: ['Objectif', 'Objective'],
  channel: ['Canal', 'Channel'],
  format: ['Format', 'Format'],
  assets: ['Vos ressources', 'Your assets'],
  brainstorm: ['Brainstorming', 'Brainstorming'],
  directions: ['Directions artistiques', 'Art directions'],
  selection: ['Choix humain', 'Human choice'],
  creation: ['Création éditable', 'Editable creation'],
  review: ['Revue', 'Review'],
  approval: ['Approbation', 'Approval'],
  delivery: ['Export / publication', 'Export / publishing'],
  results: ['Résultats', 'Results']
};
const stateLabels: Record<CampaignJourneyState, [string, string]> = {
  done: ['terminé', 'done'],
  current: ['étape en cours', 'current step'],
  upcoming: ['à venir', 'upcoming']
};

type Props = {
  objectiveDone: boolean;
  channelDone: boolean;
  formatDone: boolean;
  assetsActive: boolean;
  assetsConfirmed?: boolean;
  directionsCount?: number;
  assetsHref?: string;
  assetsHint?: string;
  identityName?: string;
  campaignId?: string | null;
  campaignName?: string | null;
  projectId?: string;
  variant: 'entry' | 'project';
  /** P12-09 — faits persistés qui rendent les étapes suivantes honnêtes. */
  selectionVersion?: number | null;
  rendered?: boolean;
  approved?: boolean;
  delivered?: boolean;
  results?: boolean;
  /** Cible de chaque étape : un lien réel, jamais un libellé mort. */
  hrefs?: Partial<Record<CampaignJourneyKey, string>>;
};

/** Carte de parcours commune à l'entrée de campagne et au projet. Elle ne déclenche aucune action. */
export default function CampaignJourney({ objectiveDone, channelDone, formatDone, assetsActive, assetsConfirmed, directionsCount, assetsHref, assetsHint, identityName, campaignId, campaignName, projectId, variant, selectionVersion, rendered, approved, delivered, results, hrefs }: Props) {
  const { t } = useWorkspace();
  const [campaign, setCampaign] = useState<{ name: string } | null>(campaignName ? { name: campaignName } : null);
  const [campaignFailed, setCampaignFailed] = useState(false);
  const [campaignLoading, setCampaignLoading] = useState(!!campaignId && !campaignName);
  const [assets, setAssets] = useState<{ count: number } | null>(null);
  const [assetsFailed, setAssetsFailed] = useState(false);
  const assetsState: CampaignJourneyState = variant === 'project'
    ? (assetsConfirmed ? 'done' : 'current')
    : (assetsActive ? 'current' : 'upcoming');
  const states = campaignJourneyStates({
    objectiveDone, channelDone, formatDone, assetsState, directionsCount,
    selectionVersion, rendered, approved, delivered, results
  });

  useEffect(() => {
    if (!campaignId || campaignName) return;
    let active = true;
    void api<{ campaign: CampaignSummary }>('/api/campaigns/' + encodeURIComponent(campaignId))
      .then((detail) => { if (active) setCampaign({ name: detail.campaign.name }); })
      .catch(() => { if (active) setCampaignFailed(true); })
      .finally(() => { if (active) setCampaignLoading(false); });
    return () => { active = false; };
  }, [campaignId, campaignName]);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    void api<{ versionIds: string[] }>('/api/projects/' + encodeURIComponent(projectId) + '/assets')
      .then((selection) => { if (active) setAssets({ count: selection.versionIds.length }); })
      .catch(() => { if (active) setAssetsFailed(true); });
    return () => { active = false; };
  }, [projectId]);

  return <section className="card campaign-journey" data-vululu-theme="blue" data-testid="campaign-journey" aria-labelledby="campaign-journey-heading">
    <div className="section-head">
      <div>
        <p className="eyebrow">{t('Votre parcours campagne', 'Your campaign journey')}</p>
        <h2 id="campaign-journey-heading">{t('De l’objectif aux résultats', 'From objective to results')}</h2>
      </div>
      {campaignId ? <Link className="text-link" href={'/campaigns?campaign=' + encodeURIComponent(campaignId)}>{campaignFailed ? t('Campagne indisponible', 'Campaign unavailable') : campaign ? t('Campagne : ', 'Campaign: ') + campaign.name : campaignLoading ? t('Chargement de la campagne…', 'Loading campaign…') : t('Campagne liée', 'Linked campaign')}</Link> : null}
    </div>
    <p className="hint">{identityName ? t('Identité réutilisée : ', 'Reused identity: ') + identityName : t('Votre identité de marque sera réutilisée sans la ressaisir.', 'Your brand identity will be reused without retyping it.')}</p>
    <ol className="campaign-journey-steps" aria-label={t('Étapes de la campagne', 'Campaign steps')}>
      {campaignJourneyKeys.map((key, index) => {
        const state = states[key];
        const href = hrefs?.[key] ?? (key === 'assets' ? assetsHref : undefined);
        // P12-09 — chaque étape ouvre la section réelle correspondante (ancre ou route) ; sans
        // cible, l'étape reste un texte d'état et n'invente pas de navigation.
        return <li key={key} data-state={state} data-step={key} aria-current={state === 'current' ? 'step' : undefined}>
          <span className="campaign-journey-number" aria-hidden="true">{index + 1}</span>
          {href
            ? <Link className="text-link" href={href} data-testid={'journey-step-' + key}>{t(labels[key][0], labels[key][1])}</Link>
            : <span data-testid={'journey-step-' + key}>{t(labels[key][0], labels[key][1])}</span>}
          <span className="sr-only"> — {t(stateLabels[state][0], stateLabels[state][1])}</span>
        </li>;
      })}
    </ol>
    {assetsFailed ? <p className="error" role="alert">{t('Sélection de ressources indisponible. Vous pouvez ouvrir la bibliothèque pour réessayer.', 'Asset selection unavailable. You can open the library to try again.')}</p> : null}
    {variant === 'project' && projectId && !assets && !assetsFailed ? <p className="hint" role="status">{t('Vérification des ressources du projet…', 'Checking project assets…')}</p> : null}
    {variant === 'project' && projectId && assets ? <p className="hint" role="status">{assets.count ? t(assets.count + ' ressource(s) sélectionnée(s) pour ce projet.', assets.count + ' asset(s) selected for this project.') : t('Aucune ressource sélectionnée pour ce projet.', 'No asset selected for this project yet.')}</p> : null}
    <div className="studio-next">
      <p><strong>{variant === 'entry' ? t('Après l’enregistrement', 'After saving') : t('Prochaine étape', 'Next step')}</strong> {assetsHint ?? t('Ajoutez ou choisissez les photos, le logo et les références de votre client.', 'Add or choose your client’s photos, logo and references.')}</p>
      {assetsHref ? <Link className="text-link" href={assetsHref}>{t('Préparer mes ressources', 'Prepare my assets')}</Link> : null}
    </div>
    <p className="hint">{t('Les étapes franchies restent enregistrées côté serveur (direction choisie, rendu, approbation, livraison) : après rafraîchissement ou reconnexion, ce parcours reprend au même point. Une étape non atteinte s’affiche « à venir ».', 'Completed steps stay recorded server-side (chosen direction, render, approval, delivery): after a refresh or a new login this journey resumes at the same point. A step not reached shows as “upcoming”.')}</p>
  </section>;
}
