import { describe, expect, it } from 'vitest';
import { DurableProductionUseCases, ProductionUseCases, type DurableProductionStore, type QaReport } from '@vululu/application';

/**
 * FIX01 — le QA obligatoire ne peut pas etre contourne.
 *
 * Ces tests exercent les use cases avec des ports en memoire : ils verifient la
 * decision (echec persiste, pas de finalisation, pas d approbation), tandis que
 * les durees reelles sont prouvees par tests/media-duration-integrity.test.ts
 * avec FFmpeg/ffprobe.
 */
const failedQa: QaReport = {
  status: 'FAIL',
  checks: [
    { name: 'png SCENE-001', status: 'PASS', detail: '1080x1920 / checksum OK' },
    { name: 'master dimensions', status: 'PASS', detail: '1080x1920' },
    { name: 'master duration', status: 'FAIL', detail: '4.500s / attendu 7.5s / ecart 3.000s' },
    { name: 'master video codec', status: 'PASS', detail: 'h264' }
  ]
};

const passedQa: QaReport = {
  status: 'PASS',
  checks: [
    { name: 'master dimensions', status: 'PASS', detail: '1080x1920' },
    { name: 'master duration', status: 'PASS', detail: '7.500s / attendu 7.5s / ecart 0.000s' }
  ]
};

const run = {
  id: 'jr-1',
  projectId: 'p-1',
  type: 'produce',
  status: 'running',
  snapshot: null,
  snapshotChecksum: null,
  outputs: null,
  workflowRunId: 'wf-1',
  jobId: 'job-1'
};

type StepOutputs = Record<string, unknown>;

function durableStore(outputs: StepOutputs) {
  const calls = {
    transitionStep: [] as unknown[][],
    transitionJob: [] as unknown[][],
    saveStepOutput: [] as { name: string; output: Record<string, unknown> }[],
    finalizeArtifacts: [] as unknown[],
    failRun: [] as { jobRunId: string; error: string; state?: string }[],
    updateJob: [] as unknown[][]
  };
  const store = {
    loadRun: async () => run,
    updateJob: async (...args: unknown[]) => {
      calls.updateJob.push(args);
    },
    getStepOutput: async <T,>(_jobRunId: string, name: string) => ((outputs[name] as T) ?? null),
    transitionStep: async (...args: unknown[]) => {
      calls.transitionStep.push(args);
    },
    transitionJob: async (...args: unknown[]) => {
      calls.transitionJob.push(args);
    },
    saveStepOutput: async (_jobRunId: string, name: string, output: Record<string, unknown>) => {
      outputs[name] = output;
      calls.saveStepOutput.push({ name, output });
    },
    finalizeArtifacts: async (input: unknown) => {
      calls.finalizeArtifacts.push(input);
      return { artifactVersionId: 'av-1', masterVersion: 1, checksum: 'abc' };
    },
    failRun: async (input: { jobRunId: string; error: string; state?: string }) => {
      calls.failRun.push(input);
    }
  };
  return { store: store as unknown as DurableProductionStore, calls };
}

const master = {
  version: 1,
  relativePath: 'p-1/master/v1.mp4',
  absolutePath: '/tmp/p-1/master/v1.mp4',
  checksum: 'a'.repeat(64),
  duration: 4.5,
  expectedDurationSeconds: 7.5,
  videoCodec: 'h264',
  audioCodec: 'aac',
  width: 1080,
  height: 1920
};

const renderedScenes = [
  {
    sceneId: 's-1',
    sceneKey: 'SCENE-001',
    position: 1,
    version: 1,
    imagePath: 'p-1/scenes/SCENE-001/v1.png',
    absolutePath: '/tmp/p-1/scenes/SCENE-001/v1.png',
    prompt: 'scene',
    checksum: 'b'.repeat(64),
    width: 1080,
    height: 1920
  }
];

function useCases(store: DurableProductionStore, qa: QaReport = failedQa) {
  const media = {
    renderScene: async () => {
      throw new Error('non utilise');
    },
    assembleMaster: async () => {
      throw new Error('non utilise');
    },
    runQa: async () => qa
  };
  return new DurableProductionUseCases(
    store,
    media as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { record: async () => undefined } as never,
    { now: () => new Date('2026-01-01T00:00:00.000Z') },
    '/tmp/artifacts'
  );
}

