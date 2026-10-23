import { DomainError } from './errors';
import { deepFreeze } from './immutability';

export type Versioned = { readonly version: number };

/**
 * Numéro de version suivant : max(versions existantes) + 1.
 * Les versions ne sont jamais réutilisées, même si l'historique est incomplet.
 */
export function nextVersion(existing: readonly Versioned[]): number {
  let highest = 0;
  for (const item of existing) {
    if (!Number.isInteger(item.version) || item.version < 1) {
      throw new DomainError('invalid_input', 'Existing versions must be positive integers.', {
        version: item.version
      });
    }
    if (item.version > highest) {
      highest = item.version;
    }
  }
  return highest + 1;
}

/** Dernière version (numéro le plus élevé), indépendamment de l'ordre du tableau. */
export function currentVersion<T extends Versioned>(versions: readonly T[]): T | null {
  let latest: T | null = null;
  for (const version of versions) {
    if (latest === null || version.version > latest.version) {
      latest = version;
    }
  }
  return latest;
}

export type AppendResult<T extends Versioned> = {
  readonly versions: readonly T[];
  readonly version: T;
};

/**
 * Ajoute une version immuable en vérifiant qu'elle porte bien le numéro suivant.
 * L'historique existant n'est jamais modifié : un nouveau tableau gelé est retourné.
 */
export function appendVersion<T extends Versioned>(
  existing: readonly T[],
  candidate: T
): AppendResult<T> {
  const expected = nextVersion(existing);
  if (!Number.isInteger(candidate.version) || candidate.version !== expected) {
    throw new DomainError(
      'version_conflict',
      `Expected version ${expected}, received ${candidate.version}.`,
      { expected, received: candidate.version }
    );
  }
  const versions = deepFreeze([...existing, deepFreeze(candidate)]);
  return deepFreeze({ versions, version: candidate });
}
