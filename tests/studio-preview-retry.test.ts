import { describe, expect, it } from 'vitest';
import { ApiRequestError, withBusyRetry } from '../apps/web/lib/api';

/**
 * DSH-04 — attente bornée des créneaux de rendu : un 429 « rendu en cours » est rejoué
 * quelques fois, sans jamais relever la limite de concurrence du serveur ni rejouer une
 * erreur de contrat.
 */
describe('withBusyRetry', () => {
  it('rejoue un 429 puis renvoie le résultat, en annonçant chaque attente', async () => {
    let calls = 0;
    const waits: number[] = [];
    const result = await withBusyRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw new ApiRequestError('Rendu en cours, réessayez.', 429);
        return 'apercu';
      },
      { delaysMs: [0], onWait: (attempt) => waits.push(attempt) }
    );
    expect(result).toBe('apercu');
    expect(calls).toBe(3);
    expect(waits).toEqual([1, 2]);
  });

  it('ne rejoue jamais une erreur de contrat (422)', async () => {
    let calls = 0;
    await expect(
      withBusyRetry(async () => {
        calls += 1;
        throw new ApiRequestError('Calque hors zone sûre.', 422);
      })
    ).rejects.toMatchObject({ status: 422 });
    expect(calls).toBe(1);
  });

  it('abandonne après la borne et conserve la dernière erreur 429', async () => {
    let calls = 0;
    await expect(
      withBusyRetry(
        async () => {
          calls += 1;
          throw new ApiRequestError('Rendu en cours, réessayez.', 429);
        },
        { attempts: 3, delaysMs: [0] }
      )
    ).rejects.toMatchObject({ status: 429 });
    expect(calls).toBe(3);
  });

  it('interrompt immédiatement l attente quand l appelant annule', async () => {
    const controller = new AbortController();
    const pending = withBusyRetry(
      async () => {
        throw new ApiRequestError('Rendu en cours, réessayez.', 429);
      },
      { signal: controller.signal, delaysMs: [10_000] }
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
