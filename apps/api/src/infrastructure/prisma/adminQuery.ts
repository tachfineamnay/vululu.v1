import type { PrismaClient } from '@prisma/client';
import { prisma } from '@vululu/db';
import type {
  AdminAuditEventRecord,
  AdminAuditQuery,
  AdminCostEventRecord,
  AdminCostQuery,
  AdminCostsRecord,
  AdminFlagRecord,
  AdminOverviewRecord,
  AdminPageInput,
  AdminPageRecord,
  AdminProjectRecord,
  AdminQueryPort,
  AdminRoutingDecisionRecord,
  AdminRunDetailRecord,
  AdminRunQuery,
  AdminRunRecord,
  AdminRuntimeRecord,
  AdminUserRecord,
  ArtifactStoragePort
} from '@vululu/application';

const DAY_MS = 24 * 60 * 60 * 1000;
const WORKER_STALE_MS = 30 * 1000;

type CountRow = { status: string; _count: { _all: number } };

function toCountMap(rows: CountRow[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const row of rows) {
    result[row.status] = row._count._all;
  }
  return result;
}

function pageOf<T>(items: T[], total: number, input: AdminPageInput): AdminPageRecord<T> {
  return {
    items,
    page: input.page,
    pageSize: input.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / input.pageSize))
  };
}

