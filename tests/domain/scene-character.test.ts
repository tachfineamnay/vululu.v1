import { describe, expect, it } from 'vitest';
import {
  addCharacterVersion,
  addSceneVersion,
  bindProviderCharacter,
  characterContentChecksum,
  createCharacter,
  createStoryboard,
  findCharacterByKey,
  findSceneByKey,
  latestCharacterVersion,
  latestSceneVersion,
  repositionScenes,
  sceneVersionSet,
  updateSceneDuration,
  assertCharactersBelongToProject
} from '../../packages/domain/src/index';
import { captureDomainError, checksum, sequenceIds, T0, T1, T2 } from './fixtures';

const templates = [
  { title: 'Accroche', description: 'Accroche visuelle', durationSeconds: 2 },
  { title: 'Probleme', description: 'Probleme concret', durationSeconds: 2 },
  { title: 'Revelation', description: 'Produit au centre', durationSeconds: 2 },
  { title: 'Preuve', description: 'Benefice mesurable', durationSeconds: 2 },
  { title: 'CTA', description: 'Appel a action', durationSeconds: 2 }
];

function storyboard() {
  return createStoryboard({
    projectId: 'project-1',
    templates,
    makeId: sequenceIds('scene')
  });
}

describe('Scene : identifiant stable, position indépendante, versions immuables', () => {
  it('creates a storyboard with stable scene keys and separate positions', () => {
    const scenes = storyboard();
    expect(scenes).toHaveLength(5);
    expect(scenes.map((scene) => scene.sceneKey)).toEqual([
      'SCENE-001',
      'SCENE-002',
      'SCENE-003',
      'SCENE-004',
      'SCENE-005'
    ]);
    expect(scenes.map((scene) => scene.position)).toEqual([1, 2, 3, 4, 5]);
    expect(scenes.map((scene) => scene.id)).toEqual([
      'scene-1',
      'scene-2',
      'scene-3',
      'scene-4',
      'scene-5'
    ]);
    expect(scenes.every((scene) => Object.isFrozen(scene))).toBe(true);
    expect(findSceneByKey(scenes.map((scene) => sceneVersionSet(scene, [])), 'SCENE-003')?.scene.id).toBe(
      'scene-3'
    );
  });

  it('repositions a scene without changing ids, keys or the original storyboard', () => {
    const scenes = storyboard();
    const before = new Map(scenes.map((scene) => [scene.id, scene.sceneKey]));
    const moved = repositionScenes(scenes, 'scene-3', 1);

    expect(moved.map((scene) => scene.position)).toEqual([1, 2, 3, 4, 5]);
    expect(moved[0].id).toBe('scene-3');
    expect(moved[0].sceneKey).toBe('SCENE-003');
    for (const scene of moved) {
      expect(before.get(scene.id)).toBe(scene.sceneKey);
    }
    expect(scenes[2].position).toBe(3);
    expect(moved[0].title).toBe(scenes[2].title);
  });

  it('moves a scene to the last position and rejects unknown scenes', () => {
    const scenes = storyboard();
    const moved = repositionScenes(scenes, 'scene-1', 5);
    expect(moved[4].id).toBe('scene-1');
    expect(moved[4].sceneKey).toBe('SCENE-001');
    expect(captureDomainError(() => repositionScenes(scenes, 'missing', 1)).code).toBe(
      'scene_not_found'
    );
    expect(captureDomainError(() => repositionScenes(scenes, 'scene-1', 6)).code).toBe(
      'invalid_input'
    );
  });

  it('updates a scene duration without touching identity or versions', () => {
    const scenes = storyboard();
    const target = scenes[2];
    const updated = updateSceneDuration(target, 10);
    expect(updated.id).toBe(target.id);
    expect(updated.sceneKey).toBe(target.sceneKey);
    expect(updated.position).toBe(target.position);
    expect(updated.durationSeconds).toBe(10);
    expect(target.durationSeconds).toBe(2);
    expect(captureDomainError(() => updateSceneDuration(target, 0)).code).toBe(
      'invalid_input'
    );
    expect(captureDomainError(() => updateSceneDuration(target, 16)).code).toBe(
      'invalid_input'
    );
  });

  it('appends immutable scene versions with the next version number', () => {
    const scene = storyboard()[2];
    expect(scene).toBeTruthy();
    const first = addSceneVersion({
      scene,
      versions: [],
      render: {
        imagePath: 'artifacts/SCENE-003/v1.png',
        prompt: 'Rendu initial',
        checksum: checksum('scene:SCENE-003:v1')
      },
      id: 'sv-1',
      createdAt: T0
    });
    expect(first.version.version).toBe(1);
    expect(first.version.instruction).toBeNull();

    const second = addSceneVersion({
      scene,
      versions: first.versions,
      render: {
        imagePath: 'artifacts/SCENE-003/v2.png',
        prompt: 'Correction ciblée',
        checksum: checksum('scene:SCENE-003:v2'),
        instruction: 'Rendre le produit rouge'
      },
      id: 'sv-2',
      createdAt: T1
    });
    expect(second.version.version).toBe(2);
    expect(second.version.instruction).toBe('Rendre le produit rouge');
    expect(second.version.checksum).not.toBe(first.version.checksum);
    expect(first.versions).toHaveLength(1);
    expect(latestSceneVersion(first.versions)?.version).toBe(1);
    expect(latestSceneVersion(second.versions)?.version).toBe(2);

    const badChecksum = captureDomainError(() =>
      addSceneVersion({
        scene,
        versions: second.versions,
        render: {
          imagePath: 'artifacts/SCENE-003/v3.png',
          prompt: 'Rendu invalide',
          checksum: 'deadbeef'
        },
        id: 'sv-3',
        createdAt: T2
      })
    );
    expect(badChecksum.code).toBe('invalid_checksum');
  });
});

