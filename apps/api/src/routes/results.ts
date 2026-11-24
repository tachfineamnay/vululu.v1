import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@vululu/db';
import { cipher } from '../infrastructure/publishing/service';
import { HttpError } from '../errors';
import { history, report, reminder, monday, purge } from '../infrastructure/results/store';
import { missing, readPost, type MetricsUnavailableReason } from '../infrastructure/results/provider';
import { rateLimitPreHandler } from '../infrastructure/security/rateLimiter';
export async function resultsRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] },
    base = '/api/results';
  app.addHook('onRequest', async (_r, reply) => {
    reply.header('Cache-Control', 'private, no-store');
  });
  let timer: ReturnType<typeof setInterval>;
  app.addHook('onReady', async () => {
    const clean = () => void purge().catch(() => app.log.warn('results retention sweep failed'));
    clean();
    timer = setInterval(clean, 3600000);
    timer.unref();
  });
  app.addHook('onClose', async () => clearInterval(timer));
  app.get(base, auth, (r) => report(r.currentUser!.id));
  app.get(base + '/history', auth, (r) => {
    const q = z
      .union([z.strictObject({ at: z.iso.datetime(), key: z.string().max(300) }), z.strictObject({})])
      .parse(r.query);
    return history(r.currentUser!.id, q.at ? { at: q.at, key: q.key } : undefined);
  });
  app.get(base + '/reminder', auth, (r) => reminder(r.currentUser!.id));
  app.post(base + '/reminder', auth, async (r) => {
    const b = z
        .union([z.strictObject({ enabled: z.boolean() }), z.strictObject({ dismiss: z.literal(true) })])
        .parse(r.body),
      userId = r.currentUser!.id;
    const data =
      'enabled' in b
        ? { reminders: b.enabled, dismissedWeek: null }
        : { dismissedWeek: monday(new Date()).toISOString().slice(0, 10) };
    await prisma.resultPreference.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    return reminder(userId);
  });
  app.post(
    base + '/publications/:id/metrics',
    {
      preHandler: [
        app.authenticate,
        rateLimitPreHandler(
          { name: 'results-read', limit: 20, windowSeconds: 60, failClosed: true },
          (r) => 'results:' + r.currentUser!.id,
        ),
      ],
    },
    async (r) => {
      const userId = r.currentUser!.id,
        id = z.object({ id: z.uuid() }).parse(r.params).id;
      const p = await prisma.publicationRequest.findFirst({
        where: {
          id,
          state: 'PUBLISHED',
          networkReceipt: { not: null },
          creative: { project: { userId } },
          connection: { ownerId: userId, provider: 'postiz' },
        },
        include: { connection: true },
      });
      if (!p) throw new HttpError(404, 'publication_not_found', 'Publication introuvable.');
      const c = p.connection,
        source = 'Postiz · ' + c.platform,
        absent = (unavailableReason: MetricsUnavailableReason) => ({
          metrics: missing(),
          retrievedAt: null,
          source,
          unavailableReason,
        });
      if (!p.remoteId) return absent('missing_remote_id');
      if (process.env.POSTIZ_ANALYTICS_ENABLED !== '1') return absent('analytics_disabled');
      if (c.revoked) return absent('connection_revoked');
      if (c.expiresAt <= new Date()) return absent('connection_expired');
      let token: string;
      try {
        token = cipher.decrypt(c.tokenCipher, c.id + ':token');
      } catch {
        return absent('credentials_unreadable');
      }
      const result = await readPost(p.remoteId, token, fetch, c.platform);
      const stillActive = await prisma.publishingConnection.findFirst({
        where: { id: c.id, ownerId: userId },
        select: { revoked: true, expiresAt: true },
      });
      if (!stillActive || stillActive.revoked) return absent('connection_revoked');
      if (stillActive.expiresAt <= new Date()) return absent('connection_expired');
      if (result.retrievedAt) {
        const { impressions, engagement, clicks } = result.metrics;
        const measured = (n: number | string) => (typeof n === 'number' ? BigInt(n) : null);
        await prisma.$executeRaw`INSERT INTO "PostMeasure" ("requestId",source,"retrievedAt",impressions,engagement,clicks)
          VALUES (${p.id},${result.source},${new Date(result.retrievedAt)},${measured(impressions)},${measured(engagement)},${measured(clicks)})
          ON CONFLICT ("requestId") DO UPDATE SET source=excluded.source,"retrievedAt"=excluded."retrievedAt",
            impressions=excluded.impressions,engagement=excluded.engagement,clicks=excluded.clicks
          WHERE excluded."retrievedAt">="PostMeasure"."retrievedAt"`;
      }
      return result;
    },
  );
}
