import {markExport} from '../infrastructure/results/exports';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@vululu/db';
import { creativeStudio } from '../application/container';
import { capabilities, PostizProvider, ProviderFailure, publishingPlatform } from '../infrastructure/publishing/provider';
import { creativeSpec } from '@vululu/contracts';
import {
  attachments,
  compatibleCalendarVersions,
  hasRenderedManifest,
  manualPackage,
  preview,
  problem
} from '../infrastructure/publishing/delivery';
import {
  cipher,
  command,
  ingest,
  prepare,
  reconcilePublication,
  resolveUnknownPublication,
  retryPreparation,
  webhookEnvelope
} from '../infrastructure/publishing/service';
import { cancel } from '../infrastructure/execution/broker';
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
  const baseConnections = '/api/publishing/connections';
  const credentials = z.object({ token: conn.shape.token }).strict();
  const publicConnection = { id: true, platform: true, channel: true, displayName: true, expiresAt: true } as const;
  const enabled = () => process.env.POSTIZ_PUBLISH_ENABLED === '1' && cipher.configured();
  const provider = () => new PostizProvider(fetch, enabled);
  async function upstream<T>(run: () => Promise<T>) {
    try { return await run(); }
    catch (error) {
      if (error instanceof ProviderFailure) return problem(error.reason === 'TOKEN_EXPIRED' ? 422 : 503, error.reason);
      return problem(503, 'postiz_unavailable');
    }
  }
  app.get(baseConnections, auth, async (r, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    return { enabled: enabled(),
      capabilities, connections: await prisma.publishingConnection.findMany({ where: { ownerId: r.currentUser!.id, revoked: false }, select: publicConnection }) };
  });
  app.post(baseConnections + '/discover', { ...auth, bodyLimit: 4096 }, async (r, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    return upstream(() => provider().integrations(credentials.parse(r.body).token, AbortSignal.timeout(10000)));
  });
  app.post(baseConnections + '/authorize', { ...auth, bodyLimit: 4096 }, async (r, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    const b = credentials.extend({ identifier: z.string().max(30) }).parse(r.body);
    return { url: await upstream(() => provider().authorizationUrl(b.token, b.identifier, AbortSignal.timeout(10000))) };
  });
  app.post(baseConnections, { ...auth, bodyLimit: 4096 }, async (r, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    const b = credentials.extend({ channel: conn.shape.channel }).parse(r.body), ownerId = r.currentUser!.id;
    const options = await upstream(() => provider().integrations(b.token, AbortSignal.timeout(10000)));
    const channel = options.find((entry) => entry.id === b.channel);
    if (!channel) return problem(422, 'CHANNEL_MISMATCH');
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${ownerId} FOR UPDATE`;
      const where = { ownerId_provider_channel: { ownerId, provider: 'postiz', channel: b.channel } };
      const existing = await tx.publishingConnection.findUnique({ where });
      if (existing && existing.platform !== channel.platform) return problem(409, 'CHANNEL_MISMATCH');
      const uid = existing?.id ?? randomUUID();
      const update = { displayName: channel.name?.trim() || null, tokenCipher: cipher.encrypt(b.token, uid + ':token'), expiresAt: new Date(Date.now() + 90 * 86400000), revoked: false };
      return tx.publishingConnection.upsert({ where, update, create: { ...update, id: uid, ownerId, provider: 'postiz',
        channel: channel.id, platform: channel.platform, hookCipher: '' }, select: publicConnection });
    });
  });
  app.post('/api/publishing/:id/reconcile', auth, async (r) => {
    try { return await reconcilePublication(r.currentUser!.id, id(r.params), provider()); }
    catch (error) {
      if (error instanceof ProviderFailure) {
        if (error.reason === 'TOKEN_EXPIRED') return problem(409, 'token_expired');
        if (error.reason === 'DISABLED') return problem(409, 'direct_disabled');
        return problem(503, error.reason);
      }
      throw error;
    }
  });
  app.post('/api/publishing/:id/resolve-unknown', auth, (r) => {
    const body = z.object({ resolution: z.enum(['confirmed_absent', 'confirmed_external']) }).strict().parse(r.body);
    return resolveUnknownPublication(r.currentUser!.id, id(r.params), body.resolution);
  });
  app.delete('/api/publishing/connections/:id', auth, async (r) => {
    const uid = id(r.params), owner = r.currentUser!.id;
    const updated = await prisma.publishingConnection.updateMany({
      where: { id: uid, ownerId: owner },
      data: { revoked: true, tokenCipher: '', hookCipher: '' }
    });
    if (!updated.count) return problem(404, 'connection_not_found');
    const jobs = await prisma.publicationRequest.findMany({ where: { connectionId: uid }, select: { submitKey: true, cancelKey: true } });
    const ops = await prisma.executionOperation.findMany({ where: { accountId: owner, key: { in: jobs.flatMap((j) => [j.submitKey, j.cancelKey]) },
      state: { in: ['PROPOSED', 'QUEUED'] }, tool: { in: ['postiz.schedule@1', 'postiz.cancel@1'] } }, select: { id: true } });
    // A claimed operation separately rechecks the live connection immediately before transfer.
    for (const op of ops) { try { await cancel(owner, op.id); } catch { /* Already claimed or completed. */ } }
    return { revoked: true };
  });
  const base = '/api/calendar/:id/publishing';
  app.get(base, auth, async (r) => {
    const owner = r.currentUser!.id,
      item = await prisma.contentItem.findFirst({ where: { id: id(r.params), userId: owner } });
    if (!item) return problem(404, 'item_not_found');
    const compatible = await compatibleCalendarVersions(item);
    const revisions = await prisma.creativeRevision.findMany({
      where: {
        contentItemId: item.id,
        contentVersion: { in: compatible },
        projectId: item.projectId ?? '',
        project: { userId: owner },
        approvedAt: { not: null },
        manifest: { not: Prisma.DbNull }
      },
      orderBy: { version: 'desc' },
      select: { version: true, spec: true, manifest: true }
    });
    const eligibleRevisions = revisions
      .filter((x) => hasRenderedManifest(x.manifest))
      .flatMap((x) => {
        const parsed = creativeSpec.safeParse(x.spec);
        const delivery = parsed.success ? parsed.data.delivery : undefined;
        if (
          !delivery ||
          delivery.calendar?.itemId !== item.id ||
          !compatible.includes(delivery.calendar.version)
        ) {
          return [];
        }
        return [{ revision: x.version, platform: delivery.platform, kind: delivery.kind }];
      });
    const requests = await prisma.publicationRequest.findMany({
      where: { itemId: item.id, connection: { ownerId: owner } },
      select: {
        id: true,
        submitKey: true,
        cancelKey: true,
        revision: true,
        itemVersion: true,
        scheduledAt: true,
        connection: { select: { platform: true, channel: true, displayName: true, revoked: true, expiresAt: true } },
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
    const policy = await prisma.executionAccount.findUnique({ where: { userId: owner }, select: { enabled: true, tools: true } });
    return {
      directEnabled: enabled(),
      scheduleAuthorized: Boolean(policy?.enabled && policy.tools.includes('postiz.schedule@1')),
      revisions: eligibleRevisions,
      connections: await prisma.publishingConnection.findMany({
        where: { ownerId: owner, revoked: false },
        select: publicConnection
      }),
      requests: requests.map(({ cancelKey, submitKey, ...v }) => {
        const submitOp = ops.find((o) => o.key === submitKey);
        const cancelOp = ops.find((o) => o.key === cancelKey);
        const effectiveState =
          ['SENDING', 'CANCELLING'].includes(v.state) &&
          (v.state === 'SENDING' ? submitOp?.state : cancelOp?.state) === 'UNKNOWN'
            ? 'UNKNOWN'
            : v.state;
        return {
          ...v,
          state: effectiveState,
          operationId: submitOp?.id,
          execution: submitOp?.state,
          cancelOperationId: cancelOp?.id,
          cancellation: cancelOp?.state
        };
      })
    };
  });
  // P10 — détail d'une demande : compte exact, états d'exécution, reçu distant et journal.
  app.get('/api/publishing/:id', auth, async (r) => {
    const owner = r.currentUser!.id,
      uid = id(r.params);
    const row = await prisma.publicationRequest.findFirst({
      where: { id: uid, connection: { ownerId: owner }, creative: { project: { userId: owner } } },
      include: {
        connection: { select: { platform: true, channel: true, displayName: true, revoked: true, expiresAt: true } },
        events: { orderBy: { createdAt: 'desc' }, take: 10, select: { eventId: true, createdAt: true } }
      }
    });
    if (!row) return problem(404, 'publication_not_found');
    const ops = await prisma.executionOperation.findMany({
      where: { accountId: owner, key: { in: [row.submitKey, row.cancelKey] } },
      select: { id: true, key: true, state: true, digest: true, maxCents: true, reportedCents: true }
    });
    const { submitKey, cancelKey, ...rest } = row;
    const submission = ops.find((op) => op.key === submitKey) ?? null;
    const cancellation = ops.find((op) => op.key === cancelKey) ?? null;
    const effectiveState =
      ['SENDING', 'CANCELLING'].includes(rest.state) &&
      (rest.state === 'SENDING' ? submission?.state : cancellation?.state) === 'UNKNOWN'
        ? 'UNKNOWN'
        : rest.state;
    return {
      ...rest,
      state: effectiveState,
      submission,
      cancellation
    };
  });
  const params = z.object({ id: z.uuid(), rev: z.coerce.number().int().positive() });
  const target = (q: unknown) => z.object({ target: publishingPlatform.optional() }).parse(q).target;
  app.get(base + '/:rev/preview', auth, async (r) => {
    const { id, rev } = params.parse(r.params);
    const p = await preview(r.currentUser!.id, id, rev, target(r.query));
    const directEnabled = enabled();
    return {
      ...p,
      direct: p.direct && directEnabled,
      directReason: p.directReason ?? (directEnabled ? null : 'direct_disabled')
    };
  });
  let activePackages = 0;
  app.get(base + '/:rev/package', auth, async (r, reply) => {
    const { id, rev } = params.parse(r.params),
      owner = r.currentUser!.id,
      p = await preview(owner, id, rev, target(r.query));
    if (p.issues.some((x) => x !== 'caption_too_long')) return problem(409, 'editorial_approval_required');
    if (activePackages >= 2) return problem(429, 'package_busy');
    activePackages++;
    try {
      markExport(r,reply,id,rev,'Lot de publication');
      return reply
        .header('Cache-Control', 'private, no-store')
        .header('Content-Disposition', `attachment; filename="${p.platform.replaceAll(' ', '-')}-v${rev}.zip"`)
        .type('application/zip')
        .send(manualPackage(p, await attachments(creativeStudio, owner, p)));
    } finally {
      activePackages--;
    }
  });
  app.post(base + '/:rev/prepare', auth, (r) => {
    const { id, rev } = params.parse(r.params);
    if (!enabled()) return problem(409, 'direct_disabled');
    const choice = z.object({ connectionId: z.uuid(), target: publishingPlatform.optional() }).strict().parse(r.body);
    return prepare(r.currentUser!.id, id, rev, choice.connectionId, choice.target);
  });
  app.post('/api/publishing/:id/prepare-cancel', auth, (r) => {
    if (!enabled()) return problem(409, 'direct_disabled');
    return command(r.currentUser!.id, id(r.params), true);
  });
  app.post('/api/publishing/:id/prepare-retry', auth, (r) => {
    if (!enabled()) return problem(409, 'direct_disabled');
    return retryPreparation(r.currentUser!.id, id(r.params));
  });
  app.post(
    '/api/publishing/relay',
    { bodyLimit: 8192, preHandler: [rateLimitPreHandler(rate, (r) => 'pub-relay:' + r.ip)] },
    (r) => ingest(webhookEnvelope.parse(r.body), String(r.headers['x-vululu-signature'] ?? ''))
  );
}
