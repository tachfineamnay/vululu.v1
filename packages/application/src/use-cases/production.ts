import {
  approveExactVersion,
  assertQaStatus,
  assertTransferAllowed,
  type Approval as DomainApproval,
  type ApprovalState,
  type ArtifactVersion as DomainArtifactVersion,
  type QaReport
} from '@vululu/domain';
import { ApplicationError } from '../errors';
import type {
  Actor,
  ApprovalRecord,
  ArtifactVersionRecord,
  AuditPort,
  Clock,
  IdGenerator,
  PostizPort,
  ProductionExecutorPort,
  MasterRepository,
  ProductionRunRepository,
  ProjectRepository
} from '../ports';

function toDomainArtifact(record: ArtifactVersionRecord, createdAt: string): DomainArtifactVersion {
  const qaStatus = assertQaStatus(record.qaStatus ?? 'PENDING');
  return {
    id: record.id,
    artifactId: record.artifactId,
    version: record.version,
    storageKey: record.masterPath,
    checksum: record.checksum,
    qaStatus,
    qaReport: (record.qaReport as QaReport | null) ?? null,
    createdAt
  };
}

function toDomainApproval(record: ApprovalRecord, createdAt: string): DomainApproval {
  return {
    id: record.id,
    artifactVersionId: record.artifactVersionId,
    approvedBy: record.approvedBy,
    checksum: record.checksum,
    createdAt,
    invalidatedAt: record.invalidatedAt ? record.invalidatedAt.toISOString() : null,
    invalidatedByArtifactVersionId: null
  };
}

/**
 * Use cases de production.
 *
 * - start : le snapshot + JobRun + StepRun + ProductionJob sont crees par
 *   ProductionRunRepository dans une transaction verrouillant le projet ;
 *   l execution media est ensuite confiee a ProductionExecutorPort.
 * - approve/transfer : regles du Domain Core puis persistance par port.
 */
