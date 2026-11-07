import { assertOwned } from '../errors';
import type { Actor, ProductionPlanningPort, ProjectRepository } from '../ports';

export class ProductionPlanningUseCases {
  constructor(private readonly projects: ProjectRepository, private readonly planning: ProductionPlanningPort) {}
  async preview(actor: Actor, projectId: string) {
    assertOwned(await this.projects.findOwned(projectId, actor.id), 'project_not_found', 'Projet introuvable.');
    return this.planning.previewOwned(actor.id, projectId);
  }
}
