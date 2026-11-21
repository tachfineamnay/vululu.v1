import { z } from 'zod';
// Version is part of each immutable tool identity. No dynamic URLs, secrets, prompts or provider selection.
import { caps } from '../mediaGeneration/providers';
import { audioTranscribeRequest, audioTtsRequest, creativeDirectionInput, imageEditRequest } from '@vululu/contracts';

import type { CostBasis } from './costBasis';
import type { ProposalToolPolicy } from '../../application/agentProposalPolicy';

export type ToolScope = 'project' | 'revision' | 'assets';
export type ToolApproval = 'auto' | 'human';
export type ToolDefinition = {
  provider: string;
  action: 'READ' | 'GENERATE' | 'WRITE/PUBLISH';
  maxCents: number;
  /** Paramètres proposés par l'agent puis revalidés par le serveur ; absent = non proposable par l'agent. */
  params?: z.ZodTypeAny;
  scope: ToolScope;
  approval: ToolApproval;
  description: string;
  /** false = l'agent ne peut pas proposer cet outil lui-même (action réservée à l'utilisateur). */
  agentProposable?: boolean;
};
const toolCatalog = {
  'media.image@1': { provider: caps.image.provider, action: 'GENERATE', maxCents: caps.image.maxCents, scope: 'revision', approval: 'human', description: 'Générer une image externe (fournisseur, budget requis).' },
  'media.video@1': { provider: caps.video.provider, action: 'GENERATE', maxCents: caps.video.maxCents, scope: 'revision', approval: 'human', description: 'Générer une vidéo externe (fournisseur, budget requis).' },
  'assistant.draft@1': { provider: 'vertex-gemini@1', action: 'GENERATE', maxCents: 8, scope: 'revision', approval: 'human', description: 'Rédiger un brouillon d’assistant (Vertex, budget requis).' },
  'marketing.plan@1': { provider: 'editorial-recipe@1', action: 'GENERATE', maxCents: 8, scope: 'revision', approval: 'human', description: 'Générer un plan marketing éditorial.' },
  'postiz.schedule@1': { provider: 'postiz@1', action: 'WRITE/PUBLISH', maxCents: 0, scope: 'revision', approval: 'human', description: 'Programmer une publication Postiz (approbation de contenu requise).' },
  'postiz.cancel@1': { provider: 'postiz@1', action: 'WRITE/PUBLISH', maxCents: 0, scope: 'revision', approval: 'human', description: 'Annuler une programmation Postiz.' },
  'studio.inspect@1': { provider: 'studio@1', action: 'READ', maxCents: 0, scope: 'revision', approval: 'auto', description: 'Lire une révision de composition existante.' },
  'studio.render@1': { provider: 'studio@1', action: 'GENERATE', maxCents: 0, scope: 'revision', approval: 'human', description: 'Rendre une révision de composition (Sharp/FFmpeg).' },
  'sandbox.generate@1': { provider: 'sandbox@1', action: 'GENERATE', maxCents: 10, scope: 'revision', approval: 'human', description: 'Unités synthétiques de démonstration, jamais publiées.' },
  'sandbox.publish@1': { provider: 'sandbox@1', action: 'WRITE/PUBLISH', maxCents: 4, scope: 'revision', approval: 'human', description: 'Unité synthétique de démonstration, jamais publiée.' },
  // P05 — outils lisibles avant toute révision créative, proposables par l'agent (aucun effet payant).
  'project.summary@1': { provider: 'vululu@1', action: 'READ', maxCents: 0, scope: 'project', approval: 'auto', description: 'Résumé du projet : objectif, canal, format, identité, décision de ressources.', params: z.strictObject({}) },
  'assets.list@1': { provider: 'vululu@1', action: 'READ', maxCents: 0, scope: 'assets', approval: 'auto', description: 'Lister les ressources confirmées du projet (version, type, empreinte, droits).', params: z.strictObject({}) },
  'assets.inspect@1': { provider: 'vululu@1', action: 'READ', maxCents: 0, scope: 'assets', approval: 'auto', description: 'Inspecter une ressource confirmée (métadonnées et empreinte).', params: z.strictObject({ versionId: z.string().min(1).max(128) }) },
  'creative.direction@1': { provider: 'vululu@1', action: 'GENERATE', maxCents: 0, scope: 'project', approval: 'human', description: 'Créer des directions artistiques versionnées depuis le brainstorming.', params: creativeDirectionInput },
  // P06 — boîte à outils Python interne ; lecture libre, dérivation d'assets avec approbation humaine.
  'image.analyze@1': { provider: 'python-tools@1', action: 'READ', maxCents: 0, scope: 'assets', approval: 'auto', description: 'Analyser une image confirmée (exposition, netteté, couleurs, empreinte perceptuelle) via le service Python interne.', params: z.strictObject({ versionId: z.string().min(1).max(128) }) },
  'image.segment@1': { provider: 'python-tools@1', action: 'GENERATE', maxCents: 0, scope: 'assets', approval: 'human', description: 'Détourer une image confirmée via le service Python interne (GrabCut classique, non appris : PNG transparent + masque alpha), puis enregistrer de nouvelles versions.', params: z.strictObject({ versionId: z.string().min(1).max(128), outputs: z.array(z.enum(['cutout', 'mask'])).min(1).max(2).optional(), maxDimension: z.int().min(256).max(4096).optional() }) },
  // P07 — édition/génération d'image IA : action utilisateur explicite (droits + source choisis), jamais auto-proposée par l'agent.
  'media.image.edit@1': { provider: 'gemini-image@1', action: 'GENERATE', maxCents: 8, scope: 'project', approval: 'human', agentProposable: false, description: 'Éditer ou générer une image (Gemini Image via Vertex) à partir d’une ressource choisie, avec ratio social et préservation du sujet ; nouvelle version d’asset, jamais d’écrasement.', params: imageEditRequest },
  // P09B — audio : lecture Python locale gratuite, transcription et voix off fournisseur avec approbation humaine.
  'audio.analyze@1': { provider: 'python-tools@1', action: 'READ', maxCents: 0, scope: 'assets', approval: 'auto', description: 'Analyser une piste WAV confirmée (durée, niveaux, silences) via le service Python interne.', params: z.strictObject({ versionId: z.string().min(1).max(128) }) },
  'audio.transcribe@1': { provider: 'gemini-audio@1', action: 'GENERATE', maxCents: 8, scope: 'revision', approval: 'human', agentProposable: false, description: 'Transcrire une piste audio confirmée en segments horodatés (Vertex Gemini, budget requis) ; nouvelle révision de sous-titres, jamais d’écrasement.', params: audioTranscribeRequest },
  'audio.tts@1': { provider: 'gemini-tts@1', action: 'GENERATE', maxCents: 12, scope: 'revision', approval: 'human', agentProposable: false, description: 'Générer une voix off (Vertex Gemini TTS) depuis un texte fourni ; nouveau fichier audio immuable, aucune voix clonée.', params: audioTtsRequest }
} as const satisfies Record<string, ToolDefinition>;
export type Tool = keyof typeof toolCatalog;
/**
 * Catalogue exposé aux routes et au broker : les valeurs sont typées ToolDefinition afin que
 * les champs optionnels (params, agentProposable) restent lisibles sans cast. Les clés
 * littérales restent portées par Tool ; l'objet lui-même reste figé par as const.
 */
