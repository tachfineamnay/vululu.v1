import {
  assertQaStatus,
  assertTransferAllowed,
  contentChecksum,
  type Approval as DomainApproval,
  type ArtifactVersion as DomainArtifactVersion,
  type QaReport as DomainQaReport
} from '@vululu/domain';
import { ApplicationError } from '../errors';
import type {
  AuditPort,
  Clock,
  DurableProductionStore,
  DurableRoutingPort,
  MasterRepository,
  MediaRendererPort,
  PostizPort,
  ProductionFinalization,
  QaReport,
  RenderedMaster,
  RenderedScene,
  StoragePort,
  DurableRunRoutingSnapshot
} from '../ports';

type StepSnapshot = { checksum: string };
type StepScenes = { scenes: RenderedScene[] };
type StepMaster = { master: RenderedMaster };
type StepQa = { qa: QaReport };
type StepFinalize = { artifactVersionId: string; masterVersion: number; checksum: string };
type StepApproval = { artifactVersionId: string; checksum: string; approvedBy: string };
type StepTransfer = { transferId: string; status: string };

function toDomainArtifact(record: {
  id: string;
  artifactId: string;
  version: number;
  masterPath: string;
  checksum: string;
  qaStatus: string | null;
  qaReport: unknown;
}, createdAt: string): DomainArtifactVersion {
  return {
    id: record.id,
    artifactId: record.artifactId,
    version: record.version,
    storageKey: record.masterPath,
    checksum: record.checksum,
    qaStatus: assertQaStatus(record.qaStatus ?? 'PENDING'),
    qaReport: (record.qaReport as DomainQaReport | null) ?? null,
    createdAt
  };
}

