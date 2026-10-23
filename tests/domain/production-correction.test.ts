import { describe, expect, it } from 'vitest';
import {
  applyTargetedCorrection,
  buildProductionSnapshot,
  createBrandContext,
  createBrief,
  createContextRevision,
  createProductionJob,
  createStoryboard,
  latestSceneVersion,
  sceneVersionSet,
  transitionProductionJob
} from '../../packages/domain/src/index';
import {
  captureDomainError,
  checksum,
  makeVersionedSceneSets,
  sequenceIds,
  T0,
  T1,
  T2
} from './fixtures';

const briefContent = {
  objective: 'Objectif de production',
  audience: 'Createurs',
  tone: 'Direct',
  cta: 'Decouvrir',
  platform: 'Instagram' as const,
  format: 'Video' as const
};

function revisions() {
  const context = createBrandContext({
    id: 'context-1',
    userId: 'user-1',
    name: 'Vululu Test',
    description: 'Contexte de production'
  });
  const contextRevision = createContextRevision({
    id: 'context-revision-1',
    context,
    revisions: [],
    createdAt: T0
  }).version;
  const brief = createBrief({
    id: 'brief-1',
    projectId: 'project-1',
    revisionId: 'brief-revision-1',
    content: briefContent,
    createdAt: T0
  }).revision;
  return { contextRevision, brief };
}

describe('Production : correction ciblée qui préserve les autres scènes', () => {
  it('adds a version only to the target scene and keeps the others byte-identical', () => {
    const before = makeVersionedSceneSets();
    const targetBefore = before[2];
    expect(targetBefore.scene.sceneKey).toBe('SCENE-003');

    const result = applyTargetedCorrection({
      sceneSets: before,
      sceneKey: 'SCENE-003',
      instruction: 'Remplacer le produit par la version rouge',
      render: {
        imagePath: 'artifacts/SCENE-003/v2.png',
        prompt: 'Correction ciblee',
        checksum: checksum('scene:SCENE-003:v2')
      },
      versionId: 'sv-SCENE-003-2',
      createdAt: T1
    });

    expect(result.correctedVersion.version).toBe(2);
    expect(result.correctedVersion.sceneId).toBe(targetBefore.scene.id);
    expect(result.correctedVersion.instruction).toBe(
      'Remplacer le produit par la version rouge'
    );
    expect(result.correctedVersion.checksum).toBe(checksum('scene:SCENE-003:v2'));

    const targetAfter = result.sceneSets[2];
    expect(targetAfter.scene).toBe(targetBefore.scene);
    expect(targetAfter.versions).toHaveLength(2);
    expect(targetAfter.versions[0]).toBe(targetBefore.versions[0]);

    const untouchedIndexes = [0, 1, 3, 4];
    for (const index of untouchedIndexes) {
      expect(result.sceneSets[index]).toBe(before[index]);
      expect(result.sceneSets[index].versions).toHaveLength(1);
      expect(result.sceneSets[index].versions[0]).toBe(before[index].versions[0]);
    }

    expect(before[2].versions).toHaveLength(1);
    expect(latestSceneVersion(before[2].versions)?.version).toBe(1);
  });

  it('keeps scene identity and position when correcting a scene', () => {
    const before = makeVersionedSceneSets();
    const target = before[3].scene;
    const result = applyTargetedCorrection({
      sceneSets: before,
      sceneKey: 'SCENE-004',
      instruction: 'Changer la preuve',
      render: {
        imagePath: 'artifacts/SCENE-004/v2.png',
        prompt: 'Correction de la preuve',
        checksum: checksum('scene:SCENE-004:v2')
      },
      versionId: 'sv-SCENE-004-2',
      createdAt: T2
    });
    const after = result.sceneSets[3].scene;
    expect(after.id).toBe(target.id);
    expect(after.sceneKey).toBe('SCENE-004');
    expect(after.position).toBe(4);
    expect(result.sceneSets.map((set) => set.scene.position)).toEqual([1, 2, 3, 4, 5]);
  });

  it('rejects a correction whose target does not exist or has no version', () => {
    const before = makeVersionedSceneSets();
    expect(
      captureDomainError(() =>
        applyTargetedCorrection({
          sceneSets: before,
          sceneKey: 'SCENE-009',
          instruction: 'Invalide',
          render: {
            imagePath: 'artifacts/SCENE-009/v1.png',
            prompt: 'x',
            checksum: checksum('missing')
          },
          versionId: 'sv-missing-1',
          createdAt: T0
        })
      ).code
    ).toBe('scene_not_found');

    const unversioned = createStoryboard({
      projectId: 'project-1',
      templates: [{ title: 'A', description: 'B', durationSeconds: 2 }],
      makeId: sequenceIds('scene')
    });
    const sceneSets = [sceneVersionSet(unversioned[0], [])];
    expect(
      captureDomainError(() =>
        applyTargetedCorrection({
          sceneSets,
          sceneKey: 'SCENE-001',
          instruction: 'Invalide',
          render: {
            imagePath: 'artifacts/SCENE-001/v2.png',
            prompt: 'x',
            checksum: checksum('scene:SCENE-001:v2')
          },
          versionId: 'sv-SCENE-001-2',
          createdAt: T0
        })
      ).code
    ).toBe('scene_version_required');
  });

  it('rejects an empty instruction', () => {
    const before = makeVersionedSceneSets();
    expect(
      captureDomainError(() =>
        applyTargetedCorrection({
          sceneSets: before,
          sceneKey: 'SCENE-001',
          instruction: '   ',
          render: {
            imagePath: 'artifacts/SCENE-001/v2.png',
            prompt: 'x',
            checksum: checksum('scene:SCENE-001:v2')
          },
          versionId: 'sv-SCENE-001-2',
          createdAt: T0
        })
      ).code
    ).toBe('invalid_input');
  });
});

