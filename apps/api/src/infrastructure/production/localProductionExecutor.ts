import type {
  MediaRendererPort,
  ProductionExecutionStore,
  ProductionExecutorPort,
  SceneRenderResult,
  StoragePort
} from '@vululu/application';

/**
 * Executeur media local.
 *
 * Frontiere DB/fichiers :
 * - les PNG et le MP4 sont ecrits d abord par le MediaRendererPort ;
 * - puis une transaction unique persiste versions, master, QA, outputs et
 *   statuts. Un crash avant la transaction ne laisse aucune version DB mais
 *   peut laisser des fichiers orphelins, detectes par scripts/audit-artifacts.
 *
 * Aucun service legacy n est appele.
 */
export class LocalProductionExecutor implements ProductionExecutorPort {
  constructor(
    private readonly store: ProductionExecutionStore,
    private readonly media: MediaRendererPort,
    private readonly storage: StoragePort,
    private readonly artifactRoot: string
  ) {}

  async start(input: {
    projectId: string;
    jobId: string;
    jobRunId: string;
    type: 'produce' | 'correction';
    targetSceneKey: string | null;
    instruction: string | null;
  }): Promise<void> {
    void this.run(input).catch(async (error: unknown) => {
      const message = error instanceof Error ? error.message : 'production_failed';
      await this.store
        .failRun({
          jobRunId: input.jobRunId,
          jobId: input.jobId,
          projectId: input.projectId,
          error: message
        })
        .catch(() => undefined);
    });
  }

  private async run(input: {
    projectId: string;
    jobId: string;
    jobRunId: string;
    type: 'produce' | 'correction';
    targetSceneKey: string | null;
    instruction: string | null;
  }): Promise<void> {
    await this.store.markRunning(input.jobRunId);
    await this.store.updateStep(input.jobRunId, 'snapshot', 'succeeded');
    await this.store.updateJob(input.jobId, { status: 'running', step: 'preparation', progress: 5 });
    const project = await this.store.loadExecutionProject(input.projectId);
    if (input.type === 'produce') {
      await this.runProduction(input, project);
    } else {
      await this.runCorrection(input, project);
    }
  }

