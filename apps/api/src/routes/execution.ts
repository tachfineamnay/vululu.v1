import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@vululu/db';
import { agentOutput } from '@vululu/contracts';
import { approve, cancel, propose, resolveIncident } from '../infrastructure/execution/broker';
import { loadOperationResult, resolveOperationRows } from '../infrastructure/execution/operationResults';
import { tools, toolSchema, toolPolicy, type Tool } from '../infrastructure/execution/registry';
import { checkAgentProposal } from '../application/agentProposalPolicy';
import { rateLimitPreHandler } from '../infrastructure/security/rateLimiter';
import {demoDisabled} from '../releaseMode';
import { HttpError } from '../errors';
export async function executionRoutes(app: FastifyInstance) {
  const rate = rateLimitPreHandler(
    { name: 'execution', limit: 40, windowSeconds: 60, failClosed: true },
    (r) => 'execution:' + r.currentUser!.id
  );
  const auth = { preHandler: [app.authenticate, rate] },
    admin = { preHandler: [app.requireSuperAdmin, rate] };
  const id = (p: unknown) => z.object({ id: z.uuid() }).parse(p).id;
  app.get('/api/admin/execution/incidents', admin, () =>
    prisma.executionOperation.findMany({
      where: { state: 'UNKNOWN' },
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: {
        id: true,
        accountId: true,
        projectId: true,
        correlationId: true,
        tool: true,
        maxCents: true,
        createdAt: true
      }
    })
  );
  // P11-B — politique d'exécution par compte : outils autorisés, plafond, consommation.
  // Lecture seule ; aucune définition d'outil arbitraire, aucun secret.
  app.get('/api/admin/execution/accounts', admin, async () => {
    const items = await prisma.executionAccount.findMany({
      orderBy: [{ enabled: 'desc' }, { userId: 'asc' }],
      take: 100,
      select: { userId: true, enabled: true, limitCents: true, reservedCents: true, spentCents: true, tools: true }
    });
    return { items };
  });
  app.get('/api/admin/execution/accounts/:account', admin, async (r) => {
    const account = z.string().min(1).max(128).parse((r.params as { account?: string }).account);
    const row = await prisma.executionAccount.findUnique({
      where: { userId: account },
      select: { userId: true, enabled: true, limitCents: true, reservedCents: true, spentCents: true, tools: true }
    });
    if (!row) throw new HttpError(404, 'execution_account_not_found', 'Compte d’exécution introuvable.');
    return row;
  });
  app.get('/api/execution/tools', auth, () => Object.fromEntries(Object.entries(tools)
    .filter(([key]) => !demoDisabled() || !key.startsWith('sandbox.'))
    .map(([key, definition]) => [key, {
      action: definition.action, scope: definition.scope, approval: definition.approval,
      maxCents: definition.maxCents, description: definition.description,
      proposable: definition.params !== undefined
    }])));
  app.put('/api/admin/execution/accounts/:account', admin, async (r) => {
    const { account } = z.object({ account: z.string().min(1).max(128) }).parse(r.params);
    const data = z
      .object({
        limitCents: z.int().min(0).max(1000000000),
        enabled: z.boolean(),
        tools: z.array(toolSchema).max(Object.keys(tools).length)
      })
      .strict()
      .parse(r.body);
    return prisma.$transaction(async (tx) => {
      const a = await tx.executionAccount.upsert({
        where: { userId: account },
        create: { userId: account, ...data },
        update: data
      });
      await tx.auditEvent.create({
        data: {
          actorId: r.currentUser!.id,
          targetType: 'execution_account',
          targetId: account,
          action: 'execution.policy_updated',
          metadata: data
        }
      });
      return a;
    });
  });
  app.post('/api/projects/:projectId/execution', auth, (r) =>
    propose(r.currentUser!.id, z.object({ projectId: z.string().max(128) }).parse(r.params).projectId, r.body)
  );
  // P05 : l'agent recommande, Vululu valide puis autorise. Statut réel des opérations du projet.
  app.get('/api/projects/:projectId/execution', auth, async (r) => {
    const { projectId } = z.object({ projectId: z.string().max(128) }).parse(r.params);
    const items = await prisma.executionOperation.findMany({
      where: { projectId, accountId: r.currentUser!.id, project: { userId: r.currentUser!.id } },
      orderBy: { createdAt: 'desc' }, take: 30,
      select: { id: true, accountId: true, tool: true, state: true, costState: true, maxCents: true, reportedCents: true,
        result: true, createdAt: true, agentTurnId: true, step: true, digest: true, approvedBy: true }
    });
    // Résolution transparente : un gros résultat est relu depuis son payload vérifié.
    return { items: await resolveOperationRows(items) };
  });
  app.post('/api/projects/:projectId/execution/agent', auth, async (r) => {
    const { projectId } = z.object({ projectId: z.string().max(128) }).parse(r.params);
    const body = z.strictObject({ turnId: z.uuid(), index: z.int().min(0).max(3) }).parse(r.body);
    const user = r.currentUser!.id;
    const turn = await prisma.assistantTurn.findFirst({
      where: { id: body.turnId, projectId, kind: 'agent', project: { userId: user } },
      select: { id: true, result: true }
    });
    if (!turn) throw new HttpError(404, 'assistant_not_found', 'Tour d’agent introuvable.');
    const output = agentOutput.safeParse(turn.result);
    if (!output.success) throw new HttpError(422, 'agent_output_invalid', 'Recommandation invalide.');
    const recommendation = output.data.tools[body.index];
    if (!recommendation) throw new HttpError(422, 'agent_proposal_missing', 'Recommandation absente à cet index.');
    // L'agent ne peut recommander qu'un outil du catalogue agent : ni outil réservé à l'utilisateur
    // (agentProposable: false), ni outil borné à une révision précise (l'agent n'en connaît aucune).
    const policy = checkAgentProposal(recommendation.tool, toolPolicy(recommendation.tool));
    if (!policy.ok) throw new HttpError(policy.code === 'agent_scope_unsupported' ? 409 : 403, policy.code, policy.message);
    const definition = tools[recommendation.tool as Tool];
    // Paramètres revalidés ici, jamais repris tels quels du modèle.
    const params = definition.params!.parse(recommendation.params);
    return propose(user, projectId,
      { key: turn.id + ':' + body.index, tool: recommendation.tool as Tool, revision: 1 },
      { agentTurnId: turn.id, step: body.index, params });
  });
  app.get('/api/execution/:id', auth, async (r) => {
    const o = await prisma.executionOperation.findFirst({
      where: { id: id(r.params), accountId: r.currentUser!.id, project: { userId: r.currentUser!.id } }
    });
    if (!o) throw new HttpError(404, 'execution_not_found', 'Opération introuvable');
    return { ...o, result: await loadOperationResult({ accountId: o.accountId, result: o.result }) };
  });
  app.post('/api/execution/:id/approve', auth, (r) =>
    approve(
      r.currentUser!.id,
      id(r.params),
      z
        .object({ digest: z.string().regex(/^[a-f0-9]{64}$/) })
        .strict()
        .parse(r.body).digest
    )
  );
  app.post('/api/execution/:id/cancel', auth, (r) => cancel(r.currentUser!.id, id(r.params)));
  app.post('/api/admin/execution/:id/resolve', admin, (r) => {
    const b = z.object({ cents: z.int().nonnegative(), evidence: z.uuid() }).strict().parse(r.body);
    return resolveIncident(r.currentUser!.id, id(r.params), b.cents, b.evidence);
  });
}
