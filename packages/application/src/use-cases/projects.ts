import { createProject as createDomainProject } from '@vululu/domain';
import type {
  Actor,
  Clock,
  ContextRepository,
  IdGenerator,
  ProjectRecord,
  ProjectRepository
} from '../ports';
import { ApplicationError } from '../errors';
import type { PublicContext } from './contexts';

export type PublicProject = {
  id: string;
  title: string;
  status: string;
  platform: string;
  format: string;
  objective: string;
  sceneDurationSeconds: number;
  contextId: string;
  createdAt?: Date;
  updatedAt?: Date;
  context?: PublicContext | null;
};

export type ProjectInput = {
  contextId: string;
  title: string;
  platform: 'TikTok' | 'Instagram' | 'LinkedIn';
  format: 'Affiche' | 'Carrousel' | 'Video' | 'Reel' | 'Motion';
  objective: string;
  sceneDurationSeconds?: number;
};

function toPublicProject(project: ProjectRecord): PublicProject {
  return {
    id: project.id,
    title: project.title,
    status: project.status,
    platform: project.platform,
    format: project.format,
    objective: project.objective,
    sceneDurationSeconds: project.sceneDurationSeconds,
    contextId: project.contextId,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt
  };
}

/**
 * Use cases de projet. La propriete du contexte est verifiee ici, avant toute
 * ecriture ; les adaptateurs Prisma appliquent aussi le filtre proprietaire.
 */
export class ProjectUseCases {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly contexts: ContextRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator
  ) {}

  async list(actor: Actor): Promise<PublicProject[]> {
    const rows = await this.projects.listOwned(actor.id);
    const result: PublicProject[] = [];
    for (const row of rows) {
      const context = await this.contexts.findOwned(row.contextId, actor.id);
      result.push({
        ...toPublicProject(row),
        context: context
          ? {
              id: context.id,
              name: context.name,
              website: context.website,
              description: context.description,
              audience: context.audience,
              tone: context.tone,
              colorPrimary: context.colorPrimary,
              colorSecondary: context.colorSecondary,
              createdAt: context.createdAt,
              updatedAt: context.updatedAt
            }
          : null
      });
    }
    return result;
  }

  async create(actor: Actor, input: ProjectInput): Promise<PublicProject> {
    const context = await this.contexts.findOwned(input.contextId, actor.id);
    if (!context) {
      throw new ApplicationError('context_not_found', 'Contexte introuvable.', 404);
    }
    const duration = input.sceneDurationSeconds ?? 2;
    // Domain validation: platform, format, duration, title, objective.
    createDomainProject({
      id: this.ids.next(),
      userId: actor.id,
      contextId: context.id,
      title: input.title,
      platform: input.platform,
      format: input.format,
      objective: input.objective,
      sceneDurationSeconds: duration,
      createdAt: this.clock.now().toISOString()
    });
    const row = await this.projects.create({
      userId: actor.id,
      contextId: context.id,
      title: input.title,
      platform: input.platform,
      format: input.format,
      objective: input.objective,
      sceneDurationSeconds: duration,
      status: 'draft'
    });
    return toPublicProject(row);
  }
}