import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { creativeSpec, type CreativeSpec } from '@vululu/contracts';
import { ApiRequestError, apiResponse, type ProjectBundle } from '../apps/web/lib/api';
import {
  createPreviewCoordinator,
  nextRenderPollDecision,
  runWithBoundedBusyRetry
} from '../apps/web/lib/studioConcurrency';
import { StudioCanvas } from '../apps/web/components/StudioCanvas';
import { StudioDelivery } from '../apps/web/components/StudioDelivery';
import CreationDelivery from '../apps/web/components/CreationDelivery';
import { executionStatus, projectJourney } from '../apps/web/lib/projectJourney';

function sampleSpec(): CreativeSpec {
  return creativeSpec.parse({
    schemaVersion: 1,
    delivery: { kind: 'square', platform: 'Instagram' },
    width: 1080,
    height: 1080,
    brand: { background: '#101010', accent: '#ffffff' },
    safeArea: 0.05,
    scenes: [
      {
        key: 'SCENE-001',
        seconds: 4,
        layers: [
          {
            type: 'text',
            role: 'headline',
            text: 'Offre spéciale',
            x: 0.08,
            y: 0.15,
            w: 0.84,
            h: 0.18,
            size: 44,
            bold: true,
            color: '#ffffff',
            opacity: 1
          }
        ]
      }
    ]
  });
}

function sampleBundle(overrides?: Partial<ProjectBundle>): ProjectBundle {
  const master = {
    id: 'master-1',
    version: 1,
    checksum: 'sha-master-1',
    qaStatus: 'PASS',
    qaReport: { checks: [{ name: 'mp4', status: 'PASS', detail: 'OK' }] },
    createdAt: '2026-11-24T10:00:00.000Z',
    approval: null
  };
  return {
    project: {
      id: 'proj-1',
      title: 'Campagne Automne',
      objective: 'Conversion',
      platform: 'TikTok',
      format: 'Video',
      sceneDurationSeconds: 5,
      status: 'review',
      storyboardBriefVersion: 1
    },
    context: {
      id: 'ctx-1',
      name: 'Marque',
      audience: 'Clients',
      tone: 'Clair',
      offers: []
    },
    brief: {
      id: 'brief-1',
      version: 1,
      objective: 'Conversion',
      audience: 'Clients',
      tone: 'Clair',
      cta: 'Essayer',
      confirmedVersion: 1,
      confirmedChecksum: 'brief-sha-1',
      revisions: [{ id: 'rev-1', version: 1, checksum: 'brief-sha-1', createdAt: '2026-11-24T09:00:00.000Z' }]
    },
    scenes: [
      {
        id: 's-1',
        sceneKey: 'SCENE-001',
        position: 0,
        title: 'Ouverture',
        description: 'Plan produit',
        durationSeconds: 5,
        versions: [{ id: 'sv-1', version: 1, checksum: 'scene-sha-1', createdAt: '2026-11-24T09:30:00.000Z' }]
      }
    ],
    master,
    masterVersions: [master],
    job: { id: 'job-1', status: 'running', step: 'approval', progress: 85, error: null },
    jobRun: { id: 'run-1', kind: 'produce', status: 'waiting_approval', workflowRunId: 'wf-1', steps: [] },
    messages: [],
    ...overrides
  } as ProjectBundle;
}

