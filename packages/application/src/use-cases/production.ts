import { ApplicationError, assertOwned } from '../errors';
import type {
  Actor,
  AuditPort,
  JobRunRecord,
  JobRunRepository,
  ProductionWorkflowPort,
  ProjectRepository,
  ReproducibilityPort,
  ReproducibilitySnapshot
} from '../ports';

export type ProductionStartResult = {
  job: unknown;
  jobRun: JobRunRecord;
};

function normalizeJob(value: unknown): unknown {
  if (value && typeof value === 'object' && 'job' in value) {
    return (value as { job: unknown }).job;
  }
  return value;
}

/**
 * Use cases de production : snapshot reproductible, run, correction, approbation
 * et transfert. L'execution media longue est derriere ProductionWorkflowPort.
 */
export class ProductionUseCases {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly reproducibility: ReproducibilityPort,
    private readonly jobs: JobRunRepository,
    private readonly workflow: ProductionWorkflowPort,
    private readonly audit: AuditPort
  ) {}

  private async assertOwnedProject(actor: Actor, projectId: string) {
    const project = await this.projects.findOwned(projectId, actor.id);
    if (!project) {
      throw new ApplicationError('project_not_found', 'Projet introuvable.', 404);
    }
    return project;
  }

  private async beginRun(
    actor: Actor,
    projectId: string,
    type: 'produce' | 'correction',
    steps: string[]
  ): Promise<{ snapshot: ReproducibilitySnapshot; jobRun: JobRunRecord }> {
    const running = await this.jobs.findRunning(projectId);
    if (running) {
      throw new ApplicationError('job_running', 'Une production est deja en cours.', 409);
    }
    const snapshot = await this.reproducibility.capture(projectId, actor.id);
    const jobRun = await this.jobs.createWithSteps({ projectId, type, snapshot, steps });
    return { snapshot, jobRun };
  }

  async startProduction(actor: Actor, projectId: string): Promise<ProductionStartResult> {
    await this.assertOwnedProject(actor, projectId);
    const { jobRun } = await this.beginRun(actor, projectId, 'produce', [
      'snapshot',
      'render-scenes',
      'assemble-master',
      'qa'
    ]);
    try {
      const execution = await this.workflow.startProduction(actor, projectId, jobRun.id);
      await this.audit.record({
        actorId: actor.id,
        action: 'production.started',
        targetType: 'project',
        targetId: projectId,
        metadata: { jobRunId: jobRun.id, type: 'produce' }
      });
      return { job: normalizeJob(execution), jobRun };
    } catch (error) {
      await this.jobs.markStatus(jobRun.id, 'failed', error instanceof Error ? error.message : 'production_failed');
      throw error;
    }
  }

  async startCorrection(
    actor: Actor,
    projectId: string,
    sceneKey: string,
    instruction: string
  ): Promise<ProductionStartResult> {
    await this.assertOwnedProject(actor, projectId);
    const { jobRun } = await this.beginRun(actor, projectId, 'correction', [
      'snapshot',
      'correct-scene',
      'assemble-master',
      'qa'
    ]);
    try {
      const execution = await this.workflow.startCorrection(actor, projectId, sceneKey, instruction, jobRun.id);
      await this.audit.record({
        actorId: actor.id,
        action: 'production.correction_started',
        targetType: 'project',
        targetId: projectId,
        metadata: { jobRunId: jobRun.id, sceneKey }
      });
      return { job: normalizeJob(execution), jobRun };
    } catch (error) {
      await this.jobs.markStatus(jobRun.id, 'failed', error instanceof Error ? error.message : 'correction_failed');
      throw error;
    }
  }

  async approve(actor: Actor, projectId: string, artifactVersionId: string, checksum: string) {
    await this.assertOwnedProject(actor, projectId);
    const result = await this.workflow.approve(actor, projectId, artifactVersionId, checksum);
    await this.audit.record({
      actorId: actor.id,
      action: 'artifact.approved',
      targetType: 'artifact_version',
      targetId: artifactVersionId,
      metadata: { projectId, checksum }
    });
    return result;
  }

  async transfer(actor: Actor, projectId: string) {
    await this.assertOwnedProject(actor, projectId);
    const result = await this.workflow.transfer(actor, projectId);
    await this.audit.record({
      actorId: actor.id,
      action: 'postiz.transfer_requested',
      targetType: 'project',
      targetId: projectId,
      metadata: { mock: true }
    });
    return result;
  }

  async getQa(actor: Actor, projectId: string) {
    await this.assertOwnedProject(actor, projectId);
    return this.workflow.getQa(actor, projectId);
  }
}
