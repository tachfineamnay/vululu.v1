import { randomUUID, createHash } from 'node:crypto';
import { prisma } from '@vululu/db';
import type { ExecutionOperation as Op, Prisma } from '@prisma/client';
import { mediaApprovalDigest } from '../mediaGeneration/approval';
import { HttpError } from '../../errors';
import { tools, toolSchema, proposal, type EnginePort } from './registry';
import { holdTool,checkClaim,finishTool } from '../billing/service';
type Tx = Prisma.TransactionClient;
const deny = (status: number, code: string): never => {
  throw new HttpError(status, code, code);
};
const missing = () => deny(404, 'execution_not_found');
const audit = (
  tx: Tx,
  o: Op,
  actor: string | null,
  event: string,
  extra: Record<string, string | number> = {}
) =>
  tx.auditEvent.create({
    data: {
      actorId: actor,
      action: 'execution.' + event,
      targetType: 'execution',
      targetId: o.id,
      traceId: o.correlationId,
      metadata: { tool: o.tool, ...extra }
    }
  });
// All financial and state transitions take the same account lock, including reconciliation.
async function lock(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT "userId" FROM "ExecutionAccount" WHERE "userId"=${id} FOR UPDATE`;
  return (await tx.executionAccount.findUnique({ where: { userId: id } })) ?? missing();
}
async function owned(tx: Tx, id: string, actor: string) {
  return (
    (await tx.executionOperation.findFirst({
      where: { id, accountId: actor, project: { userId: actor } }
    })) ?? missing()
  );
}
async function allowed(tx: Tx, actor: string, id: string, tool: keyof typeof tools, revision: number) {
  const a = await lock(tx, actor);
  if (!a.enabled || !a.tools.includes(tool)) deny(403, 'tool_disabled');
  if (tool === 'marketing.plan@1') {
    if (
      !(await tx.marketingRevision.count({
        where: { projectId: id, version: revision, project: { userId: actor } }
      }))
    )
      return missing();
    return a;
  }
  const r = await tx.creativeRevision.findFirst({
    where: { projectId: id, version: revision, project: { userId: actor } },
    select: { approvedAt: true }
  });
  if (!r) return missing();
  if (tools[tool].action === 'WRITE/PUBLISH' && !r.approvedAt) deny(409, 'content_approval_required');
  return a;
}
async function reserve(tx: Tx, o: Op, actor: string) {
  const a = await allowed(tx, actor, o.projectId, toolSchema.parse(o.tool), o.revision);
  await holdTool(tx,o);
  if (a.limitCents - a.spentCents - a.reservedCents < o.maxCents) deny(409, 'budget_exhausted');
  await tx.executionAccount.update({
    where: { userId: actor },
    data: { reservedCents: { increment: o.maxCents } }
  });
  if (tools[toolSchema.parse(o.tool)].action !== 'READ') await audit(tx, o, actor, 'approved');
  await audit(tx, o, actor, 'reserved', { cents: o.maxCents });
  return tx.executionOperation.update({
    where: { id: o.id },
    data: {
      state: 'QUEUED',
      costState: 'RESERVED',
      approvedBy: tools[toolSchema.parse(o.tool)].action === 'READ' ? null : actor
    }
  });
}
export async function propose(actor: string, projectId: string, input: unknown) {
  return prisma.$transaction((tx) => proposeTx(tx, actor, projectId, input));
}
export async function proposeTx(tx: Tx, actor: string, projectId: string, input: unknown) {
  const p = proposal.parse(input);
  const parts: unknown[] = [projectId, p.tool, p.revision];
  if (p.tool.startsWith('postiz.') || p.tool === 'marketing.plan@1') parts.push(p.key);
  let digest = createHash('sha256').update(JSON.stringify(parts)).digest('hex');
  if (p.tool.startsWith('media.')) {
    const g = await tx.mediaGeneration.findFirst({
      where: {
        id: p.key,
        projectId,
        revision: p.revision,
        tool: p.tool,
        source: { project: { userId: actor } }
      }
    });
    if (!g) return missing();
    digest = mediaApprovalDigest(g, tools[p.tool].maxCents);
  }
  await allowed(tx, actor, projectId, p.tool, p.revision);
  if (
    p.tool === 'marketing.plan@1' &&
    !(await tx.marketingRevision.count({ where: { projectId, version: p.revision, requestId: p.key } }))
  )
    return missing();
  const prev = await tx.executionOperation.findUnique({
    where: { accountId_key: { accountId: actor, key: p.key } }
  });
  if (prev) {
    if (prev.digest !== digest) deny(409, 'key_payload_conflict');
    return prev;
  }
  const o = await tx.executionOperation.create({
    data: {
      id: randomUUID(),
      correlationId: randomUUID(),
      accountId: actor,
      projectId,
      ...p,
      digest,
      maxCents: tools[p.tool].maxCents,
      state: 'PROPOSED',
      costState: 'ESTIMATED'
    }
  });
  await audit(tx, o, actor, 'estimated');
  return tools[p.tool].action === 'READ' ? reserve(tx, o, actor) : o;
}
export async function approve(actor: string, id: string, digest: string) {
  return prisma.$transaction(async (tx) => {
    await lock(tx, actor);
    const o = await owned(tx, id, actor);
    if (o.digest !== digest) deny(409, 'approval_mismatch');
    if (o.state !== 'PROPOSED') {
      if (o.approvedBy === actor) return o;
      return deny(409, 'not_proposed');
    }
    return reserve(tx, o, actor);
  });
}
export async function cancel(actor: string, id: string) {
  return prisma.$transaction(async (tx) => {
    await lock(tx, actor);
    const o = await owned(tx, id, actor);
    if (o.state === 'CANCELLED') return o;
    if (!['PROPOSED', 'QUEUED'].includes(o.state)) deny(409, 'too_late_to_cancel');
    return release(tx, o, actor);
  });
}
async function release(tx: Tx, o: Op, actor: string | null) {
  await finishTool(tx,o,'cancel');
  if (o.state === 'QUEUED')
    await tx.executionAccount.update({
      where: { userId: o.accountId },
      data: { reservedCents: { decrement: o.maxCents } }
    });
  await audit(tx, o, actor, 'cancelled');
  return tx.executionOperation.update({
    where: { id: o.id },
    data: { state: 'CANCELLED', costState: 'RELEASED' }
  });
}
async function transition<T>(id: string, fn: (tx: Tx, o: Op) => Promise<T>) {
  return prisma.$transaction(async (tx) => {
    const hint = await tx.executionOperation.findUnique({ where: { id }, select: { accountId: true } });
    if (!hint) return missing();
    await lock(tx, hint.accountId);
    return fn(tx, await tx.executionOperation.findUniqueOrThrow({ where: { id } }));
  });
}
async function incident(tx: Tx, o: Op) {
  await audit(tx, o, null, 'outcome_unknown');
  return tx.executionOperation.update({
    where: { id: o.id },
    data: { state: 'UNKNOWN', costState: 'UNKNOWN' }
  });
}
async function settle(tx: Tx, o: Op, cents: number, manual?: { actor: string; evidence: string }) {
  if (!Number.isInteger(cents) || cents < 0 || cents > o.maxCents) {
    if (manual) deny(409, 'invalid_cost');
    await tx.executionAccount.update({ where: { userId: o.accountId }, data: { enabled: false } });
    await audit(tx, o, null, 'invalid_provider_cost', Number.isSafeInteger(cents) ? { cents } : {});
    return incident(tx, o);
  }
  await finishTool(tx,o,manual?'manual':'success');
  if (!manual) await audit(tx, o, null, 'reported', { cents });
  await tx.executionAccount.update({
    where: { userId: o.accountId },
    data: { reservedCents: { decrement: o.maxCents }, spentCents: { increment: cents } }
  });
  await audit(tx, o, manual?.actor ?? null, 'reconciled', {
    cents,
    ...(manual ? { evidence: manual.evidence } : {})
  });
  return tx.executionOperation.update({
    where: { id: o.id },
    data: {
      state: manual ? 'RESOLVED' : 'SUCCEEDED',
      costState: manual ? 'RECONCILED' : 'REPORTED',
      reportedCents: cents
    }
  });
}
export async function resolveIncident(actor: string, id: string, cents: number, evidence: string) {
  return transition(id, async (tx, o) => {
    if ((await tx.user.findUnique({ where: { id: actor }, select: { role: true } }))?.role !== 'super_admin')
      deny(403, 'forbidden');
    if (o.state !== 'UNKNOWN') deny(409, 'not_unknown');
    return settle(tx, o, cents, { actor, evidence });
  });
}
// Commit the non-replayable boundary before invoking any engine. A crash on either side
// of invoke is intentionally indistinguishable: no lease re-acquisition for CLAIMED jobs.
export async function execute(id: string, engine: EnginePort, timeoutMs = 120000) {
  const o = await transition(id, async (tx, row) => {
    if (!['QUEUED', 'POLLING'].includes(row.state)) return null;
    const polling = row.state === 'POLLING';
    const tool = toolSchema.parse(row.tool);
    try {
      if(!polling)await checkClaim(tx,row);
      await allowed(tx, row.accountId, row.projectId, tool, row.revision);
    } catch (e) {
      if (!(e instanceof HttpError)) throw e;
      if (polling) await incident(tx, row);
      else await release(tx, row, null);
      return null;
    }
    if (
      row.maxCents !== tools[tool].maxCents ||
      (tools[tool].action !== 'READ' && row.approvedBy !== row.accountId)
    ) {
      if (polling) await incident(tx, row);
      else await release(tx, row, null);
      return null;
    }
    await audit(tx, row, null, 'claimed');
    return tx.executionOperation.update({
      where: { id },
      data: { state: 'CLAIMED', claimUntil: new Date(Date.now() + timeoutMs + 5000) }
    });
  });
  if (!o) return;
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      engine.invoke({ ...o, tool: toolSchema.parse(o.tool) }, ctrl.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          ctrl.abort();
          reject(new Error('deadline'));
        }, timeoutMs);
      })
    ]);
    await transition(id, async (tx, row) => {
      if (row.state !== 'CLAIMED') return;
      if ('pendingMedia' in result) {
        if (
          !row.tool.startsWith('media.') ||
          !(await tx.mediaGeneration.count({
            where: { id: row.key, projectId: row.projectId, remoteId: { not: null }, state: 'PENDING' }
          }))
        )
          throw Error('invalid_media_poll');
        await tx.executionOperation.update({
          where: { id },
          data: { state: 'POLLING', claimUntil: null, notifyAfter: new Date(Date.now() + 10000) }
        });
      } else await settle(tx, row, result.costCents);
    });
  } catch {
    await transition(id, async (tx, row) => {
      if (row.state === 'CLAIMED') await incident(tx, row);
    });
  } finally {
    clearTimeout(timer);
  }
}
export async function recover() {
  const rows = await prisma.executionOperation.findMany({
    where: { state: 'CLAIMED', claimUntil: { lt: new Date() } },
    take: 50,
    select: { id: true }
  });
  for (const { id } of rows)
    await transition(id, async (tx, o) => {
      if (o.state === 'CLAIMED' && o.claimUntil && o.claimUntil < new Date()) await incident(tx, o);
    });
}
