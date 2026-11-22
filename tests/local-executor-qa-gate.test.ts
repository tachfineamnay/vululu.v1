import { describe, expect, it } from 'vitest';
import { LocalProductionExecutor } from '../apps/api/src/infrastructure/production/localProductionExecutor';
import type {
  MediaRendererPort,
  ProductionExecutionStore,
  StoragePort,
  QaReport
} from '@vululu/application';

/**
 * FIX01 (executeur local) — le garde-fou QA ne doit pas dependre du pipeline
 * durable. L executeur local ecrivait auparavant une version d artefact et un
 * master approuvable meme quand `runQa` renvoyait FAIL.
 */
const failedQa: QaReport = {
  status: 'FAIL',
  checks: [
    { name: 'master dimensions', status: 'PASS', detail: '1080x1920' },
    { name: 'master duration', status: 'FAIL', detail: '4.500s / attendu 7.5s / ecart 3.000s' }
  ]
};
const passedQa: QaReport = {
  status: 'PASS',
  checks: [{ name: 'master duration', status: 'PASS', detail: '7.500s / attendu 7.5s' }]
};

const master = {
  relativePath: 'p-1/master/v1.mp4',
  absolutePath: '/tmp/p-1/master/v1.mp4',
  checksum: 'a'.repeat(64),
  duration: 7.5,
  expectedDurationSeconds: 7.5,
  videoCodec: 'h264',
  audioCodec: 'aac',
  width: 1080,
  height: 1920
};

const project = {
  id: 'p-1',
  status: 'producing',
  context: { name: 'Marque fictive', colorPrimary: '#2347BE', colorSecondary: '#111111' },
  brief: { objective: 'Fixture', audience: 'Audience', tone: 'Direct', cta: 'Voir' },
  render: { width: 1080, height: 1920, fps: 30 },
  scenes: [
    {
      id: 's-1',
      sceneKey: 'SCENE-001',
      position: 1,
      title: 'Scene',
      description: 'Description',
      durationSeconds: 7.5,
      latestVersion: null
    }
  ]
};

function harness(qa: QaReport) {
  const calls = {
    updateStep: [] as Array<[string, string, string, string | undefined]>,
    finalizeRun: [] as unknown[],
    failRun: [] as Array<{ error: string }>
  };
  const store = {
    markRunning: async () => undefined,
    updateJob: async () => undefined,
    updateStep: async (jobRunId: string, name: string, status: string, error?: string) => {
      calls.updateStep.push([jobRunId, name, status, error]);
    },
    loadExecutionProject: async () => project,
    nextMasterVersion: async () => 1,
    finalizeRun: async (input: unknown) => {
      calls.finalizeRun.push(input);
    },
    failRun: async (input: { error: string }) => {
      calls.failRun.push(input);
    }
  } as unknown as ProductionExecutionStore;
  const media = {
    renderScene: async () => ({
      relativePath: 'p-1/scenes/SCENE-001/v1.png',
      absolutePath: '/tmp/p-1/scenes/SCENE-001/v1.png',
      checksum: 'b'.repeat(64),
      width: 1080,
      height: 1920
    }),
    assembleMaster: async () => master,
    runQa: async () => qa
  } as unknown as MediaRendererPort;
  const storage = { putObject: async () => undefined } as unknown as StoragePort;
  const executor = new LocalProductionExecutor(store, media, storage, '/tmp/artifacts');
  return { executor, calls };
}

const input = {
  projectId: 'p-1',
  jobId: 'job-1',
  jobRunId: 'jr-1',
  type: 'produce' as const,
  targetSceneKey: null,
  instruction: null
};

describe('FIX01 — executeur local', () => {
  it('refuse de finaliser une production dont la QA est en echec', async () => {
    const { executor, calls } = harness(failedQa);
    await executor.start(input);
    // start() ne rejette pas : l echec est persiste par failRun.
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(calls.finalizeRun).toHaveLength(0);
    expect(calls.failRun).toHaveLength(1);
    expect(calls.failRun[0].error).toContain('qa_failed');
    expect(calls.failRun[0].error).toContain('master duration');
    const qaSteps = calls.updateStep.filter((entry) => entry[1] === 'qa');
    expect(qaSteps.some((entry) => entry[2] === 'failed')).toBe(true);
  });

  it('finalise quand la QA est PASS', async () => {
    const { executor, calls } = harness(passedQa);
    await executor.start(input);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(calls.finalizeRun).toHaveLength(1);
    expect(calls.failRun).toHaveLength(0);
  });
});