export const tools: Record<Tool, ToolDefinition> = toolCatalog;
export const toolSchema = z.enum(Object.keys(tools) as [Tool, ...Tool[]]);
/** Un outil est proposable si son schéma de paramètres est déclaré et qu'il n'est pas réservé à l'utilisateur. */
export function isAgentProposable(definition: ToolDefinition | undefined): boolean {
  return definition !== undefined && definition.params !== undefined && definition.agentProposable !== false;
}
/** Vue minimale du registre lue par la politique pure `checkAgentProposal`. */
export function toolPolicy(tool: string): ProposalToolPolicy | null {
  if (!Object.prototype.hasOwnProperty.call(tools, tool)) return null;
  const definition = tools[tool as Tool];
  return {
    hasParams: definition.params !== undefined,
    agentProposable: definition.agentProposable !== false,
    scope: definition.scope
  };
}
/** Sous-ensemble que l'agent peut recommander : schéma de paramètres déclaré, aucun secret, aucun réseau arbitraire. */
export const agentTools: Record<string, ToolDefinition> = Object.fromEntries(
  Object.entries(tools).filter(([, definition]) => isAgentProposable(definition))
);
export function agentCatalog() {
  return Object.entries(agentTools).map(([tool, definition]) => ({
    tool, action: definition.action, scope: definition.scope, approval: definition.approval,
    maxCents: definition.maxCents, description: definition.description
  }));
}
export const proposal = z.object({ key: z.string().min(1).max(160), tool: toolSchema, revision: z.int().positive() }).strict();
/**
 * Issue d'un moteur d'exécution.
 *
 * `costCents` est le montant brut annoncé par le fournisseur : jamais rogné au plafond.
 * `costBasis` déclare sa provenance (voir ./costBasis) ; le broker refuse de régler un montant
 * au-delà de `maxCents` et enregistre un incident au lieu d'un succès.
 */
export type EngineOutcome =
  | { costCents: number; costBasis: CostBasis; result?: unknown }
  /** Échec déterministe AVANT tout appel fournisseur : rien n'a été facturé, la réservation est libérée. */
  | { failed: { code: string; message: string } }
  /**
   * Le fournisseur a répondu (donc facturé) mais la sortie n'est pas exploitable : jamais un
   * succès, jamais une libération gratuite — le broker enregistre un incident à rapprocher.
   */
  | { uncertain: { code: string; message: string } }
  | { pendingMedia: true };
export interface EnginePort {
  invoke(
    job: { id: string; accountId: string; projectId: string; tool: Tool; revision: number; maxCents: number; params: unknown },
    signal: AbortSignal
  ): Promise<EngineOutcome>;
}


/**
 * Catalogue réellement proposable à un compte d'exécution.
 *
 * Un outil n'est exposé que si le compte est actif et que sa politique de
 * périmètre l'autorise : le catalogue ne doit jamais proposer une opération que
 * `propose()` refusera ensuite avec 403 `tool_disabled`.
 */
export function catalogForAccount(
  account: { enabled: boolean; tools: readonly string[] } | null,
  options: { demoDisabled: boolean }
): Record<string, (typeof tools)[Tool]> {
  const permitted = new Set(account && account.enabled ? account.tools : []);
  return Object.fromEntries(
    (Object.entries(tools) as [Tool, (typeof tools)[Tool]][]).filter(
      ([key]) => permitted.has(key) && (!options.demoDisabled || !key.startsWith('sandbox.'))
    )
  );
}
