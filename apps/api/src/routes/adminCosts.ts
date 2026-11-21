import { prisma } from '@vululu/db';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { betaStatus } from '../betaMode';
import { billingConfig } from '../infrastructure/billing/config';
import { tools } from '../infrastructure/execution/registry';
import { availabilityOf } from '../infrastructure/execution/availability';

/**
 * P11-D — administration des coûts et budgets d'exécution.
 *
 * P12-08 — exactitude des agrégats : les totaux ne sont plus calculés sur une fenêtre tronquée de
 * 200 comptes / 500 opérations. Chaque total vient d'un agrégat SQL sur **toutes** les lignes ;
 * ce qui reste borné (liste des budgets, opérations récentes, incidents incertains) est étiqueté
 * avec sa taille de fenêtre, son total réel et son état de troncature.
 *
 * Lecture seule : aucune écriture financière, aucun remboursement, aucun débit. La réconciliation
 * reste la route existante avec coût constaté et preuve.
 */
const query = z
  .object({
    accountsPage: z.coerce.number().int().min(1).max(10000).optional(),
    operationsLimit: z.coerce.number().int().min(1).max(500).optional()
  })
  .strict();

const ACCOUNTS_PAGE_SIZE = 100;
const OPERATIONS_WINDOW = 500;
const UNCERTAIN_LIMIT = 50;

