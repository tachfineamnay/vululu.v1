import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '@vululu/db';
import { creativeStudio } from '../../application/container';
import type { Manifest } from '../../application/creative';
import { HttpError } from '../../errors';
import { logEvent } from '../../observability/logger';
import { appendStudioEvent } from './studioEvents';

const publicFields = {
  id: true,
  state: true,
  reason: true,
  revision: true,
  progress: true,
  cancelRequested: true,
  attempts: true
} as const;
const lost = 'studio_render_lease_lost';
const cancelledCode = 'creative_render_cancelled';
export const STUDIO_RENDER_MAX_ATTEMPTS = 3;

export type StudioRenderDeps = {
  db?: PrismaClient;
  studio?: Pick<typeof creativeStudio, 'get' | 'render'>;
  emitEvent?: typeof appendStudioEvent;
  newToken?: () => string;
  heartbeatMs?: number;
};

function resolveDeps(deps?: StudioRenderDeps) {
  return {
    db: deps?.db ?? prisma,
    studio: deps?.studio ?? creativeStudio,
    emitEvent: deps?.emitEvent ?? appendStudioEvent,
    newToken: deps?.newToken ?? randomUUID,
    heartbeatMs: deps?.heartbeatMs ?? 15_000
  };
}

export async function renderStatus(
  userId: string,
  projectId: string,
  revision: number,
  deps?: StudioRenderDeps
) {
  const { db, studio } = resolveDeps(deps);
  const row = await studio.get(userId, projectId, revision);
  const job = await db.studioRender.findFirst({
    where: { projectId, revision },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: publicFields
  });
  const state = row.manifest ? 'succeeded' : job?.state ?? 'idle';
  return {
    state,
    reason: row.manifest ? null : job?.reason ?? null,
    progress: row.manifest ? 100 : job?.progress ?? 0,
    cancelRequested: !row.manifest && state === 'running' ? Boolean(job?.cancelRequested) : false,
    retryable: !row.manifest && (state === 'failed' || state === 'cancelled'),
    attempts: job?.attempts ?? 0,
    maxAttempts: STUDIO_RENDER_MAX_ATTEMPTS
  };
}

export async function queueRender(
  userId: string,
  projectId: string,
  revision: number,
  deps?: StudioRenderDeps
) {
  const { db, emitEvent } = resolveDeps(deps);
  const outcome = await db.$transaction(async (tx) => {
    // Serialize submissions and coordinate with the worker's immutable seal on this exact revision.
    const rows = await tx.$queryRaw<{ rendered: boolean }[]>`
      SELECT (r.manifest IS NOT NULL AND r.manifest <> 'null'::jsonb) AS rendered
      FROM "CreativeRevision" r JOIN "Project" p ON p.id = r."projectId"
      WHERE r."projectId" = ${projectId} AND r.version = ${revision} AND p."userId" = ${userId}
      FOR UPDATE OF r`;
    if (!rows.length) throw new HttpError(404, 'creative_not_found', 'Projet ou révision introuvable.');
    if (rows[0].rendered) {
      return {
        created: false,
        job: {
          state: 'succeeded',
          reason: null,
          progress: 100,
          cancelRequested: false,
          retryable: false
        }
      };
    }
    const existing = await tx.studioRender.findFirst({
      where: { projectId, revision, managed: true, state: { in: ['queued', 'running'] } },
      select: publicFields
    });
    if (existing) {
      return {
        created: false,
        job: {
          ...existing,
          retryable: false
        }
      };
    }
    const created = await tx.studioRender.create({
      data: { projectId, revision, managed: true, state: 'queued' },
      select: publicFields
    });
    return {
      created: true,
      job: {
        ...created,
        retryable: false
      }
    };
  });
  if (outcome.created && outcome.job.state === 'queued') {
    await emitEvent(projectId, { kind: 'render', entity: String(revision), state: 'queued' });
  }
  return outcome.job;
}

