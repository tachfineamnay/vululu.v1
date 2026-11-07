import { ApplicationError } from '../errors';
import { buildDemoConversation } from '../deterministicConversation';
import type {
  Actor,
  AuditPort,
  MessageStore,
  ProjectBundleQueryPort,
  ProjectRepository
} from '../ports';

/** Use case message : la paire user/assistant est creee atomiquement. */
export class MessageUseCases {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly messages: MessageStore,
    private readonly bundle: ProjectBundleQueryPort,
    private readonly audit: AuditPort
  ) {}

  async add(actor: Actor, projectId: string, content: string) {
    if (typeof content !== 'string' || !content.trim() || content.length > 2000) throw new ApplicationError('invalid_message', 'Le message doit contenir de 1 à 2000 caractères.', 400);
    const project = await this.projects.findOwned(projectId, actor.id);
    if (!project) {
      throw new ApplicationError('project_not_found', 'Projet introuvable.', 404);
    }
    const current = await this.bundle.getOwnedBundle(actor.id, projectId);
    const reply = buildDemoConversation(current, content.trim());
    const pair = await this.messages.createPair({
      projectId,
      userContent: content.trim(),
      assistantContent: reply.content,
      ...(reply.proposal ? { assistantProposal: reply.proposal } : {})
    });
    await this.audit.record({
      actorId: actor.id,
      action: 'message.created',
      targetType: 'project',
      targetId: projectId,
      metadata: { role: 'user', mode: 'MOCK', proposalKind: reply.proposal?.kind ?? null }
    });
    return pair;
  }
}
