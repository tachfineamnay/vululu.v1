import { createHash } from 'node:crypto';
import { type AssistantTurn, Prisma } from '@prisma/client';
import { prisma } from '@vululu/db';
import { assistantRequest, creativeSpec, marketingContext, type AgentOutput, type AssistantCopy, type AssistantRequest, type ActionPreview, type BrainstormOutput } from '@vululu/contracts';
import { HttpError } from '../../errors';
import { localTranslator, previewOf } from '../../application/creativeActions';
import { proposeTx } from '../execution/broker';
import { marketingSnapshot } from '../marketing/service';
import { compile, fallback, sensitive } from '../marketing/editorial';
import { evaluateAssetDecision, type AssetDecisionSnapshot } from '@vululu/application';
import { readAssetDecisionRow } from '../prisma/assetDecisionRepository';
import { receipt, vertexConfig, vertexProfile, vertexProvider, type AssistantProvider, type ModelInput } from './vertex';
import { minimizeModelData, vettedAgentOutput, vettedBrainstorm, vettedChanges, vettedCopy } from './safety';
import { agentCatalog, agentTools, toolPolicy } from '../execution/registry';
import { checkAgentProposal } from '../../application/agentProposalPolicy';

export const assistantTool = 'assistant.draft@1';
const unavailable = () => new HttpError(409, 'assistant_unavailable', 'IA indisponible pour ce projet. Utilisez le brouillon hors ligne.');
const missing = () => new HttpError(404, 'assistant_not_found', 'Projet ou brouillon introuvable.');
const stale = () => new HttpError(409, 'assistant_stale', 'Les sources ont changé. Préparez un nouveau brouillon.');
const invalid = () => new HttpError(422, 'assistant_invalid_copy', 'Retirez les chiffres, liens et affirmations non vérifiées.');
const trimmed = (value: string | null, max: number) => (value ?? '').trim().slice(0, max);
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).sort(([x], [y]) => x.localeCompare(y)).map(([k, x]) => [k, canonical(x)]));
  return v;
}
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const dbJson = (value: object) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
type Tx = Prisma.TransactionClient;
const turnSelect = { id: true, parentId: true, kind: true, request: true, result: true, digest: true, origin: true,
  reason: true, approvedAt: true, createdAt: true, operation: { select: { id: true, digest: true, maxCents: true, state: true } } } as const;

