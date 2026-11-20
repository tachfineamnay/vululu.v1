import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@vululu/db';
import {
  marketingInput,
  marketingContext,
  marketingOutput,
  platformSchema,
  type MarketingContext,
  type Recipe
} from '@vululu/contracts';
import { HttpError } from '../../errors';
import { propose } from '../execution/broker';
import { classify, compile, fallback, sensitive } from './editorial';
import { decide, offline, type LlmProvider } from './provider';
type Tx = Prisma.TransactionClient;
const fail = (status: number, code: string): never => {
  throw new HttpError(status, code, code);
};
// Canonical JSON: PostgreSQL jsonb does not retain JS object key order.
function stable(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.entries(v)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, x]) => [k, stable(x)])
    );
  return v;
}
const hash = (v: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(stable(v)))
    .digest('hex');
async function lock(tx: Tx, user: string, project: string) {
  const rows = await tx.$queryRaw<
    { id: string }[]
  >`SELECT id FROM "Project" WHERE id=${project} AND "userId"=${user} FOR UPDATE`;
  if (!rows.length) fail(404, 'marketing_project_not_found');
}
export async function marketingSnapshot(
  tx: Tx,
  user: string,
  project: string,
  offerId: string,
  week: string,
  regulated: boolean
) {
  const p = await tx.project.findFirst({
    where: { id: project, userId: user, context: { userId: user } },
    select: {
      contextId: true,
      platform: true,
      objective: true,
      context: { select: { name: true, description: true, audience: true, tone: true } }
    }
  });
  if (!p) return fail(404, 'marketing_project_not_found');
  const offer = await tx.confirmedOffer.findFirst({
    where: { id: offerId, contextId: p.contextId, context: { userId: user } },
    select: { name: true }
  });
  if (!offer) return fail(404, 'marketing_offer_not_found');
  const start = new Date(week);
  const planned = await tx.contentItem.findMany({
    where: {
      userId: user,
      projectId: project,
      archived: false,
      plannedAt: { gte: start, lt: new Date(+start + 7 * 86400000) }
    },
    orderBy: [{ plannedAt: 'asc' }, { id: 'asc' }],
    take: 101,
    select: { id: true, version: true, plannedAt: true }
  });
  if (planned.length > 100) return fail(422, 'marketing_week_too_large');
  // Only two owner-entered labels are ever interpolated, verbatim and attributed. Reject embedded advertising/instruction-like copy rather than trying to clean it up.
  for (const label of [p.context.name, offer.name])
    if (
      !/^[\p{L}\p{M}\p{N} &'’().,+–-]{1,160}$/u.test(label) ||
      /ignore|ignor[ez]|instructions?|syst[èe]me|garant|gu[ée]ri|certifi|dipl[oô]m|t[ée]moign|promo|remise|r[ée]duction|en stock|euros?|dollars?|gratuit|résultat assuré|guarantee|discount|testimonial/i.test(
        label
      )
    )
      return fail(422, 'marketing_review_source_label');
  const words = [p.context.description, offer.name, p.context.name].join(' ');
  return marketingContext.parse({
    projectId: project,
    contextId: p.contextId,
    offerId,
    brand: p.context.name,
    offer: offer.name,
    week,
    platform: platformSchema.parse(p.platform),
    sectorHint: classify(words),
    regulated: regulated || sensitive(words),
    plan: planned.map((x) => ({
      id: x.id,
      version: x.version,
      date: x.plannedAt.toISOString().slice(0, 10)
    })),
    audienceHint: /équipe|entreprise|professionnel/i.test(p.context.audience ?? '')
      ? 'equipes'
      : /débutant|novice/i.test(p.context.audience ?? '')
        ? 'debutants'
        : /famill|parent/i.test(p.context.audience ?? '')
          ? 'familles'
          : 'non_precise',
    toneHint: /formel|sobre|professionnel/i.test(p.context.tone ?? '')
      ? 'formel'
      : /chaleureux|convivial/i.test(p.context.tone ?? '')
        ? 'chaleureux'
        : 'neutre',
    goalHint: /demande|contact|réserv|inscri/i.test(p.objective)
      ? 'contact'
      : /expli|inform|éduqu/i.test(p.objective)
        ? 'explication'
        : 'decouverte',
    audienceDeclared: !!p.context.audience,
    toneDeclared: !!p.context.tone
  });
}
async function append(
  tx: Tx,
  c: MarketingContext,
  recipe: Recipe,
  input: {
    requestId: string;
    requestDigest: string;
    origin: string;
    reason: string;
    parentVersion?: number;
    operationId?: string;
  }
) {
  const prev = await tx.marketingRevision.findFirst({
      where: { projectId: c.projectId },
      orderBy: { version: 'desc' },
      select: { version: true }
    }),
    version = (prev?.version ?? 0) + 1,
    result = compile(c, recipe),
    digest = hash([version, c, recipe, result, input.origin, input.reason]);
  return tx.marketingRevision.create({
    data: { projectId: c.projectId, version, context: c, recipe, result, digest, ...input }
  });
}
export async function createDraft(user: string, project: string, raw: unknown) {
  const b = marketingInput.parse(raw),
    requestDigest = hash(b);
  return prisma.$transaction(async (tx) => {
    await lock(tx, user, project);
    const prev = await tx.marketingRevision.findUnique({
      where: { projectId_requestId: { projectId: project, requestId: b.requestId } }
    });
    if (prev) {
      if (prev.requestDigest !== requestDigest) return fail(409, 'marketing_key_conflict');
      return prev;
    }
    const c = await marketingSnapshot(tx, user, project, b.offerId, b.week, b.regulated);
    return append(tx, c, fallback(c), {
      requestId: b.requestId,
      requestDigest,
      origin: 'fallback',
      reason: 'local_plan'
    });
  });
}
export async function readDraft(user: string, project: string, version: number) {
  return (
    (await prisma.marketingRevision.findFirst({
      where: { projectId: project, version, project: { userId: user } }
    })) ?? fail(404, 'marketing_revision_not_found')
  );
}
export async function history(user: string, project: string) {
  return prisma.marketingRevision.findMany({
    where: { projectId: project, project: { userId: user } },
    select: { version: true, approvedAt: true, origin: true, reason: true, parentVersion: true },
    orderBy: { version: 'desc' }
  });
}
export async function prepareRefinement(user: string, project: string, version: number) {
  const r = await readDraft(user, project, version);
  return propose(user, project, { tool: 'marketing.plan@1', key: r.requestId, revision: version });
}
export async function generateClaim(
  job: { id: string; accountId: string; projectId: string; revision: number; maxCents: number },
  signal: AbortSignal,
  provider: LlmProvider = offline
) {
  const op = await prisma.executionOperation.findFirst({
    where: {
      id: job.id,
      tool: 'marketing.plan@1',
      state: 'CLAIMED',
      approvedBy: job.accountId,
      accountId: job.accountId,
      projectId: job.projectId,
      revision: job.revision
    }
  });
  if (!op) return fail(403, 'marketing_claim_required');
  const base = await readDraft(job.accountId, job.projectId, job.revision);
  if (op.key !== base.requestId) return fail(409, 'marketing_request_mismatch');
  const c = marketingContext.parse(base.context);
  const d = await decide(c, provider, { signal, maxCostCents: op.maxCents, idempotencyKey: op.id });
  await prisma.$transaction(async (tx) => {
    await lock(tx, job.accountId, job.projectId);
    if (signal.aborted || !(await tx.executionOperation.count({ where: { id: op.id, state: 'CLAIMED' } })))
      return fail(409, 'marketing_interrupted');
    await append(tx, c, d.recipe, {
      requestId: randomUUID(),
      requestDigest: base.digest,
      origin: d.origin,
      reason: d.reason,
      parentVersion: base.version,
      operationId: op.id
    });
  });
  if (d.costCents === null) throw Error('marketing_cost_unknown');
  return { costCents: d.costCents };
}
export async function approveDraft(
  user: string,
  project: string,
  version: number,
  digest: string,
  professionalReview: boolean
) {
  return prisma.$transaction(async (tx) => {
    await lock(tx, user, project);
    const r = await tx.marketingRevision.findUnique({
      where: { projectId_version: { projectId: project, version } }
    });
    if (!r) return fail(404, 'marketing_revision_not_found');
    const c = marketingContext.parse(r.context);
    if (r.digest !== digest) return fail(409, 'marketing_digest_mismatch');
    if (c.regulated && !professionalReview) return fail(409, 'professional_review_required');
    const current = await marketingSnapshot(tx, user, project, c.offerId, c.week, c.regulated);
    if (hash(c) !== hash(current)) return fail(409, 'marketing_context_changed');
    const output = marketingOutput.parse(r.result);
    if (
      hash([version, c, r.recipe, output, r.origin, r.reason]) !== digest ||
      hash(compile(c, r.recipe)) !== hash(output)
    )
      return fail(409, 'marketing_integrity');
    if (r.approvedAt) return r;
    await tx.auditEvent.create({
      data: {
        actorId: user,
        targetType: 'marketing_revision',
        targetId: project,
        action: 'marketing.approved',
        metadata: { version, digest, professionalReview }
      }
    });
    return tx.marketingRevision.update({
      where: { projectId_version: { projectId: project, version } },
      data: { approvedBy: user, approvedAt: new Date() }
    });
  });
}
