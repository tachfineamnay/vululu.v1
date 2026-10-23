import { AppendResult, appendVersion, currentVersion, nextVersion } from './versions';
import { assertSha256Hex } from './checksum';
import { DomainError } from './errors';
import {
  assertEntityId,
  assertSceneKey,
  createEntityId,
  EntityId,
  IdFactory,
  requireNonEmpty,
  sceneKeyForOrdinal
} from './identifiers';
import { deepFreeze } from './immutability';
import { assertSceneDurationSeconds } from './project';
import { assertIsoTimestamp, IsoTimestamp } from './timestamp';

export interface Scene {
  readonly id: EntityId;
  readonly projectId: EntityId;
  /** Clé stable attribuée à la création (SCENE-001...), indépendante de la position. */
  readonly sceneKey: string;
  /** Position d'affichage, mutable sans changer id ni sceneKey. */
  readonly position: number;
  readonly title: string;
  readonly description: string;
  readonly durationSeconds: number;
  readonly characterKey: string | null;
}

/** Version immuable du rendu d'une scène. */
export interface SceneVersion {
  readonly id: EntityId;
  readonly sceneId: EntityId;
  readonly version: number;
  readonly imagePath: string;
  readonly prompt: string;
  readonly checksum: string;
  readonly instruction: string | null;
  readonly createdAt: IsoTimestamp;
}

export interface SceneTemplate {
  readonly title: string;
  readonly description: string;
  readonly durationSeconds: number;
  readonly characterKey?: string | null;
}

/** Sortie normalisée d'un moteur de rendu (sans accès fichier ni réseau). */
export interface SceneRender {
  readonly imagePath: string;
  readonly prompt: string;
  readonly checksum: string;
  readonly instruction?: string | null;
}

/** Ensemble immuable {scène, versions} utilisé par la production et la correction. */
export interface SceneVersionSet {
  readonly scene: Scene;
  readonly versions: readonly SceneVersion[];
}

/**
 * Crée les scènes d'un storyboard : clés stables SCENE-NNN, positions 1..N.
 * La ré-exécution ne doit jamais réattribuer les clés ; l'Application réutilise
 * les scènes existantes (id + sceneKey) et ne crée que les manquantes.
 */
export function createStoryboard(input: {
  readonly projectId: EntityId;
  readonly templates: readonly SceneTemplate[];
  readonly makeId: IdFactory;
  readonly characterKey?: string | null;
}): readonly Scene[] {
  if (input.templates.length === 0) {
    throw new DomainError('invalid_input', 'A storyboard requires at least one scene template.');
  }
  const projectId = assertEntityId(input.projectId, 'projectId');
  const characterKey = input.characterKey ?? null;
  if (characterKey !== null) {
    requireNonEmpty(characterKey, 'characterKey');
  }
  const scenes = input.templates.map((template, index) =>
    deepFreeze({
      id: createEntityId(input.makeId, 'sceneId'),
      projectId,
      sceneKey: sceneKeyForOrdinal(index + 1),
      position: index + 1,
      title: requireNonEmpty(template.title, 'title'),
      description: requireNonEmpty(template.description, 'description'),
      durationSeconds: assertSceneDurationSeconds(template.durationSeconds),
      characterKey: template.characterKey === undefined ? characterKey : template.characterKey
    })
  );
  return deepFreeze(scenes);
}

/**
 * Déplace une scène et renumérote les positions. Les identifiants, clés et
 * contenus restent strictement inchangés : la position est un attribut distinct.
 */
export function repositionScenes(
  scenes: readonly Scene[],
  sceneId: EntityId,
  targetPosition: number
): readonly Scene[] {
  if (scenes.length === 0) {
    throw new DomainError('invalid_input', 'Cannot reposition an empty storyboard.');
  }
  if (!Number.isInteger(targetPosition) || targetPosition < 1 || targetPosition > scenes.length) {
    throw new DomainError('invalid_input', 'Target position is outside the storyboard.', {
      targetPosition,
      length: scenes.length
    });
  }
  const ordered = [...scenes].sort((left, right) => left.position - right.position);
  const currentIndex = ordered.findIndex((scene) => scene.id === sceneId);
  if (currentIndex < 0) {
    throw new DomainError('scene_not_found', 'Scene does not belong to this storyboard.', {
      sceneId
    });
  }
  const [moved] = ordered.splice(currentIndex, 1);
  ordered.splice(targetPosition - 1, 0, moved);
  const repositioned = ordered.map((scene, index) =>
    scene.position === index + 1 ? scene : deepFreeze({ ...scene, position: index + 1 })
  );
  return deepFreeze(repositioned);
}

/** Change la durée d'une scène sans toucher à son identité ni à ses versions. */
export function updateSceneDuration(scene: Scene, durationSeconds: number): Scene {
  return deepFreeze({ ...scene, durationSeconds: assertSceneDurationSeconds(durationSeconds) });
}

/**
 * Ajoute une version immuable à une scène. Le numéro de version est calculé
 * côté domaine ; les versions précédentes restent intactes.
 */
export function addSceneVersion(input: {
  readonly scene: Scene;
  readonly versions: readonly SceneVersion[];
  readonly render: SceneRender;
  readonly id: EntityId;
  readonly createdAt: IsoTimestamp;
}): AppendResult<SceneVersion> {
  const sceneId = assertEntityId(input.scene.id, 'sceneId');
  const candidate: SceneVersion = {
    id: assertEntityId(input.id),
    sceneId,
    version: nextVersion(input.versions),
    imagePath: requireNonEmpty(input.render.imagePath, 'imagePath'),
    prompt: requireNonEmpty(input.render.prompt, 'prompt'),
    checksum: assertSha256Hex(input.render.checksum),
    instruction:
      input.render.instruction === undefined || input.render.instruction === null
        ? null
        : requireNonEmpty(input.render.instruction, 'instruction'),
    createdAt: assertIsoTimestamp(input.createdAt, 'createdAt')
  };
  return appendVersion(input.versions, candidate);
}

export function latestSceneVersion(
  versions: readonly SceneVersion[]
): SceneVersion | null {
  return currentVersion(versions);
}

export function sceneVersionSet(
  scene: Scene,
  versions: readonly SceneVersion[]
): SceneVersionSet {
  return deepFreeze({ scene, versions });
}

/**
 * Récupère une scène par sa clé stable (et non par sa position).
 */
export function findSceneByKey(
  sceneSets: readonly SceneVersionSet[],
  sceneKey: string
): SceneVersionSet | null {
  const key = assertSceneKey(sceneKey);
  return sceneSets.find((set) => set.scene.sceneKey === key) ?? null;
}
