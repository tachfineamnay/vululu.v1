import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@vululu/db';
import type { CreativeStudio } from '../../application/creative';
import { AesProviderCredentialCipher } from '../security/providerCredentialCipher';
import { propose } from '../execution/broker';
import { preview, attachments, problem } from './delivery';
import { capabilities, publishingPlatform, ProviderFailure, PostizProvider, type PublishingProvider, type PublishingPlatform } from './provider';
export const cipher = new AesProviderCredentialCipher(() => process.env.PUBLISHING_ENCRYPTION_KEY);
export async function prepare(owner: string, itemId: string, rev: number, connectionId: string, target?: PublishingPlatform) {
  const c = await prisma.publishingConnection.findFirst({
    where: { id: connectionId, ownerId: owner, provider: 'postiz', revoked: false }
  });
  if (!c) return problem(404, 'connection_not_found');
  if (c.expiresAt <= new Date()) return problem(409, 'token_expired');
  const p = await preview(owner, itemId, rev, target);
  if (p.platform !== c.platform) return problem(409, 'CHANNEL_MISMATCH');
  if (!p.direct || p.issues.length || Date.parse(p.when) <= Date.now()) return problem(409, 'not_schedulable');
  const r = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ContentItem" WHERE id=${itemId} FOR UPDATE`;
    const other = await tx.publicationRequest.findFirst({ where: {
      itemId, connectionId, itemVersion: { not: p.itemVersion },
      state: { in: ['SENDING', 'SUBMITTED', 'CANCELLING', 'PUBLISHED', 'UNKNOWN'] }
    } });
    if (other) return problem(409, 'existing_publication');
    const request = await tx.publicationRequest.upsert({
      where: { itemId_itemVersion_connectionId: { itemId, itemVersion: p.itemVersion, connectionId } },
      create: { id: randomUUID(), submitKey: randomUUID(), cancelKey: randomUUID(), projectId: p.projectId,
        revision: rev, itemId, itemVersion: p.itemVersion, connectionId, scheduledAt: new Date(p.when) },
      update: {}
    });
    if (request.state === 'PREPARED' && request.revision === rev && await tx.executionOperation.count({ where: {
      accountId: owner, projectId: p.projectId, key: request.submitKey, tool: 'postiz.schedule@1', state: 'CANCELLED'
    } })) return tx.publicationRequest.update({ where: { id: request.id }, data: { submitKey: randomUUID() } });
    return request;
  });
  if (r.revision !== rev) return problem(409, 'revision_conflict');
  return command(owner, r.id, false);
}
export async function command(owner: string, id: string, cancelling: boolean) {
  const r = await prisma.publicationRequest.findFirst({
    where: { id, connection: { ownerId: owner }, creative: { project: { userId: owner } } }
  });
  if (!r) return problem(404, 'publication_not_found');
  if (cancelling && r.state !== 'SUBMITTED') return problem(409, 'not_submitted');
  const operation = await propose(owner, r.projectId, {
    key: cancelling ? r.cancelKey : r.submitKey,
    tool: cancelling ? 'postiz.cancel@1' : 'postiz.schedule@1',
    revision: r.revision
  });
  return { id: r.id, operationId: operation.id, digest: operation.digest, state: operation.state };
}
export async function retryPreparation(owner: string, id: string) {
  const row = await prisma.publicationRequest.findFirst({
    where: { id, connection: { ownerId: owner, revoked: false, expiresAt: { gt: new Date() } } },
    include: { connection: { select: { platform: true } } }
  });
  if (!row) return problem(404, 'connection_not_found');
  if (
    row.state === 'FAILED' &&
    ['TOKEN_EXPIRED', 'CHANNEL_MISMATCH', 'DISABLED'].includes(row.reason ?? '')
  ) {
    await prisma.publicationRequest.updateMany({
      where: { id, state: 'FAILED', submitKey: row.submitKey },
      data: { submitKey: randomUUID(), state: 'PREPARED', reason: null }
    });
  } else if (row.state !== 'PREPARED') return problem(409, 'unsafe_retry');
  return prepare(owner, row.itemId, row.revision, row.connectionId, publishingPlatform.parse(row.connection.platform));
}
export async function dispatchPublication(
  job: { id: string; accountId: string; projectId: string; revision: number; tool: string },
  studio: CreativeStudio,
  provider: PublishingProvider,
  signal: AbortSignal
): Promise<{ costCents: number; costBasis: 'none' }> {
  const op = await prisma.executionOperation.findFirst({
    where: {
      id: job.id,
      state: 'CLAIMED',
      accountId: job.accountId,
      approvedBy: job.accountId,
      tool: job.tool,
      revision: job.revision,
      projectId: job.projectId
    }
  });
  if (!op) return problem(403, 'operation_not_claimed');
  const cancel = job.tool === 'postiz.cancel@1';
  const r = await prisma.publicationRequest.findFirst({
    where: {
      ...(cancel ? { cancelKey: op.key } : { submitKey: op.key }),
      connection: { ownerId: job.accountId },
      projectId: job.projectId,
      revision: job.revision
    },
    include: { connection: true }
  });
  if (!r) return problem(404, 'publication_not_found');
  const platform = publishingPlatform.parse(r.connection.platform);
  const from = cancel ? 'SUBMITTED' : 'PREPARED',
    busy = cancel ? 'CANCELLING' : 'SENDING';
  if (!await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ContentItem" WHERE id=${r.itemId} FOR UPDATE`;
    if (!cancel && await tx.publicationRequest.count({ where: { itemId: r.itemId, connectionId: r.connectionId,
      id: { not: r.id }, state: { in: ['SENDING', 'SUBMITTED', 'CANCELLING', 'PUBLISHED', 'UNKNOWN'] } } })) return false;
    return (await tx.publicationRequest.updateMany({ where: { id: r.id, state: from }, data: { state: busy, reason: null } })).count > 0;
  }))
    return problem(409, 'already_dispatched');
  let invoked = false;
  try {
    const c = r.connection;
    if (c.revoked || c.expiresAt <= new Date()) throw new ProviderFailure('TOKEN_EXPIRED', false);
    const token = cipher.decrypt(c.tokenCipher, c.id + ':token');
    if (cancel) {
      if (!r.remoteId || !capabilities[platform].cancel) throw Error('missing receipt or unsupported cancellation');
      if (provider.status) {
        const when = r.scheduledAt ?? (await prisma.contentItem.findUnique({ where: { id: r.itemId } }))?.plannedAt;
        if (!when || when <= new Date() || (await provider.status(token, r.remoteId, c.channel, platform, when, signal))?.status !== 'QUEUE')
          throw new ProviderFailure('REJECTED', false);
        if (when <= new Date() || !await prisma.publishingConnection.count({ where: { id: c.id, revoked: false, tokenCipher: c.tokenCipher, expiresAt: { gt: new Date() } } }))
          throw new ProviderFailure('TOKEN_EXPIRED', false);
      }
      invoked = true;
      await provider.cancel(token, r.remoteId, signal);
      await prisma.publicationRequest.updateMany({
        where: { id: r.id, state: busy },
        data: { state: 'CANCELLED' }
      });
    } else {
      const p = await preview(job.accountId, r.itemId, r.revision, platform);
      if (!p.direct || p.issues.length || p.itemVersion !== r.itemVersion || Date.parse(p.when) <= Date.now())
        throw Error('stale approval');
      const files = await attachments(studio, job.accountId, p, true);
      signal.throwIfAborted();
      invoked = true;
      const remoteId = await provider.schedule(
        token,
        { channel: c.channel, platform, caption: p.caption, when: p.when, files },
        signal,
        async () => {
          signal.throwIfAborted();
          const valid = await prisma.publishingConnection.count({
            where: {
              id: c.id,
              ownerId: job.accountId,
              revoked: false,
              tokenCipher: c.tokenCipher,
              expiresAt: { gt: new Date() }
            }
          });
          if (!valid) throw new ProviderFailure('TOKEN_EXPIRED', false);
          const current = await preview(job.accountId, r.itemId, r.revision, platform);
          if (
            current.issues.length ||
            current.itemVersion !== r.itemVersion ||
            Date.parse(current.when) <= Date.now()
          )
            throw new ProviderFailure('REJECTED', false);
        }
      );
      await prisma.publicationRequest.update({ where: { id: r.id }, data: { state: 'SUBMITTED', remoteId, scheduledAt: new Date(p.when) } });
    }
    return { costCents: 0, costBasis: 'none' };
  } catch (e) {
    const ambiguous = e instanceof ProviderFailure ? e.ambiguous : invoked;
    await prisma.publicationRequest.updateMany({
      where: { id: r.id, state: busy },
      data: {
        state: ambiguous ? 'UNKNOWN' : cancel ? 'SUBMITTED' : 'FAILED',
        reason: e instanceof ProviderFailure ? e.reason : invoked ? 'RECEIPT_UNKNOWN' : 'VALIDATION_FAILED'
      }
    });
    // eslint-disable-next-line preserve-caught-error -- Remote exceptions may contain headers or credentials.
    if (ambiguous) throw new Error('publication_not_confirmed');
    return { costCents: 0, costBasis: 'none' };
  }
}
export async function reconcilePublication(owner: string, id: string, provider: PublishingProvider = new PostizProvider()) {
  const row = await prisma.publicationRequest.findFirst({ where: { id, connection: { ownerId: owner } }, include: { connection: true } });
  if (!row) return problem(404, 'publication_not_found');
  const c = row.connection;
  if (c.revoked || c.expiresAt <= new Date()) return problem(409, 'token_expired');
  const abandonedCancellation = row.state === 'CANCELLING' && await prisma.executionOperation.count({ where: {
    accountId: owner, projectId: row.projectId, tool: 'postiz.cancel@1', key: row.cancelKey, state: 'UNKNOWN'
  } });
  if (!row.remoteId || !provider.status || (!['SUBMITTED', 'UNKNOWN'].includes(row.state) && !abandonedCancellation))
    return { state: row.state };
  const when = row.scheduledAt ?? (await prisma.contentItem.findUnique({ where: { id: row.itemId, userId: owner } }))?.plannedAt;
  if (!when) return { state: row.state };
  const status = await provider.status(cipher.decrypt(c.tokenCipher, c.id + ':token'), row.remoteId, c.channel,
    publishingPlatform.parse(c.platform), when, AbortSignal.timeout(10000));
  if (!status || status.status === 'QUEUE' || (status.status === 'PUBLISHED' && !status.receipt)) return { state: row.state };
  const state = status.status === 'PUBLISHED' ? 'PUBLISHED' : 'FAILED';
  const updated = await prisma.publicationRequest.updateMany({ where: { id, state: row.state, remoteId: row.remoteId,
    connection: { ownerId: owner, revoked: false, tokenCipher: c.tokenCipher } }, data: {
    state, networkReceipt: status.receipt ?? null, reason: state === 'FAILED' ? 'PROVIDER_FAILED' : null
  } });
  return { state: updated.count ? state : row.state };
}
// Operator relay protocol, NOT a claim that upstream Postiz signs this format.
export const webhookEnvelope = z
  .object({ connectionId: z.uuid(), timestamp: z.int(), payload: z.string().max(4096) })
  .strict();
