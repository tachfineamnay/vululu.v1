import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@vululu/db';
import type { CreativeStudio } from '../../application/creative';
import { AesProviderCredentialCipher } from '../security/providerCredentialCipher';
import { propose } from '../execution/broker';
import { preview, attachments, problem } from './delivery';
import { capabilities, publishingPlatform, ProviderFailure, PostizProvider, type PublishingProvider, type PublishingPlatform } from './provider';
export const cipher = new AesProviderCredentialCipher(() => process.env.PUBLISHING_ENCRYPTION_KEY);
export const SAFE_RETRY_REASONS = [
  'TOKEN_EXPIRED',
  'CHANNEL_MISMATCH',
  'DISABLED',
  'PROVIDER_UNAVAILABLE',
  'MANUAL_CONFIRMED_ABSENT'
] as const;

export async function prepare(owner: string, itemId: string, rev: number, connectionId: string, target?: PublishingPlatform) {
  const c = await prisma.publishingConnection.findFirst({
    where: { id: connectionId, ownerId: owner, provider: 'postiz' }
  });
  if (!c) return problem(404, 'connection_not_found');
  if (c.revoked) return problem(409, 'connection_revoked');
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
    if (request.revision !== rev) return problem(409, 'revision_conflict');
    if (request.state === 'UNKNOWN') return problem(409, 'publication_outcome_unknown');
    if (request.state === 'FAILED') return problem(409, 'retry_required');
    if (request.state !== 'PREPARED') return problem(409, 'existing_publication');
    if (await tx.executionOperation.count({ where: {
      accountId: owner, projectId: p.projectId, key: request.submitKey, tool: 'postiz.schedule@1', state: 'CANCELLED'
    } })) return tx.publicationRequest.update({ where: { id: request.id }, data: { submitKey: randomUUID() } });
    return request;
  });
  return command(owner, r.id, false);
}
export async function command(owner: string, id: string, cancelling: boolean) {
  let r = await prisma.publicationRequest.findFirst({
    where: { id, connection: { ownerId: owner }, creative: { project: { userId: owner } } },
    include: { connection: true }
  });
  if (!r) return problem(404, 'publication_not_found');
  if (cancelling) {
    if (r.state !== 'SUBMITTED') return problem(409, 'not_submitted');
    if (r.connection.revoked) return problem(409, 'connection_revoked');
    if (r.connection.expiresAt <= new Date()) return problem(409, 'token_expired');
    const platform = publishingPlatform.parse(r.connection.platform);
    if (!r.remoteId || !capabilities[platform].cancel) return problem(409, 'cancellation_unsupported');
    if (r.scheduledAt && r.scheduledAt <= new Date()) return problem(409, 'schedule_already_passed');
    if (await prisma.executionOperation.count({ where: {
      accountId: owner, projectId: r.projectId, key: r.cancelKey, tool: 'postiz.cancel@1', state: 'CANCELLED'
    } })) {
      const updated = await prisma.publicationRequest.update({
        where: { id: r.id },
        data: { cancelKey: randomUUID() },
        include: { connection: true }
      });
      r = updated;
    }
  }
  const operation = await propose(owner, r.projectId, {
    key: cancelling ? r.cancelKey : r.submitKey,
    tool: cancelling ? 'postiz.cancel@1' : 'postiz.schedule@1',
    revision: r.revision
  });
  return { id: r.id, operationId: operation.id, digest: operation.digest, state: operation.state };
}
export async function retryPreparation(owner: string, id: string) {
  const row = await prisma.publicationRequest.findFirst({
    where: { id, connection: { ownerId: owner } },
    include: { connection: { select: { platform: true, revoked: true, expiresAt: true } } }
  });
  if (!row) return problem(404, 'publication_not_found');
  if (row.connection.revoked) return problem(409, 'connection_revoked');
  if (row.connection.expiresAt <= new Date()) return problem(409, 'token_expired');
  if (
    row.state === 'FAILED' &&
    (SAFE_RETRY_REASONS as readonly string[]).includes(row.reason ?? '')
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
            !current.direct ||
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
export type ReconcileOutcome =
  | 'published_verified'
  | 'provider_failed'
  | 'recovered_queued'
  | 'still_queued'
  | 'missing_network_receipt'
  | 'not_found_on_provider'
  | 'not_found_without_receipt'
  | 'ambiguous_without_receipt'
  | 'no_action_needed';

export async function reconcilePublication(
  owner: string,
  id: string,
  provider: PublishingProvider = new PostizProvider()
): Promise<{
  state: string;
  outcome: ReconcileOutcome;
  remoteId?: string | null;
  networkReceipt?: string | null;
}> {
  const row = await prisma.publicationRequest.findFirst({ where: { id, connection: { ownerId: owner } }, include: { connection: true } });
  if (!row) return problem(404, 'publication_not_found');
  const c = row.connection;
  if (c.revoked) return problem(409, 'connection_revoked');
  if (c.expiresAt <= new Date()) return problem(409, 'token_expired');
  const abandonedCancellation =
    row.state === 'CANCELLING' &&
    Boolean(await prisma.executionOperation.count({ where: {
      accountId: owner, projectId: row.projectId, tool: 'postiz.cancel@1', key: row.cancelKey, state: 'UNKNOWN'
    } }));
  const abandonedSubmission =
    row.state === 'SENDING' &&
    Boolean(await prisma.executionOperation.count({ where: {
      accountId: owner, projectId: row.projectId, tool: 'postiz.schedule@1', key: row.submitKey, state: 'UNKNOWN'
    } }));
  const isAmbiguous = row.state === 'UNKNOWN' || abandonedCancellation || abandonedSubmission;
  const platform = publishingPlatform.parse(c.platform);
  const when = row.scheduledAt ?? (await prisma.contentItem.findUnique({ where: { id: row.itemId, userId: owner } }))?.plannedAt;
  if (!when) return { state: row.state, outcome: 'no_action_needed', remoteId: row.remoteId, networkReceipt: row.networkReceipt };

  // Case 1: Ambiguous outcome with lost remoteId — attempt read-only exact lookup without ever re-submitting.
  if (!row.remoteId) {
    if (!isAmbiguous) {
      return { state: row.state, outcome: 'no_action_needed', remoteId: null, networkReceipt: row.networkReceipt };
    }
    if (!provider.findSubmission) {
      return { state: 'UNKNOWN', outcome: 'ambiguous_without_receipt', remoteId: null, networkReceipt: null };
    }
    const token = cipher.decrypt(c.tokenCipher, c.id + ':token');
    const found = await provider.findSubmission(token, c.channel, platform, when, AbortSignal.timeout(10000));
    if (found.status === 'none') {
      return { state: 'UNKNOWN', outcome: 'not_found_without_receipt', remoteId: null, networkReceipt: null };
    }
    if (found.status === 'ambiguous') {
      return { state: 'UNKNOWN', outcome: 'ambiguous_without_receipt', remoteId: null, networkReceipt: null };
    }
    // Unique exact match found on provider: attach remoteId and update to the verified state without duplicating.
    const nextState =
      found.post?.status === 'PUBLISHED' && found.post.receipt
        ? 'PUBLISHED'
        : found.post?.status === 'ERROR'
          ? 'FAILED'
          : found.post?.status === 'QUEUE'
            ? 'SUBMITTED'
            : 'UNKNOWN';
    const nextReceipt = nextState === 'PUBLISHED' ? (found.post?.receipt ?? null) : null;
    const nextReason =
      nextState === 'FAILED'
        ? 'PROVIDER_FAILED'
        : nextState === 'UNKNOWN'
          ? 'MISSING_NETWORK_RECEIPT'
          : null;
    const updated = await prisma.publicationRequest.updateMany({
      where: {
        id,
        state: row.state,
        remoteId: null,
        connection: { ownerId: owner, revoked: false, tokenCipher: c.tokenCipher }
      },
      data: {
        remoteId: found.id,
        state: nextState,
        networkReceipt: nextReceipt,
        reason: nextReason
      }
    });
    const finalState = updated.count ? nextState : row.state;
    const outcome: ReconcileOutcome =
      finalState === 'PUBLISHED'
        ? 'published_verified'
        : finalState === 'FAILED'
          ? 'provider_failed'
          : finalState === 'SUBMITTED'
            ? 'recovered_queued'
            : 'missing_network_receipt';
    return { state: finalState, outcome, remoteId: found.id, networkReceipt: nextReceipt };
  }

  // Case 2: Known remoteId — read provider status and reconcile honestly.
  if (!provider.status || (!['SUBMITTED', 'UNKNOWN'].includes(row.state) && !abandonedCancellation && !abandonedSubmission)) {
    return { state: row.state, outcome: 'no_action_needed', remoteId: row.remoteId, networkReceipt: row.networkReceipt };
  }
  const status = await provider.status(
    cipher.decrypt(c.tokenCipher, c.id + ':token'),
    row.remoteId,
    c.channel,
    platform,
    when,
    AbortSignal.timeout(10000)
  );
  if (!status) {
    return { state: isAmbiguous ? 'UNKNOWN' : row.state, outcome: 'not_found_on_provider', remoteId: row.remoteId, networkReceipt: row.networkReceipt };
  }
  if (status.status === 'PUBLISHED' && !status.receipt) {
    return { state: isAmbiguous ? 'UNKNOWN' : row.state, outcome: 'missing_network_receipt', remoteId: row.remoteId, networkReceipt: null };
  }
  if (status.status === 'QUEUE') {
    // Recover an ambiguous cancellation/submission once provider confirms the post is queued.
    if (isAmbiguous) {
      const updated = await prisma.publicationRequest.updateMany({
        where: {
          id,
          state: row.state,
          remoteId: row.remoteId,
          connection: { ownerId: owner, revoked: false, tokenCipher: c.tokenCipher }
        },
        data: { state: 'SUBMITTED', reason: null }
      });
      return {
        state: updated.count ? 'SUBMITTED' : row.state,
        outcome: updated.count ? 'recovered_queued' : 'still_queued',
        remoteId: row.remoteId,
        networkReceipt: null
      };
    }
    return { state: row.state, outcome: 'still_queued', remoteId: row.remoteId, networkReceipt: null };
  }
  const state = status.status === 'PUBLISHED' ? 'PUBLISHED' : 'FAILED';
  const updated = await prisma.publicationRequest.updateMany({
    where: {
      id,
      state: row.state,
      remoteId: row.remoteId,
      connection: { ownerId: owner, revoked: false, tokenCipher: c.tokenCipher }
    },
    data: {
      state,
      networkReceipt: status.receipt ?? null,
      reason: state === 'FAILED' ? 'PROVIDER_FAILED' : null
    }
  });
  return {
    state: updated.count ? state : row.state,
    outcome: state === 'PUBLISHED' ? 'published_verified' : 'provider_failed',
    remoteId: row.remoteId,
    networkReceipt: state === 'PUBLISHED' ? (status.receipt ?? null) : null
  };
}

export async function resolveUnknownPublication(
  owner: string,
  id: string,
  resolution: 'confirmed_absent' | 'confirmed_external'
) {
  const row = await prisma.publicationRequest.findFirst({
    where: { id, connection: { ownerId: owner } },
    include: { connection: { select: { ownerId: true } } }
  });
  if (!row) return problem(404, 'publication_not_found');
  const abandonedOp =
    ['SENDING', 'CANCELLING'].includes(row.state) &&
    Boolean(await prisma.executionOperation.count({
      where: {
        accountId: owner,
        projectId: row.projectId,
        tool: row.state === 'CANCELLING' ? 'postiz.cancel@1' : 'postiz.schedule@1',
        key: row.state === 'CANCELLING' ? row.cancelKey : row.submitKey,
        state: 'UNKNOWN'
      }
    }));
  if (row.state !== 'UNKNOWN' && !abandonedOp) return problem(409, 'not_unknown');
  // Never forge a verified PUBLISHED state or networkReceipt via manual resolution.
  const next =
    resolution === 'confirmed_absent'
      ? { state: 'FAILED' as const, reason: 'MANUAL_CONFIRMED_ABSENT' }
      : { state: 'CANCELLED' as const, reason: 'RESOLVED_EXTERNALLY' };
  const updated = await prisma.publicationRequest.updateMany({
    where: { id: row.id, state: row.state },
    data: next
  });
  if (!updated.count) return problem(409, 'state_changed');
  return { id: row.id, state: next.state, reason: next.reason };
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
