import { describe, expect, it } from 'vitest';
import { assertIsoTimestamp, timestampMillis } from '../../packages/domain/src';
import { DomainError } from '../../packages/domain/src/errors';

/**
 * Regressions d audit : `Date.parse` seul reporte les dates impossibles
 * (2026-02-30 -> 2026-03-02) au lieu de les refuser.
 */
function code(value: string) {
  try {
    assertIsoTimestamp(value);
    return null;
  } catch (error) {
    return error instanceof DomainError ? error.code : 'unexpected';
  }
}

describe('horodatages ISO 8601 UTC', () => {
  it('accepte les dates reelles, avec ou sans millisecondes', () => {
    for (const value of [
      '2026-12-31T23:59:59Z',
      '2026-01-01T00:00:00.123Z',
      '2024-02-29T12:00:00Z',
      '2000-02-29T00:00:00Z'
    ]) {
      expect(assertIsoTimestamp(value)).toBe(value);
      expect(Number.isNaN(timestampMillis(value))).toBe(false);
    }
  });

  it('refuse les jours impossibles au lieu de les reporter au mois suivant', () => {
    for (const value of [
      '2026-02-30T00:00:00Z',
      '2026-04-31T00:00:00Z',
      '2026-02-29T00:00:00Z',
      '2100-02-29T00:00:00Z'
    ]) {
      expect(code(value)).toBe('invalid_input');
    }
  });

  it('refuse les composantes hors bornes et les formats non UTC', () => {
    for (const value of [
      '2026-13-01T00:00:00Z',
      '2026-00-10T00:00:00Z',
      '2026-01-01T25:00:00Z',
      '2026-01-01T00:60:00Z',
      '2026-01-01T00:00:60Z',
      '2026-01-01T00:00:00+02:00',
      '2026-01-01',
      '2026-01-01T00:00:00.123456Z'
    ]) {
      expect(code(value)).toBe('invalid_input');
    }
  });
});
