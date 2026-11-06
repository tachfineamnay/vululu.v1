import type { ProjectBundle } from './api';

/** Repères de lecture dérivés du bundle ; aucun état de workflow conservé côté client. */
export function projectJourney(bundle: ProjectBundle) {
  const { brief, project, scenes, master } = bundle;
  const revision = brief?.revisions.find((item) => item.version === brief.version);
  const confirmed = !!(brief && revision && brief.confirmedVersion === brief.version && brief.confirmedChecksum === revision.checksum);
  const storyboardCurrent = !!(brief && scenes.length && project.storyboardBriefVersion === brief.version);
  const approval = master?.approval;
  const approved = !!(master && approval && !approval.invalidatedAt && approval.checksum === master.checksum);
  const current = !confirmed ? 'brief' : !storyboardCurrent ? 'storyboard' : !master || project.status === 'producing' || bundle.job?.status === 'failed' ? 'production' : 'finalization';
  return {
    current,
    stages: [
      { key: 'brief', title: 'Préparer le brief', target: 'brief-heading', action: 'Relire et compléter le brief',
        state: !brief ? 'À préparer' : confirmed ? `Version ${brief.version} confirmée` : `Version ${brief.version} à confirmer`,
        input: `Contexte : ${bundle.context.name}. Idée : ${project.objective}`,
        output: brief ? `Brief v${brief.version} enregistré. ${confirmed ? 'Version exacte confirmée.' : 'Confirmation nécessaire avant le storyboard.'}` : 'Aucun brief enregistré.' },
      { key: 'storyboard', title: 'Préparer les scènes', target: 'storyboard-heading', action: 'Consulter les scènes et leurs durées',
        state: !scenes.length ? 'Aucune scène' : storyboardCurrent ? `${scenes.length} scènes liées au brief actuel` : 'Storyboard à actualiser',
        input: confirmed ? `Brief v${brief!.version} confirmé.` : 'Un brief enregistré et confirmé est requis pour générer le storyboard.',
        output: scenes.length ? `${scenes.length} scènes conservées, identifiées par leur Scene ID. Brief source : ${project.storyboardBriefVersion ?? 'non exposé'}.` : 'Le storyboard sera produit par l’action existante, sans lancer le rendu média.' },
      { key: 'production', title: 'Produire et examiner', target: master ? 'preview-heading' : 'storyboard-heading', action: master ? 'Voir le résultat et ses versions' : 'Consulter les conditions de production',
        state: project.status === 'producing' ? 'Production en cours' : bundle.job?.status === 'failed' ? 'Dernière exécution en échec' : master ? `Master v${master.version} disponible · QA ${master.qaStatus ?? 'NOT_RUN'}` : 'Aucun résultat produit',
        input: 'Brief confirmé, storyboard à jour et plan admissible. Le serveur vérifie ces conditions au lancement.',
        output: master ? `Master v${master.version} et ${bundle.masterVersions.length} version(s) consultables. Un résultat disponible ne prouve pas qu’il correspond aux dernières modifications du brief.` : 'Aucun master disponible. Consultez le plan et son plafond avant de lancer.' },
      { key: 'finalization', title: 'Valider et transférer', target: master ? 'qa-heading' : null, action: 'Examiner la qualité et l’approbation',
        state: approved ? (approval?.transfer ? `Transfert MOCK : ${approval.transfer.status}` : `Master v${master!.version} approuvé`) : 'Approbation exacte requise',
        input: 'Master courant, contrôle qualité et approbation de sa version exacte et de son checksum.',
        output: approved ? 'Approbation serveur consultable. Un transfert Postiz MOCK ne constitue pas une publication.' : 'Aucune approbation valide du master courant. Les versions précédentes restent consultables.' }
    ]
  };
}

export function executionStatus(status: string) {
  const labels: Record<string, string> = { pending: 'En attente', queued: 'En file', running: 'En cours', succeeded: 'Réussie', failed: 'Échec', cancelled: 'Annulée', skipped: 'Ignorée' };
  return labels[status] ?? status;
}

export function productionStepLabel(key: string) {
  const labels: Record<string, string> = { snapshot: 'Figer les paramètres', 'validate-snapshot': 'Vérifier les paramètres figés', 'resolve-capabilities': 'Résoudre les capacités', 'render-scenes': 'Rendre les scènes', 'correct-scene': 'Corriger la scène ciblée', 'assemble-master': 'Assembler la vidéo', qa: 'Contrôler la qualité', finalize: 'Conserver la version et sa provenance', approval: 'Attendre l’approbation humaine', transfer: 'Transférer vers Postiz MOCK' };
  return labels[key] ?? key;
}