function toDomainApproval(record: {
  id: string;
  artifactVersionId: string;
  approvedBy: string;
  checksum: string;
  invalidatedAt: Date | null;
}, createdAt: string): DomainApproval {
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
 * Use case du pipeline media durable.
 *
 * Le worker Hatchet n orchestre que des appels a ces operations ; il ne
 * reimplemente ni les invariants de version, ni l approbation exacte.
 * Chaque etape est idempotente par cle persistante (StepRun.output et
 * RunArtifact), et les transitions passent par la machine a etats metier.
 */
export class DurableProductionUseCases {
  constructor(
    private readonly store: DurableProductionStore,
    private readonly media: MediaRendererPort,
    private readonly storage: StoragePort,
    private readonly routing: DurableRoutingPort,
    private readonly master: MasterRepository,
    private readonly postiz: PostizPort,
    private readonly audit: AuditPort,
    private readonly clock: Clock,
    private readonly artifactRoot: string,
    private readonly sceneDelayMs: number = 0,
    private readonly budgetCents: number = 100
  ) {}

  private async finishStep(
    jobRunId: string,
    name: string,
    output: Record<string, unknown>
  ): Promise<void> {
    await this.store.saveStepOutput(jobRunId, name, output);
    await this.store.transitionStep(jobRunId, name, 'succeeded', 'worker');
  }

  async validateSnapshot(jobRunId: string): Promise<StepSnapshot> {
    const run = await this.store.loadRun(jobRunId);
    if (!run.snapshot) {
      throw new ApplicationError('snapshot_missing', 'Snapshot de run absent.', 409);
    }
    if (contentChecksum(run.snapshot) !== run.snapshotChecksum) {
      throw new ApplicationError('snapshot_checksum_mismatch', 'Checksum de snapshot invalide.', 409);
    }
    if (run.status === 'queued' || run.status === 'recovery_pending') {
      await this.store.transitionJob(jobRunId, 'running', 'worker', { reason: 'pipeline_started' });
    }
    await this.store.transitionStep(jobRunId, 'validate-snapshot', 'running', 'worker');
    const output = { checksum: run.snapshotChecksum ?? '' };
    await this.store.saveStepOutput(jobRunId, 'validate-snapshot', output);
    await this.store.transitionStep(jobRunId, 'validate-snapshot', 'succeeded', 'worker');
    return output;
  }

  async resolveCapabilities(jobRunId: string): Promise<DurableRunRoutingSnapshot> {
    const existing = await this.store.getStepOutput<{ routing: DurableRunRoutingSnapshot }>(
      jobRunId,
      'resolve-capabilities'
    );
    if (existing?.routing) {
      return existing.routing;
    }
    const run = await this.store.loadRun(jobRunId);
    await this.store.transitionStep(jobRunId, 'resolve-capabilities', 'running', 'worker');
    const routing = await this.routing.resolve({
      jobRunId,
      projectId: run.projectId,
      capabilityKey: 'scene.generate',
      budgetCents: this.budgetCents,
      input: { projectId: run.projectId, jobRunId },
      idempotencyKey: 'route:' + jobRunId
    });
    await this.store.recordRoutingSnapshot(jobRunId, routing);
    await this.store.recordCost({
      idempotencyKey: 'cost:routing:' + jobRunId,
      jobRunId,
      projectId: run.projectId,
      provider: routing.providerKey,
      model: routing.modelKey,
      units: 1,
      amountCents: routing.actualCents
    });
    const output = { routing };
    await this.finishStep(jobRunId, 'resolve-capabilities', output);
    await this.audit.record({
      actorId: null,
      action: 'orchestration.capability_routed',
      targetType: 'job_run',
      targetId: jobRunId,
      metadata: {
        providerKey: routing.providerKey,
        modelKey: routing.modelKey,
        usedFallback: routing.usedFallback,
        actualCents: routing.actualCents
      }
    });
    return routing;
  }

  async renderScenes(jobRunId: string): Promise<StepScenes> {
    const existing = await this.store.getStepOutput<StepScenes>(jobRunId, 'render-scenes');
    const run = await this.store.loadRun(jobRunId);
    const project = await this.store.loadExecutionProject(run.projectId);
    const target =
      run.type === 'correction' && run.snapshot?.correction
        ? run.snapshot.correction.targetSceneKey
        : null;
    const completed = new Map<string, RenderedScene>(
      (existing?.scenes ?? []).map((scene) => [scene.sceneKey, scene])
    );
    await this.store.transitionStep(jobRunId, 'render-scenes', 'running', 'worker');
    const scenes: RenderedScene[] = [];
    for (let index = 0; index < project.scenes.length; index += 1) {
      const scene = project.scenes[index];
      const already = completed.get(scene.sceneKey);
      if (already) {
        scenes.push(already);
        continue;
      }
      if (target && scene.sceneKey !== target) {
        if (!scene.latestVersion) {
          throw new ApplicationError('scene_version_required', 'Une scene source est sans version.', 409);
        }
        const reused: RenderedScene = {
          sceneId: scene.id,
          sceneKey: scene.sceneKey,
          position: scene.position,
          version: scene.latestVersion.version,
          imagePath: scene.latestVersion.imagePath,
          absolutePath: this.storage.resolve(scene.latestVersion.imagePath),
          prompt: scene.latestVersion.prompt,
          checksum: scene.latestVersion.checksum,
          width: 0,
          height: 0
        };
        completed.set(scene.sceneKey, reused);
        scenes.push(reused);
        continue;
      }
      const version = (scene.latestVersion?.version ?? 0) + 1;
      const result = await this.media.renderScene({
        projectId: project.id,
        artifactRoot: this.artifactRoot,
        sceneKey: scene.sceneKey,
        position: scene.position,
        title: scene.title,
        description: scene.description,
        brandName: project.context.name,
        colorPrimary: project.context.colorPrimary,
        colorSecondary: project.context.colorSecondary,
        version,
        ...(target && target === scene.sceneKey && run.snapshot?.correction
          ? { instruction: run.snapshot.correction.instruction }
          : {})
      });
      const rendered: RenderedScene = {
        sceneId: scene.id,
        sceneKey: scene.sceneKey,
        position: scene.position,
        version,
        imagePath: result.relativePath,
        absolutePath: result.absolutePath,
        prompt: target && target === scene.sceneKey
          ? 'Correction: ' + (run.snapshot?.correction?.instruction ?? '')
          : scene.sceneKey + ' - ' + scene.title,
        checksum: result.checksum,
        width: result.width,
        height: result.height
      };
      completed.set(scene.sceneKey, rendered);
      scenes.push(rendered);
      await this.store.saveStepOutput(jobRunId, 'render-scenes', { scenes });
      await this.store.updateJob(run.jobId ?? '', {
        step: 'scene:' + scene.sceneKey,
        progress: 10 + Math.round(((index + 1) / project.scenes.length) * 50)
      }).catch(() => undefined);
      if (this.sceneDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.sceneDelayMs));
      }
    }
    await this.finishStep(jobRunId, 'render-scenes', { scenes });
    return { scenes };
  }

  async assembleMaster(jobRunId: string): Promise<StepMaster> {
    const existing = await this.store.getStepOutput<StepMaster>(jobRunId, 'assemble-master');
    if (existing?.master) {
      return existing;
    }
    const rendered = await this.store.getStepOutput<StepScenes>(jobRunId, 'render-scenes');
    if (!rendered?.scenes?.length) {
      throw new ApplicationError('scenes_missing', 'Scenes non rendues.', 409);
    }
    const run = await this.store.loadRun(jobRunId);
    await this.store.transitionStep(jobRunId, 'assemble-master', 'running', 'worker');
    const version = await this.store.nextMasterVersion(run.projectId);
    const project = await this.store.loadExecutionProject(run.projectId);
    const master = await this.media.assembleMaster({
      projectId: run.projectId,
      artifactRoot: this.artifactRoot,
      version,
      scenePaths: rendered.scenes.map((scene) => scene.absolutePath),
      sceneDurationsSeconds: project.scenes.map((scene) => scene.durationSeconds)
    });
    const output = {
      master: {
        version,
        relativePath: master.relativePath,
        absolutePath: master.absolutePath,
        checksum: master.checksum,
        duration: master.duration,
        expectedDurationSeconds: master.expectedDurationSeconds,
        videoCodec: master.videoCodec,
        audioCodec: master.audioCodec,
        width: master.width,
        height: master.height
      }
    };
    await this.finishStep(jobRunId, 'assemble-master', output);
    return output;
  }

  async runQa(jobRunId: string): Promise<StepQa> {
    const existing = await this.store.getStepOutput<StepQa>(jobRunId, 'qa');
    if (existing?.qa) {
      return existing;
    }
    const rendered = await this.store.getStepOutput<StepScenes>(jobRunId, 'render-scenes');
    const master = await this.store.getStepOutput<StepMaster>(jobRunId, 'assemble-master');
    if (!rendered?.scenes?.length || !master?.master) {
      throw new ApplicationError('media_incomplete', 'Media incomplet pour QA.', 409);
    }
    await this.store.transitionStep(jobRunId, 'qa', 'running', 'worker');
    const qa = await this.media.runQa(
      rendered.scenes.map((scene) => ({
        relativePath: scene.imagePath,
        absolutePath: scene.absolutePath,
        checksum: scene.checksum,
        width: scene.width,
        height: scene.height
      })),
      master.master
    );
    const output = { qa };
    await this.finishStep(jobRunId, 'qa', output);
    return output;
  }

  async finalize(jobRunId: string): Promise<StepFinalize> {
    const existing = await this.store.getStepOutput<StepFinalize>(jobRunId, 'finalize');
    if (existing) {
      return existing;
    }
    const run = await this.store.loadRun(jobRunId);
    const rendered = await this.store.getStepOutput<StepScenes>(jobRunId, 'render-scenes');
    const master = await this.store.getStepOutput<StepMaster>(jobRunId, 'assemble-master');
    const qa = await this.store.getStepOutput<StepQa>(jobRunId, 'qa');
    if (!rendered || !master || !qa) {
      throw new ApplicationError('media_incomplete', 'Media incomplet pour finalisation.', 409);
    }
    await this.store.transitionStep(jobRunId, 'finalize', 'running', 'worker');
    const scenes = rendered.scenes.map((scene) => ({
      sceneId: scene.sceneId,
      sceneKey: scene.sceneKey,
      position: scene.position,
      version: scene.version,
      imagePath: scene.imagePath,
      prompt: scene.prompt,
      checksum: scene.checksum
    }));
    const outputs = {
      completedAt: this.clock.now().toISOString(),
      scenes: rendered.scenes.map((scene) => ({
        sceneKey: scene.sceneKey,
        version: scene.version,
        checksum: scene.checksum,
        imagePath: scene.imagePath
      })),
      master: {
        version: master.master.version,
        checksum: master.master.checksum,
        masterPath: master.master.relativePath,
        duration: master.master.duration,
        videoCodec: master.master.videoCodec,
        audioCodec: master.master.audioCodec
      },
      qa: { status: qa.qa.status, checks: qa.qa.checks }
    };
    if (run.jobId) {
      await this.store.updateJob(run.jobId, { step: 'approval', progress: 90 });
    }
    const finalization: ProductionFinalization = {
      jobRunId,
      jobId: run.jobId ?? '',
      projectId: run.projectId,
      masterVersion: master.master.version,
      master: master.master,
      qa: qa.qa,
      scenes,
      outputs
    };
    const finalized = await this.store.finalizeArtifacts(finalization);
    const output = {
      artifactVersionId: finalized.artifactVersionId,
      masterVersion: finalized.masterVersion,
      checksum: finalized.checksum
    };
    await this.finishStep(jobRunId, 'finalize', output);
    await this.store.transitionJob(jobRunId, 'waiting_approval', 'worker', {
      artifactVersionId: finalized.artifactVersionId,
      checksum: finalized.checksum
    });
    await this.audit.record({
      actorId: null,
      action: 'orchestration.awaiting_approval',
      targetType: 'artifact_version',
      targetId: finalized.artifactVersionId,
      metadata: { jobRunId, checksum: finalized.checksum }
    });
    return output;
  }

  async confirmApproval(input: {
    jobRunId: string;
    artifactVersionId: string;
    checksum: string;
    approvedBy: string;
  }): Promise<StepApproval> {
    const run = await this.store.loadRun(input.jobRunId);
    const master = await this.master.latestMaster(run.projectId);
    if (!master || master.id !== input.artifactVersionId || master.checksum !== input.checksum) {
      throw new ApplicationError('approval_stale', 'Approbation perimee ou version inexacte.', 409);
    }
    if (master.qaStatus !== 'PASS') {
      throw new ApplicationError('qa_required', 'QA PASS requis avant approbation.', 409);
    }
    const approval = await this.master.findApproval(master.id);
    if (!approval || approval.checksum !== input.checksum || approval.invalidatedAt !== null) {
      throw new ApplicationError('approval_required', 'Approbation exacte absente.', 409);
    }
    const createdAt = this.clock.now().toISOString();
    assertTransferAllowed({
      approval: toDomainApproval(approval, createdAt),
      artifactVersion: toDomainArtifact(master, createdAt),
      currentArtifactVersion: toDomainArtifact(master, createdAt)
    });
    await this.store.transitionStep(input.jobRunId, 'approval', 'running', 'worker');
    await this.store.saveStepOutput(input.jobRunId, 'approval', {
      artifactVersionId: master.id,
      checksum: master.checksum,
      approvedBy: input.approvedBy
    });
    await this.store.transitionStep(input.jobRunId, 'approval', 'succeeded', 'worker');
    return {
      artifactVersionId: master.id,
      checksum: master.checksum,
      approvedBy: input.approvedBy
    };
  }

  async transfer(jobRunId: string): Promise<StepTransfer> {
    const existing = await this.store.getStepOutput<StepTransfer>(jobRunId, 'transfer');
    if (existing) {
      return existing;
    }
    const run = await this.store.loadRun(jobRunId);
    const master = await this.master.latestMaster(run.projectId);
    if (!master) {
      throw new ApplicationError('master_required', 'Master absent.', 409);
    }
    const approval = await this.master.findApproval(master.id);
    if (!approval || approval.invalidatedAt !== null) {
      throw new ApplicationError('approval_required', 'Approbation active absente.', 409);
    }
    await this.store.transitionStep(jobRunId, 'transfer', 'running', 'worker');
    const transfer = await this.postiz.transfer({
      approvalId: approval.id,
      checksum: approval.checksum,
      artifactVersionId: master.id
    });
    await this.store.completeRun({
      jobRunId,
      projectId: run.projectId,
      outputs: {
        transferId: transfer.id,
        transferStatus: transfer.status,
        artifactVersionId: master.id,
        checksum: master.checksum,
        completedAt: this.clock.now().toISOString()
      }
    });
    await this.store.transitionStep(jobRunId, 'transfer', 'succeeded', 'worker');
    const output = { transferId: transfer.id, status: transfer.status };
    await this.store.saveStepOutput(jobRunId, 'transfer', output);
    await this.audit.record({
      actorId: null,
      action: 'orchestration.transfer_completed',
      targetType: 'artifact_version',
      targetId: master.id,
      metadata: { jobRunId, transferId: transfer.id, mock: true }
    });
    return output;
  }

  async fail(jobRunId: string, error: string, state: 'failed' | 'timed_out' | 'cancelled' = 'failed'): Promise<void> {
    const run = await this.store.loadRun(jobRunId).catch(() => null);
    if (!run) return;
    if (run.status === 'succeeded' || run.status === 'failed' || run.status === 'cancelled' || run.status === 'timed_out') {
      return;
    }
    await this.store.failRun({
      jobRunId,
      jobId: run.jobId ?? '',
      projectId: run.projectId,
      error,
      state
    });
  }
}