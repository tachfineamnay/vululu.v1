import { ApplicationError } from '../errors';
import type {
  Actor,
  AuditPort,
  MessageStore,
  ProjectBundleQueryPort,
  ProjectBundleRecord,
  ProjectRepository
} from '../ports';

function buildVululuReply(bundle: ProjectBundleRecord): string {
  if (!bundle.brief) {
    return 'Je peux preparer le brief. Renseigne l objectif, l audience, le ton et le CTA, puis clique sur Preparer le brief.';
  }
  if (bundle.scenes.length === 0) {
    return 'Brief enregistre. Je peux generer un storyboard de cinq scenes, avec des Scene ID stables.';
  }
  if (!bundle.master) {
    return 'Storyboard pret. Lance la production des cinq scenes : je genererai les PNG, le master MP4, puis le controle qualite.';
  }
  if (bundle.master.approval && bundle.master.approval.transfer) {
    return 'Le transfert Postiz mock est confirme. Le parcours V0 est complet. Tu peux encore corriger la scene 3 et creer une nouvelle version.';
  }
  if (bundle.master.approval) {
    return 'Le master exact est approuve. Je peux maintenant lancer le transfert Postiz mock.';
  }
  return 'Le master est pret et verifie. Tu peux me demander de corriger la scene 3, ou valider cette version exacte avant transfert.';
}

/** Use case message : la paire user/assistant est creee atomiquement. */
export class MessageUseCases {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly messages: MessageStore,
    private readonly bundle: ProjectBundleQueryPort,
    private readonly audit: AuditPort
  ) {}

  async add(actor: Actor, projectId: string, content: string) {
    const project = await this.projects.findOwned(projectId, actor.id);
    if (!project) {
      throw new ApplicationError('project_not_found', 'Projet introuvable.', 404);
    }
    const current = await this.bundle.getOwnedBundle(actor.id, projectId);
    const pair = await this.messages.createPair({
      projectId,
      userContent: content,
      assistantContent: buildVululuReply(current)
    });
    await this.audit.record({
      actorId: actor.id,
      action: 'message.created',
      targetType: 'project',
      targetId: projectId,
      metadata: { role: 'user' }
    });
    return pair;
  }
}
