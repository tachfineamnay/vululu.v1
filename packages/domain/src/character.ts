import { AppendResult, appendVersion, currentVersion, nextVersion } from './versions';
import { contentChecksum } from './checksum';
import { DomainError } from './errors';
import {
  assertCharacterKey,
  assertEntityId,
  EntityId,
  requireNonEmpty
} from './identifiers';
import { deepFreeze } from './immutability';
import { assertIsoTimestamp, IsoTimestamp } from './timestamp';

export interface Character {
  readonly id: EntityId;
  readonly projectId: EntityId;
  /** Clé stable (CHAR-001...), distincte des bindings fournisseurs. */
  readonly characterKey: string;
  readonly name: string;
  readonly description: string;
  /**
   * Bindings facultatifs vers les identifiants internes d'un fournisseur.
   * Ils ne remplacent jamais character.id / character.characterKey.
   */
  readonly providerBindings: Readonly<Record<string, string>>;
}

/** Version immuable de la fiche de référence d'un personnage. */
export interface CharacterVersion {
  readonly id: EntityId;
  readonly characterId: EntityId;
  readonly version: number;
  readonly name: string;
  readonly description: string;
  readonly checksum: string;
  readonly createdAt: IsoTimestamp;
}

export interface CharacterContent {
  readonly name: string;
  readonly description: string;
}

export function createCharacter(input: {
  readonly id: EntityId;
  readonly projectId: EntityId;
  readonly characterKey: string;
  readonly name: string;
  readonly description: string;
  readonly providerBindings?: Readonly<Record<string, string>>;
}): Character {
  return deepFreeze({
    id: assertEntityId(input.id),
    projectId: assertEntityId(input.projectId, 'projectId'),
    characterKey: assertCharacterKey(input.characterKey),
    name: requireNonEmpty(input.name, 'name'),
    description: requireNonEmpty(input.description, 'description'),
    providerBindings: normalizeBindings(input.providerBindings ?? {})
  });
}

function normalizeBindings(
  bindings: Readonly<Record<string, string>>
): Readonly<Record<string, string>> {
  const normalized: Record<string, string> = {};
  for (const provider of Object.keys(bindings).sort()) {
    normalized[requireNonEmpty(provider, 'provider')] = requireNonEmpty(
      bindings[provider],
      'providerCharacterId'
    );
  }
  return deepFreeze(normalized);
}

/**
 * Ajoute un binding fournisseur sans changer l'identité du personnage.
 * Un binding est facultatif : il peut être remplacé sans effet sur character_id.
 */
export function bindProviderCharacter(
  character: Character,
  provider: string,
  providerCharacterId: string
): Character {
  const key = requireNonEmpty(provider, 'provider');
  return deepFreeze({
    ...character,
    providerBindings: normalizeBindings({
      ...character.providerBindings,
      [key]: requireNonEmpty(providerCharacterId, 'providerCharacterId')
    })
  });
}

export function characterContentChecksum(content: CharacterContent): string {
  return contentChecksum({
    name: requireNonEmpty(content.name, 'name'),
    description: requireNonEmpty(content.description, 'description')
  });
}

export function addCharacterVersion(input: {
  readonly character: Character;
  readonly versions: readonly CharacterVersion[];
  readonly content: CharacterContent;
  readonly id: EntityId;
  readonly createdAt: IsoTimestamp;
}): AppendResult<CharacterVersion> {
  const content = {
    name: requireNonEmpty(input.content.name, 'name'),
    description: requireNonEmpty(input.content.description, 'description')
  };
  const candidate: CharacterVersion = {
    id: assertEntityId(input.id),
    characterId: input.character.id,
    version: nextVersion(input.versions),
    name: content.name,
    description: content.description,
    checksum: contentChecksum(content),
    createdAt: assertIsoTimestamp(input.createdAt, 'createdAt')
  };
  return appendVersion(input.versions, candidate);
}

export function latestCharacterVersion(
  versions: readonly CharacterVersion[]
): CharacterVersion | null {
  return currentVersion(versions);
}

export function findCharacterByKey(
  characters: readonly Character[],
  characterKey: string
): Character | null {
  const key = assertCharacterKey(characterKey);
  return characters.find((character) => character.characterKey === key) ?? null;
}

export function assertCharactersBelongToProject(
  characters: readonly Character[],
  projectId: EntityId
): void {
  for (const character of characters) {
    if (character.projectId !== projectId) {
      throw new DomainError('character_not_found', 'Character does not belong to this project.', {
        characterId: character.id,
        projectId
      });
    }
  }
}