/** Annulation : immediate si le job est en file, cooperative s'il est en cours. */
export async function cancelRender(
  userId: string,
  projectId: string,
  revision: number,
  deps?: StudioRenderDeps
) {
  const { db, emitEvent } = resolveDeps(deps);
  const result = await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ rendered: boolean }[]>`
      SELECT (r.manifest IS NOT NULL AND r.manifest <> 'null'::jsonb) AS rendered
      FROM "CreativeRevision" r JOIN "Project" p ON p.id = r."projectId"
      WHERE r."projectId" = ${projectId} AND r.version = ${revision} AND p."userId" = ${userId}
      FOR UPDATE OF r`;
    if (!rows.length) throw new HttpError(404, 'creative_not_found', 'Projet ou révision introuvable.');
    if (rows[0].rendered) {
      return { state: 'succeeded', reason: null, progress: 100, cancelRequested: false, retryable: false };
    }
    const order = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];
    const queued = await tx.studioRender.findFirst({
      where: { projectId, revision, managed: true, state: 'queued' },
      orderBy: order,
      select: publicFields
    });
    if (queued) {
      const row = await tx.studioRender.update({
        where: { id: queued.id },
        data: { state: 'cancelled', reason: 'Rendu annulé.', cancelRequested: true },
        select: publicFields
      });
      return {
        state: row.state,
        reason: row.reason,
        progress: row.progress,
        cancelRequested: true,
        retryable: true
      };
    }
    const running = await tx.studioRender.findFirst({
      where: { projectId, revision, managed: true, state: 'running' },
      orderBy: order,
      select: publicFields
    });
    if (running) {
      await tx.studioRender.update({ where: { id: running.id }, data: { cancelRequested: true } });
      return {
        state: running.state,
        reason: null,
        progress: running.progress,
        cancelRequested: true,
        retryable: false
      };
    }
    return { state: 'idle', reason: null, progress: 0, cancelRequested: false, retryable: false };
  });
  if (result.state === 'cancelled') {
    await emitEvent(projectId, { kind: 'render', entity: String(revision), state: 'cancelled' });
  }
  return result;
}

type Claimed = {
  id: string;
  projectId: string;
  revision: number;
  attempts: number;
  cancelRequested?: boolean;
  userId: string;
};

