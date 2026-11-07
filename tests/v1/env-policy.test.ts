import { describe, expect, it } from 'vitest';
import { assertDatabaseLocation, isLocalDatabaseHost } from '../../apps/api/src/envPolicy';

describe('Politique de localisation de la base', () => {
  it('reconnait les hotes locaux', () => {
    expect(isLocalDatabaseHost('127.0.0.1')).toBe(true);
    expect(isLocalDatabaseHost('localhost')).toBe(true);
    expect(isLocalDatabaseHost('::1')).toBe(true);
    expect(isLocalDatabaseHost('db.internal')).toBe(false);
  });

  it('accepte une base locale sans exception', () => {
    expect(() =>
      assertDatabaseLocation('postgresql://u:p@127.0.0.1:5432/vululu', {
        appEnv: 'production',
        allowNonLocal: false
      })
    ).not.toThrow();
  });

  it('refuse une base non locale par defaut', () => {
    expect(() =>
      assertDatabaseLocation('postgresql://u:p@postgres:5432/vululu', {
        appEnv: 'production',
        allowNonLocal: false
      })
    ).toThrow(/refuse une base non locale/);
  });

  it('accepte une base non locale avec exception explicite en production', () => {
    expect(() =>
      assertDatabaseLocation('postgresql://u:p@postgres:5432/vululu', {
        appEnv: 'production',
        allowNonLocal: true
      })
    ).not.toThrow();
  });

  it('refuse l exception hors production', () => {
    expect(() =>
      assertDatabaseLocation('postgresql://u:p@postgres:5432/vululu', {
        appEnv: 'local',
        allowNonLocal: true
      })
    ).toThrow(/APP_ENV=production/);
  });

  it('refuse une URL invalide', () => {
    expect(() =>
      assertDatabaseLocation('not-a-url', { appEnv: 'production', allowNonLocal: true })
    ).toThrow(/invalide/);
  });
});
