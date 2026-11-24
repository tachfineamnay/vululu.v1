import { describe, expect, it, vi } from 'vitest';
vi.hoisted(() => {
  process.env.APP_ENV = 'test';
  process.env.V0_TEST_DB = '1';
  process.env.DATABASE_URL_TEST = 'postgresql://vululu@127.0.0.1:55432/vululu_v1_00_test?schema=public';
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
  process.env.SESSION_SECRET = globalThis.crypto.randomUUID();
});

import { CreativeRenderSlot } from '../apps/api/src/infrastructure/creative/renderSlot';
import { HttpError } from '../apps/api/src/errors';
import { buildServer } from '../apps/api/src/server';
import {
  cancelRender,
  queueRender,
  renderStatus,
  runNextStudioRender,
  STUDIO_RENDER_MAX_ATTEMPTS
} from '../apps/api/src/infrastructure/creative/renderJobs';
import { OutboxDispatcher } from '../apps/api/src/infrastructure/durable/outboxDispatcher';
import { PrismaProductionRunRepository } from '../apps/api/src/infrastructure/prisma/productionRunRepository';
import {
  ApplicationError,
  DurableProductionUseCases,
  ProductionUseCases,
  type ApprovalSignalPort,
  type ArtifactVersionRecord,
  type AuditPort,
  type Clock,
  type DurableProductionStore,
  type IdGenerator,
  type JobRunRecord,
  type MasterRepository,
  type PostizPort,
  type ProductionExecutorPort,
  type ProductionRunRepository,
  type ProjectRepository
} from '@vululu/application';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('429 creative_busy — slot de rendu borné et en-tête Retry-After', () => {
  it('borne strictement la concurrence à 2, renvoie 429 creative_busy avec retryAfterSeconds et libère les créneaux', async () => {
    const slot = new CreativeRenderSlot(2, 2);
    const gate1 = deferred<string>();
    const gate2 = deferred<string>();

    const first = slot.run(() => gate1.promise);
    const second = slot.run(() => gate2.promise);
    expect(slot.inFlight).toBe(2);

    await expect(slot.run(async () => 'third')).rejects.toSatisfy((error: unknown) => {
      return (
        error instanceof HttpError &&
        error.statusCode === 429 &&
        error.code === 'creative_busy' &&
        error.retryAfterSeconds === 2
      );
    });

    gate1.resolve('ok-1');
    await expect(first).resolves.toBe('ok-1');
    expect(slot.inFlight).toBe(1);

    // Une fois un créneau libéré, la requête suivante est acceptée immédiatement.
    await expect(slot.run(async () => 'ok-3')).resolves.toBe('ok-3');

    gate2.reject(new Error('boom'));
    await expect(second).rejects.toThrow('boom');
    expect(slot.inFlight).toBe(0);
  });

  it('refuse une requête déjà annulée sans consommer de créneau et mappe media_text_overflow en 422', async () => {
    const slot = new CreativeRenderSlot(2, 2);
    await expect(
      slot.run(async () => 'never', { aborted: () => true })
    ).rejects.toSatisfy(
      (error: unknown) => error instanceof HttpError && error.statusCode === 499 && error.code === 'client_aborted'
    );
    expect(slot.inFlight).toBe(0);

    await expect(
      slot.run(async () => {
        throw Object.assign(new Error('SCENE-001 texte trop long'), { code: 'media_text_overflow' });
      })
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof HttpError &&
        error.statusCode === 422 &&
        error.code === 'creative_text_overflow' &&
        error.message === 'SCENE-001 texte trop long'
    );
    expect(slot.inFlight).toBe(0);
  });

  it('émet l’en-tête HTTP Retry-After et retryAfterSeconds JSON pour HttpError 429', async () => {
    const app = await buildServer();
    app.get('/fixture-creative-busy', async () => {
      throw new HttpError(429, 'creative_busy', 'Le moteur de rendu est occupé. Réessayez dans un instant.', {
        retryAfterSeconds: 2
      });
    });
    try {
      const response = await app.inject({ method: 'GET', url: '/fixture-creative-busy' });
      expect(response.statusCode).toBe(429);
      expect(response.headers['retry-after']).toBe('2');
      expect(response.json()).toEqual({
        error: 'creative_busy',
        message: 'Le moteur de rendu est occupé. Réessayez dans un instant.',
        retryAfterSeconds: 2
      });
    } finally {
      await app.close();
    }
  });
});

