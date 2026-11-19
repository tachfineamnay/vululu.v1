import {markExport} from '../infrastructure/results/exports';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@vululu/db';
import { creativeStudio } from '../application/container';
import { creativeSpec } from '@vululu/contracts';
import { attachments, manualPackage, preview, problem } from '../infrastructure/publishing/delivery';
import {
  cipher,
  command,
  ingest,
  prepare,
  retryPreparation,
  webhookEnvelope
} from '../infrastructure/publishing/service';
import { rateLimitPreHandler } from '../infrastructure/security/rateLimiter';
export async function publishingRoutes(app: FastifyInstance) {
  const rate = { name: 'publishing', limit: 40, windowSeconds: 60, failClosed: true };
  const auth = {
    preHandler: [app.authenticate, rateLimitPreHandler(rate, (r) => 'publishing:' + r.currentUser!.id)]
  };
  const id = (p: unknown) => z.object({ id: z.uuid() }).parse(p).id;
  const conn = z
    .object({
      ownerId: z.string().min(1).max(128),
      channel: z.string().regex(/^[\w-]{1,160}$/),
      token: z
        .string()
        .min(8)
        .max(2048)
        .regex(/^[\x21-\x7e]+$/),
      relayKey: z.string().min(32).max(256),
      expiresAt: z.iso.datetime()
    })
    .strict();
  const admin = {
    preHandler: [app.requireSuperAdmin, rateLimitPreHandler(rate, (r) => 'pub-admin:' + r.currentUser!.id)]
  };
  app.post('/api/admin/publishing/connections', admin, async (r) => {
    const b = conn.parse(r.body),
      uid = randomUUID();
    if (Date.parse(b.expiresAt) <= Date.now()) return problem(400, 'token_expired');
    return prisma.publishingConnection.create({
      data: {
        id: uid,
        ownerId: b.ownerId,
        provider: 'postiz',
        platform: 'LinkedIn',
        channel: b.channel,
        expiresAt: new Date(b.expiresAt),
        tokenCipher: cipher.encrypt(b.token, uid + ':token'),
        hookCipher: cipher.encrypt(b.relayKey, uid + ':relay')
      },
      select: { id: true, platform: true, channel: true, expiresAt: true }
    });
  });
  app.put('/api/admin/publishing/connections/:id/credential', admin, async (r) => {
    const uid = id(r.params),
      b = conn.pick({ token: true, expiresAt: true }).parse(r.body);
    if (Date.parse(b.expiresAt) <= Date.now()) return problem(400, 'token_expired');
    return prisma.publishingConnection.update({
      where: { id: uid, revoked: false },
      data: { tokenCipher: cipher.encrypt(b.token, uid + ':token'), expiresAt: new Date(b.expiresAt) },
      select: { id: true, expiresAt: true }
    });
  });
  app.delete('/api/publishing/connections/:id', auth, async (r) => {
    const updated = await prisma.publishingConnection.updateMany({
      where: { id: id(r.params), ownerId: r.currentUser!.id },
      data: { revoked: true, tokenCipher: '', hookCipher: '' }
    });
    if (!updated.count) return problem(404, 'connection_not_found');
    return { revoked: true };
  });
  const base = '/api/calendar/:id/publishing';
  app.get(base, auth, async (r) => {
    const owner = r.currentUser!.id,
      item = await prisma.contentItem.findFirst({ where: { id: id(r.params), userId: owner } });
    if (!item) return problem(404, 'item_not_found');
    const revisions = await prisma.creativeRevision.findMany({
      where: {
        contentItemId: item.id,
        contentVersion: item.version,
        project: { userId: owner },
        approvedAt: { not: null }
      },
      orderBy: { version: 'desc' },
      select: { version: true, spec: true }
    });
    const requests = await prisma.publicationRequest.findMany({
      where: { itemId: item.id, connection: { ownerId: owner } },
      select: {
        id: true,
        submitKey: true,
        cancelKey: true,
        revision: true,
        itemVersion: true,
        state: true,
        remoteId: true,
        networkReceipt: true,
        reason: true
      }
    });
    const ops = await prisma.executionOperation.findMany({
      where: { accountId: owner, key: { in: requests.flatMap((x) => [x.submitKey, x.cancelKey]) } },
      select: { id: true, key: true, state: true }
    });
    return {
      revisions: revisions.map((x) => ({
        revision: x.version,
        platform: creativeSpec.parse(x.spec).delivery?.platform
      })),
      connections: await prisma.publishingConnection.findMany({
        where: { ownerId: owner, revoked: false },
        select: { id: true, platform: true, channel: true, expiresAt: true }
      }),
      requests: requests.map(({ cancelKey, submitKey, ...v }) => ({
        ...v,
        state:
          ['SENDING', 'CANCELLING'].includes(v.state) &&
          ops.find((o) => o.key === (v.state === 'SENDING' ? submitKey : cancelKey))?.state === 'UNKNOWN'
            ? 'UNKNOWN'
            : v.state,
        operationId: ops.find((o) => o.key === submitKey)?.id,
        execution: ops.find((o) => o.key === submitKey)?.state,
        cancellation: ops.find((o) => o.key === cancelKey)?.state
      }))
    };
  });
  const params = z.object({ id: z.uuid(), rev: z.coerce.number().int().positive() });
  app.get(base + '/:rev/preview', auth, async (r) => {
    const { id, rev } = params.parse(r.params);
    const p = await preview(r.currentUser!.id, id, rev);
    return { ...p, direct: p.direct && process.env.POSTIZ_PUBLISH_ENABLED === '1' };
  });
  let activePackages = 0;
  app.get(base + '/:rev/package', auth, async (r, reply) => {
    const { id, rev } = params.parse(r.params),
      owner = r.currentUser!.id,
      p = await preview(owner, id, rev);
    if (p.issues.length) return problem(409, p.issues[0]);
    if (activePackages >= 2) return problem(429, 'package_busy');
    activePackages++;
    try {
      markExport(r,reply,id,rev,'Lot de publication');
      return reply
        .header('Cache-Control', 'private, no-store')
        .header('Content-Disposition', `attachment; filename="${p.platform}-v${rev}.zip"`)
        .type('application/zip')
        .send(manualPackage(p, await attachments(creativeStudio, owner, p)));
    } finally {
      activePackages--;
    }
  });
  app.post(base + '/:rev/prepare', auth, (r) => {
    const { id, rev } = params.parse(r.params);
    if (process.env.POSTIZ_PUBLISH_ENABLED !== '1') return problem(409, 'direct_disabled');
    return prepare(
      r.currentUser!.id,
      id,
      rev,
      z.object({ connectionId: z.uuid() }).strict().parse(r.body).connectionId
    );
  });
  app.post('/api/publishing/:id/prepare-cancel', auth, (r) => command(r.currentUser!.id, id(r.params), true));
  app.post('/api/publishing/:id/prepare-retry', auth, (r) => {
    if (process.env.POSTIZ_PUBLISH_ENABLED !== '1') return problem(409, 'direct_disabled');
    return retryPreparation(r.currentUser!.id, id(r.params));
  });
  app.post(
    '/api/publishing/relay',
    { bodyLimit: 8192, preHandler: [rateLimitPreHandler(rate, (r) => 'pub-relay:' + r.ip)] },
    (r) => ingest(webhookEnvelope.parse(r.body), String(r.headers['x-vululu-signature'] ?? ''))
  );
}
