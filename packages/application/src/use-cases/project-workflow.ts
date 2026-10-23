import type { AuditPort, Actor, BriefInput, ProductionWorkflowPort, ProjectWorkflowPort } from '../ports';

/**
 * Use cases de workflow projet : brief, storyboard, messages, duree de scene,
 * lecture du bundle. Les operations metier sont deleguees a un port injecte ;
 * la couche application reste sans Prisma/Fastify.
 */
export class ProjectWorkflowUseCases {
  constructor(
    private readonly workflow: ProjectWorkflowPort,
    private readonly audit: AuditPort
  ) {}

  getBundle(actor: Actor, projectId: string): Promise<unknown> {
    return this.workflow.getBundle(actor, projectId);
  }

  async updateBrief(actor: Actor, projectId: string, input: BriefInput): Promise<unknown> {
    const result = await this.workflow.updateBrief(actor, projectId, input);
    await this.audit.record({
      actorId: actor.id,
      action: 'brief.updated',
      targetType: 'project',
      targetId: projectId,
      metadata: { version: (result as { brief?: { version?: number } }).brief?.version ?? null }
    });
    return result;
  }

  async generateStoryboard(actor: Actor, projectId: string): Promise<unknown> {
    const result = await this.workflow.generateStoryboard(actor, projectId);
    await this.audit.record({
      actorId: actor.id,
      action: 'storyboard.generated',
      targetType: 'project',
      targetId: projectId,
      metadata: { scenes: (result as { scenes?: unknown[] }).scenes?.length ?? null }
    });
    return result;
  }

  async addMessage(actor: Actor, projectId: string, content: string): Promise<unknown> {
    const result = await this.workflow.addMessage(actor, projectId, content);
    await this.audit.record({
      actorId: actor.id,
      action: 'message.created',
      targetType: 'project',
      targetId: projectId,
      metadata: { role: 'user' }
    });
    return result;
  }

  async updateSceneDuration(actor: Actor, projectId: string, sceneKey: string, durationSeconds: number): Promise<unknown> {
    const result = await this.workflow.updateSceneDuration(actor, projectId, sceneKey, durationSeconds);
    await this.audit.record({
      actorId: actor.id,
      action: 'scene.duration_updated',
      targetType: 'scene',
      targetId: sceneKey,
      metadata: { projectId, durationSeconds }
    });
    return result;
  }
}
