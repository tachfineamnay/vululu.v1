import type { Actor, ProjectBundleQueryPort, ProjectBundleRecord } from '../ports';

/** Use case de lecture du bundle projet (modele de lecture dedie). */
export class ProjectBundleUseCases {
  constructor(private readonly bundles: ProjectBundleQueryPort) {}

  get(actor: Actor, projectId: string): Promise<ProjectBundleRecord> {
    return this.bundles.getOwnedBundle(actor.id, projectId);
  }
}
