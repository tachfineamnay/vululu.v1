import { prisma } from '@vululu/db';
import type { FastifyInstance } from 'fastify';
import { betaStatus } from '../betaMode';
import { billingConfig } from '../infrastructure/billing/config';
import { tools } from '../infrastructure/execution/registry';
import { availabilityOf } from '../infrastructure/execution/availability';

/**
 * P11-D — administration des coûts et budgets d'exécution.
 *
 * Lecture seule : budgets par compte (plafond, réservé, consommé, restant), coûts par
 * outil et fournisseur, distinction estimation / charge confirmée, opérations à coût
 * incertain et état commercial. Aucune écriture financière, aucun remboursement,
 * aucun débit, aucune libération silencieuse d'une réservation incertaine : la
 * réconciliation reste la route existante avec coût constaté et preuve.
 */
export async function adminCostRoutes(app: FastifyInstance): Promise<void> {
  const superAdminOnly = { preHandler: [app.authenticate, app.requireSuperAdmin] };

  app.get('/api/admin/costs/execution', superAdminOnly, async () => {
    const now = Date.now();
    const [accounts, operations, costEvents, control] = await Promise.all([
      prisma.executionAccount.findMany({
        orderBy: { userId: 'asc' },
        take: 200,
        select: {
          userId: true, enabled: true, limitCents: true, reservedCents: true, spentCents: true, tools: true,
          user: { select: { email: true, name: true, status: true } }
        }
      }),
      prisma.executionOperation.findMany({
        orderBy: { createdAt: 'desc' },
        take: 500,
        select: {
          id: true, tool: true, state: true, costState: true, maxCents: true, reportedCents: true,
          correlationId: true, createdAt: true, accountId: true, projectId: true,
          project: { select: { title: true } }
        }
      }),
      prisma.costEvent.groupBy({ by: ['provider'], _count: { _all: true }, _sum: { amountCents: true } }),
      prisma.billingControl.findUnique({ where: { id: 'commercial' }, select: { enabled: true, mode: true } })
    ]);

    const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
    const providerOf = (toolKey: string) => tools[toolKey as keyof typeof tools]?.provider ?? 'unknown';
    const emailOf = new Map(accounts.map((account) => [account.userId, account.user.email]));

    const byCostState: Record<string, number> = {};
    for (const operation of operations) byCostState[operation.costState] = (byCostState[operation.costState] ?? 0) + 1;
    // Une estimation réglée porte son montant estimé ; à défaut, le plafond engagé reste la borne.
    const estimatedCents = sum(operations.filter((op) => op.costState === 'ESTIMATED').map((op) => op.reportedCents ?? op.maxCents));
    const reservedCents = sum(operations.filter((op) => op.costState === 'RESERVED').map((op) => op.maxCents));
    const confirmedCents = sum(operations
      .filter((op) => op.costState === 'REPORTED' || op.costState === 'RECONCILED')
      .map((op) => op.reportedCents ?? 0));
    const uncertainCents = sum(operations.filter((op) => op.costState === 'UNKNOWN').map((op) => op.maxCents));
    const releasedCents = sum(operations.filter((op) => op.costState === 'RELEASED').map((op) => op.maxCents));
    const maxExposureCents = sum(operations
      .filter((op) => op.costState === 'RESERVED' || op.costState === 'UNKNOWN')
      .map((op) => op.maxCents));

    type ToolRow = { tool: string; provider: string; operations: number; maxCents: number; confirmedCents: number; uncertainCents: number };
    const toolMap = new Map<string, ToolRow>();
    for (const operation of operations) {
      const entry = toolMap.get(operation.tool) ?? {
        tool: operation.tool, provider: providerOf(operation.tool), operations: 0, maxCents: 0, confirmedCents: 0, uncertainCents: 0
      };
      entry.operations += 1;
      entry.maxCents += operation.maxCents;
      // Seuls un montant fournisseur (REPORTED) ou un constat humain (RECONCILED) sont confirmés.
      if (operation.costState === 'REPORTED' || operation.costState === 'RECONCILED')
        entry.confirmedCents += operation.reportedCents ?? 0;
      if (operation.costState === 'UNKNOWN' || operation.state === 'UNKNOWN') entry.uncertainCents += operation.maxCents;
      toolMap.set(operation.tool, entry);
    }
    const byTool = [...toolMap.values()].sort((left, right) => right.maxCents - left.maxCents);

    const providerMap = new Map<string, { provider: string; tools: Set<string>; operations: number; maxCents: number; confirmedCents: number; uncertainCents: number }>();
    for (const entry of byTool) {
      const provider = providerMap.get(entry.provider) ?? {
        provider: entry.provider, tools: new Set<string>(), operations: 0, maxCents: 0, confirmedCents: 0, uncertainCents: 0
      };
      provider.tools.add(entry.tool);
      provider.operations += entry.operations;
      provider.maxCents += entry.maxCents;
      provider.confirmedCents += entry.confirmedCents;
      provider.uncertainCents += entry.uncertainCents;
      providerMap.set(entry.provider, provider);
    }
    const byProvider = [...providerMap.values()]
      .map((entry) => {
        const state = availabilityOf(entry.provider);
        return {
          provider: entry.provider,
          tools: entry.tools.size,
          operations: entry.operations,
          maxCents: entry.maxCents,
          confirmedCents: entry.confirmedCents,
          uncertainCents: entry.uncertainCents,
          availability: state.availability,
          availabilityReason: state.reason
        };
      })
      .sort((left, right) => right.maxCents - left.maxCents);

    const uncertainByAccount = new Map<string, number>();
    for (const operation of operations)
      if (operation.state === 'UNKNOWN' || operation.costState === 'UNKNOWN')
        uncertainByAccount.set(operation.accountId, (uncertainByAccount.get(operation.accountId) ?? 0) + 1);

    const budgets = accounts.map((account) => {
      const committed = account.spentCents + account.reservedCents;
      const remainingCents = account.limitCents - committed;
      const percentUsed = account.limitCents > 0 ? Math.round((committed / account.limitCents) * 1000) / 10 : null;
      const uncertainOperations = uncertainByAccount.get(account.userId) ?? 0;
      const alert =
        uncertainOperations > 0
          ? 'unknown'
          : account.limitCents > 0 && remainingCents <= 0
            ? 'exhausted'
            : percentUsed !== null && percentUsed >= 90
              ? 'critical'
              : percentUsed !== null && percentUsed >= 75
                ? 'warning'
                : 'ok';
      return {
        userId: account.userId,
        email: account.user.email,
        name: account.user.name,
        status: account.user.status,
        enabled: account.enabled,
        limitCents: account.limitCents,
        reservedCents: account.reservedCents,
        spentCents: account.spentCents,
        remainingCents,
        percentUsed,
        toolsCount: account.tools.length,
        uncertainOperations,
        alert
      };
    });

    const uncertain = operations
      .filter((operation) => operation.state === 'UNKNOWN' || operation.costState === 'UNKNOWN')
      .slice(0, 50)
      .map((operation) => ({
        id: operation.id,
        tool: operation.tool,
        provider: providerOf(operation.tool),
        state: operation.state,
        costState: operation.costState,
        maxCents: operation.maxCents,
        correlationId: operation.correlationId,
        createdAt: operation.createdAt.toISOString(),
        ageMs: Math.max(0, now - operation.createdAt.getTime()),
        accountId: operation.accountId,
        ownerEmail: emailOf.get(operation.accountId) ?? null,
        projectTitle: operation.project.title
      }));

    const status = betaStatus();
    const config = billingConfig();
    return {
      generatedAt: new Date(now).toISOString(),
      commercial: {
        betaMode: status.beta,
        mode: status.mode,
        paymentsFrozen: status.paymentsFrozen,
        checkout: status.checkout,
        billingControlEnabled: control?.enabled ?? false,
        billingControlMode: control?.mode ?? null,
        stripeLiveMode: config ? config.live : false,
        stripeCheckoutEnabled: config ? config.checkoutEnabled : false
      },
      summary: {
        estimatedCents,
        reservedCents,
        confirmedCents,
        uncertainCents,
        releasedCents,
        maxExposureCents,
        byCostState
      },
      budgetTotals: {
        accounts: budgets.length,
        enabledAccounts: budgets.filter((budget) => budget.enabled).length,
        limitCents: sum(budgets.map((budget) => budget.limitCents)),
        reservedCents: sum(budgets.map((budget) => budget.reservedCents)),
        spentCents: sum(budgets.map((budget) => budget.spentCents)),
        remainingCents: sum(budgets.map((budget) => budget.remainingCents))
      },
      budgets,
      byTool,
      byProvider,
      uncertain,
      ledger: {
        events: costEvents.reduce((total, row) => total + row._count._all, 0),
        cents: sum(costEvents.map((row) => row._sum.amountCents ?? 0)),
        providers: costEvents
          .map((row) => ({ provider: row.provider, events: row._count._all, cents: row._sum.amountCents ?? 0 }))
          .sort((left, right) => right.cents - left.cents)
      },
      reconciliation: { route: '/api/admin/execution/:id/resolve', requiresCents: true, requiresEvidence: true }
    };
  });
}
