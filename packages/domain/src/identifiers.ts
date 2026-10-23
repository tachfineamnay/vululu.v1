import { DomainError } from './errors';

/** Identifiant opaque, attribué une seule fois par la couche Application. */
export type EntityId = string;

/** Fabrique d'identifiants injectée (l'Application fournit cuid/uuid). */
export type IdFactory = () => string;

export function assertEntityId(value: string, field = 'id'): EntityId {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new DomainError('invalid_id', `${field} must be a non-empty stable identifier.`, {
      field,
      value
    });
  }
  return value;
}

export function createEntityId(factory: IdFactory, field = 'id'): EntityId {
  if (typeof factory !== 'function') {
    throw new DomainError('invalid_input', 'An identifier factory function is required.', { field });
  }
  return assertEntityId(factory(), field);
}

export function requireNonEmpty(value: string, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new DomainError('invalid_input', `${field} must be a non-empty string.`, { field, value });
  }
  return value;
}

export const SCENE_KEY_PATTERN = /^SCENE-\d{3,}$/;
export const CHARACTER_KEY_PATTERN = /^CHAR-\d{3,}$/;

/**
 * Clé de scène stable, dérivée du rang initial du storyboard.
 * Elle est attribuée à la création puis ne change plus, même si la position change.
 */
export function sceneKeyForOrdinal(ordinal: number): string {
  if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > 999) {
    throw new DomainError('invalid_input', 'Scene ordinal must be an integer between 1 and 999.', {
      ordinal
    });
  }
  return 'SCENE-' + String(ordinal).padStart(3, '0');
}

export function characterKeyForOrdinal(ordinal: number): string {
  if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > 999) {
    throw new DomainError('invalid_input', 'Character ordinal must be an integer between 1 and 999.', {
      ordinal
    });
  }
  return 'CHAR-' + String(ordinal).padStart(3, '0');
}

export function isSceneKey(value: string): boolean {
  return typeof value === 'string' && SCENE_KEY_PATTERN.test(value);
}

export function isCharacterKey(value: string): boolean {
  return typeof value === 'string' && CHARACTER_KEY_PATTERN.test(value);
}

export function assertSceneKey(value: string): string {
  if (!isSceneKey(value)) {
    throw new DomainError('invalid_input', 'Scene key must match SCENE-NNN.', { value });
  }
  return value;
}

export function assertCharacterKey(value: string): string {
  if (!isCharacterKey(value)) {
    throw new DomainError('invalid_input', 'Character key must match CHAR-NNN.', { value });
  }
  return value;
}

export type Positioned = { readonly position: number };

export function nextPosition(items: readonly Positioned[]): number {
  let highest = 0;
  for (const item of items) {
    if (!Number.isInteger(item.position) || item.position < 1) {
      throw new DomainError('invalid_input', 'Position must be a positive integer.', {
        position: item.position
      });
    }
    if (item.position > highest) {
      highest = item.position;
    }
  }
  return highest + 1;
}

export function orderedByPosition<T extends Positioned>(items: readonly T[]): readonly T[] {
  return [...items].sort((left, right) => left.position - right.position);
}