describe('FIX01 — QA obligatoire', () => {
  it('marque l etape QA en echec, persiste le rapport et refuse la suite', async () => {
    const { store, calls } = durableStore({
      'render-scenes': { scenes: renderedScenes },
      'assemble-master': { master }
    });

    await expect(useCases(store).runQa('jr-1')).rejects.toMatchObject({ code: 'qa_failed' });

    // Le rapport defaillant reste consultable en base.
    const saved = calls.saveStepOutput.find((entry) => entry.name === 'qa');
    expect(saved).toBeTruthy();
    expect((saved?.output.qa as QaReport).status).toBe('FAIL');

    // L etape est explicitement en echec (pas "succeeded" avec un rapport FAIL).
    const qaTransitions = calls.transitionStep.filter((args) => args[1] === 'qa');
    expect(qaTransitions.some((args) => args[2] === 'failed')).toBe(true);
    const failure = qaTransitions.find((args) => args[2] === 'failed');
    expect(failure?.[4]).toMatchObject({ reason: 'qa_failed' });
  });

  it('refuse la finalisation d un master dont le QA est en echec et persiste la cause', async () => {
    const { store, calls } = durableStore({
      'render-scenes': { scenes: renderedScenes },
      'assemble-master': { master },
      qa: { qa: failedQa }
    });

    await expect(useCases(store).finalize('jr-1')).rejects.toMatchObject({ code: 'qa_failed' });

    // Aucune version d artefact creee, aucun passage en attente d approbation.
    expect(calls.finalizeArtifacts).toHaveLength(0);
    expect(calls.transitionJob).toHaveLength(0);
    expect(calls.saveStepOutput).toHaveLength(0);

    // Etat d echec explicite + raison diagnosticable.
    expect(calls.failRun).toHaveLength(1);
    expect(calls.failRun[0].state).toBe('failed');
    expect(calls.failRun[0].error).toContain('qa_failed');
    expect(calls.failRun[0].error).toContain('master duration');
    expect(calls.failRun[0].error).toContain('4.500s / attendu 7.5s');
  });

  it('refuse la finalisation quand le rapport QA est absent du stockage', async () => {
    const { store, calls } = durableStore({
      'render-scenes': { scenes: renderedScenes },
      'assemble-master': { master }
    });

    await expect(useCases(store).finalize('jr-1')).rejects.toMatchObject({ code: 'media_incomplete' });
    expect(calls.finalizeArtifacts).toHaveLength(0);
    expect(calls.failRun).toHaveLength(0);
  });

  it('bloque l approbation d un master dont le QA n est pas PASS', async () => {
    const approvals: unknown[] = [];
    const production = {
      latestMaster: async () => ({
        id: 'av-1',
        checksum: 'a'.repeat(64),
        qaStatus: 'FAIL',
        qaReport: failedQa
      }),
      findApproval: async () => null,
      createOrUpdateApproval: async (input: unknown) => {
        approvals.push(input);
        return input;
      }
    };
    const projects = { findOwned: async () => ({ id: 'p-1' }) };
    const audit = { record: async () => undefined };
    const useCase = new ProductionUseCases(
      projects as never,
      {} as never,
      {} as never,
      production as never,
      {} as never,
      audit as never,
      { now: () => new Date('2026-01-01T00:00:00.000Z') },
      { next: () => 'id-1' }
    );

    await expect(
      useCase.approve({ id: 'u-1' } as never, 'p-1', 'av-1', 'a'.repeat(64))
    ).rejects.toMatchObject({ code: 'qa_required' });
    expect(approvals).toHaveLength(0);
  });

  it('laisse la finalisation se poursuivre quand le QA est PASS (non-regression)', async () => {
    const { store, calls } = durableStore({
      'render-scenes': { scenes: renderedScenes },
      'assemble-master': { master },
      qa: { qa: passedQa }
    });

    const result = await useCases(store, passedQa).finalize('jr-1');
    expect(result.artifactVersionId).toBe('av-1');
    expect(calls.failRun).toHaveLength(0);
    expect(calls.finalizeArtifacts).toHaveLength(1);
    expect(calls.transitionJob).toHaveLength(1);
    expect(calls.transitionJob[0][1]).toBe('waiting_approval');
  });
});