describe('Production : snapshot figé et cycle de job', () => {
  it('freezes context, brief and exact scene versions for a run', () => {
    const { contextRevision, brief } = revisions();
    const sceneSets = makeVersionedSceneSets();
    const snapshot = buildProductionSnapshot({
      contextRevision,
      briefRevision: brief,
      sceneSets
    });
    expect(snapshot.contextRevisionId).toBe('context-revision-1');
    expect(snapshot.briefRevisionId).toBe('brief-revision-1');
    expect(snapshot.scenes).toHaveLength(5);
    expect(snapshot.scenes.map((scene) => scene.sceneVersionId)).toEqual([
      'sv-SCENE-001-1',
      'sv-SCENE-002-1',
      'sv-SCENE-003-1',
      'sv-SCENE-004-1',
      'sv-SCENE-005-1'
    ]);
    for (const scene of snapshot.scenes) {
      expect(scene.checksum).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.scenes)).toBe(true);
  });

  it('keeps an old snapshot intact when the storyboard gets a new version', () => {
    const { contextRevision, brief } = revisions();
    const sceneSets = makeVersionedSceneSets();
    const snapshot = buildProductionSnapshot({
      contextRevision,
      briefRevision: brief,
      sceneSets
    });
    const corrected = applyTargetedCorrection({
      sceneSets,
      sceneKey: 'SCENE-003',
      instruction: 'Nouvelle version',
      render: {
        imagePath: 'artifacts/SCENE-003/v2.png',
        prompt: 'Correction',
        checksum: checksum('scene:SCENE-003:v2')
      },
      versionId: 'sv-SCENE-003-2',
      createdAt: T1
    });
    const nextSnapshot = buildProductionSnapshot({
      contextRevision,
      briefRevision: brief,
      sceneSets: corrected.sceneSets
    });
    expect(snapshot.scenes[2].sceneVersionId).toBe('sv-SCENE-003-1');
    expect(nextSnapshot.scenes[2].sceneVersionId).toBe('sv-SCENE-003-2');
    expect(snapshot.scenes[2].sceneVersionId).toBe('sv-SCENE-003-1');
    expect(nextSnapshot.scenes[0]).toEqual(snapshot.scenes[0]);
  });

  it('rejects a snapshot with an unversioned scene', () => {
    const { contextRevision, brief } = revisions();
    const before = makeVersionedSceneSets();
    const unversioned = sceneVersionSet(before[0].scene, []);
    expect(
      captureDomainError(() =>
        buildProductionSnapshot({
          contextRevision,
          briefRevision: brief,
          sceneSets: [unversioned, before[1]]
        })
      ).code
    ).toBe('scene_version_required');
  });

  it('creates production and correction jobs with explicit targets', () => {
    const job = createProductionJob({
      id: 'job-1',
      projectId: 'project-1',
      kind: 'produce',
      targetSceneKey: null,
      createdAt: T0
    });
    expect(job.status).toBe('queued');
    expect(job.progress).toBe(0);
    expect(job.targetSceneKey).toBeNull();
    expect(Object.isFrozen(job)).toBe(true);

    const correction = createProductionJob({
      id: 'job-2',
      projectId: 'project-1',
      kind: 'correction',
      targetSceneKey: 'SCENE-003',
      createdAt: T0
    });
    expect(correction.targetSceneKey).toBe('SCENE-003');

    expect(
      captureDomainError(() =>
        createProductionJob({
          id: 'job-3',
          projectId: 'project-1',
          kind: 'correction',
          targetSceneKey: null,
          createdAt: T0
        })
      ).code
    ).toBe('invalid_input');
    expect(
      captureDomainError(() =>
        createProductionJob({
          id: 'job-4',
          projectId: 'project-1',
          kind: 'produce',
          targetSceneKey: 'SCENE-001',
          createdAt: T0
        })
      ).code
    ).toBe('invalid_input');
  });

  it('enforces ordered job transitions and monotonic progress', () => {
    const job = createProductionJob({
      id: 'job-1',
      projectId: 'project-1',
      kind: 'produce',
      targetSceneKey: null,
      createdAt: T0
    });
    expect(
      captureDomainError(() =>
        transitionProductionJob(job, { type: 'succeed', at: T1 })
      ).code
    ).toBe('invalid_transition');

    const running = transitionProductionJob(job, {
      type: 'start',
      at: T0,
      step: 'preparation'
    });
    expect(running.status).toBe('running');
    expect(running.step).toBe('preparation');

    const progressing = transitionProductionJob(running, {
      type: 'progress',
      at: T1,
      step: 'scene:SCENE-003',
      progress: 40
    });
    expect(progressing.progress).toBe(40);
    expect(
      captureDomainError(() =>
        transitionProductionJob(progressing, {
          type: 'progress',
          at: T2,
          step: 'scene:SCENE-002',
          progress: 20
        })
      ).code
    ).toBe('invalid_input');

    const succeeded = transitionProductionJob(progressing, { type: 'succeed', at: T2 });
    expect(succeeded.status).toBe('succeeded');
    expect(succeeded.progress).toBe(100);
    expect(succeeded.step).toBe('done');
    expect(
      captureDomainError(() =>
        transitionProductionJob(succeeded, { type: 'start', at: T2 })
      ).code
    ).toBe('invalid_transition');
  });

  it('fails a running job only with a non-empty error', () => {
    const job = createProductionJob({
      id: 'job-1',
      projectId: 'project-1',
      kind: 'produce',
      targetSceneKey: null,
      createdAt: T0
    });
    const running = transitionProductionJob(job, { type: 'start', at: T0 });
    expect(
      captureDomainError(() =>
        transitionProductionJob(running, { type: 'fail', at: T1, error: '  ' })
      ).code
    ).toBe('invalid_input');
    const failed = transitionProductionJob(running, {
      type: 'fail',
      at: T1,
      error: 'FFmpeg a echoue'
    });
    expect(failed.status).toBe('failed');
    expect(failed.step).toBe('failed');
    expect(failed.error).toBe('FFmpeg a echoue');
    expect(
      captureDomainError(() =>
        transitionProductionJob(failed, { type: 'succeed', at: T2 })
      ).code
    ).toBe('invalid_transition');
  });
});