  private async runProduction(
    input: { projectId: string; jobId: string; jobRunId: string },
    project: Awaited<ReturnType<ProductionExecutionStore['loadExecutionProject']>>
  ): Promise<void> {
    await this.store.updateStep(input.jobRunId, 'render-scenes', 'running');
    const rendered: Array<{
      sceneId: string;
      sceneKey: string;
      position: number;
      version: number;
      imagePath: string;
      prompt: string;
      checksum: string;
      result: SceneRenderResult;
    }> = [];
    for (let index = 0; index < project.scenes.length; index += 1) {
      const scene = project.scenes[index];
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
        version
      });
      rendered.push({
        sceneId: scene.id,
        sceneKey: scene.sceneKey,
        position: scene.position,
        version,
        imagePath: result.relativePath,
        prompt: scene.sceneKey + ' - ' + scene.title,
        checksum: result.checksum,
        result
      });
      await this.store.updateJob(input.jobId, {
        step: 'scene:' + scene.sceneKey,
        progress: 10 + Math.round(((index + 1) / project.scenes.length) * 60)
      });
    }
    await this.store.updateStep(input.jobRunId, 'render-scenes', 'succeeded');
    await this.store.updateStep(input.jobRunId, 'assemble-master', 'running');
    const masterVersion = await this.store.nextMasterVersion(project.id);
    const master = await this.media.assembleMaster({
      projectId: project.id,
      artifactRoot: this.artifactRoot,
      version: masterVersion,
      scenePaths: rendered.map((item) => item.result.absolutePath),
      sceneDurationsSeconds: project.scenes.map((scene) => scene.durationSeconds)
    });
    await this.store.updateStep(input.jobRunId, 'assemble-master', 'succeeded');
    await this.store.updateStep(input.jobRunId, 'qa', 'running');
    await this.store.updateJob(input.jobId, { step: 'qa', progress: 85 });
    const qa = await this.media.runQa(rendered.map((item) => item.result), master);
    await this.store.finalizeRun({
      jobRunId: input.jobRunId,
      jobId: input.jobId,
      projectId: project.id,
      masterVersion,
      master,
      qa,
      scenes: rendered.map((item) => ({
        sceneId: item.sceneId,
        sceneKey: item.sceneKey,
        position: item.position,
        version: item.version,
        imagePath: item.imagePath,
        prompt: item.prompt,
        checksum: item.checksum
      })),
      outputs: {
        completedAt: new Date().toISOString(),
        scenes: rendered.map((item) => ({
          sceneKey: item.sceneKey,
          version: item.version,
          checksum: item.checksum,
          imagePath: item.imagePath
        })),
        master: {
          version: masterVersion,
          checksum: master.checksum,
          masterPath: master.relativePath,
          duration: master.duration,
          videoCodec: master.videoCodec,
          audioCodec: master.audioCodec
        },
        qa: { status: qa.status, checks: qa.checks }
      }
    });
  }

  private async runCorrection(
    input: { projectId: string; jobId: string; jobRunId: string; targetSceneKey: string | null; instruction: string | null },
    project: Awaited<ReturnType<ProductionExecutionStore['loadExecutionProject']>>
  ): Promise<void> {
    const target = project.scenes.find((scene) => scene.sceneKey === input.targetSceneKey);
    if (!target) {
      throw new Error('Scene cible absente.');
    }
    if (!target.latestVersion) {
      throw new Error('Aucune version existante pour la scene cible.');
    }
    await this.store.updateStep(input.jobRunId, 'correct-scene', 'running');
    const version = target.latestVersion.version + 1;
    const targetResult = await this.media.renderScene({
      projectId: project.id,
      artifactRoot: this.artifactRoot,
      sceneKey: target.sceneKey,
      position: target.position,
      title: target.title,
      description: target.description,
      brandName: project.context.name,
      colorPrimary: project.context.colorPrimary,
      colorSecondary: project.context.colorSecondary,
      version,
      instruction: input.instruction ?? undefined
    });
    const sceneResults: SceneRenderResult[] = project.scenes.map((scene) => {
      if (scene.id === target.id) {
        return targetResult;
      }
      if (!scene.latestVersion) {
        throw new Error('Une scene ne possede pas de version.');
      }
      return {
        relativePath: scene.latestVersion.imagePath,
        absolutePath: this.storage.resolve(scene.latestVersion.imagePath),
        checksum: scene.latestVersion.checksum,
        width: 0,
        height: 0
      };
    });
    await this.store.updateStep(input.jobRunId, 'correct-scene', 'succeeded');
    await this.store.updateStep(input.jobRunId, 'assemble-master', 'running');
    await this.store.updateJob(input.jobId, { step: 'master', progress: 60 });
    const masterVersion = await this.store.nextMasterVersion(project.id);
    const master = await this.media.assembleMaster({
      projectId: project.id,
      artifactRoot: this.artifactRoot,
      version: masterVersion,
      scenePaths: sceneResults.map((result) => result.absolutePath),
      sceneDurationsSeconds: project.scenes.map((scene) => scene.durationSeconds)
    });
    await this.store.updateStep(input.jobRunId, 'assemble-master', 'succeeded');
    await this.store.updateStep(input.jobRunId, 'qa', 'running');
    await this.store.updateJob(input.jobId, { step: 'qa', progress: 85 });
    const qa = await this.media.runQa(sceneResults, master);
    const outputs = project.scenes.map((scene) => {
      const isTarget = scene.id === target.id;
      return {
        sceneKey: scene.sceneKey,
        version: isTarget ? version : scene.latestVersion?.version ?? 0,
        checksum: isTarget ? targetResult.checksum : scene.latestVersion?.checksum ?? '',
        imagePath: isTarget ? targetResult.relativePath : scene.latestVersion?.imagePath ?? ''
      };
    });
    await this.store.finalizeRun({
      jobRunId: input.jobRunId,
      jobId: input.jobId,
      projectId: project.id,
      masterVersion,
      master,
      qa,
      scenes: [
        {
          sceneId: target.id,
          sceneKey: target.sceneKey,
          position: target.position,
          version,
          imagePath: targetResult.relativePath,
          prompt: 'Correction: ' + (input.instruction ?? ''),
          checksum: targetResult.checksum
        }
      ],
      outputs: {
        completedAt: new Date().toISOString(),
        scenes: outputs,
        master: {
          version: masterVersion,
          checksum: master.checksum,
          masterPath: master.relativePath,
          duration: master.duration,
          videoCodec: master.videoCodec,
          audioCodec: master.audioCodec
        },
        qa: { status: qa.status, checks: qa.checks }
      }
    });
  }
}
