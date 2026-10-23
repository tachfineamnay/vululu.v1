import { describe, expect, it } from 'vitest';
import {
  appendVersion,
  currentVersion,
  nextVersion
} from '../../packages/domain/src/index';
import { captureDomainError } from './fixtures';

type VersionedItem = { readonly version: number; readonly label: string };

function item(version: number): VersionedItem {
  return { version, label: 'version-' + version };
}

describe('versions immuables et numéro suivant', () => {
  it('computes max(version) + 1, even on unordered histories', () => {
    expect(nextVersion([])).toBe(1);
    expect(nextVersion([item(1)])).toBe(2);
    expect(nextVersion([item(3), item(1)])).toBe(4);
    expect(nextVersion([item(2), item(2)])).toBe(3);
  });

  it('refuses an invalid existing version number', () => {
    expect(captureDomainError(() => nextVersion([item(0)])).code).toBe('invalid_input');
    expect(captureDomainError(() => nextVersion([item(1.5)])).code).toBe(
      'invalid_input'
    );
  });

  it('appends only the expected next version and keeps history immutable', () => {
    const first = appendVersion([] as VersionedItem[], item(1));
    expect(first.version.version).toBe(1);
    expect(first.versions).toHaveLength(1);

    const second = appendVersion(first.versions, item(2));
    expect(second.versions.map((entry) => entry.version)).toEqual([1, 2]);
    expect(first.versions).toHaveLength(1);

    const frozenInput: readonly VersionedItem[] = first.versions;
    expect(() => {
      (frozenInput as VersionedItem[])[0] = item(99);
    }).toThrow(TypeError);
  });

  it('freezes returned version, history and append result', () => {
    const first = appendVersion([] as VersionedItem[], item(1));
    expect(Object.isFrozen(first.version)).toBe(true);
    expect(Object.isFrozen(first.versions)).toBe(true);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it('rejects a skipped, duplicated or decreasing version', () => {
    const first = appendVersion([] as VersionedItem[], item(1));
    expect(captureDomainError(() => appendVersion(first.versions, item(3))).code).toBe(
      'version_conflict'
    );
    expect(captureDomainError(() => appendVersion(first.versions, item(1))).code).toBe(
      'version_conflict'
    );
  });

  it('returns the highest version regardless of array order', () => {
    expect(currentVersion<VersionedItem>([])).toBeNull();
    const versions = [item(2), item(7), item(1)];
    expect(currentVersion(versions)?.version).toBe(7);
  });
});