export async function adminCostRoutes(app: FastifyInstance): Promise<void> {
  const superAdminOnly = { preHandler: [app.authenticate, app.requireSuperAdmin] };

  app.get('/api/admin/costs/execution', superAdminOnly, async (request) => {
    const filters = query.parse(request.query ?? {});
    const accountsPage = filters.accountsPage ?? 1;
    const operationsLimit = filters.operationsLimit ?? OPERATIONS_WINDOW;
    const now = Date.now();

    const [accounts, accountsTotal, enabledAccounts, budgetAggregate, byCostStateRows, nullReportedRows, operations, operationsTotal, toolStateRows, costEvents, control, uncertainRows, uncertainTotal, uncertainByAccount] =
      await Promise.all([
        prisma.executionAccount.findMany({
          orderBy: { userId: 'asc' },
          skip: (accountsPage - 1) * ACCOUNTS_PAGE_SIZE,
          take: ACCOUNTS_PAGE_SIZE,
          select: {
            userId: true, enabled: true, limitCents: true, reservedCents: true, spentCents: true, tools: true,
            user: { select: { email: true, name: true, status: true } }
          }
        }),
        prisma.executionAccount.count(),
        prisma.executionAccount.count({ where: { enabled: true } }),
        prisma.executionAccount.aggregate({ _sum: { limitCents: true, reservedCents: true, spentCents: true } }),
        // Comptes et sommes par état de coût : source unique des totaux (aucune fenêtre).
        prisma.executionOperation.groupBy({
          by: ['costState'],
          _count: { _all: true },
          _sum: { maxCents: true, reportedCents: true }
        }),
        // Lignes ESTIMATED sans montant rapporté : la borne engagée est alors le plafond.
        prisma.executionOperation.groupBy({
          by: ['costState'],
          where: { reportedCents: null },
          _count: { _all: true },
          _sum: { maxCents: true }
        }),
        prisma.executionOperation.findMany({
          orderBy: { createdAt: 'desc' },
          take: operationsLimit,
          select: {
            id: true, tool: true, state: true, costState: true, maxCents: true, reportedCents: true,
            correlationId: true, createdAt: true, accountId: true, projectId: true,
            project: { select: { title: true } }
          }
        }),
        prisma.executionOperation.count(),
        // Agrégat par outil ET par état : les colonnes confirmées/incertaines restent séparées.
        prisma.executionOperation.groupBy({
          by: ['tool', 'costState'],
          _count: { _all: true },
          _sum: { maxCents: true, reportedCents: true }
        }),
        prisma.costEvent.groupBy({ by: ['provider'], _count: { _all: true }, _sum: { amountCents: true } }),
        prisma.billingControl.findUnique({ where: { id: 'commercial' }, select: { enabled: true, mode: true } }),
        prisma.executionOperation.findMany({
          where: { OR: [{ state: 'UNKNOWN' }, { costState: 'UNKNOWN' }] },
          orderBy: { createdAt: 'desc' },
          take: UNCERTAIN_LIMIT,
          select: {
            id: true, tool: true, state: true, costState: true, maxCents: true, correlationId: true,
            createdAt: true, accountId: true, project: { select: { title: true } }
          }
        }),
        prisma.executionOperation.count({ where: { OR: [{ state: 'UNKNOWN' }, { costState: 'UNKNOWN' }] } }),
        prisma.executionOperation.groupBy({
          by: ['accountId'],
          where: { OR: [{ state: 'UNKNOWN' }, { costState: 'UNKNOWN' }] },
          _count: { _all: true }
        })
      ]);

    const stateRow = new Map(byCostStateRows.map((row) => [row.costState, row]));
    const nullReported = new Map(nullReportedRows.map((row) => [row.costState, row]));
    const maxOf = (state: string) => stateRow.get(state)?._sum.maxCents ?? 0;
    const reportedOf = (state: string) => stateRow.get(state)?._sum.reportedCents ?? 0;

    const byCostState: Record<string, number> = {};
    for (const row of byCostStateRows) byCostState[row.costState] = row._count._all;

    // Chaque nature de coût reste distincte : estimation (borne), réservé, confirmé (rapporté ou
    // constaté), incertain, libéré. Aucun montant n'est fondu dans un total ambigu.
    const estimatedCents = reportedOf('ESTIMATED') + (nullReported.get('ESTIMATED')?._sum.maxCents ?? 0);
    const reservedCents = maxOf('RESERVED');
    const confirmedCents = reportedOf('REPORTED') + reportedOf('RECONCILED');
    const uncertainCents = maxOf('UNKNOWN');
    const releasedCents = maxOf('RELEASED');
    const maxExposureCents = reservedCents + uncertainCents;

    const providerOf = (toolKey: string) => tools[toolKey as keyof typeof tools]?.provider ?? 'unknown';
    const emailOf = new Map(accounts.map((account) => [account.userId, account.user.email]));
    const uncertainPerAccount = new Map(uncertainByAccount.map((row) => [row.accountId, row._count._all]));

    type ToolRow = { tool: string; provider: string; operations: number; maxCents: number; confirmedCents: number; uncertainCents: number };
    const toolMap = new Map<string, ToolRow>();
    for (const row of toolStateRows) {
      const entry = toolMap.get(row.tool) ?? {
        tool: row.tool, provider: providerOf(row.tool), operations: 0, maxCents: 0, confirmedCents: 0, uncertainCents: 0
      };
      entry.operations += row._count._all;
      entry.maxCents += row._sum.maxCents ?? 0;
      if (row.costState === 'REPORTED' || row.costState === 'RECONCILED')
        entry.confirmedCents += row._sum.reportedCents ?? 0;
      if (row.costState === 'UNKNOWN') entry.uncertainCents += row._sum.maxCents ?? 0;
      toolMap.set(row.tool, entry);
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

    const budgets = accounts.map((account) => {
      const committed = account.spentCents + account.reservedCents;
      const remainingCents = account.limitCents - committed;
      const percentUsed = account.limitCents > 0 ? Math.round((committed / account.limitCents) * 1000) / 10 : null;
      const uncertainOperations = uncertainPerAccount.get(account.userId) ?? 0;
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

    const uncertain = uncertainRows.map((operation) => ({
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
    const limitCents = budgetAggregate._sum.limitCents ?? 0;
    const spentCents = budgetAggregate._sum.spentCents ?? 0;
    const reservedBudgetCents = budgetAggregate._sum.reservedCents ?? 0;
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
      // P12-08 — périmètre explicite de chaque total : plus aucun agrégat partiel non étiqueté.
      scope: {
        summary: 'all execution operations (all-time)',
        budgetTotals: 'all execution accounts',
        ledger: 'all cost events (all-time, mock router)',
        budgets: { page: accountsPage, pageSize: ACCOUNTS_PAGE_SIZE, total: accountsTotal, returned: budgets.length, truncated: budgets.length < accountsTotal },
        recentOperations: { limit: operationsLimit, total: operationsTotal, returned: operations.length, truncated: operations.length < operationsTotal },
        uncertain: { limit: UNCERTAIN_LIMIT, total: uncertainTotal, returned: uncertain.length, truncated: uncertain.length < uncertainTotal }
      },
      summary: {
        estimatedCents,
        reservedCents,
        confirmedCents,
        uncertainCents,
        releasedCents,
        maxExposureCents,
        byCostState,
        operations: operationsTotal
      },
      budgetTotals: {
        accounts: accountsTotal,
        enabledAccounts,
        limitCents,
        reservedCents: reservedBudgetCents,
        spentCents,
        remainingCents: limitCents - spentCents - reservedBudgetCents
      },
      budgets,
      byTool,
      byProvider,
      uncertain,
      operations,
      ledger: {
        events: costEvents.reduce((total, row) => total + row._count._all, 0),
        cents: costEvents.reduce((total, row) => total + (row._sum.amountCents ?? 0), 0),
        providers: costEvents
          .map((row) => ({ provider: row.provider, events: row._count._all, cents: row._sum.amountCents ?? 0 }))
          .sort((left, right) => right.cents - left.cents)
      },
      reconciliation: { route: '/api/admin/execution/:id/resolve', requiresCents: true, requiresEvidence: true }
    };
  });
}
