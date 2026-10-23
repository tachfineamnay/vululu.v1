import {
  addSceneVersion,
  findSceneByKey,
  latestSceneVersion,
  SceneRender,
  SceneVersion,
  SceneVersionSet,
  sceneVersionSet
} from './scene';
import { ContextRevision } from './context';
import { BriefRevision } from './brief';
import { DomainError } from './errors';
import {
  assertEntityId,
  assertSceneKey,
  EntityId,
  requireNonEmpty
} from './identifiers';
import { deepFreeze } from './immutability';
import { assertIsoTimestamp, IsoTimestamp } from './timestamp';

export type ProductionJobKind = 'produce' | 'correction';
export type ProductionJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface ProductionJob {
  readonly id: EntityId;
  readonly projectId: EntityId;
  readonly kind: ProductionJobKind;
  readonly status: ProductionJobStatus;
  readonly step: string;
  readonly progress: number;
  readonly targetSceneKey: string | null;
  readonly error: string | null;
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
}

export type ProductionJobEvent =
  | { readonly type: 'start'; readonly at: IsoTimestamp; readonly step?: string }
  | {
      readonly type: 'progress';
      readonly at: IsoTimestamp;
      readonly step: string;
      readonly progress: number;
    }
  | { readonly type: 'succeed'; readonly at: IsoTimestamp }
  | { readonly type: 'fail'; readonly at: IsoTimestamp; readonly error: string };

export interface SnapshotSceneVersion {
  readonly sceneId: EntityId;
  readonly sceneVersionId: EntityId;
  readonly checksum: string;
}

/**
 * Snapshot figé au lancement d'un run : révisions de contexte/brief et versions
 * exactes des scènes. Un run ancien reste reproductible même après corrections.
 */
export interface ProductionSnapshot {
  readonly contextRevisionId: EntityId;
  readonly briefRevisionId: EntityId;
  readonly scenes: readonly SnapshotSceneVersion[];
}

function assertProgress(progress: number): number {
  if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
    throw new DomainError('invalid_input', 'Job progress must be an integer between 0 and 100.', {
      progress
    });
  }
  return progress;
}

/** Crée un job de production (produce) ou de correction ciblée. */
export function createProductionJob(input: {
  readonly id: EntityId;
  readonly projectId: EntityId;
  readonly kind: ProductionJobKind;
  readonly targetSceneKey: string | null;
  readonly createdAt: IsoTimestamp;
}): ProductionJob {
  if (input.kind !== 'produce' && input.kind !== 'correction') {
    throw new DomainError('invalid_input', 'Unknown production job kind.', { kind: input.kind });
  }
  let targetSceneKey: string | null = null;
  if (input.kind === 'correction') {
    if (input.targetSceneKey === null) {
      throw new DomainError('invalid_input', 'A correction job requires a target scene key.');
    }
    targetSceneKey = assertSceneKey(input.targetSceneKey);
  } else if (input.targetSceneKey !== null) {
    throw new DomainError('invalid_input', 'A produce job must not target a single scene.', {
      targetSceneKey: input.targetSceneKey
    });
  }
  const createdAt = assertIsoTimestamp(input.createdAt, 'createdAt');
  return deepFreeze({
    id: assertEntityId(input.id),
    projectId: assertEntityId(input.projectId, 'projectId'),
    kind: input.kind,
    status: 'queued',
    step: 'queued',
    progress: 0,
    targetSceneKey,
    error: null,
    createdAt,
    updatedAt: createdAt
  });
}

/**
 * Transitions explicites d'un job : queued -> running -> succeeded/failed.
 * Aucune transition terminale n'est réversible ; un échec est journalisable.
 */
export function transitionProductionJob(
  job: ProductionJob,
  event: ProductionJobEvent
): ProductionJob {
  const at = assertIsoTimestamp(event.at, 'at');
  if (event.type === 'start') {
    if (job.status !== 'queued') {
      throw new DomainError('invalid_transition', 'Only a queued job can start.', {
        status: job.status
      });
    }
    return deepFreeze({
      ...job,
      status: 'running',
      step: event.step === undefined ? 'running' : requireNonEmpty(event.step, 'step'),
      error: null,
      updatedAt: at
    });
  }
  if (event.type === 'progress') {
    if (job.status !== 'running') {
      throw new DomainError('invalid_transition', 'Only a running job can progress.', {
        status: job.status
      });
    }
    const progress = assertProgress(event.progress);
    if (progress < job.progress) {
      throw new DomainError('invalid_input', 'Job progress cannot go backwards.', {
        current: job.progress,
        received: progress
      });
    }
    return deepFreeze({
      ...job,
      step: requireNonEmpty(event.step, 'step'),
      progress,
      updatedAt: at
    });
  }
  if (event.type === 'succeed') {
    if (job.status !== 'running') {
      throw new DomainError('invalid_transition', 'Only a running job can succeed.', {
        status: job.status
      });
    }
    return deepFreeze({
      ...job,
      status: 'succeeded',
      step: 'done',
      progress: 100,
      error: null,
      updatedAt: at
    });
  }
  if (event.type === 'fail') {
    if (job.status === 'succeeded' || job.status === 'failed') {
      throw new DomainError('invalid_transition', 'A terminal job cannot fail again.', {
        status: job.status
      });
    }
    return deepFreeze({
      ...job,
      status: 'failed',
      step: 'failed',
      error: requireNonEmpty(event.error, 'error'),
      updatedAt: at
    });
  }
  const exhaustive: never = event;
  throw new DomainError('invalid_input', 'Unknown production event.', { event: exhaustive });
}

