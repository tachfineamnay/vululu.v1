import type { FastifyInstance } from 'fastify';
import { Readable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import type { Prisma } from '@prisma/client';
import { prisma } from '@vululu/db';
import { z } from 'zod';
import { HttpError } from '../errors';
import { capability } from '../infrastructure/mediaGeneration/providers';
type Tx = Prisma.TransactionClient;
type Access = { user: string; session: string; project: string };
async function guard(tx: Tx, a: Access) {
  if (
    !(await tx.session.count({
      where: { id: a.session, userId: a.user, revokedAt: null, expiresAt: { gt: new Date() } },
    }))
  )
    throw new HttpError(401, 'session_expired', 'Session expirée.');
  if (!(await tx.project.count({ where: { id: a.project, userId: a.user } })))
    throw new HttpError(404, 'project_not_found', 'Projet inaccessible.');
}
const read = <T>(a: Access, fn: (tx: Tx) => Promise<T>) =>
  prisma.$transaction(
    async (tx) => {
      await guard(tx, a);
      return fn(tx);
    },
    { isolationLevel: 'RepeatableRead' },
  );
const head = async (tx: Tx, id: string) =>
  (await tx.studioClock.findUnique({ where: { projectId: id } }))?.cursor ?? 0;
export const readBatch = (a: Access, after: number) =>
  read(a, async (tx) => {
    const cursor = await head(tx, a.project);
    const rows = await tx.studioEvent.findMany({
      where: { projectId: a.project, cursor: { gt: after } },
      orderBy: { cursor: 'asc' },
      take: 50,
    });
    return { cursor, reset: after > cursor || (after < cursor && rows[0]?.cursor !== after + 1), rows };
  });
export const studioState = (a: Access) =>
  read(a, async (tx) => {
    const projectId = a.project,
      where = { projectId },
      cursor = await head(tx, projectId);
    const project = await tx.project.findUniqueOrThrow({
      where: { id: projectId },
      select: {
        campaign: { select: { name: true } },
        context: { select: { name: true, offers: { select: { name: true }, take: 5 } } },
      },
    });
    const revisions = await tx.creativeRevision.findMany({
      where,
      orderBy: { version: 'desc' },
      select: { version: true, approvedAt: true },
      take: 15,
    });
    const operations = await tx.executionOperation.findMany({
      where: { ...where, accountId: a.user },
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: {
        id: true,
        tool: true,
        state: true,
        revision: true,
        costState: true,
        maxCents: true,
        reportedCents: true,
      },
    });
    const renders = await tx.studioRender.findMany({ where, orderBy: { createdAt: 'desc' }, take: 8 });
    const media = await tx.mediaGeneration.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, sceneKey: true, state: true, model: true, revision: true },
    });
    const events = await tx.studioEvent.findMany({
      where,
      orderBy: { cursor: 'desc' },
      take: 10,
      select: { cursor: true, kind: true, state: true, createdAt: true },
    });
    return {
      cursor,
      project,
      revisions,
      operations,
      renders,
      media,
      events,
      providers: [capability('image'), capability('video')].map(({ kind, model, availability }) => ({
        kind,
        model,
        availability,
      })),
    };
  });
const cursorSchema = z
  .string()
  .regex(/^\d{1,10}$/)
  .transform(Number)
  .pipe(z.int().min(0).max(2147483647));
export async function studioRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] },
    params = z.object({ id: z.string().min(1).max(128) }),
    path = '/api/projects/:id/studio',
    active = new Map<string, number>();
  app.get(path + '/state', auth, (r, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    return studioState({
      user: r.currentUser!.id,
      session: r.authSession!.id,
      project: params.parse(r.params).id,
    });
  });
  app.get(path + '/stream', auth, async (r, reply) => {
    const a = { user: r.currentUser!.id, session: r.authSession!.id, project: params.parse(r.params).id };
    let after = cursorSchema.parse(
      r.headers['last-event-id'] ?? z.object({ after: z.string().optional() }).parse(r.query).after ?? '0',
    );
    let batch = await readBatch(a, after);
    if ((active.get(a.user) ?? 0) >= 4 || active.size >= 256)
      throw new HttpError(429, 'stream_limit', 'Limite de flux atteinte.');
    active.set(a.user, (active.get(a.user) ?? 0) + 1);
    const ctrl = new AbortController();
    const close = () => {
      if (ctrl.signal.aborted) return;
      ctrl.abort();
      const n = (active.get(a.user) ?? 1) - 1;
      if (n) active.set(a.user, n);
      else active.delete(a.user);
    };
    reply.raw.once('close', close);
    async function* frames() {
      try {
        yield ': connected\n\n';
        while (!ctrl.signal.aborted) {
          if (batch.reset) {
            yield `event: reset\ndata: {}\n\n`;
            return;
          }
          for (const { cursor, kind, entity, state } of batch.rows) {
            yield `id: ${cursor}\nevent: change\ndata: ${JSON.stringify({ version: 1, cursor, kind, entity, state })}\n\n`;
            after = cursor;
          }
          if (after >= batch.cursor) {
            yield ': heartbeat\n\n';
            await delay(2000, undefined, { signal: ctrl.signal });
          }
          batch = await readBatch(a, after);
        }
      } catch (e) {
        if (!ctrl.signal.aborted && e instanceof HttpError) yield `event: denied\ndata: ${e.statusCode}\n\n`;
      } finally {
        close();
      }
    }
    return reply
      .header('Cache-Control', 'private, no-cache, no-transform')
      .header('X-Accel-Buffering', 'no')
      .type('text/event-stream; charset=utf-8')
      .send(Readable.from(frames()));
  });
}