describe('Concurrence et reprise bornée côté Studio (429 / 409 / polling)', () => {
  it('extrait code et retryAfterSeconds depuis apiResponse sur 429 creative_busy', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: 'creative_busy',
          message: 'Le moteur de rendu est occupé.',
          retryAfterSeconds: 2
        }),
        {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '2' }
        }
      )
    );
    try {
      await expect(apiResponse('/api/projects/p1/creative/preview', { method: 'POST', body: '{}' })).rejects.toSatisfy(
        (error: unknown) =>
          error instanceof ApiRequestError &&
          error.status === 429 &&
          error.code === 'creative_busy' &&
          error.retryAfterSeconds === 2
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('réessaie de façon strictement bornée un 429 creative_busy, notifie l’attente et n’entre jamais en boucle infinie', async () => {
    const waits: number[] = [];
    const notices: string[] = [];
    let calls = 0;

    const recovered = await runWithBoundedBusyRetry(
      async () => {
        calls += 1;
        if (calls < 3) {
          throw new ApiRequestError('Occupé', 429, 'creative_busy', 2);
        }
        return 'preview-ok';
      },
      {
        maxRetries: 3,
        wait: async (ms) => {
          waits.push(ms);
        },
        onWaiting: (info) => {
          notices.push(info.message);
        }
      }
    );

    expect(recovered).toBe('preview-ok');
    expect(calls).toBe(3);
    expect(waits).toEqual([2000, 2000]);
    expect(notices).toHaveLength(2);
    expect(notices[0]).toContain('(1/3)');

    // Au-delà de maxRetries, l'erreur 429 remonte proprement sans boucle infinie.
    let exhaustedCalls = 0;
    await expect(
      runWithBoundedBusyRetry(
        async () => {
          exhaustedCalls += 1;
          throw new ApiRequestError('Toujours occupé', 429, 'creative_busy', 2);
        },
        {
          maxRetries: 2,
          wait: async () => undefined
        }
      )
    ).rejects.toSatisfy((error: unknown) => error instanceof ApiRequestError && error.status === 429);
    expect(exhaustedCalls).toBe(3); // 1 essai initial + 2 reprises bornées
  });

  it('ne réessaie jamais une erreur 409 job_running ni 422 et interrompt l’attente sur abort', async () => {
    let calls = 0;
    await expect(
      runWithBoundedBusyRetry(
        async () => {
          calls += 1;
          throw new ApiRequestError('Une production est déjà en cours.', 409, 'job_running');
        },
        { wait: async () => undefined }
      )
    ).rejects.toSatisfy((error: unknown) => error instanceof ApiRequestError && error.status === 409);
    expect(calls).toBe(1);

    const controller = new AbortController();
    await expect(
      runWithBoundedBusyRetry(
        async () => {
          throw new ApiRequestError('Occupé', 429, 'creative_busy', 2);
        },
        {
          signal: controller.signal,
          wait: async (_ms, signal) => {
            controller.abort();
            if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
          }
        }
      )
    ).rejects.toThrow();
  });

  it('sérialise les aperçus concurrents dans un même onglet et ignore les requêtes annulées avant le réseau', async () => {
    const coordinator = createPreviewCoordinator();
    let active = 0;
    let peak = 0;
    const order: string[] = [];
    const aborted = new AbortController();
    aborted.abort();

    const p1 = coordinator.schedule(async () => {
      active += 1;
      peak = Math.max(peak, active);
      order.push('start-1');
      await new Promise((resolve) => setTimeout(resolve, 15));
      order.push('end-1');
      active -= 1;
      return 'one';
    });

    const pCancelled = coordinator.schedule(async () => {
      order.push('never');
      return 'cancelled';
    }, aborted.signal);

    const p2 = coordinator.schedule(async () => {
      active += 1;
      peak = Math.max(peak, active);
      order.push('start-2');
      order.push('end-2');
      active -= 1;
      return 'two';
    });

    await expect(pCancelled).rejects.toThrow();
    await expect(Promise.all([p1, p2])).resolves.toEqual(['one', 'two']);
    expect(peak).toBe(1);
    expect(order).toEqual(['start-1', 'end-1', 'start-2', 'end-2']);
  });

  it('borne strictement le suivi de rendu (états terminaux, erreurs répétées, stagnation et Retry-After)', () => {
    expect(nextRenderPollDecision({ state: 'succeeded', unchangedPolls: 0, consecutiveErrors: 0 })).toEqual({
      action: 'stop',
      terminalState: 'succeeded',
      retryable: false,
      reason: null
    });
    expect(nextRenderPollDecision({ state: 'failed', unchangedPolls: 0, consecutiveErrors: 0 })).toEqual({
      action: 'stop',
      terminalState: 'failed',
      retryable: true,
      reason: null
    });
    expect(nextRenderPollDecision({ state: 'running', unchangedPolls: 0, consecutiveErrors: 0 })).toEqual({
      action: 'poll',
      delayMs: 1500
    });
    expect(nextRenderPollDecision({ state: 'running', unchangedPolls: 10, consecutiveErrors: 0 })).toEqual({
      action: 'poll',
      delayMs: 4000
    });
    expect(
      nextRenderPollDecision({
        state: 'running',
        unchangedPolls: 120,
        consecutiveErrors: 0
      })
    ).toMatchObject({
      action: 'stop',
      terminalState: 'stalled',
      retryable: true
    });
    expect(
      nextRenderPollDecision({
        unchangedPolls: 0,
        consecutiveErrors: 1,
        errorStatus: 429,
        retryAfterSeconds: 5
      })
    ).toEqual({ action: 'poll', delayMs: 5000 });
    expect(
      nextRenderPollDecision({
        unchangedPolls: 0,
        consecutiveErrors: 5,
        errorStatus: 503
      })
    ).toMatchObject({
      action: 'stop',
      terminalState: 'offline',
      retryable: true
    });
    expect(
      nextRenderPollDecision({
        unchangedPolls: 0,
        consecutiveErrors: 1,
        errorStatus: 403
      })
    ).toMatchObject({
      action: 'stop',
      terminalState: 'offline',
      retryable: false
    });
  });
});