describe('renderJobs — idempotence, ordre de verrouillage, annulation et récupération après bail expiré', () => {
  it('déduplique queueRender sur une révision déjà active sans émettre de second événement SSE', async () => {
    const events: string[] = [];
    const existingRow = {
      id: 'render-1',
      state: 'running',
      reason: null,
      revision: 3,
      progress: 40,
      cancelRequested: false,
      attempts: 1
    };

    const tx = {
      $queryRaw: vi.fn(async () => [{ rendered: false }]),
      studioRender: {
        findFirst: vi.fn(async () => existingRow),
        create: vi.fn()
      }
    };
    const db = {
      $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx))
    };

    const status = await queueRender('user-1', 'proj-1', 3, {
      db: db as never,
      emitEvent: async (_projectId, event) => {
        events.push(event.state);
      }
    });

    expect(status).toEqual({
      id: 'render-1',
      state: 'running',
      reason: null,
      revision: 3,
      progress: 40,
      cancelRequested: false,
      attempts: 1,
      retryable: false
    });
    expect(tx.studioRender.create).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it('expose les métadonnées additives cancelRequested/retryable/attempts dans renderStatus et cancelRender', async () => {
    const db = {
      $transaction: vi.fn(async (fn: (client: unknown) => Promise<unknown>) =>
        fn({
          $queryRaw: vi.fn(async () => [{ rendered: false }]),
          studioRender: {
            findFirst: vi
              .fn()
              .mockResolvedValueOnce(null) // queued
              .mockResolvedValueOnce({
                id: 'render-2',
                state: 'running',
                reason: null,
                revision: 2,
                progress: 60,
                cancelRequested: false,
                attempts: 1
              }),
            update: vi.fn(async () => ({}))
          }
        })
      ),
      studioRender: {
        findFirst: vi.fn(async () => ({
          id: 'render-2',
          state: 'failed',
          reason: 'Erreur média.',
          revision: 2,
          progress: 60,
          cancelRequested: false,
          attempts: 2
        }))
      }
    };

    const cancelled = await cancelRender('user-1', 'proj-1', 2, {
      db: db as never,
      emitEvent: vi.fn(async () => undefined)
    });
    expect(cancelled).toEqual({
      state: 'running',
      reason: null,
      progress: 60,
      cancelRequested: true,
      retryable: false
    });

    const failedStatus = await renderStatus('user-1', 'proj-1', 2, {
      db: db as never,
      studio: { get: vi.fn(async () => ({ manifest: null } as never)), render: vi.fn() }
    });
    expect(failedStatus).toEqual({
      state: 'failed',
      reason: 'Erreur média.',
      progress: 60,
      cancelRequested: false,
      attempts: 2,
      maxAttempts: STUDIO_RENDER_MAX_ATTEMPTS,
      retryable: true
    });
  });

  it('acquiert CreativeRevision avant StudioRender dans runNextStudioRender.finish() pour éviter l’interblocage AB-BA', async () => {
    const lockOrder: string[] = [];
    const tx = {
      $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
        const sql = strings.join('?');
        if (sql.includes('"CreativeRevision"')) {
          lockOrder.push('CreativeRevision');
          return [{ version: 2 }];
        }
        if (sql.includes('"StudioRender"')) {
          lockOrder.push('StudioRender');
          return [{ id: 'render-1' }];
        }
        return [];
      }),
      creativeRevision: {
        updateMany: vi.fn(async () => ({ count: 1 }))
      },
      $executeRaw: vi.fn(async () => 1)
    };
    const db = {
      $queryRaw: vi.fn(async () => [
        {
          id: 'render-1',
          projectId: 'proj-1',
          revision: 2,
          attempts: 1,
          cancelRequested: false,
          userId: 'user-1'
        }
      ]),
      $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
      $executeRaw: vi.fn(async () => 1),
      studioRender: {
        findFirst: vi.fn(async () => ({ cancelRequested: false })),
        updateMany: vi.fn(async () => ({ count: 1 }))
      }
    };
    const events: string[] = [];
    const studio = {
      get: vi.fn(),
      render: vi.fn(
        async (
          _userId: string,
          _projectId: string,
          _revision: number,
          seal: (manifest: unknown) => Promise<void>
        ) => {
          await seal({ master: { sha256: 'abc123' } });
          return {} as never;
        }
      )
    };

    const ran = await runNextStudioRender({
      db: db as never,
      studio: studio as never,
      emitEvent: async (_projectId, event) => {
        events.push(event.state);
      },
      newToken: () => 'lease-token-1',
      heartbeatMs: 60_000
    });

    expect(ran).toBe(true);
    expect(lockOrder).toEqual(['CreativeRevision', 'StudioRender']);
    expect(tx.creativeRevision.updateMany).toHaveBeenCalledOnce();
    expect(events).toEqual(['succeeded']);
  });

  it('annule directement un job repris après bail expiré si cancelRequested était déjà demandé', async () => {
    const events: string[] = [];
    const tx = {
      $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
        const sql = strings.join('?');
        if (sql.includes('"CreativeRevision"')) return [{ version: 4 }];
        if (sql.includes('"StudioRender"')) return [{ id: 'render-cancel-1' }];
        return [];
      }),
      creativeRevision: { updateMany: vi.fn() },
      $executeRaw: vi.fn(async () => 1)
    };
    const db = {
      $queryRaw: vi.fn(async () => [
        {
          id: 'render-cancel-1',
          projectId: 'proj-1',
          revision: 4,
          attempts: 2,
          cancelRequested: true,
          userId: 'user-1'
        }
      ]),
      $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
      $executeRaw: vi.fn(async () => 1),
      studioRender: {
        findFirst: vi.fn(),
        updateMany: vi.fn()
      }
    };
    const renderSpy = vi.fn();

    const ran = await runNextStudioRender({
      db: db as never,
      studio: { get: vi.fn(), render: renderSpy },
      emitEvent: async (_projectId, event) => {
        events.push(event.state);
      },
      newToken: () => 'lease-token-2',
      heartbeatMs: 60_000
    });

    expect(ran).toBe(true);
    expect(renderSpy).not.toHaveBeenCalled();
    expect(tx.creativeRevision.updateMany).not.toHaveBeenCalled();
    expect(events).toEqual(['cancelled']);
  });
});

