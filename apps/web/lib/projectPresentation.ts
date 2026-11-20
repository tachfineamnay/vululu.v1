import { availableFormats, productionFormats, type ProductionFormat } from '@vululu/contracts';
/** Libellés de l'état serveur, sans déduire une approbation ou une publication. */
export function projectProgress(status: string): { label: string; next: string } {
  const states: Record<string, { label: string; next: string }> = {
    draft: { label: 'Brouillon', next: 'Compléter le brief' },
    brief_ready: { label: 'Brief enregistré', next: 'Relire le brief et son plan' },
    storyboard_ready: { label: 'Storyboard prêt', next: 'Revoir les scènes avant production' },
    producing: { label: 'Création en cours', next: 'Suivre la création' },
    review: { label: 'Résultat à examiner', next: 'Examiner le résultat et la qualité' },
    approved: { label: 'Version approuvée', next: 'Préparer le transfert' },
    transferred: { label: 'Transfert MOCK confirmé', next: 'Consulter la livraison simulée' },
    failed: { label: 'Échec', next: 'Examiner l’erreur dans le projet' },
    cancelled: { label: 'Annulé', next: 'Consulter le travail conservé' },
    paused: { label: 'En pause', next: 'Consulter le suivi du projet' }
  };
  return states[status] ?? { label: status || 'État indisponible', next: 'Ouvrir le projet' };
}

export const projectFormatLabels: Record<string, string> = {
  ...Object.fromEntries(Object.entries(productionFormats).map(([key, value]) => [key, value.label])),
  Motion: 'Motion design'
};

export const projectPlatforms = ['Instagram', 'TikTok', 'LinkedIn'] as const;
export type ProjectPlatform = (typeof projectPlatforms)[number];

export type ProjectDraft = {
  title: string; objective: string; contextId: string; campaignId: string; platform: ProjectPlatform;
  format: ProductionFormat; sceneDurationSeconds: number; step: number;
};
export const emptyProjectDraft: ProjectDraft = { title: '', objective: '', contextId: '', campaignId: '', platform: 'Instagram', format: 'Video', sceneDurationSeconds: 2, step: 0 };

/** Le stockage de l'onglet n'est pas une source de confiance ni une sauvegarde serveur. */
export function restoreProjectDraft(raw: string | null): ProjectDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ProjectDraft>;
    if (!value || typeof value !== 'object' || typeof value.title !== 'string' || value.title.length > 160 || typeof value.objective !== 'string' || value.objective.length > 8000 || typeof value.contextId !== 'string' || value.contextId.length > 128 || !(projectPlatforms as readonly string[]).includes(value.platform ?? '') || !['Video','Story','Affiche','Carrousel','Reel'].includes(value.format??'') || !Number.isInteger(value.sceneDurationSeconds) || value.sceneDurationSeconds! < 1 || value.sceneDurationSeconds! > 15 || !Number.isInteger(value.step) || value.step! < 0 || value.step! > 3) return null;
    const campaignId = typeof value.campaignId === 'string' && value.campaignId.length <= 128 ? value.campaignId : '';
    return { title: value.title, objective: value.objective, contextId: value.contextId, campaignId, platform: value.platform as ProjectPlatform, format: (availableFormats[value.platform as ProjectPlatform] as readonly string[]).includes(value.format!) ? value.format! : availableFormats[value.platform as ProjectPlatform][0], sceneDurationSeconds: value.sceneDurationSeconds!, step: value.step! };
  } catch { return null; }
}

/** Première étape du parcours de création non renseignée, sans état de workflow côté client. */
export function entryStepComplete(draft: Pick<ProjectDraft, 'title' | 'objective'>): boolean {
  return draft.title.trim().length >= 2 && draft.objective.trim().length >= 2;
}

export type CampaignJourneyKey =
  | 'objective' | 'channel' | 'format' | 'assets' | 'brainstorm' | 'directions'
  | 'selection' | 'creation' | 'review' | 'approval' | 'delivery' | 'results';
export type CampaignJourneyState = 'done' | 'current' | 'upcoming';
export const campaignJourneyKeys: CampaignJourneyKey[] = [
  'objective', 'channel', 'format', 'assets', 'brainstorm', 'directions',
  'selection', 'creation', 'review', 'approval', 'delivery', 'results'
];

/** États dérivés du brouillon ou du projet : aucune étape future n'est présentée comme faite. */
export function campaignJourneyStates(input: {
  objectiveDone: boolean; channelDone: boolean; formatDone: boolean;
  assetsState: CampaignJourneyState; directionsCount?: number;
}): Record<CampaignJourneyKey, CampaignJourneyState> {
  const states: Record<CampaignJourneyKey, CampaignJourneyState> = {
    objective: 'upcoming', channel: 'upcoming', format: 'upcoming', assets: 'upcoming',
    brainstorm: 'upcoming', directions: 'upcoming', selection: 'upcoming', creation: 'upcoming',
    review: 'upcoming', approval: 'upcoming', delivery: 'upcoming', results: 'upcoming'
  };
  if (!input.objectiveDone) { states.objective = 'current'; return states; }
  states.objective = 'done';
  if (!input.channelDone) { states.channel = 'current'; return states; }
  states.channel = 'done';
  if (!input.formatDone) { states.format = 'current'; return states; }
  states.format = 'done';
  states.assets = input.assetsState;
  if (input.assetsState === 'done') {
    if ((input.directionsCount ?? 0) > 0) {
      states.brainstorm = 'done';
      states.directions = 'done';
      states.selection = 'current';
    } else {
      states.brainstorm = 'current';
    }
  }
  return states;
}
