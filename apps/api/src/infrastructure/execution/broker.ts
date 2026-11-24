import { randomUUID, createHash } from 'node:crypto';
import { prisma } from '@vululu/db';
import type { ExecutionOperation as Op, Prisma } from '@prisma/client';
import { contentChecksum } from '@vululu/domain';
import { mediaApprovalDigest } from '../mediaGeneration/approval';
import { HttpError } from '../../errors';
import { tools, toolSchema, toolPolicy, proposal, type EnginePort, type Tool } from './registry';
import { checkAgentProposal } from '../../application/agentProposalPolicy';
import { settlementFor, type CostBasis } from './costBasis';
import { storeOperationResult } from './operationResults';
import { holdTool,checkClaim,finishTool } from '../billing/service';
import {demoDisabled} from '../../releaseMode';
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
async function allowed(tx: Tx, actor: string, id: string, tool: Tool, revision: number, key: string) {
  if(tool.startsWith('sandbox.')&&demoDisabled()) deny(403,'tool_disabled');
  const a = await lock(tx, actor);
  const owner = await tx.user.findUnique({ where: { id: actor }, select: { status: true } });
  if (owner?.status === 'suspended') deny(403, 'account_suspended');
  if (!a.enabled || !a.tools.includes(tool)) deny(403, 'tool_disabled');
  if (tool === 'assistant.draft@1') {
    if (!await tx.assistantTurn.count({ where: { id: key, projectId: id, revision, providerProfile: { not: null },
      origin: null, project: { userId: actor, context: { userId: actor } } } })) return missing();
    return a;
  }
  if (tool === 'marketing.plan@1') {
    if (
      !(await tx.marketingRevision.count({
        where: { projectId: id, version: revision, project: { userId: actor } }
      }))
    )
      return missing();
    return a;
  }
  const definition = tools[tool];
  // Outils bornés aux ressources confirmées : exécutables avant toute révision créative (ADR-0036).
  if (definition.scope === 'assets') {
    const project = await tx.project.findFirst({
      where: { id, userId: actor, context: { userId: actor } },
      select: { assetsConfirmationDigest: true }
    });
    if (!project) return missing();
    if (!project.assetsConfirmationDigest) deny(409, 'assets_required');
    return a;
  }
  if (definition.scope === 'project') {
    if (!(await tx.project.count({ where: { id, userId: actor } }))) return missing();
    return a;
  }
  const r = await tx.creativeRevision.findFirst({
    where: { projectId: id, version: revision, project: { userId: actor } },
    select: { approvedAt: true }
  });
  if (!r) return missing();
  if (definition.action === 'WRITE/PUBLISH' && !r.approvedAt) deny(409, 'content_approval_required');
  return a;
}
async function reserve(tx: Tx, o: Op, actor: string) {
  const a = await allowed(tx, actor, o.projectId, toolSchema.parse(o.tool), o.revision, o.key);
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
export type AgentProposalMeta = { agentTurnId?: string; step?: number; params?: unknown };
export async function propose(actor: string, projectId: string, input: unknown, meta?: AgentProposalMeta) {
  return prisma.$transaction((tx) => proposeTx(tx, actor, projectId, input, meta));
}
export async function proposeTx(tx: Tx, actor: string, projectId: string, input: unknown, meta?: AgentProposalMeta) {
  const p = proposal.parse(input);
  const parts: unknown[] = [projectId, p.tool, p.revision];
  if (p.tool.startsWith('postiz.') || p.tool === 'marketing.plan@1') parts.push(p.key);
  let digest = createHash('sha256').update(JSON.stringify(parts)).digest('hex');
  if (p.tool === 'assistant.draft@1') {
    const turn = await tx.assistantTurn.findFirst({ where: { id: p.key, projectId, revision: p.revision, project: { userId: actor } }, select: { inputDigest: true } });
    if (!turn) return missing();
    digest = createHash('sha256').update(JSON.stringify([...parts, p.key, turn.inputDigest, tools[p.tool].maxCents])).digest('hex');
  }
  // P12-06 — autorité serveur : une proposition issue de l'agent est vérifiée ici, pas seulement
  // dans la route. Outil du catalogue agent, paramètres conformes au schéma du registre fermé,
  // aucune cible de révision, ressource réellement confirmée.
  let params = meta?.params;
  if (meta?.agentTurnId !== undefined) {
    const policy = checkAgentProposal(p.tool, toolPolicy(p.tool));
    if (!policy.ok) deny(policy.code === 'agent_scope_unsupported' ? 409 : 403, policy.code);
    if (params === undefined) deny(422, 'agent_params_missing');
  }
  if (params !== undefined) {
    const definition = tools[p.tool];
    const schema = definition.params;
    if (!schema) throw new HttpError(403, 'tool_not_proposable', 'tool_not_proposable');
    const parsed = schema.safeParse(params);
    if (!parsed.success) deny(422, 'agent_params_invalid');
    // Valeur validée : c'est elle qui est hachée puis exécutée (aucune divergence digest/params).
    params = parsed.data;
    digest = createHash('sha256')
      .update(JSON.stringify([projectId, p.tool, p.revision, p.key, contentChecksum(params)]))
      .digest('hex');
  }
  // Seuls les outils historiques de scène s'appuient sur une ligne MediaGeneration (P07 utilise meta.params).
  if (p.tool === 'media.image@1' || p.tool === 'media.video@1') {
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
  await allowed(tx, actor, projectId, p.tool, p.revision, p.key);
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
  // La ressource confirmée est vérifiée APRÈS la propriété, l'autorisation d'outil et la clé
  // d'idempotence : un appelant étranger reçoit 404, une clé réutilisée 409, jamais un code
  // qui révélerait l'état de confirmation d'une ressource.
  if (params !== undefined) {
    const definition = tools[p.tool];
    const versionId = (params as { versionId?: unknown }).versionId;
    if (definition.scope === 'assets' && typeof versionId === 'string') {
      const confirmed = await tx.projectAssetSelection.count({
        where: { projectId, assetVersionId: versionId, project: { userId: actor } }
      });
      if (!confirmed) deny(422, 'asset_not_confirmed');
    }
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
      costState: 'ESTIMATED',
      ...(params !== undefined ? { params: JSON.parse(JSON.stringify(params)) as Prisma.InputJsonValue } : {}),
      ...(meta?.agentTurnId ? { agentTurnId: meta.agentTurnId } : {}),
      ...(meta?.step !== undefined ? { step: meta.step } : {})
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
/**
 * Issue incertaine : réservation CONSERVÉE (aucune libération automatique) et sortie éventuelle
 * conservée — déjà bornée et persistée par `storeOperationResult` — pour permettre un
 * rapprochement humain sans rejouer l'appel payé.
 */
async function incident(tx: Tx, o: Op, result?: Prisma.InputJsonValue) {
  await audit(tx, o, null, 'outcome_unknown');
  return tx.executionOperation.update({
    where: { id: o.id },
    data: { state: 'UNKNOWN', costState: 'UNKNOWN', ...(result === undefined ? {} : { result }) }
  });
}
type Settlement = {
  cents: number;
  basis: CostBasis;
  /** Rapprochement humain : preuve obligatoire, jamais automatique. */
  manual?: { actor: string; evidence: string };
  /** Valeur déjà bornée par storeOperationResult : valeur en ligne, ou référence de payload. */
  result?: Prisma.InputJsonValue;
};
/**
 * Règlement unique : le montant est pris tel qu'annoncé, jamais rogné au plafond. Un montant
 * hors plafond n'est pas un succès — compte gelé, réservation conservée, incident, sortie gardée.
 * L'état de coût suit la provenance : une estimation reste ESTIMATED et n'est jamais une facture.
 */
async function settle(tx: Tx, o: Op, settlement: Settlement) {
  const { cents, basis } = settlement;
  const outcome = settlementFor(cents, basis, o.maxCents);
  if (!outcome.valid) {
    if (settlement.manual) deny(409, 'invalid_cost');
    await tx.executionAccount.update({ where: { userId: o.accountId }, data: { enabled: false } });
    await audit(tx, o, null, 'invalid_provider_cost', {
      basis,
      ...(Number.isSafeInteger(cents) ? { cents } : {}),
      ...(outcome.reason === 'above_ceiling' ? { maxCents: o.maxCents } : {})
    });
    return incident(tx, o, settlement.result);
  }
  await finishTool(tx, o, settlement.manual ? 'manual' : 'success');
  if (!settlement.manual) await audit(tx, o, null, 'reported', { cents, basis });
  await tx.executionAccount.update({
    where: { userId: o.accountId },
    data: { reservedCents: { decrement: o.maxCents }, spentCents: { increment: cents } }
  });
  await audit(tx, o, settlement.manual?.actor ?? null, 'reconciled', {
    cents,
    basis,
    ...(settlement.manual ? { evidence: settlement.manual.evidence } : {})
  });
  return tx.executionOperation.update({
    where: { id: o.id },
    data: {
      state: settlement.manual ? 'RESOLVED' : 'SUCCEEDED',
      costState: settlement.manual ? 'RECONCILED' : outcome.costState,
      reportedCents: cents,
      ...(settlement.result === undefined ? {} : { result: settlement.result })
    }
  });
}
export async function resolveIncident(actor: string, id: string, cents: number, evidence: string) {
  return transition(id, async (tx, o) => {
    if ((await tx.user.findUnique({ where: { id: actor }, select: { role: true } }))?.role !== 'super_admin')
      deny(403, 'forbidden');
    if (o.state !== 'UNKNOWN') deny(409, 'not_unknown');
    // Constat humain : l'état RECONCILED atteste la vérification, jamais une estimation.
    return settle(tx, o, { cents, basis: 'manual', manual: { actor, evidence } });
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
      await allowed(tx, row.accountId, row.projectId, tool, row.revision, row.key);
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
      engine.invoke({ ...o, tool: toolSchema.parse(o.tool), params: o.params ?? undefined }, ctrl.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          ctrl.abort();
          reject(new Error('deadline'));
        }, timeoutMs);
      })
    ]);
    // La sortie payante devient durable AVANT le règlement : un gros résultat part hors base,
    // et un échec d'écriture est explicite (jamais un marqueur tronqué).
    const stored = 'result' in result && result.result !== undefined
      ? await storeOperationResult({ accountId: o.accountId, operationId: o.id, value: result.result })
      : undefined;
    await transition(id, async (tx, row) => {
      if (row.state !== 'CLAIMED') return;
      if ('failed' in result) {
        await finishTool(tx, row, 'cancel');
        await tx.executionAccount.update({
          where: { userId: row.accountId },
          data: { reservedCents: { decrement: row.maxCents } }
        });
        await audit(tx, row, null, 'failed', { code: result.failed.code });
        await tx.executionOperation.update({
          where: { id },
          data: { state: 'FAILED', costState: 'RELEASED', reportedCents: 0,
            result: { error: { code: result.failed.code, message: result.failed.message } } as Prisma.InputJsonValue }
        });
        return;
      }
      if ('uncertain' in result) {
        await audit(tx, row, null, 'uncertain', { code: result.uncertain.code });
        await incident(tx, row);
        return;
      }
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
      } else await settle(tx, row, {
        cents: result.costCents,
        basis: result.costBasis,
        result: stored
      });
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
      if (o.state !== 'CLAIMED' || !o.claimUntil || o.claimUntil >= new Date()) return;
      if (o.tool.startsWith('media.')) {
        const media = await tx.mediaGeneration.findFirst({ where: { id: o.key, projectId: o.projectId, remoteId: { not: null } } });
        if (media?.state === 'PENDING') {
          // A persisted remote ID makes the next invocation resume polling instead of replaying submission.
          await tx.executionOperation.update({ where: { id }, data: { state: 'POLLING', claimUntil: null, notifyAfter: new Date() } });
          return;
        }
        if (media && ['READY', 'FAILED', 'CANCELLED', 'INVALID_OUTPUT'].includes(media.state) && media.reportedCents !== null) {
          // Reprise depuis le reçu déjà persisté : l'appel fournisseur n'est pas rejoué.
          await settle(tx, o, { cents: media.reportedCents, basis: 'provider_reported' });
          return;
        }
      }
      await incident(tx, o);
    });
}
