import type {
  Actor,
  BriefInput,
  ProductionWorkflowPort,
  ProjectWorkflowPort
} from '@vululu/application';
import {
  addMessage,
  getProjectBundle,
  generateStoryboard,
  updateBrief,
  updateSceneDuration
} from '../../services/projects';
import {
  approveMaster,
  getQa,
  startCorrection,
  startProduction,
  transferToPostiz
} from '../../services/production';

/**
 * Adaptateur de transition : encapsule les services V0 Prisma derriere les ports
 * applicatifs. Les routes ne dependent plus directement de ces services.
 *
 * V1-01-B remplacera progressivement les methodes de lecture/production par des
 * use cases 100% ports/domain, sans changer les contrats des routes.
 */
export class LegacyWorkflowAdapter implements ProjectWorkflowPort, ProductionWorkflowPort {
  getBundle(actor: Actor, projectId: string): Promise<unknown> {
    return getProjectBundle(actor.id, projectId);
  }

  updateBrief(actor: Actor, projectId: string, input: BriefInput): Promise<unknown> {
    return updateBrief(actor.id, projectId, input);
  }

  generateStoryboard(actor: Actor, projectId: string): Promise<unknown> {
    return generateStoryboard(actor.id, projectId);
  }

  addMessage(actor: Actor, projectId: string, content: string): Promise<unknown> {
    return addMessage(actor.id, projectId, content);
  }

  updateSceneDuration(actor: Actor, projectId: string, sceneKey: string, durationSeconds: number): Promise<unknown> {
    return updateSceneDuration(actor.id, projectId, sceneKey, durationSeconds);
  }

  startProduction(actor: Actor, projectId: string, jobRunId?: string): Promise<unknown> {
    return startProduction(actor.id, projectId, jobRunId);
  }

  startCorrection(actor: Actor, projectId: string, sceneKey: string, instruction: string, jobRunId?: string): Promise<unknown> {
    return startCorrection(actor.id, projectId, sceneKey, instruction, jobRunId);
  }

  approve(actor: Actor, projectId: string, artifactVersionId: string, checksum: string): Promise<unknown> {
    return approveMaster(actor.id, projectId, artifactVersionId, checksum).then((approval) => ({ approval }));
  }

  transfer(actor: Actor, projectId: string): Promise<unknown> {
    return transferToPostiz(actor.id, projectId).then((transfer) => ({ transfer }));
  }

  getQa(actor: Actor, projectId: string): Promise<unknown> {
    return getQa(actor.id, projectId);
  }
}
