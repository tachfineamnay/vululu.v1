import crypto from 'node:crypto';
import {
  ContextUseCases,
  ProductionUseCases,
  ProjectUseCases,
  ProjectWorkflowUseCases,
  type Actor
} from '@vululu/application';
import {
  LegacyWorkflowAdapter,
  PrismaAuditAdapter,
  PrismaContextRepository,
  PrismaJobRunRepository,
  PrismaProjectRepository,
  PrismaReproducibilityAdapter
} from '../infrastructure';

const clock = { now: () => new Date() };
const ids = { next: () => crypto.randomUUID() };

const contextRepository = new PrismaContextRepository();
const projectRepository = new PrismaProjectRepository();
const workflowAdapter = new LegacyWorkflowAdapter();
const audit = new PrismaAuditAdapter();

export const contexts = new ContextUseCases(contextRepository, clock, ids);
export const projects = new ProjectUseCases(projectRepository, contextRepository, clock, ids);
export const projectWorkflow = new ProjectWorkflowUseCases(workflowAdapter, audit);
export const production = new ProductionUseCases(
  projectRepository,
  new PrismaReproducibilityAdapter(),
  new PrismaJobRunRepository(),
  workflowAdapter,
  audit
);

export function actorOf(user: { id: string; role: string } | undefined): Actor {
  if (!user) {
    throw new Error('actor_required');
  }
  return {
    id: user.id,
    role: user.role === 'super_admin' ? 'super_admin' : 'user'
  };
}
