import type { BriefProposalFields, MessageProposal, ProjectBundleRecord } from './ports';

type Reply = { content: string; proposal?: MessageProposal };
const help = 'Simulation MOCK. Pour proposer un brief, utilisez /brief ou quatre lignes : Objectif: …, Audience: …, Ton: …, CTA: …. Pour préparer une correction : SCENE-003: votre instruction. Relisez ensuite le formulaire avant de sauvegarder ou lancer une action.';
const labels: Record<string, keyof BriefProposalFields> = { objectif: 'objective', audience: 'audience', ton: 'tone', cta: 'cta' };

/** Scénarios synchrones : saisie déclarée, données enregistrées et exemples explicites. */
export function buildDemoConversation(bundle: ProjectBundleRecord, content: string): Reply {
  if (/^(?:\/aide|aide|bonjour|salut)\b/i.test(content)) return { content: help };
  if (/^(?:je\s+)?confirm(?:er|e|ation)\b/i.test(content)) return { content: 'Simulation MOCK. La confirmation se fait dans le formulaire du brief, après relecture du plan, de la version exacte et de son plafond. Ce message ne confirme aucune version.' };
  const sceneMatch = /\bSCENE-\d{3,}\b/i.exec(content);
  const hasDeclaredFields = /^(?:objectif|audience|ton|cta)\s*:/im.test(content);
  if (sceneMatch && !hasDeclaredFields && !/^\/brief\b/i.test(content)) {
    const key = sceneMatch[0].toUpperCase(); const scene = bundle.scenes.find((value) => value.sceneKey === key); const version = scene?.versions[0];
    if (!scene) return { content: 'Simulation MOCK. Ce Scene ID n’existe pas dans le storyboard courant. Choisissez une scène affichée.' };
    if (!version || !bundle.master) return { content: 'Simulation MOCK. Produisez un aperçu avant de préparer une correction de rendu.' };
    const instruction = content.slice(sceneMatch.index + sceneMatch[0].length).replace(/^\s*[:—-]?\s*/, '').trim();
    if (instruction.length < 3 || instruction.length > 500) return { content: 'Simulation MOCK. Après le Scene ID, précisez une instruction de 3 à 500 caractères.' };
    return { content: 'Simulation MOCK. Voici une correction à reprendre dans le formulaire. Relisez la scène et la version du master avant de lancer la correction.', proposal: { schemaVersion: 1, mode: 'MOCK', kind: 'correction', baseBriefVersion: bundle.brief?.version ?? null, sceneKey: key, sceneVersion: version.version, sceneChecksum: version.checksum, masterVersion: bundle.master.version, masterChecksum: bundle.master.checksum, instruction } };
  }
  const declared: Partial<BriefProposalFields> = {}; let ambiguous = false;
  const body = content.replace(/^\/brief\b/i, '').trim();
  const requestsBrief = /^\/brief\b/i.test(content) || /^(?:propose|proposer)\b.*\bbrief\b/i.test(content) || hasDeclaredFields;
  if (!requestsBrief) return { content: help };
  if (body && !/^(?:propose|proposer)\b/i.test(body)) for (const line of body.split(/\r?\n/).filter((value) => value.trim())) {
    const match = /^(objectif|audience|ton|cta)\s*:\s*(.+)$/i.exec(line.trim());
    if (!match) { ambiguous = true; continue; }
    const field = labels[match[1].toLowerCase()]; const value = match[2].trim();
    if (declared[field] !== undefined || value.length < 2) ambiguous = true;
    declared[field] = value;
  }
  if (ambiguous) return { content: 'Simulation MOCK. Précisez une seule valeur par ligne avec Objectif:, Audience:, Ton: et CTA:. Les lignes non reconnues ou répétées demandent une clarification.' };
  const fields = {} as BriefProposalFields;
  const sources = {} as Extract<MessageProposal, { kind: 'brief' }>['sources'];
  const hypotheses: Array<keyof BriefProposalFields> = [];
  const examples: BriefProposalFields = { objective: 'Présenter le projet', audience: 'Public à préciser', tone: 'Clair et accueillant', cta: 'Découvrir le projet' };
  for (const field of ['objective', 'audience', 'tone', 'cta'] as const) {
    const contextual = field === 'audience' ? bundle.context.audience : field === 'tone' ? bundle.context.tone : null;
    const options = [
      { value: declared[field], source: 'user' as const }, { value: bundle.brief?.[field], source: 'brief' as const },
      { value: contextual, source: 'context' as const }, { value: field === 'objective' ? bundle.project.objective : null, source: 'project' as const }
    ];
    const selected = options.find((option) => typeof option.value === 'string' && option.value.trim().length >= 2 && option.value.length <= 2000);
    fields[field] = selected?.value?.trim() ?? examples[field]; sources[field] = selected?.source ?? 'example';
    if (!selected) hypotheses.push(field);
  }
  const revision = bundle.brief?.revisions.find((value) => value.version === bundle.brief?.version);
  return { content: 'Simulation MOCK. Cette proposition reprend les champs déclarés ou enregistrés. Les exemples signalés restent à valider. Reprenez-la dans le brouillon puis relisez, enregistrez et confirmez cette version du brief.', proposal: { schemaVersion: 1, mode: 'MOCK', kind: 'brief', baseBriefVersion: bundle.brief?.version ?? null, baseBriefChecksum: revision?.checksum ?? null, fields, sources, hypotheses } };
}