export class ProductionUseCases {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly runs: ProductionRunRepository,
    private readonly executor: ProductionExecutorPort,
    private readonly production: MasterRepository,
    private readonly postiz: PostizPort,
    private readonly audit: AuditPort,
    private readonly clock: Clock,
    private readonly ids: IdGenerator
  ) {}

  private async assertOwnedProject(actor: Actor, projectId: string) {
    const project = await this.projects.findOwned(projectId, actor.id);
    if (!project) {
      throw new ApplicationError('project_not_found', 'Projet introuvable.', 404);
    }
    return project;
  }

  async startProduction(actor: Actor, projectId: string) {
    await this.assertOwnedProject(actor, projectId);
    const { job, jobRun } = await this.runs.startRun({
      userId: actor.id,
      projectId,
      type: 'produce',
      targetSceneKey: null,
      instruction: null,
      steps: ['snapshot', 'render-scenes', 'assemble-master', 'qa']
    });
    try {
      await this.executor.start({
        projectId,
        jobId: job.id,
        jobRunId: jobRun.id,
        type: 'produce',
        targetSceneKey: null,
        instruction: null
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'production_failed';
      await this.runs.updateJob(job.id, { status: 'failed', error: message });
      throw error;
    }
    await this.audit.record({
      actorId: actor.id,
      action: 'production.started',
      targetType: 'project',
      targetId: projectId,
      metadata: { jobRunId: jobRun.id, type: 'produce' }
    });
    return { job, jobRun };
  }

  async startCorrection(actor: Actor, projectId: string, sceneKey: string, instruction: string) {
    await this.assertOwnedProject(actor, projectId);
    const { job, jobRun } = await this.runs.startRun({
      userId: actor.id,
      projectId,
      type: 'correction',
      targetSceneKey: sceneKey,
      instruction,
      steps: ['snapshot', 'correct-scene', 'assemble-master', 'qa']
    });
    try {
      await this.executor.start({
        projectId,
        jobId: job.id,
        jobRunId: jobRun.id,
        type: 'correction',
        targetSceneKey: sceneKey,
        instruction
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'correction_failed';
      await this.runs.updateJob(job.id, { status: 'failed', error: message });
      throw error;
    }
    await this.audit.record({
      actorId: actor.id,
      action: 'production.correction_started',
      targetType: 'project',
      targetId: projectId,
      metadata: { jobRunId: jobRun.id, sceneKey }
    });
    return { job, jobRun };
  }

  async approve(actor: Actor, projectId: string, artifactVersionId: string, checksum: string) {
    await this.assertOwnedProject(actor, projectId);
    const master = await this.production.latestMaster(projectId);
    if (!master) {
      throw new ApplicationError('master_required', 'Aucun master a approuver.', 400);
    }
    if (master.id !== artifactVersionId) {
      throw new ApplicationError('master_stale', 'Cette version n est plus le master courant.', 409);
    }
    if (master.checksum !== checksum) {
      throw new ApplicationError('checksum_mismatch', 'Le checksum ne correspond pas au master.', 400);
    }
    if (master.qaStatus !== 'PASS') {
      throw new ApplicationError('qa_required', 'Le master doit avoir un QA PASS avant approbation.', 409);
    }
    const createdAt = this.clock.now().toISOString();
    const existing = await this.production.findApproval(master.id);
    const domainArtifact = toDomainArtifact(master, createdAt);
    const state: ApprovalState = approveExactVersion({
      artifactVersion: domainArtifact,
      artifactVersionId,
      checksum,
      approvedBy: actor.id,
      existingApprovals: existing ? [toDomainApproval(existing, createdAt)] : [],
      id: this.ids.next(),
      createdAt
    });
    const approval = await this.production.createOrUpdateApproval({
      artifactVersionId: master.id,
      approvedBy: actor.id,
      checksum: state.approval.checksum
    });
    await this.projects.updateStatus(projectId, 'approved');
    await this.audit.record({
      actorId: actor.id,
      action: 'artifact.approved',
      targetType: 'artifact_version',
      targetId: artifactVersionId,
      metadata: { projectId, checksum }
    });
    return { approval };
  }

  async transfer(actor: Actor, projectId: string) {
    await this.assertOwnedProject(actor, projectId);
    const master = await this.production.latestMaster(projectId);
    if (!master) {
      throw new ApplicationError('master_required', 'Aucun master a transferer.', 400);
    }
    const approval = await this.production.findApproval(master.id);
    if (!approval) {
      throw new ApplicationError('approval_required', 'Le master doit etre approuve avant transfert.', 400);
    }
    if (approval.invalidatedAt !== null) {
      throw new ApplicationError('approval_invalidated', 'Cette approbation a ete invalidee par un nouveau master.', 409);
    }
    const existingTransfer = await this.production.findTransfer(approval.id);
    if (existingTransfer) {
      return { transfer: existingTransfer };
    }
    const createdAt = this.clock.now().toISOString();
    assertTransferAllowed({
      approval: toDomainApproval(approval, createdAt),
      artifactVersion: toDomainArtifact(master, createdAt),
      currentArtifactVersion: toDomainArtifact(master, createdAt)
    });
    const transfer = await this.postiz.transfer({
      approvalId: approval.id,
      checksum: approval.checksum,
      artifactVersionId: master.id
    });
    await this.projects.updateStatus(projectId, 'transferred');
    await this.audit.record({
      actorId: actor.id,
      action: 'postiz.transfer_requested',
      targetType: 'project',
      targetId: projectId,
      metadata: { mock: true, transferId: transfer.id }
    });
    return { transfer };
  }

  async getQa(actor: Actor, projectId: string) {
    await this.assertOwnedProject(actor, projectId);
    const master = await this.production.latestMaster(projectId);
    if (!master) {
      return { status: 'NOT_RUN', report: null, version: null };
    }
    return { status: master.qaStatus ?? 'NOT_RUN', report: master.qaReport, version: master.version };
  }
}