describe('Character : identifiant stable distinct des bindings provider', () => {
  it('creates a character and appends immutable character versions', () => {
    const character = createCharacter({
      id: 'character-1',
      projectId: 'project-1',
      characterKey: 'CHAR-001',
      name: 'Personnage A',
      description: 'Personnage principal recurrent'
    });
    expect(Object.isFrozen(character)).toBe(true);
    expect(character.providerBindings).toEqual({});

    const first = addCharacterVersion({
      character,
      versions: [],
      content: { name: 'Personnage A', description: 'Fiche initiale' },
      id: 'char-version-1',
      createdAt: T0
    });
    expect(first.version.version).toBe(1);
    expect(first.version.checksum).toBe(
      characterContentChecksum({ name: 'Personnage A', description: 'Fiche initiale' })
    );
    expect(first.version.characterId).toBe('character-1');

    const second = addCharacterVersion({
      character,
      versions: first.versions,
      content: { name: 'Personnage A', description: 'Fiche etoffee' },
      id: 'char-version-2',
      createdAt: T1
    });
    expect(second.version.version).toBe(2);
    expect(second.version.checksum).not.toBe(first.version.checksum);
    expect(first.versions).toHaveLength(1);
    expect(latestCharacterVersion(second.versions)?.version).toBe(2);
  });

  it('binds a provider id without changing the stable character identity', () => {
    const character = createCharacter({
      id: 'character-1',
      projectId: 'project-1',
      characterKey: 'CHAR-001',
      name: 'Personnage A',
      description: 'Personnage principal'
    });
    const bound = bindProviderCharacter(character, 'mock-image', 'provider-char-77');
    expect(bound.id).toBe(character.id);
    expect(bound.characterKey).toBe(character.characterKey);
    expect(bound.providerBindings).toEqual({ 'mock-image': 'provider-char-77' });
    expect(character.providerBindings).toEqual({});
    expect(bindProviderCharacter(bound, 'other', 'x-1').providerBindings).toEqual({
      'mock-image': 'provider-char-77',
      other: 'x-1'
    });
    expect(captureDomainError(() => bindProviderCharacter(character, ' ', 'x')).code).toBe(
      'invalid_input'
    );
  });

  it('finds characters by stable key and checks project ownership', () => {
    const character = createCharacter({
      id: 'character-1',
      projectId: 'project-1',
      characterKey: 'CHAR-001',
      name: 'Personnage A',
      description: 'Personnage principal'
    });
    expect(findCharacterByKey([character], 'CHAR-001')?.id).toBe('character-1');
    expect(findCharacterByKey([character], 'CHAR-002')).toBeNull();
    expect(() => assertCharactersBelongToProject([character], 'project-1')).not.toThrow();
    expect(
      captureDomainError(() => assertCharactersBelongToProject([character], 'project-2')).code
    ).toBe('character_not_found');
  });
});