function dateOrUndefined(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function errorMessage(value: unknown): string {
  if (value instanceof Error) return value.name + ': ' + value.message;
  return String(value);
}

function buildFlags(input: {
  orchestratorMode: 'local' | 'hatchet';
  storageBackend: 'local' | 's3';
  storageOk: boolean;
  postizMode: 'MOCK' | 'REAL';
  providersMode: 'MOCK' | 'REAL';
}): AdminFlagRecord[] {
  return [
    {
      key: 'admin.ui',
      label: 'Interface admin',
      status: 'CONNECTED',
      detail: 'Routes /admin protegees par la session serveur et le role super_admin.'
    },
    {
      key: 'orchestration.hatchet',
      label: 'Orchestration Hatchet',
      status: input.orchestratorMode === 'hatchet' ? 'CONNECTED' : 'NOT_CONNECTED',
      detail:
        input.orchestratorMode === 'hatchet'
          ? 'Mode Hatchet configure ; engine et token requis pour un run reel.'
          : 'Mode local in-process : non durable, aucune reprise apres crash.'
    },
    {
      key: 'storage.s3',
      label: 'Stockage S3',
      status: input.storageBackend === 's3' && input.storageOk ? 'CONNECTED' : 'NOT_CONNECTED',
      detail:
        input.storageBackend === 's3'
          ? 'Backend S3 configure ; sante ' + (input.storageOk ? 'OK' : 'en erreur') + '.'
          : 'Backend local filesystem ; S3 non actif.'
    },
    {
      key: 'providers.real',
      label: 'Providers IA reels',
      status: input.providersMode === 'REAL' ? 'CONNECTED' : 'MOCK',
      detail:
        input.providersMode === 'REAL'
          ? 'Provider reel configure.'
          : 'Providers mock deterministes uniquement ; aucun modele IA ni cout reel.'
    },
    {
      key: 'postiz.real',
      label: 'Postiz reel',
      status: input.postizMode === 'REAL' ? 'CONNECTED' : 'MOCK',
      detail: 'Adaptateur postiz-mock : transfert local idempotent, aucune publication.'
    },
    {
      key: 'costs.real',
      label: 'Couts reels',
      status: 'MOCK',
      detail: 'CostEvent alimente par des providers mock ; aucun cout fournisseur reel.'
    },
    { key: 'mcp', label: 'MCP V1', status: 'NOT_CONNECTED', detail: 'Aucun serveur MCP implemente.' },
    { key: 'audio', label: 'Audio / voix / musique', status: 'NOT_CONNECTED', detail: 'Piste AAC silencieuse seulement.' },
    { key: 'campaigns', label: 'Campagnes', status: 'NOT_CONNECTED', detail: 'Le projet est l unite ; aucun modele Campaign.' },
    { key: 'assets', label: 'Bibliotheque d assets', status: 'NOT_CONNECTED', detail: 'Aucun modele Asset ni upload.' },
    { key: 'mfa', label: 'MFA', status: 'NOT_CONNECTED', detail: 'Non implemente (dette P2).' }
  ];
}

export type PrismaAdminQueryOptions = {
  database?: PrismaClient;
  storage?: ArtifactStoragePort;
  orchestratorMode?: () => 'local' | 'hatchet';
  storageBackend?: () => 'local' | 's3';
};

/**
 * Adaptateur Prisma des lectures d'administration.
 * Aucune ecriture, aucun secret : seules des metadonnees sont lues.
 */
export class PrismaAdminQuery implements AdminQueryPort {
  private readonly db: PrismaClient;
  private readonly storage?: ArtifactStoragePort;
  private readonly orchestratorMode: () => 'local' | 'hatchet';
  private readonly storageBackend: () => 'local' | 's3';

  constructor(options: PrismaAdminQueryOptions = {}) {
    this.db = options.database ?? prisma;
    this.storage = options.storage;
    this.orchestratorMode =
      options.orchestratorMode ??
      (() => (process.env.ORCHESTRATOR_MODE === 'hatchet' ? 'hatchet' : 'local'));
    this.storageBackend =
      options.storageBackend ??
      (() => (process.env.ARTIFACT_STORAGE_BACKEND === 's3' ? 's3' : 'local'));
  }

  private async storageHealth(): Promise<{ ok: boolean; detail: string }> {
    if (!this.storage) {
      return { ok: false, detail: 'Aucun port de stockage injecte.' };
    }
    try {
      await this.storage.head('__vululu_admin_health__');
      return { ok: true, detail: 'Lecture de sante du backend OK.' };
    } catch (error) {
      return { ok: false, detail: 'Backend inaccessible : ' + errorMessage(error) };
    }
  }

  async overview(): Promise<AdminOverviewRecord> {
    let database: 'ok' | 'error' = 'ok';
    try {
      await this.db.$queryRawUnsafe('SELECT 1');
    } catch {
      database = 'error';
    }

    const storageHealth = await this.storageHealth();
    const orchestratorMode = this.orchestratorMode();
    const storageBackend = this.storageBackend();
    const flags = buildFlags({
      orchestratorMode,
      storageBackend,
      storageOk: storageHealth.ok,
      postizMode: 'MOCK',
      providersMode: 'MOCK'
    });

    if (database === 'error') {
      return {
        generatedAt: new Date().toISOString(),
        counts: {
          users: 0,
          superAdmins: 0,
          invitations: 0,
          pendingInvitations: 0,
          contexts: 0,
          projects: 0,
          jobRuns: 0,
          failedRuns: 0,
          auditEvents24h: 0,
          rbacDenied24h: 0,
          costEvents: 0,
          costCents: 0
        },
        runsByStatus: {},
        stepsByStatus: {},
        outboxByStatus: {},
        artifactsByState: {},
        workers: { active: 0, stale: 0, total: 0 },
        database,
        storage: { backend: storageBackend, ok: storageHealth.ok, detail: storageHealth.detail },
        orchestrator: {
          mode: orchestratorMode,
          detail: orchestratorMode === 'hatchet' ? 'Mode Hatchet configure.' : 'Mode local in-process non durable.'
        },
        providers: { mode: 'MOCK', detail: 'Providers mock uniquement.' },
        postiz: { mode: 'MOCK', detail: 'Adaptateur postiz-mock.' },
        flags,
        recentErrors: []
      };
    }

    const since = new Date(Date.now() - DAY_MS);
    const [
      users,
      superAdmins,
      invitations,
      pendingInvitations,
      contexts,
      projects,
      jobRuns,
      failedRuns,
      auditEvents24h,
      rbacDenied24h,
      costAggregate,
      runsByStatus,
      stepsByStatus,
      outboxByStatus,
      artifactsByState,
      workers,
      failedJobRuns,
      failedStepRuns,
      failedOutbox
    ] = await Promise.all([
      this.db.user.count(),
      this.db.user.count({ where: { role: 'super_admin' } }),
      this.db.invitation.count(),
      this.db.invitation.count({ where: { usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } }),
      this.db.brandContext.count(),
      this.db.project.count(),
      this.db.jobRun.count(),
      this.db.jobRun.count({ where: { status: 'failed' } }),
      this.db.auditEvent.count({ where: { createdAt: { gte: since } } }),
      this.db.auditEvent.count({ where: { action: 'rbac.denied', createdAt: { gte: since } } }),
      this.db.costEvent.aggregate({ _sum: { amountCents: true }, _count: { _all: true } }),
      this.db.jobRun.groupBy({ by: ['status'], _count: { _all: true } }),
      this.db.stepRun.groupBy({ by: ['status'], _count: { _all: true } }),
      this.db.orchestrationOutbox.groupBy({ by: ['status'], _count: { _all: true } }),
      this.db.artifactObject.groupBy({ by: ['state'], _count: { _all: true } }),
      this.db.workerHeartbeat.findMany({ orderBy: { lastSeenAt: 'desc' }, take: 50 }),
      this.db.jobRun.findMany({
        where: { status: 'failed' },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: { id: true, status: true, projectId: true, updatedAt: true, productionJob: { select: { error: true } } }
      }),
      this.db.stepRun.findMany({
        where: { status: 'failed' },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, status: true, error: true, jobRunId: true, jobRun: { select: { projectId: true } } }
      }),
      this.db.orchestrationOutbox.findMany({
        where: { status: 'failed' },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: { id: true, status: true, lastError: true, jobRunId: true, updatedAt: true }
      })
    ]);

    const now = Date.now();
    const activeWorkers = workers.filter((worker) => now - worker.lastSeenAt.getTime() <= WORKER_STALE_MS).length;

    const recentErrors: AdminOverviewRecord['recentErrors'] = [
      ...failedJobRuns.map((run) => ({
        id: run.id,
        source: 'job_run' as const,
        status: run.status,
        error: run.productionJob?.error ?? 'JobRun en echec.',
        createdAt: run.updatedAt.toISOString(),
        jobRunId: run.id,
        projectId: run.projectId
      })),
      ...failedStepRuns.map((step) => ({
        id: step.id,
        source: 'step_run' as const,
        status: step.status,
        error: step.error ?? 'StepRun en echec.',
        createdAt: new Date(now).toISOString(),
        jobRunId: step.jobRunId,
        projectId: step.jobRun.projectId
      })),
      ...failedOutbox.map((row) => ({
        id: row.id,
        source: 'outbox' as const,
        status: row.status,
        error: row.lastError ?? 'Outbox en echec.',
        createdAt: row.updatedAt.toISOString(),
        jobRunId: row.jobRunId,
        projectId: null
      }))
    ]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 8);

    return {
      generatedAt: new Date().toISOString(),
      counts: {
        users,
        superAdmins,
        invitations,
        pendingInvitations,
        contexts,
        projects,
        jobRuns,
        failedRuns,
        auditEvents24h,
        rbacDenied24h,
        costEvents: costAggregate._count._all,
        costCents: costAggregate._sum.amountCents ?? 0
      },
      runsByStatus: toCountMap(runsByStatus),
      stepsByStatus: toCountMap(stepsByStatus),
      outboxByStatus: toCountMap(outboxByStatus),
      artifactsByState: Object.fromEntries(artifactsByState.map((row) => [row.state, row._count._all])),
      workers: {
        active: activeWorkers,
        stale: workers.length - activeWorkers,
        total: workers.length
      },
      database,
      storage: { backend: storageBackend, ok: storageHealth.ok, detail: storageHealth.detail },
      orchestrator: {
        mode: orchestratorMode,
        detail: orchestratorMode === 'hatchet' ? 'Mode Hatchet configure.' : 'Mode local in-process non durable.'
      },
      providers: { mode: 'MOCK', detail: 'Providers mock deterministes uniquement.' },
      postiz: { mode: 'MOCK', detail: 'Adaptateur postiz-mock ; aucune publication.' },
      flags,
      recentErrors
    };
  }

  async listUsers(input: AdminPageInput): Promise<AdminPageRecord<AdminUserRecord>> {
    const where = input.q
      ? {
          OR: [
            { email: { contains: input.q, mode: 'insensitive' as const } },
            { name: { contains: input.q, mode: 'insensitive' as const } }
          ]
        }
      : {};
    const [total, rows] = await Promise.all([
      this.db.user.count({ where }),
      this.db.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
          _count: { select: { projects: true, sessions: true } },
          sessions: {
            orderBy: { lastUsedAt: 'desc' },
            take: 1,
            select: { lastUsedAt: true, revokedAt: true, expiresAt: true }
          }
        }
      })
    ]);
    const items: AdminUserRecord[] = rows.map((row) => {
      const session = row.sessions[0];
      let lastSessionStatus: AdminUserRecord['lastSessionStatus'] = 'none';
      if (session) {
        if (session.revokedAt) lastSessionStatus = 'revoked';
        else if (session.expiresAt.getTime() <= Date.now()) lastSessionStatus = 'expired';
        else lastSessionStatus = 'active';
      }
      return {
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role,
        createdAt: row.createdAt.toISOString(),
        projectsCount: row._count.projects,
        sessionsCount: row._count.sessions,
        lastSessionAt: session ? session.lastUsedAt.toISOString() : null,
        lastSessionStatus
      };
    });
    return pageOf(items, total, input);
  }

  async listProjects(input: AdminPageInput): Promise<AdminPageRecord<AdminProjectRecord>> {
    const where = input.q
      ? {
          OR: [
            { title: { contains: input.q, mode: 'insensitive' as const } },
            { user: { email: { contains: input.q, mode: 'insensitive' as const } } }
          ]
        }
      : {};
    const [total, rows] = await Promise.all([
      this.db.project.count({ where }),
      this.db.project.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        select: {
          id: true,
          title: true,
          status: true,
          platform: true,
          format: true,
          createdAt: true,
          updatedAt: true,
          user: { select: { email: true } },
          context: { select: { name: true } },
          _count: { select: { scenes: true, jobRuns: true } }
        }
      })
    ]);
    const items: AdminProjectRecord[] = rows.map((row) => ({
      id: row.id,
      title: row.title,
      ownerEmail: row.user.email,
      status: row.status,
      platform: row.platform,
      format: row.format,
      contextName: row.context.name,
      scenesCount: row._count.scenes,
      runsCount: row._count.jobRuns,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    }));
    return pageOf(items, total, input);
  }

  async listRuns(input: AdminRunQuery): Promise<AdminPageRecord<AdminRunRecord>> {
    const where = input.status ? { status: input.status } : {};
    const [total, rows] = await Promise.all([
      this.db.jobRun.count({ where }),
      this.db.jobRun.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        select: {
          id: true,
          projectId: true,
          type: true,
          status: true,
          orchestrator: true,
          workflowRunId: true,
          traceId: true,
          createdAt: true,
          updatedAt: true,
          project: { select: { title: true, user: { select: { email: true } } } },
          steps: { select: { name: true, status: true, error: true } },
          productionJob: { select: { status: true, step: true, progress: true, error: true } }
        }
      })
    ]);
    const items: AdminRunRecord[] = rows.map((row) => {
      const failedStep = row.steps.find((step) => step.status === 'failed');
      const runningStep = row.steps.find((step) => step.status === 'running');
      const pendingStep = row.steps.find((step) => step.status === 'pending');
      return {
        id: row.id,
        projectId: row.projectId,
        projectTitle: row.project.title,
        ownerEmail: row.project.user.email,
        type: row.type,
        status: row.status,
        orchestrator: row.orchestrator,
        workflowRunId: row.workflowRunId,
        traceId: row.traceId,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        stepsTotal: row.steps.length,
        stepsFailed: row.steps.filter((step) => step.status === 'failed').length,
        currentStep: (runningStep ?? pendingStep ?? row.steps[row.steps.length - 1])?.name ?? null,
        error: row.productionJob?.error ?? failedStep?.error ?? null,
        productionStatus: row.productionJob?.status ?? null,
        progress: row.productionJob?.progress ?? null
      };
    });
    return pageOf(items, total, input);
  }

  async getRun(jobRunId: string): Promise<AdminRunDetailRecord | null> {
    const row = await this.db.jobRun.findUnique({
      where: { id: jobRunId },
      select: {
        id: true,
        projectId: true,
        type: true,
        status: true,
        orchestrator: true,
        workflowRunId: true,
        traceId: true,
        createdAt: true,
        updatedAt: true,
        project: { select: { title: true, user: { select: { email: true } } } },
        steps: {
          orderBy: { createdAt: 'asc' },
          select: { name: true, status: true, attempts: true, error: true, startedAt: true, finishedAt: true }
        },
        productionJob: { select: { status: true, step: true, progress: true, error: true } }
      }
    });
    if (!row) return null;
    const [outbox, artifact] = await Promise.all([
      this.db.orchestrationOutbox.findMany({
        where: { jobRunId },
        orderBy: { createdAt: 'asc' },
        select: { id: true, kind: true, status: true, attempts: true, lastError: true, workflowRunId: true, createdAt: true }
      }),
      this.db.runArtifact.findUnique({
        where: { jobRunId },
        select: { id: true, artifactVersionId: true, masterVersion: true, checksum: true, createdAt: true }
      })
    ]);
    const failedStep = row.steps.find((step) => step.status === 'failed');
    const runningStep = row.steps.find((step) => step.status === 'running');
    const pendingStep = row.steps.find((step) => step.status === 'pending');
    return {
      id: row.id,
      projectId: row.projectId,
      projectTitle: row.project.title,
      ownerEmail: row.project.user.email,
      type: row.type,
      status: row.status,
      orchestrator: row.orchestrator,
      workflowRunId: row.workflowRunId,
      traceId: row.traceId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      stepsTotal: row.steps.length,
      stepsFailed: row.steps.filter((step) => step.status === 'failed').length,
      currentStep: (runningStep ?? pendingStep ?? row.steps[row.steps.length - 1])?.name ?? null,
      error: row.productionJob?.error ?? failedStep?.error ?? null,
      productionStatus: row.productionJob?.status ?? null,
      progress: row.productionJob?.progress ?? null,
      steps: row.steps.map((step) => ({
        name: step.name,
        status: step.status,
        attempts: step.attempts,
        error: step.error,
        startedAt: step.startedAt ? step.startedAt.toISOString() : null,
        finishedAt: step.finishedAt ? step.finishedAt.toISOString() : null
      })),
      outbox: outbox.map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        status: entry.status,
        attempts: entry.attempts,
        lastError: entry.lastError,
        workflowRunId: entry.workflowRunId,
        createdAt: entry.createdAt.toISOString()
      })),
      artifact: artifact
        ? {
            id: artifact.id,
            artifactVersionId: artifact.artifactVersionId,
            masterVersion: artifact.masterVersion,
            checksum: artifact.checksum,
            createdAt: artifact.createdAt.toISOString()
          }
        : null
    };
  }

  async listAudit(input: AdminAuditQuery): Promise<AdminPageRecord<AdminAuditEventRecord>> {
    const createdAt: { gte?: Date; lte?: Date } = {};
    const from = dateOrUndefined(input.from);
    const to = dateOrUndefined(input.to);
    if (from) createdAt.gte = from;
    if (to) createdAt.lte = to;
    const where = {
      ...(input.action ? { action: input.action } : {}),
      ...(input.actorId ? { actorId: input.actorId } : {}),
      ...(input.targetType ? { targetType: input.targetType } : {}),
      ...(Object.keys(createdAt).length > 0 ? { createdAt } : {})
    };
    const [total, rows] = await Promise.all([
      this.db.auditEvent.count({ where }),
      this.db.auditEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize
      })
    ]);
    const items: AdminAuditEventRecord[] = rows.map((row) => ({
      id: row.id,
      actorId: row.actorId,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      metadata: row.metadata,
      traceId: row.traceId,
      requestId: row.requestId,
      createdAt: row.createdAt.toISOString()
    }));
    return pageOf(items, total, input);
  }

  async listCosts(input: AdminCostQuery): Promise<AdminCostsRecord> {
    const createdAt: { gte?: Date; lte?: Date } = {};
    const from = dateOrUndefined(input.from);
    const to = dateOrUndefined(input.to);
    if (from) createdAt.gte = from;
    if (to) createdAt.lte = to;
    const where = {
      ...(input.provider ? { provider: input.provider } : {}),
      ...(Object.keys(createdAt).length > 0 ? { createdAt } : {})
    };
    const [total, rows, aggregate, byProvider] = await Promise.all([
      this.db.costEvent.count({ where }),
      this.db.costEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize
      }),
      this.db.costEvent.aggregate({ where, _sum: { amountCents: true } }),
      this.db.costEvent.groupBy({
        by: ['provider'],
        where,
        _count: { _all: true },
        _sum: { amountCents: true }
      })
    ]);
    const projectIds = [...new Set(rows.map((row) => row.projectId).filter((id): id is string => Boolean(id)))];
    const projects = projectIds.length
      ? await this.db.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, title: true } })
      : [];
    const projectTitles = new Map(projects.map((project) => [project.id, project.title]));
    const items: AdminCostEventRecord[] = rows.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      projectTitle: row.projectId ? projectTitles.get(row.projectId) ?? null : null,
      jobRunId: row.jobRunId,
      provider: row.provider,
      model: row.model,
      units: row.units,
      amountCents: row.amountCents,
      createdAt: row.createdAt.toISOString()
    }));
    return {
      items,
      total,
      page: input.page,
      pageSize: input.pageSize,
      totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
      totalCents: aggregate._sum.amountCents ?? 0,
      totalEvents: total,
      byProvider: byProvider.map((row) => ({
        provider: row.provider,
        events: row._count._all,
        cents: row._sum.amountCents ?? 0
      })),
      mode: 'MOCK'
    };
  }

  async listRoutingDecisions(input: AdminPageInput): Promise<AdminPageRecord<AdminRoutingDecisionRecord>> {
    const [total, rows] = await Promise.all([
      this.db.routingDecision.count(),
      this.db.routingDecision.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize
      })
    ]);
    const items: AdminRoutingDecisionRecord[] = rows.map((row) => ({
      id: row.id,
      capabilityKey: row.capabilityKey,
      candidateModelIds: row.candidateModelIds,
      selectedModelId: row.selectedModelId,
      fallbackModelId: row.fallbackModelId,
      criteria: row.criteria,
      reason: row.reason,
      createdAt: row.createdAt.toISOString()
    }));
    return pageOf(items, total, input);
  }

  async runtime(): Promise<AdminRuntimeRecord> {
    const orchestratorMode = this.orchestratorMode();
    const storageBackend = this.storageBackend();
    const storageHealth = await this.storageHealth();
    const durableBudget = process.env.DURABLE_BUDGET_CENTS;
    const maxRunCost = process.env.MAX_RUN_COST_CENTS;
    const flags = buildFlags({
      orchestratorMode,
      storageBackend,
      storageOk: storageHealth.ok,
      postizMode: 'MOCK',
      providersMode: 'MOCK'
    });
    return {
      generatedAt: new Date().toISOString(),
      appEnv: process.env.APP_ENV ?? 'local',
      orchestratorMode,
      storageBackend,
      s3TlsRequired: process.env.S3_REQUIRE_TLS === '1',
      sessionTtlHours: 24,
      invitationTtlHours: 72,
      budget: {
        durableBudgetCents: durableBudget ? Number(durableBudget) : null,
        maxRunCostCents: maxRunCost ? Number(maxRunCost) : null
      },
      flags,
      versions: { node: process.version, prisma: '6.19.3' }
    };
  }
}
