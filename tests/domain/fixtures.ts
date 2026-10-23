import {
  addSceneVersion,
  contentChecksum,
  createStoryboard,
  DomainError,
  IdFactory,
  isDomainError,
  SceneVersionSet,
  sceneVersionSet
} from '../../packages/domain/src/index';

export const T0 = '2026-10-23T10:00:00.000Z';
export const T1 = '2026-10-23T10:05:00.000Z';
export const T2 = '2026-10-23T10:10:00.000Z';
export const T3 = '2026-10-23T10:15:00.000Z';

export function sequenceIds(prefix: string): IdFactory {
  let count = 0;
  return () => {
    count += 1;
    return prefix + '-' + count;
  };
}

/** Checksum réel (SHA-256 canonique) d'une étiquette de test. */
export function checksum(label: string): string {
  return contentChecksum({ label });
}

/** Capture une DomainError et vérifie son code stable. */
export function captureDomainError(fn: () => unknown): DomainError {
  try {
    fn();
  } catch (error) {
    if (isDomainError(error) || error instanceof DomainError) {
      return error as DomainError;
    }
    throw error;
  }
  throw new Error('Expected the domain to reject the operation, but it did not throw.');
}

/**
 * Storyboard de 5 scènes avec une version v1 réelle par scène.
 * Clés stables SCENE-001..005, identifiants déterministes.
 */
export function makeVersionedSceneSets(): readonly SceneVersionSet[] {
  const scenes = createStoryboard({
    projectId: 'project-1',
    templates: [
      { title: 'Accroche', description: 'Accroche visuelle forte', durationSeconds: 2 },
      { title: 'Probleme', description: 'Probleme concret du client', durationSeconds: 2 },
      { title: 'Revelation produit', description: 'Produit au centre du plan', durationSeconds: 2 },
      { title: 'Preuve et benefices', description: 'Benefice mesurable', durationSeconds: 2 },
      { title: 'Appel a action', description: 'Invitation claire a agir', durationSeconds: 2 }
    ],
    makeId: sequenceIds('scene')
  });

  return scenes.map((scene) => {
    const appended = addSceneVersion({
      scene,
      versions: [],
      render: {
        imagePath: 'artifacts/' + scene.sceneKey + '/v1.png',
        prompt: 'Rendu de ' + scene.sceneKey,
        checksum: checksum('scene:' + scene.sceneKey + ':v1')
      },
      id: 'sv-' + scene.sceneKey + '-1',
      createdAt: T0
    });
    return sceneVersionSet(scene, appended.versions);
  });
}