async function projectScope(tx: Tx, userId: string, projectId: string) {
  const row = await tx.project.findFirst({ where: { id: projectId, userId, context: { userId } }, select: {
    title: true, objective: true, platform: true, format: true, contextId: true,
    context: { select: { name: true, description: true, audience: true, tone: true } }
  } });
  if (!row) throw missing();
  return row;
}
async function creativeSource(tx: Tx, projectId: string, input: Extract<AssistantRequest, { kind: 'creative' }>, requireHead: boolean) {
  if (input.scope.target.projectId !== projectId) throw missing();
  const head = await tx.creativeRevision.findFirst({ where: { projectId }, orderBy: { version: 'desc' }, select: { version: true } });
  if (requireHead && head?.version !== input.scope.expectedRevision) throw stale();
  const row = await tx.creativeRevision.findUnique({ where: { projectId_version: { projectId, version: input.scope.expectedRevision } } });
  if (!row) throw missing();
  const spec = creativeSpec.parse(row.spec);
  const index = spec.scenes.findIndex((s) => s.key === input.scope.target.sceneKey);
  if (index === -1) throw missing();
  return { spec, scene: spec.scenes[index], index, checksum: hash(spec) };
}
async function agentDepth(tx: Tx, projectId: string, parentId?: string): Promise<number> {
  let depth = 0;
  let id: string | undefined = parentId;
  while (id && depth < 8) {
    const row = await tx.assistantTurn.findFirst({ where: { id, projectId }, select: { request: true, parentId: true } });
    if (!row) break;
    const prior = assistantRequest.parse(row.request);
    if (prior.kind !== 'agent') break;
    depth += 1;
    id = row.parentId ?? undefined;
  }
  return depth;
}
async function assetDecision(tx: Tx, userId: string, projectId: string) {
  const row = await readAssetDecisionRow(tx, projectId, userId);
  if (!row) throw missing();
  const state = evaluateAssetDecision(row);
  if (!state.confirmed) {
    throw state.reason === 'not_confirmed'
      ? new HttpError(409, 'assets_required', 'Confirmez vos ressources (ou l’absence de ressources) avant de lancer le brainstorming.')
      : new HttpError(409, 'assets_confirmation_stale', 'La sélection de ressources a changé. Reconfirmez-la avant de lancer le brainstorming.');
  }
  if (!state.snapshot) throw new HttpError(409, 'assets_required', 'Confirmez vos ressources (ou l’absence de ressources) avant de lancer le brainstorming.');
  return state.snapshot;
}
async function snapshot(tx: Tx, userId: string, projectId: string, input: AssistantRequest) {
  const row = await projectScope(tx, userId, projectId);
  // Prérequis serveur : la décision de ressources est confirmée et non périmée. Aucun identifiant de média n'est envoyé au modèle.
  const assets = await assetDecision(tx, userId, projectId);
  // No account identifiers, contacts, website, documents, media IDs or other projects are sent to the model.
  const profile = { name: trimmed(row.context.name, 160), description: trimmed(row.context.description, 1600),
    audience: trimmed(row.context.audience, 450), tone: trimmed(row.context.tone, 300), objective: trimmed(row.objective, 600),
    platform: row.platform, format: row.format };
  if (input.kind === 'brainstorm') {
    const offer = input.offerId ? await offerName(tx, userId, projectId, input.offerId) : null;
    return { profile, offer, assets };
  }
  if (input.kind === 'agent') {
    // L'agent recommande des outils ; il n'exécute rien. Seules les ressources confirmées sont exposées.
    return { profile, assets };
  }
  if (input.kind === 'marketing') {
    const c = await marketingSnapshot(tx, userId, projectId, input.offerId, input.week,
      input.regulated || sensitive([profile.description, input.prompt, profile.objective].join(' ')));
    return { profile, context: c, sourceDigest: hash(row), assets };
  }
  const c = await creativeSource(tx, projectId, input, true);
  return { profile, checksum: c.checksum, selected: { position: c.index + 1, total: c.spec.scenes.length,
    seconds: c.scene.seconds, background: c.scene.background ?? c.spec.brand.background, transition: c.scene.transition,
    layers: c.scene.layers.map((l, index) => l.type === 'text'
      ? { index, type: l.type, role: l.role, text: trimmed(l.text, 200) }
      : { index, type: l.type, fit: l.fit, gravity: l.gravity }) }, assets };
}
function sameScope(a: AssistantRequest, b: AssistantRequest) {
  if (a.kind === 'marketing' && b.kind === 'marketing') return a.offerId === b.offerId;
  if (a.kind === 'brainstorm' && b.kind === 'brainstorm') return true;
  if (a.kind === 'agent' && b.kind === 'agent') return true;
  return a.kind === 'creative' && b.kind === 'creative' && a.scope.target.sceneKey === b.scope.target.sceneKey;
}
async function lineage(tx: Tx, projectId: string, input: AssistantRequest) {
  const previous = [];
  let id = input.parentId;
  while (id && previous.length < 3) {
    const row = await tx.assistantTurn.findFirst({ where: { id, projectId } });
    const prior = row && assistantRequest.parse(row.request);
    if (!row || !prior || !sameScope(input, prior) || !row.result) throw missing();
    const result = row.result as { copy?: AssistantCopy; preview?: ActionPreview; ack?: string; angles?: Array<{ title: string }>; reply?: string; tools?: Array<{ tool: string }> };
    const suggestion = prior.kind === 'brainstorm'
      ? { ack: trimmed(result.ack ?? '', 200), angles: (result.angles ?? []).map((a) => a.title).slice(0, 4) }
      : prior.kind === 'agent'
        ? { reply: trimmed(result.reply ?? '', 200), tools: (result.tools ?? []).map((tool) => tool.tool).slice(0, 4) }
        : result.copy
        ? { campaign: result.copy.campaign, strategy: result.copy.strategy, headlines: result.copy.posts.map((p) => p.headline) }
        : { changes: result.preview?.action.changes.map((c) => c.operation === 'cta' || c.operation === 'text'
          ? { operation: c.operation, text: trimmed(c.parameters.text, 200) } : { operation: c.operation }) ?? [] };
    previous.unshift({ request: trimmed(prior.prompt, 300), suggestion });
    id = row.parentId ?? undefined;
  }
  return previous;
}
type BrainstormSource = { profile: { name: string; description: string; audience: string; tone: string; objective: string; platform: string; format: string }; offer: { id: string; name: string } | null; assets: AssetDecisionSnapshot };
async function offerName(tx: Tx, userId: string, projectId: string, offerId: string) {
  const project = await tx.project.findFirst({ where: { id: projectId, userId }, select: { contextId: true } });
  if (!project) throw missing();
  const offer = await tx.confirmedOffer.findFirst({ where: { id: offerId, contextId: project.contextId, context: { userId } }, select: { name: true } });
  return offer ? { id: offerId, name: offer.name } : null;
}
function assetNames(assets: AssetDecisionSnapshot) { return (assets?.items ?? []).map((item) => ({ name: item.name, kind: item.kind })); }
/** Repli local déterministe et honnête : aucune affirmation métier inventée, aucune intelligence simulée. */
function brainstormResult(source: BrainstormSource): BrainstormOutput {
  const { profile, offer, assets } = source;
  const names = assetNames(assets);
  const visual = names.some((n) => n.kind === 'image' || n.kind === 'logo');
  const ack = 'Brainstorming pour « ' + trimmed(profile.objective, 220) + ' » sur ' + profile.platform + ' (' + profile.format + ').'
    + (offer ? ' Offre retenue : ' + offer.name + '.' : '') + (names.length ? ' Ressources disponibles : ' + names.map((n) => n.name).join(', ') + '.' : ' Aucune ressource confirmée.');
  const questions: string[] = [];
  if (!profile.audience) questions.push('À qui s’adresse cette création ? (public, contexte)');
  if (!profile.tone) questions.push('Quel ton souhaitez-vous : formel, chaleureux, neutre ?');
  if (!offer) questions.push('Y a-t-il une offre ou un appel à l’action précis à mettre en avant ?');
  const angles: BrainstormOutput['angles'] = [
    { title: visual ? 'Mettre en avant votre visuel' : 'Faire découvrir votre univers',
      reasoning: 'Sur ' + profile.platform + ', un ' + profile.format + ' accroche mieux avec un point d’entrée simple.',
      premise: 'Une entrée visuelle forte, puis une invitation à en savoir plus.',
      assets: names.filter((n) => n.kind === 'image' || n.kind === 'logo').map((n) => n.name).slice(0, 3) },
    { title: 'Expliquer votre objectif ou votre offre', reasoning: 'Clarifier ce que vous proposez répond à l’intention de découverte.',
      premise: 'Une explication courte de la valeur, sans chiffre ni promesse.', assets: [] },
    { title: 'Poser une question à votre public', reasoning: 'Une question invite à réagir et engage le commentaire.',
      premise: 'Une question simple liée à votre activité.', assets: [] }
  ];
  return { schemaVersion: 1, ack, questions: questions.slice(0, 5), angles: angles.slice(0, 4), decisions: [] };
}
/** Garde les seules références de ressources réellement confirmées ; aucune invention de nom par le modèle. */
function sanitizeBrainstorm(value: unknown, source: BrainstormSource): BrainstormOutput | null {
  const br = vettedBrainstorm(value);
  if (!br) return null;
  const allowed = new Set(assetNames(source.assets).map((n) => n.name));
  return { ...br, angles: br.angles.map((angle) => ({ ...angle, assets: angle.assets.filter((name) => allowed.has(name)).slice(0, 12) })) };
}
function localPlan(s: Awaited<ReturnType<typeof snapshot>>) {
  const c = marketingContext.parse(s.context);
  return compile(c, fallback(c));
}
function marketingResult(s: Awaited<ReturnType<typeof snapshot>>, copy?: AssistantCopy) {
  const local = localPlan(s);
  return { facts: local.facts, unknowns: local.unknowns, review: local.review, regulated: marketingContext.parse(s.context).regulated,
    slots: local.suggestions.map(({ day, platform }) => ({ day, platform })), copy: copy ?? {
      campaign: 'Présenter votre offre', strategy: 'Faire découvrir, expliquer et inviter à poser une question.',
      posts: local.suggestions.map((p) => ({ headline: p.hook, caption: p.caption, cta: p.cta, storyboard: p.storyboard })) } };
}
async function creativePreview(tx: Tx, projectId: string, input: Extract<AssistantRequest, { kind: 'creative' }>, raw?: unknown) {
  const { spec, scene } = await creativeSource(tx, projectId, input, false);
  const local = raw === undefined ? await localTranslator.generate({ prompt: input.prompt,
    keys: spec.scenes.map((s) => s.key), selected: scene.key }, { signal: AbortSignal.timeout(1000), maxCostCents: 0, idempotencyKey: input.requestId }) as { sceneKey: string; changes: unknown } : null;
  const changes = local ? local.sceneKey === scene.key ? vettedChanges({ changes: local.changes }) : null : vettedChanges(raw);
  if (!changes) throw invalid();
  return { preview: previewOf(spec, { ...input.scope, schemaVersion: 1, changes, authorization: 'project-owner:confirm', estimatedCostCents: 0 }) };
}
async function fallbackResult(tx: Tx, projectId: string, input: AssistantRequest, s: Awaited<ReturnType<typeof snapshot>>) {
  if (input.kind === 'marketing') return marketingResult(s);
  if (input.kind === 'brainstorm') return brainstormResult(s as unknown as BrainstormSource);
  if (input.kind === 'agent') {
    const offlineAgent: AgentOutput = { schemaVersion: 1,
      reply: 'Hors ligne, je ne propose pas d’action automatique. Décrivez ce que vous voulez accomplir ; les recommandations outillées reviennent avec le fournisseur IA ou un opérateur humain.',
      tools: [] };
    return offlineAgent;
  }
  try { return await creativePreview(tx, projectId, input); }
  catch (e) {
    if (!(e instanceof HttpError || (e instanceof Error && e.name === 'ZodError'))) throw e;
    return { clarification: 'Aucune modification proposée. Sélectionnez la scène et précisez une valeur, par exemple : CTA "Parlons de votre projet" ; couleur #225588.' };
  }
}
const resultFields = (id: string, inputDigest: string, result: object, origin: string, reason: string) => ({
  result: dbJson(result), origin, reason, digest: hash([id, inputDigest, result, origin, reason])
});
export async function assistantHistory(userId: string, projectId: string) {
  await projectScope(prisma, userId, projectId);
  const config = vertexConfig();
  const account = config ? await prisma.executionAccount.findUnique({ where: { userId }, select: { enabled: true, tools: true } }) : null;
  return { model: config && account?.enabled && account.tools.includes(assistantTool) ? config.model : null,
    turns: await prisma.assistantTurn.findMany({ where: { projectId, project: { userId } }, select: turnSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 30 }) };
}
export async function createTurn(userId: string, projectId: string, raw: unknown) {
  const input = assistantRequest.parse(raw);
  return prisma.$transaction(async (tx) => {
    await projectScope(tx, userId, projectId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.requestId}, 48105))`;
    const existing = await tx.assistantTurn.findUnique({ where: { id: input.requestId }, select: { ...turnSelect, projectId: true } });
    if (existing) {
      if (existing.projectId !== projectId) throw missing();
      if (hash(existing.request) !== hash(input)) throw new HttpError(409, 'assistant_key_conflict', 'Identifiant de demande déjà utilisé.');
      return tx.assistantTurn.findUniqueOrThrow({ where: { id: input.requestId }, select: turnSelect });
    }
    if (input.kind === 'agent' && (await agentDepth(tx, projectId, input.parentId)) >= 6) {
      throw new HttpError(422, 'agent_steps_exhausted', 'Plafond d’étapes atteint. Concluez ou repartez d’une nouvelle conversation.');
    }
    const source = await snapshot(tx, userId, projectId, input);
    const context = { source, previous: await lineage(tx, projectId, input) };
    const config = input.engine === 'ai' ? vertexConfig() : null;
    if (input.engine === 'ai' && !config) throw unavailable();
    const providerProfile = config ? vertexProfile(config) : null;
    const inputDigest = hash([input, context, providerProfile]);
    const revision = input.kind === 'creative' ? input.scope.expectedRevision : 1;
    const result = config ? {} : resultFields(input.requestId, inputDigest, await fallbackResult(tx, projectId, input, source), 'offline', 'local');
    await tx.assistantTurn.create({ data: { id: input.requestId, projectId, parentId: input.parentId, kind: input.kind,
      revision, request: dbJson(input), snapshot: dbJson(context), inputDigest, providerProfile, ...result } });
    if (config) {
      const op = await proposeTx(tx, userId, projectId, { tool: assistantTool, key: input.requestId, revision });
      await tx.assistantTurn.update({ where: { id: input.requestId }, data: { operationId: op.id } });
    }
    return tx.assistantTurn.findUniqueOrThrow({ where: { id: input.requestId }, select: turnSelect });
  });
}
const frozen = (row: AssistantTurn) => row.snapshot as unknown as { source: Awaited<ReturnType<typeof snapshot>>; previous: Awaited<ReturnType<typeof lineage>> };
export async function generateAssistantClaim(job: { id: string; accountId: string; projectId: string; revision: number }, signal: AbortSignal,
  providerOverride?: AssistantProvider): Promise<{ costCents: number; costBasis: 'configured_estimate' }> {
  const op = await prisma.executionOperation.findFirst({ where: { id: job.id, accountId: job.accountId, projectId: job.projectId,
    revision: job.revision, state: 'CLAIMED', approvedBy: job.accountId, tool: assistantTool, project: { userId: job.accountId } } });
  const row = op && await prisma.assistantTurn.findFirst({ where: { id: op.key, projectId: job.projectId, revision: job.revision,
    operationId: op.id } });
  if (!row || !op || !row.providerProfile || row.result) throw missing();
  const input = assistantRequest.parse(row.request), { source, previous } = frozen(row);
  if (hash([input, row.snapshot, row.providerProfile]) !== row.inputDigest) throw stale();
  const config = vertexConfig();
  const c = input.kind === 'marketing' ? marketingContext.parse(source.context) : undefined;
  const modelInput: ModelInput = input.kind === 'marketing'
    ? { kind: 'marketing', data: minimizeModelData({ request: input.prompt, previous, business: source.profile, offer: c!.offer, week: c!.week, slots: marketingResult(source).slots, professionalReview: c!.regulated }) }
    : input.kind === 'creative'
      ? { kind: 'creative', data: minimizeModelData({ request: input.prompt, previous, business: source.profile, selectedScene: source.selected }) }
      : input.kind === 'agent'
        ? { kind: 'agent', data: minimizeModelData({ request: input.prompt, previous, business: source.profile, assets: assetNames((source as unknown as BrainstormSource).assets), tools: agentCatalog() }) }
        : { kind: 'brainstorm', data: minimizeModelData({ request: input.prompt, previous, business: source.profile, offer: (source as unknown as BrainstormSource).offer?.name ?? null, assets: assetNames((source as unknown as BrainstormSource).assets) }) };
  const fresh = await snapshot(prisma, job.accountId, job.projectId, input).then((s) => hash(s) === hash(source)).catch((error: unknown) => {
    if (error instanceof HttpError && [404, 409, 422].includes(error.statusCode)) return false;
    throw error;
  });
  let outcome: ReturnType<typeof receipt.parse> = { status: 'unavailable', costCents: 0 };
  let reason = 'provider_configuration_changed';
  if (fresh && config && vertexProfile(config) === row.providerProfile) {
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(20_000)]);
    let stop: (() => void) | undefined;
    try {
      deadline.throwIfAborted();
      const timeout = new Promise<never>((_, reject) => { stop = () => reject(Error('deadline')); deadline.addEventListener('abort', stop, { once: true }); });
      outcome = receipt.parse(await Promise.race([(providerOverride ?? vertexProvider(config)).generate(modelInput,
        { signal: deadline, maxCostCents: op.maxCents, idempotencyKey: op.id }), timeout]));
      reason = outcome.status;
    } catch { outcome = { status: deadline.aborted ? 'deadline' : 'invalid', costCents: null }; reason = outcome.status; }
    finally { if (stop) deadline.removeEventListener('abort', stop); }
  }
  let result: object | undefined;
  let origin = 'fallback';
  if (outcome.status === 'complete' && outcome.costCents !== null && outcome.costCents <= op.maxCents) {
    if (input.kind === 'marketing') {
      const copy = vettedCopy(outcome.output);
      if (copy) result = marketingResult(source, copy);
    } else if (input.kind === 'brainstorm') {
      const br = sanitizeBrainstorm(outcome.output, source as unknown as BrainstormSource);
      if (br) result = br;
    } else if (input.kind === 'agent') {
      const out = vettedAgentOutput(outcome.output);
      // P12-06 — une recommandation n'est persistée que si l'outil est dans le catalogue agent ET
      // que ses paramètres respectent son schéma : une sortie de modèle malformée n'atteint jamais
      // l'utilisateur (elle retombe sur le repli déterministe, jamais un faux succès).
      if (out)
        result = {
          ...out,
          tools: out.tools.filter((tool) => {
            if (!Object.prototype.hasOwnProperty.call(agentTools, tool.tool)) return false;
            if (!checkAgentProposal(tool.tool, toolPolicy(tool.tool)).ok) return false;
            return agentTools[tool.tool].params?.safeParse(tool.params).success === true;
          })
        };
    } else if (outcome.output !== undefined) {
      try { result = await creativePreview(prisma, job.projectId, input, outcome.output); }
      catch (e) { if (!(e instanceof HttpError || (e instanceof Error && e.name === 'ZodError'))) throw e; }
    }
    if (result) { origin = 'ai'; reason = 'validated'; } else reason = 'invalid_suggestion';
  } else if (outcome.costCents !== null && outcome.costCents > op.maxCents) reason = 'over_budget_receipt';
  if (!fresh) { reason = 'source_changed'; result = { clarification: 'Les sources ont changé. Préparez un nouveau brouillon.' }; }
  result ??= await fallbackResult(prisma, job.projectId, input, source);
  await prisma.$transaction(async (tx) => {
    // Hold the operation row so settlement/recovery cannot race the write.
    const claimed = await tx.$queryRaw`SELECT id FROM "ExecutionOperation" WHERE id=${op.id} AND state='CLAIMED' FOR UPDATE` as unknown[];
    if (signal.aborted || !claimed.length) throw stale();
    await tx.assistantTurn.update({ where: { id: row.id }, data: resultFields(row.id, row.inputDigest, result, origin, reason) });
  });
  if (outcome.costCents === null) throw Error('assistant_cost_unknown');
  // Jetons annoncés par le fournisseur × tarif configuré : estimation, jamais une facture.
  return { costCents: outcome.costCents, costBasis: 'configured_estimate' };
}
async function getMarketingTurn(tx: Tx, userId: string, projectId: string, id: string) {
  await projectScope(tx, userId, projectId);
  const row = await tx.assistantTurn.findFirst({ where: { id, projectId, kind: 'marketing' } });
  if (!row?.result || !row.digest) throw missing();
  const input = assistantRequest.parse(row.request);
  if (input.kind !== 'marketing') throw missing();
  const { source } = frozen(row);
  if (row.digest !== hash([id, row.inputDigest, row.result, row.origin, row.reason]) ||
    hash(source) !== hash(await snapshot(tx, userId, projectId, input))) throw stale();
  return { row, input, source };
}
export async function editMarketingTurn(userId: string, projectId: string, id: string, requestId: string, value: unknown) {
  const copy = vettedCopy(value);
  if (!copy) throw invalid();
  return prisma.$transaction(async (tx) => {
    const { row, input, source } = await getMarketingTurn(tx, userId, projectId, id);
    const request = { ...input, engine: 'offline', requestId, parentId: id, prompt: 'Révision manuelle du brouillon' };
    const context = { source, previous: [] };
    const result = marketingResult(source, copy);
    const inputDigest = hash([row.digest, request, result]);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${requestId}, 48105))`;
    const prev = await tx.assistantTurn.findUnique({ where: { id: requestId } });
    if (prev && (prev.projectId !== projectId || prev.inputDigest !== inputDigest)) throw stale();
    if (prev) return tx.assistantTurn.findUniqueOrThrow({ where: { id: requestId }, select: turnSelect });
    return tx.assistantTurn.create({ data: { id: requestId, projectId, revision: 1, kind: 'marketing', parentId: id,
      request: dbJson(request), snapshot: dbJson(context), inputDigest, ...resultFields(requestId, inputDigest, result, 'edited', 'manual') }, select: turnSelect });
  });
}
export async function approveMarketingTurn(userId: string, projectId: string, id: string, digest: string, professionalReview: boolean) {
  return prisma.$transaction(async (tx) => {
    const { row, source } = await getMarketingTurn(tx, userId, projectId, id);
    if (row.digest !== digest) throw stale();
    if (marketingContext.parse(source.context).regulated && !professionalReview)
      throw new HttpError(409, 'professional_review_required', 'Une relecture professionnelle est nécessaire.');
    const saved = await tx.assistantTurn.updateMany({ where: { id, digest, approvedAt: null }, data: { approvedAt: new Date() } });
    if (saved.count) await tx.auditEvent.create({ data: { actorId: userId, action: 'assistant.approved', targetType: 'assistant_turn',
      targetId: id, metadata: { digest, professionalReview } } });
    return tx.assistantTurn.findUniqueOrThrow({ where: { id }, select: turnSelect });
  });
}