/**
 * Fige le snapshot de lancement. Chaque scène doit avoir une version ; la liste
 * est triée par sceneId pour être déterministe et vérifiable par checksum.
 */
export function buildProductionSnapshot(input: {
  readonly contextRevision: ContextRevision;
  readonly briefRevision: BriefRevision;
  readonly sceneSets: readonly SceneVersionSet[];
}): ProductionSnapshot {
  if (input.sceneSets.length === 0) {
    throw new DomainError('invalid_input', 'A production snapshot requires at least one scene.');
  }
  const seenScenes = new Set<EntityId>();
  const scenes: SnapshotSceneVersion[] = input.sceneSets.map((set) => {
    if (seenScenes.has(set.scene.id)) {
      throw new DomainError('invalid_input', 'Duplicate scene in production snapshot.', {
        sceneId: set.scene.id
      });
    }
    seenScenes.add(set.scene.id);
    const version = latestSceneVersion(set.versions);
    if (version === null) {
      throw new DomainError('scene_version_required', 'Every scene needs a version before a run.', {
        sceneKey: set.scene.sceneKey
      });
    }
    return {
      sceneId: set.scene.id,
      sceneVersionId: version.id,
      checksum: version.checksum
    };
  });
  scenes.sort((left, right) => left.sceneId.localeCompare(right.sceneId));
  return deepFreeze({
    contextRevisionId: input.contextRevision.id,
    briefRevisionId: input.briefRevision.id,
    scenes
  });
}

export interface TargetedCorrectionResult {
  /** Mêmes ensembles pour toutes les autres scènes (identifiants/versions intacts). */
  readonly sceneSets: readonly SceneVersionSet[];
  readonly correctedVersion: SceneVersion;
}

/**
 * Correction ciblée : une nouvelle version est ajoutée uniquement à la scène
 * ciblée. Toutes les autres scènes conservent exactement leurs versions.
 * L'identité de la scène ciblée (id, sceneKey, position) reste inchangée.
 */
export function applyTargetedCorrection(input: {
  readonly sceneSets: readonly SceneVersionSet[];
  readonly sceneKey: string;
  readonly instruction: string;
  readonly render: SceneRender;
  readonly versionId: EntityId;
  readonly createdAt: IsoTimestamp;
}): TargetedCorrectionResult {
  if (input.sceneSets.length === 0) {
    throw new DomainError('invalid_input', 'A correction requires a storyboard.');
  }
  const sceneKey = assertSceneKey(input.sceneKey);
  const instruction = requireNonEmpty(input.instruction, 'instruction');
  if (
    input.render.instruction !== undefined &&
    input.render.instruction !== null &&
    input.render.instruction !== instruction
  ) {
    throw new DomainError('invalid_input', 'Correction render instruction contradicts the request.', {
      instruction,
      renderInstruction: input.render.instruction
    });
  }
  const seen = new Set<string>();
  for (const set of input.sceneSets) {
    if (seen.has(set.scene.sceneKey)) {
      throw new DomainError('invalid_input', 'Duplicate scene key in storyboard.', {
        sceneKey: set.scene.sceneKey
      });
    }
    seen.add(set.scene.sceneKey);
  }
  const target = findSceneByKey(input.sceneSets, sceneKey);
  if (target === null) {
    throw new DomainError('scene_not_found', 'Target scene does not exist in the storyboard.', {
      sceneKey
    });
  }
  for (const set of input.sceneSets) {
    if (latestSceneVersion(set.versions) === null) {
      throw new DomainError(
        'scene_version_required',
        'Every scene needs an existing version before a targeted correction.',
        { sceneKey: set.scene.sceneKey }
      );
    }
  }
  const targetIndex = input.sceneSets.indexOf(target);
  const appended = addSceneVersion({
    scene: target.scene,
    versions: target.versions,
    render: { ...input.render, instruction },
    id: input.versionId,
    createdAt: input.createdAt
  });
  const sceneSets = input.sceneSets.map((set, index) =>
    index === targetIndex ? sceneVersionSet(set.scene, appended.versions) : set
  );
  return deepFreeze({ sceneSets: deepFreeze(sceneSets), correctedVersion: appended.version });
}

/** Vérifie que toutes les scènes du storyboard possèdent au moins une version. */
export function assertStoryboardVersioned(
  sceneSets: readonly SceneVersionSet[]
): readonly SceneVersion[] {
  const versions = sceneSets.map((set) => {
    const version = latestSceneVersion(set.versions);
    if (version === null) {
      throw new DomainError('scene_version_required', 'Scene has no version.', {
        sceneKey: set.scene.sceneKey
      });
    }
    return version;
  });
  return deepFreeze(versions);
}