export async function runNextStudioRender(deps?: StudioRenderDeps) {
  const { db, studio, emitEvent, newToken, heartbeatMs } = resolveDeps(deps);
  const token = newToken();
  const [job] = await db.$queryRaw<Claimed[]>`
    WITH candidate AS (
      SELECT id FROM "StudioRender"
      WHERE managed AND (state = 'queued' OR (state = 'running' AND "leaseUntil" <= clock_timestamp()))
      ORDER BY "createdAt", id LIMIT 1 FOR UPDATE SKIP LOCKED
    )
    UPDATE "StudioRender" j SET state = 'running', reason = NULL, "leaseToken" = ${token},
      "leaseUntil" = clock_timestamp() + interval '2 minutes', attempts = attempts + 1
    FROM candidate c, "Project" p WHERE j.id = c.id AND p.id = j."projectId"
    RETURNING j.id, j."projectId", j.revision, j.attempts, j."cancelRequested", p."userId"`;
  if (!job) return false;
  const finish = (state: 'failed' | 'succeeded' | 'cancelled', reason: string | null, manifest?: Manifest) =>
    db.$transaction(async (tx) => {
      // Acquire CreativeRevision before StudioRender to match queueRender/cancelRender lock order
      // and eliminate AB-BA deadlocks during concurrent cancellation and sealing.
      await tx.$queryRaw<{ version: number }[]>`
        SELECT version FROM "CreativeRevision"
        WHERE "projectId" = ${job.projectId} AND version = ${job.revision}
        FOR UPDATE`;
      // Lock the lease before triggering revision/feed updates. A stale worker cannot enter the seal.
      const owned = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "StudioRender" WHERE id = ${job.id} AND "leaseToken" = ${token}
          AND "leaseUntil" > clock_timestamp() FOR UPDATE`;
      if (!owned.length) throw new Error(lost);
      if (manifest) {
        await tx.creativeRevision.updateMany({
          where: {
            projectId: job.projectId,
            version: job.revision,
            OR: [{ manifest: { equals: Prisma.DbNull } }, { manifest: { equals: Prisma.JsonNull } }]
          },
          data: { manifest }
        });
      }
      // Roll back the seal and all terminal side effects if another worker claimed the lease.
      const n = await tx.$executeRaw`
        UPDATE "StudioRender" SET state = ${state}, reason = ${reason}, "leaseToken" = NULL, "leaseUntil" = NULL,
          progress = GREATEST(progress, ${state === 'succeeded' ? 100 : 0})
        WHERE id = ${job.id} AND "leaseToken" = ${token} AND "leaseUntil" > clock_timestamp()`;
      if (!n) throw new Error(lost);
    }).then(async () => {
      await emitEvent(job.projectId, { kind: 'render', entity: String(job.revision), state });
    });
  const heartbeat = setInterval(() => {
    void db.$executeRaw`
      UPDATE "StudioRender" SET "leaseUntil" = clock_timestamp() + interval '2 minutes'
      WHERE id = ${job.id} AND "leaseToken" = ${token} AND "leaseUntil" > clock_timestamp()`
      .catch(() => logEvent('warn', 'studio.render.heartbeat_failed', { jobId: job.id }));
  }, heartbeatMs);
  heartbeat.unref();
  let lastProgress = 0;
  const hooks = {
    onProgress: (percent: number) => {
      if (percent - lastProgress < 5) return;
      lastProgress = percent;
      void db.studioRender
        .updateMany({
          where: { id: job.id, leaseToken: token },
          data: { progress: Math.max(0, Math.min(100, Math.round(percent))) }
        })
        .catch(() => logEvent('warn', 'studio.render.progress_failed', { jobId: job.id }));
    },
    isCancelled: async () => {
      const row = await db.studioRender.findFirst({
        where: { id: job.id, leaseToken: token },
        select: { cancelRequested: true }
      });
      return Boolean(row?.cancelRequested);
    }
  };
  try {
    if (job.cancelRequested) {
      await finish('cancelled', 'Rendu annulé.');
    } else if (job.attempts > STUDIO_RENDER_MAX_ATTEMPTS) {
      await finish('failed', 'Rendu interrompu plusieurs fois. Vous pouvez le relancer.');
    } else {
      let sealed = false;
      await studio.render(
        job.userId,
        job.projectId,
        job.revision,
        async (manifest) => {
          await finish('succeeded', null, manifest);
          sealed = true;
        },
        hooks
      );
      if (!sealed) await finish('succeeded', null); // A sealed historical result is never replaced.
    }
  } catch (error) {
    if (!(error instanceof Error && error.message === lost)) {
      const cancelled = error instanceof Error && error.message === cancelledCode;
      const overflow = error instanceof Error && 'code' in error && error.code === 'media_text_overflow';
      const integrity = error instanceof Error && /^creative_(asset|cache|master)_integrity$/.test(error.message);
      const audio = error instanceof Error && /^media_audio_/.test(error.message);
      const code = cancelled
        ? 'cancelled'
        : overflow
          ? 'text_overflow'
          : integrity
            ? 'integrity'
            : audio
              ? 'audio'
              : 'render_failed';
      logEvent('warn', 'studio.render.failed', { jobId: job.id, code });
      await finish(
        cancelled ? 'cancelled' : 'failed',
        cancelled
          ? 'Rendu annulé.'
          : overflow
            ? 'Texte trop long pour le cadre.'
            : integrity
              ? 'Le rendu n’a pas passé les contrôles d’intégrité. Vérifiez vos médias.'
              : audio
                ? 'La piste audio ne correspond pas à la durée de la vidéo.'
                : 'Rendu non terminé : vérifiez les médias puis réessayez.'
      ).catch(() => logEvent('warn', 'studio.render.finish_failed', { jobId: job.id }));
    }
  } finally {
    clearInterval(heartbeat);
  }
  return true;
}

export function startStudioRenderPump() {
  let running: Promise<boolean | void> | undefined;
  const timer = setInterval(() => {
    if (running) return;
    running = runNextStudioRender()
      .catch(() => logEvent('error', 'studio.render.pump_failed', {}))
      .finally(() => {
        running = undefined;
      });
  }, 1000);
  timer.unref();
  return async () => {
    clearInterval(timer);
    await running;
  };
}