describe('409 job_running — synchronisation démarrage, approbation, transfert et worker durable', () => {
  function createProductionHarness(options?: {
    projectStatus?: string;
    activeRun?: JobRunRecord | null;
    master?: ArtifactVersionRecord | null;
    approval?: {
      id: string;
      artifactVersionId: string;
      checksum: string;
      approvedBy: string;
      invalidatedAt: Date | null;
    } | null;
    existingTransfer?: { id: string; status: string; provider: string; approvalId: string } | null;
    executorStartError?: Error;
  }) {
    const project = {
      id: 'proj-1',
      ownerId: 'user-1',
      contextId: 'ctx-1',
      title: 'Campagne',
      objective: 'Lancement',
      platform: 'TikTok' as const,
      format: 'Video' as const,
      sceneDurationSeconds: 5,
      status: options?.projectStatus ?? 'review',
      storyboardBriefVersion: 1
    };
    const validSha = 'a'.repeat(64);
    const master: ArtifactVersionRecord | null =
      options?.master === undefined
        ? {
            id: 'master-1',
            artifactId: 'art-1',
            version: 1,
            masterPath: '/tmp/master.mp4',
            checksum: validSha,
            qaStatus: 'PASS',
            qaReport: null
          }
        : options.master;

    const failStart = vi.fn(async () => undefined);
    const completeWaitingApprovalRun = vi.fn(async () => undefined);
    const signal = vi.fn(async () => undefined);
    const updateStatus = vi.fn(async () => undefined);
    const createOrUpdateApproval = vi.fn(async () => ({
      id: 'app-1',
      artifactVersionId: master?.id ?? 'master-1',
      checksum: master?.checksum ?? 'sha-master-1',
      approvedBy: 'user-1',
      invalidatedAt: null
    }));
    const transferPostiz = vi.fn(async () => ({
      id: 'tr-1',
      approvalId: 'app-1',
      provider: 'postiz-mock',
      status: 'submitted'
    }));

    const projects = {
      findOwned: vi.fn(async () => project),
      updateStatus,
      findLatestBrief: vi.fn(async () => ({
        id: 'brief-1',
        projectId: 'proj-1',
        version: 1,
        objective: 'Lancement',
        audience: 'Clients',
        tone: 'Clair',
        cta: 'Essayer',
        settings: {
          schemaVersion: 1,
          profileVersion: 'v1-demo-2026-11-04',
          ratio: '9:16',
          defaultSceneDurationSeconds: 5,
          visualStyle: 'editorial',
          direction: '',
          maxMockCents: 1000,
          audio: {
            voiceVersionId: null,
            musicVersionId: null,
            spokenText: '',
            voiceGainDb: -3,
            musicGainDb: -18,
            ducking: true
          }
        },
        confirmedVersion: 1,
        confirmedChecksum: 'brief-sha-1',
        revisions: [{ id: 'rev-1', version: 1, checksum: 'brief-sha-1' }]
      })),
      listScenes: vi.fn(async () => [
        { id: 's-1', sceneKey: 'SCENE-001', position: 0, durationSeconds: 5, prompt: 'Intro' }
      ])
    } as unknown as ProjectRepository;

    const production = {
      latestMaster: vi.fn(async () => master),
      findApproval: vi.fn(async () => options?.approval ?? null),
      createOrUpdateApproval,
      findTransfer: vi.fn(async () => options?.existingTransfer ?? null)
    } as unknown as MasterRepository;

    const runs = {
      startRun: vi.fn(async () => ({
        jobRun: { id: 'run-new', projectId: 'proj-1', kind: 'produce', status: 'queued', workflowRunId: null },
        job: { id: 'job-new', projectId: 'proj-1', status: 'queued', step: 'snapshot', progress: 0 }
      })),
      updateJob: vi.fn(async () => undefined),
      updateStep: vi.fn(async () => undefined),
      findActiveByProject: vi.fn(async () => options?.activeRun ?? null),
      failStart,
      completeWaitingApprovalRun
    } as unknown as ProductionRunRepository;

    const executor: ProductionExecutorPort = {
      start: vi.fn(async () => {
        if (options?.executorStartError) throw options.executorStartError;
      })
    };
    const postiz: PostizPort = { transfer: transferPostiz };
    const audit: AuditPort = { record: vi.fn(async () => undefined) };
    const clock: Clock = { now: () => new Date('2026-11-24T12:00:00.000Z') };
    const ids: IdGenerator = { next: () => 'id-1' };
    const approvalSignal: ApprovalSignalPort = { signal };

    const useCases = new ProductionUseCases(
      projects,
      runs,
      executor,
      production,
      postiz,
      audit,
      clock,
      ids,
      { approvalSignal }
    );

    return {
      useCases,
      failStart,
      completeWaitingApprovalRun,
      signal,
      updateStatus,
      createOrUpdateApproval,
      transferPostiz
    };
  }

  it('libère le JobRun via failStart si executor.start échoue au lancement (évite un 409 job_running permanent)', async () => {
    const harness = createProductionHarness({
      projectStatus: 'storyboard_ready',
      executorStartError: new Error('queue_dispatch_down')
    });

    await expect(
      harness.useCases.startProduction({ id: 'user-1', role: 'user' }, 'proj-1')
    ).rejects.toThrow('queue_dispatch_down');

    expect(harness.failStart).toHaveBeenCalledWith({
      jobRunId: 'run-new',
      jobId: 'job-new',
      projectId: 'proj-1',
      error: 'queue_dispatch_down'
    });
  });

  it('rejette approve() et transfer() en 409 job_running pendant un run actif en cours (queued/running/recovery_pending)', async () => {
    const validSha = 'a'.repeat(64);
    for (const status of ['queued', 'running', 'recovery_pending']) {
      const harness = createProductionHarness({
        projectStatus: status === 'running' ? 'producing' : 'review',
        activeRun: { id: 'run-1', projectId: 'proj-1', kind: 'produce', status, workflowRunId: 'wf-1' },
        approval: {
          id: 'app-1',
          artifactVersionId: 'master-1',
          checksum: validSha,
          approvedBy: 'user-1',
          invalidatedAt: null
        }
      });

      await expect(
        harness.useCases.approve({ id: 'user-1', role: 'user' }, 'proj-1', 'master-1', validSha)
      ).rejects.toSatisfy(
        (error: unknown) => error instanceof ApplicationError && error.statusCode === 409 && error.code === 'job_running'
      );

      await expect(
        harness.useCases.transfer({ id: 'user-1', role: 'user' }, 'proj-1')
      ).rejects.toSatisfy(
        (error: unknown) => error instanceof ApplicationError && error.statusCode === 409 && error.code === 'job_running'
      );

      expect(harness.signal).not.toHaveBeenCalled();
      expect(harness.completeWaitingApprovalRun).not.toHaveBeenCalled();
    }
  });

  it('autorise approve() sur un run waiting_approval, envoie le signal et clôture le run lors du transfer()', async () => {
    const validSha = 'a'.repeat(64);
    const activeRun: JobRunRecord = {
      id: 'run-wait-1',
      projectId: 'proj-1',
      kind: 'produce',
      status: 'waiting_approval',
      workflowRunId: 'wf-1'
    };
    const harness = createProductionHarness({
      projectStatus: 'review',
      activeRun,
      approval: {
        id: 'app-1',
        artifactVersionId: 'master-1',
        checksum: validSha,
        approvedBy: 'user-1',
        invalidatedAt: null
      }
    });

    await harness.useCases.approve({ id: 'user-1', role: 'user' }, 'proj-1', 'master-1', validSha);
    expect(harness.signal).toHaveBeenCalledWith({
      jobRunId: 'run-wait-1',
      projectId: 'proj-1',
      artifactVersionId: 'master-1',
      checksum: validSha,
      approvedBy: 'user-1'
    });

    const transferred = await harness.useCases.transfer({ id: 'user-1', role: 'user' }, 'proj-1');
    expect(transferred.transfer.id).toBe('tr-1');
    expect(harness.completeWaitingApprovalRun).toHaveBeenCalledWith(
      expect.objectContaining({
        jobRunId: 'run-wait-1',
        projectId: 'proj-1',
        outputs: expect.objectContaining({
          transferId: 'tr-1',
          artifactVersionId: 'master-1',
          checksum: validSha
        })
      })
    );
  });

  it('rend DurableProductionUseCases.confirmApproval et transfer idempotents si le run est déjà succeeded', async () => {
    const validSha = 'a'.repeat(64);
    const savedOutputs: Record<string, unknown> = {};
    const transitionStep = vi.fn(async () => undefined);
    const store = {
      loadRun: vi.fn(async () => ({
        jobRunId: 'run-done',
        jobId: 'job-done',
        projectId: 'proj-1',
        kind: 'produce',
        status: 'succeeded',
        snapshot: null
      })),
      getStepOutput: vi.fn(async (_id: string, step: string) => savedOutputs[step] ?? null),
      saveStepOutput: vi.fn(async (_id: string, step: string, output: unknown) => {
        savedOutputs[step] = output;
      }),
      transitionStep
    } as unknown as DurableProductionStore;

    const masterRepo = {
      latestMaster: vi.fn(async () => ({
        id: 'master-1',
        artifactId: 'art-1',
        version: 1,
        masterPath: '/tmp/master.mp4',
        checksum: validSha,
        qaStatus: 'PASS',
        qaReport: null
      })),
      findApproval: vi.fn(async () => ({
        id: 'app-1',
        artifactVersionId: 'master-1',
        checksum: validSha,
        approvedBy: 'user-1',
        invalidatedAt: null
      })),
      findTransfer: vi.fn(async () => ({
        id: 'tr-1',
        approvalId: 'app-1',
        provider: 'postiz-mock',
        status: 'acknowledged'
      }))
    } as unknown as MasterRepository;

    const postiz: PostizPort = { transfer: vi.fn() };
    const durable = new DurableProductionUseCases(
      store,
      {} as never,
      {} as never,
      {} as never,
      masterRepo,
      postiz,
      { record: vi.fn(async () => undefined) },
      { now: () => new Date('2026-11-24T12:00:00.000Z') },
      '/tmp/vululu-test-artifacts'
    );

    const approvalOut = await durable.confirmApproval({
      jobRunId: 'run-done',
      artifactVersionId: 'master-1',
      checksum: validSha,
      approvedBy: 'user-1'
    });
    expect(approvalOut).toEqual({
      artifactVersionId: 'master-1',
      checksum: validSha,
      approvedBy: 'user-1'
    });

    const transferOut = await durable.transfer('run-done');
    expect(transferOut).toEqual({ transferId: 'tr-1', status: 'acknowledged' });
    expect(transitionStep).not.toHaveBeenCalled();
    expect(postiz.transfer).not.toHaveBeenCalled();
  });

  it('vérifie la garde stricte waiting_approval -> succeeded dans PrismaProductionRunRepository.completeWaitingApprovalRun', async () => {
    const events: unknown[] = [];
    const projectUpdates: unknown[] = [];
    let currentStatus = 'running';
    const tx = {
      jobRun: {
        findUnique: vi.fn(async () => ({ status: currentStatus })),
        updateMany: vi.fn(async () => ({ count: 1 }))
      },
      runStateEvent: {
        create: vi.fn(async (args: unknown) => {
          events.push(args);
        })
      },
      productionJob: { updateMany: vi.fn(async () => ({ count: 1 })) },
      stepRun: { updateMany: vi.fn(async () => ({ count: 2 })) },
      project: {
        update: vi.fn(async (args: unknown) => {
          projectUpdates.push(args);
        })
      }
    };
    const db = {
      $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx))
    };
    const repo = new PrismaProductionRunRepository(db as never);

    // Jamais de contournement d'un run en cours : 409 job_running garanti.
    await expect(
      repo.completeWaitingApprovalRun({ jobRunId: 'run-1', projectId: 'proj-1', outputs: { transferId: 'tr-1' } })
    ).rejects.toSatisfy(
      (error: unknown) => error instanceof ApplicationError && error.statusCode === 409 && error.code === 'job_running'
    );
    expect(events).toHaveLength(0);

    // En état waiting_approval, transition propre vers succeeded + RunStateEvent + statut projet transferred.
    currentStatus = 'waiting_approval';
    await repo.completeWaitingApprovalRun({ jobRunId: 'run-1', projectId: 'proj-1', outputs: { transferId: 'tr-1' } });
    expect(events).toHaveLength(1);
    expect(projectUpdates).toEqual([{ where: { id: 'proj-1' }, data: { status: 'transferred' } }]);
  });

  it('marque un outbox approval_signal comme dispatched si le JobRun est déjà succeeded (évite les retries inutiles)', async () => {
    const outboxUpdate = vi.fn(async () => ({}));
    const row = {
      id: 'outbox-1',
      idempotencyKey: 'approval-1',
      kind: 'approval_signal',
      jobRunId: 'run-done',
      payload: { projectId: 'proj-1', artifactVersionId: 'master-1', checksum: 'a'.repeat(64), approvedBy: 'user-1' },
      status: 'pending',
      attempts: 0,
      nextAttemptAt: new Date(Date.now() - 1000)
    };
    const db = {
      orchestrationOutbox: {
        findMany: vi.fn(async () => [row]),
        updateMany: vi.fn(async () => ({ count: 1 })),
        findUnique: vi.fn(async () => ({ ...row, status: 'dispatching' })),
        update: outboxUpdate
      },
      jobRun: {
        findUnique: vi.fn(async () => ({
          id: 'run-done',
          projectId: 'proj-1',
          status: 'succeeded',
          workflowRunId: 'wf-done'
        })),
        findFirst: vi.fn()
      }
    };
    const hatchet = { runWorkflow: vi.fn(), pushEvent: vi.fn() };
    const dispatcher = new OutboxDispatcher(hatchet as never, db as never);

    const count = await dispatcher.dispatchPending();
    expect(count).toBe(1);
    expect(hatchet.pushEvent).not.toHaveBeenCalled();
    expect(outboxUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'outbox-1' },
        data: expect.objectContaining({ status: 'dispatched', workflowRunId: 'wf-done' })
      })
    );
  });
});