describe('Affichage synchronisé des états (attente, en cours, terminé, échec réessayable, approbation)', () => {
  it('affiche l’état waiting distinct sur StudioCanvas pendant une attente de créneau serveur', () => {
    const html = renderToStaticMarkup(
      <StudioCanvas
        spec={sampleSpec()}
        sceneIndex={0}
        selected={[]}
        sources={[]}
        channel={undefined}
        preview={{
          url: null,
          state: 'waiting',
          message: 'Serveur de rendu occupé · nouvelle tentative automatique (1/3)…',
          retryable: true
        }}
        busy={false}
        onSelect={() => undefined}
        onGestureStart={() => undefined}
        onGestureEnd={() => undefined}
        onChange={() => undefined}
        onRefreshPreview={() => undefined}
      />
    );
    expect(html).toContain('Serveur de rendu occupé · nouvelle tentative automatique (1/3)…');
  });

  it('distingue explicitement queued, annulation demandée, échec réessayable et suivi interrompu sur StudioDelivery', () => {
    const baseProps = {
      base: '/api/projects/p1/creative',
      view: { version: 2, spec: sampleSpec(), manifest: null, approvedAt: null },
      versions: [{ version: 2, approvedAt: null }],
      expectedVersion: 2,
      dirty: false,
      busy: false,
      onAction: async (fn: () => Promise<void>) => fn(),
      onRender: async () => undefined,
      onApprove: async () => undefined,
      onRestore: async () => undefined,
      onView: async () => undefined,
      onCancel: async () => undefined,
      onRefreshRender: () => undefined,
      onNotice: () => undefined
    };

    const queuedHtml = renderToStaticMarkup(
      <StudioDelivery {...baseProps} renderState={{ revision: 2, state: 'queued', reason: null, progress: 0 }} />
    );
    expect(queuedHtml).toContain('En attente (file)');
    expect(queuedHtml).toContain('Annuler le rendu');

    const cancellingHtml = renderToStaticMarkup(
      <StudioDelivery
        {...baseProps}
        renderState={{ revision: 2, state: 'running', reason: null, progress: 50, cancelRequested: true }}
      />
    );
    expect(cancellingHtml).toContain('Annulation demandée');
    expect(cancellingHtml).toContain('Annulation demandée…');

    const failedHtml = renderToStaticMarkup(
      <StudioDelivery
        {...baseProps}
        renderState={{ revision: 2, state: 'failed', reason: 'Encodeur indisponible.', progress: 30, retryable: true }}
      />
    );
    expect(failedHtml).toContain('Échec · réessayable');
    expect(failedHtml).toContain('Relancer le rendu v2');

    const stalledHtml = renderToStaticMarkup(
      <StudioDelivery
        {...baseProps}
        renderState={{
          revision: 2,
          state: 'stalled',
          reason: 'Le suivi automatique a été mis en pause.',
          progress: 50,
          retryable: true
        }}
      />
    );
    expect(stalledHtml).toContain('Suivi interrompu · réessayable');
    expect(stalledHtml).toContain('Actualiser le suivi');
  });

  it('synchronise CreationDelivery et projectJourney avec jobRun.status (bloque en cours, autorise waiting_approval)', () => {
    const runningBundle = sampleBundle({
      project: {
        id: 'proj-1',
        title: 'Campagne',
        objective: 'Conversion',
        platform: 'TikTok',
        format: 'Video',
        sceneDurationSeconds: 5,
        status: 'review',
        storyboardBriefVersion: 1
      },
      jobRun: { id: 'run-2', kind: 'correct', status: 'recovery_pending', workflowRunId: 'wf-2', steps: [] }
    });
    const runningHtml = renderToStaticMarkup(
      <CreationDelivery bundle={runningBundle} refresh={async () => undefined} />
    );
    expect(runningHtml).toContain('data-testid="approve" disabled=""');
    expect(runningHtml).toContain('Une nouvelle production est en cours');

    const waitingBundle = sampleBundle({
      jobRun: { id: 'run-1', kind: 'produce', status: 'waiting_approval', workflowRunId: 'wf-1', steps: [] }
    });
    const waitingHtml = renderToStaticMarkup(
      <CreationDelivery bundle={waitingBundle} refresh={async () => undefined} />
    );
    expect(waitingHtml).toContain('Run en attente de votre approbation exacte.');
    expect(waitingHtml).not.toContain('data-testid="approve" disabled=""');

    const journeyWaiting = projectJourney(waitingBundle);
    expect(journeyWaiting.stages[3].state).toContain('en attente d’approbation');
    expect(executionStatus('waiting_approval')).toBe('En attente d’approbation');
    expect(executionStatus('recovery_pending')).toBe('Reprise en cours');
    expect(executionStatus('timed_out')).toContain('réessayable');
  });
});
