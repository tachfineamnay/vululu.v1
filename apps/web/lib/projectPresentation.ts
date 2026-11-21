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

export type ProjectDraft = {
  title: string; objective: string; contextId: string; platform: 'TikTok' | 'Instagram' | 'LinkedIn';
  format: ProductionFormat; sceneDurationSeconds: number; step: number;
};
export const emptyProjectDraft: ProjectDraft = { title: '', objective: '', contextId: '', platform: 'Instagram', format: 'Video', sceneDurationSeconds: 2, step: 0 };

/** Le stockage de l'onglet n'est pas une source de confiance ni une sauvegarde serveur. */
export function restoreProjectDraft(raw: string | null): ProjectDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ProjectDraft>;
    if (!value || typeof value !== 'object' || typeof value.title !== 'string' || value.title.length > 160 || typeof value.objective !== 'string' || value.objective.length > 8000 || typeof value.contextId !== 'string' || value.contextId.length > 128 || !['TikTok', 'Instagram', 'LinkedIn'].includes(value.platform ?? '') || !['Video','Story','Affiche','Carrousel','Reel'].includes(value.format??'') || !Number.isInteger(value.sceneDurationSeconds) || value.sceneDurationSeconds! < 1 || value.sceneDurationSeconds! > 15 || !Number.isInteger(value.step) || value.step! < 0 || value.step! > 3) return null;
    // Un couple destination/format non qualifié est refusé, jamais corrigé en silence.
    if (!(availableFormats[value.platform!] as readonly string[]).includes(value.format!)) return null;
    return { title: value.title, objective: value.objective, contextId: value.contextId, platform: value.platform!, format: value.format as ProductionFormat, sceneDurationSeconds: value.sceneDurationSeconds!, step: value.step! };
  } catch { return null; }
}