const event = z
  .object({
    eventId: z.uuid(),
    remoteId: z.string().regex(/^[\w-]{1,160}$/),
    state: z.enum(['PUBLISHED', 'FAILED']),
    networkReceipt: z
      .string()
      .regex(/^[\w:/.-]{1,500}$/)
      .optional()
  })
  .strict();
export async function ingest(envelope: z.infer<typeof webhookEnvelope>, signature: string) {
  const { connectionId, timestamp, payload } = envelope;
  if (Math.abs(Date.now() / 1000 - timestamp) > 300 || !/^v1=[a-f0-9]{64}$/.test(signature))
    return problem(401, 'invalid_webhook');
  const c = await prisma.publishingConnection.findFirst({ where: { id: connectionId, revoked: false } });
  if (!c?.hookCipher) return problem(401, 'invalid_webhook');
  const secret = cipher.decrypt(c.hookCipher, c.id + ':relay');
  const mac = createHmac('sha256', secret).update(`${connectionId}.${timestamp}.${payload}`).digest();
  if (!timingSafeEqual(mac, Buffer.from(signature.slice(3), 'hex'))) return problem(401, 'invalid_webhook');
  let body;
  try {
    body = event.parse(JSON.parse(payload));
  } catch {
    return problem(400, 'invalid_event');
  }
  const e = body;
  if (e.state === 'PUBLISHED' && !e.networkReceipt) return problem(400, 'network_receipt_required');
  const digest = createHash('sha256').update(payload).digest('hex');
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      { id: string; state: string }[]
    >`SELECT id,state FROM "PublicationRequest" WHERE "connectionId"=${c.id} AND "remoteId"=${e.remoteId} FOR UPDATE`;
    const r = rows[0];
    if (!r) return problem(409, 'receipt_not_yet_known');
    const prior = await tx.publicationEvent.findUnique({
      where: { requestId_eventId: { requestId: r.id, eventId: e.eventId } }
    });
    if (prior) {
      if (prior.digest !== digest) return problem(409, 'event_conflict');
      return { accepted: true };
    }
    await tx.publicationEvent.create({ data: { requestId: r.id, eventId: e.eventId, digest } });
    if (
      ['SUBMITTED', 'CANCELLING', 'UNKNOWN'].includes(r.state) ||
      (e.state === 'PUBLISHED' && ['CANCELLED', 'FAILED'].includes(r.state))
    )
      await tx.publicationRequest.update({
        where: { id: r.id },
        data: {
          state: e.state,
          networkReceipt: e.networkReceipt ?? null,
          reason: e.state === 'FAILED' ? 'PROVIDER_FAILED' : null
        }
      });
    return { accepted: true };
  });
}
