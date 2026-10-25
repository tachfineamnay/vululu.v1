import { describe, expect, it } from 'vitest';
import { parseByteRange } from '../../apps/api/src/infrastructure/http/byteRange';

describe('V1-01-G byte range certification', () => {
  it('parse les plages valides, suffixe et ouvertes', () => {
    expect(parseByteRange(undefined, 100)).toBeUndefined();
    expect(parseByteRange('bytes=0-9', 100)).toEqual({ start: 0, end: 9 });
    expect(parseByteRange('bytes=10-', 100)).toEqual({ start: 10, end: 99 });
    expect(parseByteRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
    expect(parseByteRange('bytes=-200', 100)).toEqual({ start: 0, end: 99 });
    expect(parseByteRange('bytes=99-99', 100)).toEqual({ start: 99, end: 99 });
  });

  it('refuse les plages invalides sans retomber sur un 200 complet', () => {
    expect(parseByteRange('bytes=100-101', 100)).toBeNull();
    expect(parseByteRange('bytes=10-9', 100)).toBeNull();
    expect(parseByteRange('bytes=0-1,3-4', 100)).toBeNull();
    expect(parseByteRange('items=0-1', 100)).toBeNull();
    expect(parseByteRange('bytes=abc-def', 100)).toBeNull();
    expect(parseByteRange('bytes=0-1', 0)).toBeNull();
  });
});
import { OpsMetricsService } from '../../apps/api/src/infrastructure/operations/opsMetrics';

describe('V1-01-G ops degradation', () => {
  it('retourne degraded sans requetes secondaires si la base est indisponible', async () => {
    const fake = {
      $queryRawUnsafe: async () => { throw new Error('db_down'); }
    } as never;
    const snapshot = await new OpsMetricsService(fake).snapshot();
    expect(snapshot.database).toBe('error');
    expect(snapshot.workers).toEqual([]);
    expect(snapshot.jobRuns).toEqual({});
  });
});
