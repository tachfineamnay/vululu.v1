import { createRequire } from 'node:module';
import type { FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpError } from '../../apps/api/src/errors';

const apiRequire = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const Fastify = apiRequire('fastify') as () => FastifyInstance;

const { auditEvents, prismaMock } = vi.hoisted(() => {
  process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:5432/vululu_unit_test';
  process.env.SESSION_SECRET ??= 'unit-test-session-secret-0123456789abcdef';
  const events: Array<Record<string, unknown>> = [];
  const mock = {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn()
    },
    session: {
      updateMany: vi.fn()
    },
    accountToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn()
    },
    auditEvent: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        events.push(data);
        return { id: 'audit-1', ...data };
      }),
      findMany: vi.fn()
    },
    serviceTicket: {
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
      deleteMany: vi.fn(async () => ({ count: 0 }))
    },
    executionAccount: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn()
    },
    executionOperation: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
      updateMany: vi.fn()
    },
    costEvent: {
      groupBy: vi.fn()
    },
    billingControl: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn()
    },
    stepRun: {
      findMany: vi.fn()
    },
    jobRun: {
      groupBy: vi.fn()
    },
    outboxEvent: {
      groupBy: vi.fn()
    },
    invitation: {
      count: vi.fn()
    },
    agentDefinition: {
      count: vi.fn()
    },
    modelProvider: {
      count: vi.fn()
    },
    modelCatalogEntry: {
      count: vi.fn()
    },
    project: {
      count: vi.fn(),
      findUnique: vi.fn()
    },
    contentItem: {
      count: vi.fn()
    },
    publicationRequest: {
      groupBy: vi.fn()
    }
  };
  return { auditEvents: events, prismaMock: mock };
});

vi.mock('@vululu/db', () => ({ prisma: prismaMock }));
vi.mock('../../apps/api/src/infrastructure/security/rateLimiter', () => ({
  RATE_LIMITS: {
    providerCredentialsWrite: { name: 'provider_cred_write', limit: 30, windowSeconds: 60 },
    routingExecute: { name: 'routing_execute', limit: 30, windowSeconds: 60 }
  },
  rateLimitPreHandler: () => async () => {},
  consumeRateLimit: vi.fn(async () => ({ allowed: true, remaining: 10, resetAt: new Date() }))
}));
vi.mock('../../apps/api/src/infrastructure/operations/runtimeReconciliation', () => ({
  RuntimeReconciliationService: class {
    report = vi.fn(async (input: { dryRun: boolean }) => ({
      dryRun: input.dryRun,
      checkedAt: '2026-11-24T10:00:00.000Z',
      dispatcherAttached: false,
      actions: [{ kind: 'job_run_recovered', id: 'jr-1' }],
      incidents: []
    }));
  }
}));
vi.mock('../../apps/api/src/infrastructure/execution/broker', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../apps/api/src/infrastructure/execution/broker')>();
  return {
    ...actual,
    cancel: vi.fn(async (_actor: string, opId: string) => ({
      id: opId,
      state: 'CANCELLED',
      costState: 'RELEASED',
      correlationId: 'corr-cancel-1'
    }))
  };
});

import { adminRoutes } from '../../apps/api/src/routes/admin';
import { adminAgentRoutes } from '../../apps/api/src/routes/adminAgents';
import { adminCostRoutes } from '../../apps/api/src/routes/adminCosts';
import { billingRoutes } from '../../apps/api/src/routes/billing';
import { customerAccountRoutes } from '../../apps/api/src/routes/customerAccount';
import { opsRoutes } from '../../apps/api/src/routes/ops';
import { availabilityOf } from '../../apps/api/src/infrastructure/execution/availability';
import { PrismaAdminQuery } from '../../apps/api/src/infrastructure/prisma/adminQuery';
import { proposeTx } from '../../apps/api/src/infrastructure/execution/broker';

type MockUser = {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'support' | 'super_admin';
  status: 'active' | 'suspended';
};

async function createTestApp(currentUser: MockUser | null) {
  const app = Fastify();
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof HttpError) {
      return reply.status(err.statusCode).send({ error: err.code, message: err.message });
    }
    if ((err as { name?: string })?.name === 'ZodError') {
      return reply.status(400).send({ error: 'validation_error', issues: (err as { issues?: unknown }).issues });
    }
    return reply.status(500).send({ error: 'internal_error', message: (err as Error).message });
  });
  app.decorate('authenticate', async (request) => {
    if (!currentUser) {
      throw new HttpError(401, 'unauthorized', 'Authentication required');
    }
    request.currentUser = currentUser as never;
  });
  app.decorate('requireSuperAdmin', async (request) => {
    if (!request.currentUser) {
      throw new HttpError(401, 'unauthorized', 'Authentication required');
    }
    if (request.currentUser.role !== 'super_admin') {
      await prismaMock.auditEvent.create({
        data: {
          actorId: request.currentUser.id,
          action: 'rbac.denied',
          targetType: 'route',
          metadata: { path: request.url.split('?')[0], role: request.currentUser.role, required: ['super_admin'] }
        }
      });
      throw new HttpError(403, 'forbidden', 'Super admin required');
    }
  });
  return app;
}

const SUPER_ADMIN: MockUser = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'admin@vululu.test',
  name: 'Admin',
  role: 'super_admin',
  status: 'active'
};
const SUPPORT_USER: MockUser = {
  id: '00000000-0000-4000-8000-000000000002',
  email: 'support@vululu.test',
  name: 'Support',
  role: 'support',
  status: 'active'
};
const REGULAR_USER: MockUser = {
  id: '00000000-0000-4000-8000-000000000003',
  email: 'user@vululu.test',
  name: 'Regular',
  role: 'user',
  status: 'active'
};

beforeEach(() => {
  vi.clearAllMocks();
  auditEvents.length = 0;
  prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock));
  prismaMock.$queryRaw.mockResolvedValue([]);
  prismaMock.$executeRaw.mockResolvedValue(1);
  prismaMock.serviceTicket.deleteMany.mockResolvedValue({ count: 0 });
});

describe('VULULU A04 — User suspension, AccountToken revocation & ToolBroker guard', () => {
  it('revokes sessions AND pending AccountToken rows on suspend and audits revokedTokens', async () => {
    const targetId = '00000000-0000-4000-8000-000000000099';
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: targetId,
      email: 'victim@vululu.test',
      role: 'user',
      status: 'active',
      suspendedAt: null
    });
    prismaMock.user.update.mockResolvedValueOnce({
      id: targetId,
      email: 'victim@vululu.test',
      role: 'user',
      status: 'suspended',
      suspendedAt: new Date('2026-11-24T10:00:00.000Z')
    });
    prismaMock.session.updateMany.mockResolvedValueOnce({ count: 2 });
    prismaMock.accountToken.deleteMany.mockResolvedValueOnce({ count: 3 });

    const app = await createTestApp(SUPER_ADMIN);
    await app.register(adminRoutes);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${targetId}`,
      payload: { status: 'suspended' }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.revokedSessions).toBe(2);
    expect(body.revokedTokens).toBe(3);
    expect(prismaMock.accountToken.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ userId: targetId }, { email: 'victim@vululu.test' }] }
      })
    );
    const suspendedEvent = auditEvents.find((e) => e.action === 'user.suspended');
    expect(suspendedEvent).toBeDefined();
    expect((suspendedEvent?.metadata as Record<string, unknown>)?.revokedTokens).toBe(3);
    await app.close();
  });

  it('blocks forgot-password and reset-password for suspended accounts without leaking status', async () => {
    const mail = { send: vi.fn(async () => {}) };
    const app = await createTestApp(null);
    await app.register(customerAccountRoutes, { mail });

    // forgot-password for suspended user: 202 anti-enumeration, ZERO token created, ZERO mail sent
    prismaMock.$queryRaw.mockResolvedValueOnce([
      { id: 'u-susp', email: 'suspended@vululu.test', role: 'user', status: 'suspended' }
    ]);
    const forgotRes = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: 'suspended@vululu.test' }
    });
    expect(forgotRes.statusCode).toBe(202);
    expect(prismaMock.accountToken.create).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();

    // reset-password for suspended user: rejected 400 and never updates password
    prismaMock.accountToken.findUnique.mockResolvedValueOnce({
      id: 'tok-1',
      kind: 'password_reset',
      userId: 'u-susp',
      usedAt: null,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 3600_000),
      user: { id: 'u-susp', role: 'user', status: 'suspended' }
    });
    const resetRes = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: {
        token: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        password: 'ValidLongPassword123!'
      }
    });
    expect(resetRes.statusCode).toBe(400);
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('blocks ToolBroker execution for suspended users even when ExecutionAccount is enabled', async () => {
    const fakeTx = {
      $queryRaw: vi.fn(async () => []),
      $executeRaw: vi.fn(async () => 1),
      project: {
        findUnique: vi.fn(async () => ({ id: 'proj-1', userId: 'u-susp' }))
      },
      user: {
        findUnique: vi.fn(async () => ({ status: 'suspended' }))
      },
      executionAccount: {
        findUnique: vi.fn(async () => ({
          userId: 'u-susp',
          enabled: true,
          limitCents: 10000,
          reservedCents: 0,
          spentCents: 0,
          tools: ['studio.inspect@1']
        }))
      }
    };

    await expect(
      proposeTx(fakeTx as never, 'u-susp', 'proj-1', {
        tool: 'studio.inspect@1',
        key: 'idem-key-12345678',
        revision: 1
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'account_suspended'
    });
  });
});

describe('VULULU A04 — RBAC, Support Queue & Audit Path Hygiene', () => {
  it('strips query parameters from rbac.denied audit path on /api/support/cases and searches ticket id', async () => {
    const userApp = await createTestApp(REGULAR_USER);
    await userApp.register(billingRoutes);

    const deniedRes = await userApp.inject({
      method: 'GET',
      url: '/api/support/cases?q=sensitive-customer%40example.com&status=OPEN'
    });
    expect(deniedRes.statusCode).toBe(403);
    const rbacEvent = auditEvents.find((e) => e.action === 'rbac.denied');
    expect(rbacEvent).toBeDefined();
    expect((rbacEvent?.metadata as Record<string, unknown>)?.path).toBe('/api/support/cases');
    expect(JSON.stringify(rbacEvent)).not.toContain('sensitive-customer');
    await userApp.close();

    // Support user is allowed, search includes ticket id, and user.name is returned
    prismaMock.serviceTicket.count.mockResolvedValueOnce(1);
    prismaMock.serviceTicket.findMany.mockResolvedValueOnce([
      {
        id: '00000000-0000-4000-8000-000000000777',
        userId: REGULAR_USER.id,
        kind: 'SUPPORT',
        status: 'OPEN',
        subject: 'Facture introuvable',
        createdAt: new Date('2026-11-24T08:00:00.000Z'),
        updatedAt: new Date('2026-11-24T09:00:00.000Z'),
        user: { email: REGULAR_USER.email, name: 'Regular', status: 'active' },
        entries: [
          {
            id: 'entry-1',
            role: 'customer',
            status: 'OPEN',
            message: 'Bonjour',
            createdAt: new Date('2026-11-24T08:00:00.000Z')
          }
        ],
        _count: { entries: 1 }
      }
    ]);
    prismaMock.serviceTicket.groupBy.mockResolvedValueOnce([{ status: 'OPEN', _count: { _all: 1 } }]);

    const supportApp = await createTestApp(SUPPORT_USER);
    await supportApp.register(billingRoutes);
    const okRes = await supportApp.inject({
      method: 'GET',
      url: '/api/support/cases?q=00000000-0000-4000-8000-000000000777'
    });
    expect(okRes.statusCode).toBe(200);
    const payload = okRes.json();
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].user.name).toBe('Regular');
    const findManyArg = prismaMock.serviceTicket.findMany.mock.calls[0]?.[0] as { where?: { OR?: unknown[] } };
    expect(JSON.stringify(findManyArg.where)).toContain('"id":{"contains":"00000000-0000-4000-8000-000000000777"');
    await supportApp.close();
  });
});

describe('VULULU A04 — Provider/Tool Availability & Admin Overview Timestamps', () => {
  it('classifies local as healthy, configured external as unverified, and missing/disabled as unavailable', async () => {
    const origMediaGen = process.env.MEDIA_GENERATION_ENABLED;
    const origMediaImg = process.env.MEDIA_IMAGE_ENABLED;
    const origReplicate = process.env.REPLICATE_API_TOKEN;
    const origImgConfigured = process.env.MEDIA_IMAGE_CONFIGURED;
    try {
      process.env.MEDIA_GENERATION_ENABLED = '1';
      process.env.MEDIA_IMAGE_ENABLED = '1';
      delete process.env.REPLICATE_API_TOKEN;
      delete process.env.MEDIA_IMAGE_CONFIGURED;

      expect(availabilityOf('vululu@1')).toMatchObject({
        availability: 'local',
        configured: true,
        verified: true,
        healthState: 'healthy'
      });

      const replicateMissing = availabilityOf('replicate@1');
      expect(replicateMissing).toMatchObject({
        availability: 'missing_credential',
        configured: false,
        verified: false,
        healthState: 'unavailable'
      });
      expect(replicateMissing.reason).toBeTruthy();

      process.env.REPLICATE_API_TOKEN = 'r8_configured_unverified';
      const replicateConfigured = availabilityOf('replicate@1');
      expect(replicateConfigured).toMatchObject({
        availability: 'configured',
        configured: true,
        verified: false,
        healthState: 'unverified'
      });

      // Verify /api/admin/tools exposes configured, verified, healthState cleanly
      const app = await createTestApp(SUPER_ADMIN);
      await app.register(adminAgentRoutes);
      const res = await app.inject({ method: 'GET', url: '/api/admin/tools' });
      expect(res.statusCode).toBe(200);
      const items = res.json().items as Array<Record<string, unknown>>;
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(typeof item.configured).toBe('boolean');
        expect(typeof item.verified).toBe('boolean');
        expect(['healthy', 'unverified', 'unavailable']).toContain(item.healthState);
      }
      await app.close();
    } finally {
      if (origMediaGen === undefined) delete process.env.MEDIA_GENERATION_ENABLED;
      else process.env.MEDIA_GENERATION_ENABLED = origMediaGen;
      if (origMediaImg === undefined) delete process.env.MEDIA_IMAGE_ENABLED;
      else process.env.MEDIA_IMAGE_ENABLED = origMediaImg;
      if (origReplicate === undefined) delete process.env.REPLICATE_API_TOKEN;
      else process.env.REPLICATE_API_TOKEN = origReplicate;
      if (origImgConfigured === undefined) delete process.env.MEDIA_IMAGE_CONFIGURED;
      else process.env.MEDIA_IMAGE_CONFIGURED = origImgConfigured;
    }
  });

  it('uses real step.finishedAt ?? step.createdAt in overview recentErrors instead of current clock', async () => {
    const createdAt = new Date('2026-10-01T12:00:00.000Z');
    const finishedAt = new Date('2026-10-01T12:05:00.000Z');
    const fakePrisma = {
      $queryRawUnsafe: vi.fn(async () => 1),
      user: { count: vi.fn(async () => 1) },
      session: { count: vi.fn(async () => 1) },
      invitation: { count: vi.fn(async () => 0) },
      brandContext: { count: vi.fn(async () => 1) },
      project: { count: vi.fn(async () => 1) },
      jobRun: {
        count: vi.fn(async () => 1),
        groupBy: vi.fn(async () => []),
        findMany: vi.fn(async () => [])
      },
      auditEvent: { count: vi.fn(async () => 0) },
      costEvent: { aggregate: vi.fn(async () => ({ _sum: { amountCents: 0 }, _count: { _all: 0 } })) },
      stepRun: {
        groupBy: vi.fn(async () => []),
        findMany: vi.fn(async () => [
          {
            id: 'step-with-finished',
            status: 'failed',
            jobRunId: 'job-1',
            error: 'timeout',
            createdAt,
            finishedAt,
            jobRun: { projectId: 'proj-1' }
          },
          {
            id: 'step-without-finished',
            status: 'failed',
            jobRunId: 'job-2',
            error: 'crash',
            createdAt,
            finishedAt: null,
            jobRun: { projectId: 'proj-2' }
          }
        ])
      },
      orchestrationOutbox: {
        groupBy: vi.fn(async () => []),
        findMany: vi.fn(async () => [])
      },
      artifactObject: { groupBy: vi.fn(async () => []) },
      workerHeartbeat: { findMany: vi.fn(async () => []) }
    };
    const svc = new PrismaAdminQuery({ database: fakePrisma as never });
    const overview = await svc.overview();
    const withFinished = overview.recentErrors.find((e) => e.id === 'step-with-finished');
    const withoutFinished = overview.recentErrors.find((e) => e.id === 'step-without-finished');
    expect(withFinished?.createdAt).toBe(finishedAt.toISOString());
    expect(withoutFinished?.createdAt).toBe(createdAt.toISOString());
  });
});

describe('VULULU A04 — Ops Reconcile Validation/Audit, Execution Pagination & Python Health', () => {
  it('validates /api/ops/reconcile input, audits ops.reconcile, and preserves { dryRun: false } compatibility', async () => {
    const app = await createTestApp(SUPER_ADMIN);
    await app.register(opsRoutes);

    const invalidRes = await app.inject({
      method: 'POST',
      url: '/api/ops/reconcile',
      payload: { dryRun: 'yes', staleSeconds: -5 }
    });
    expect(invalidRes.statusCode).toBe(400);

    const validRes = await app.inject({
      method: 'POST',
      url: '/api/ops/reconcile',
      payload: { dryRun: false }
    });
    expect(validRes.statusCode).toBe(200);
    expect(validRes.json().dryRun).toBe(false);
    const reconcileAudit = auditEvents.find((e) => e.action === 'ops.reconcile');
    expect(reconcileAudit).toBeDefined();
    expect(reconcileAudit?.actorId).toBe(SUPER_ADMIN.id);
    expect((reconcileAudit?.metadata as Record<string, unknown>)?.dryRun).toBe(false);
    await app.close();
  });

  it('paginates and filters /api/admin/ops/execution and correlates execution.admin_cancelled audit via traceId', async () => {
    const app = await createTestApp(SUPER_ADMIN);
    await app.register(opsRoutes);

    const badFilter = await app.inject({
      method: 'GET',
      url: '/api/admin/ops/execution?state=BOGUS'
    });
    expect(badFilter.statusCode).toBe(400);

    const opUuid = '00000000-0000-4000-8000-000000000abc';
    prismaMock.executionOperation.groupBy
      .mockResolvedValueOnce([{ state: 'QUEUED', _count: { _all: 3 } }])
      .mockResolvedValueOnce([{ costState: 'RESERVED', _count: { _all: 3 } }]);
    prismaMock.executionOperation.count.mockResolvedValueOnce(3);
    prismaMock.executionOperation.findMany.mockResolvedValueOnce([
      {
        id: opUuid,
        tool: 'media.image@1',
        state: 'QUEUED',
        costState: 'RESERVED',
        maxCents: 50,
        reportedCents: null,
        correlationId: 'corr-1',
        createdAt: new Date('2026-11-24T09:59:00.000Z'),
        updatedAt: new Date('2026-11-24T09:59:00.000Z'),
        dispatchedAt: null,
        approvedAt: new Date('2026-11-24T09:59:00.000Z'),
        approvedBy: SUPER_ADMIN.id,
        accountId: REGULAR_USER.id,
        projectId: 'proj-1',
        project: { title: 'Campagne Automne', user: { email: REGULAR_USER.email } }
      }
    ]);

    const listRes = await app.inject({
      method: 'GET',
      url: '/api/admin/ops/execution?page=2&pageSize=1&state=QUEUED&costState=RESERVED'
    });
    expect(listRes.statusCode).toBe(200);
    const listBody = listRes.json();
    expect(listBody.page).toBe(2);
    expect(listBody.pageSize).toBe(1);
    expect(listBody.total).toBe(3);
    expect(listBody.totalPages).toBe(3);
    expect(listBody.truncated).toBe(true);
    expect(listBody.items[0].cancelEligible).toBe(true);

    // Cancel writes execution.admin_cancelled audit with traceId = operation.correlationId
    prismaMock.executionOperation.findUnique.mockResolvedValueOnce({
      id: opUuid,
      accountId: REGULAR_USER.id,
      tool: 'media.image@1',
      correlationId: 'corr-cancel-1',
      state: 'QUEUED'
    });
    const cancelRes = await app.inject({
      method: 'POST',
      url: `/api/admin/ops/execution/${opUuid}/cancel`
    });
    expect(cancelRes.statusCode).toBe(200);
    const cancelAudit = auditEvents.find((e) => e.action === 'execution.admin_cancelled');
    expect(cancelAudit?.traceId).toBe('corr-cancel-1');
    await app.close();
  });

  it('reports python healthState as unavailable when unconfigured', async () => {
    const origUrl = process.env.PYTHON_TOOLS_URL;
    try {
      delete process.env.PYTHON_TOOLS_URL;
      const app = await createTestApp(SUPER_ADMIN);
      await app.register(opsRoutes);
      const res = await app.inject({ method: 'GET', url: '/api/admin/ops/python' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        configured: false,
        reachable: false,
        ready: false,
        healthState: 'unavailable'
      });
      await app.close();
    } finally {
      if (origUrl === undefined) delete process.env.PYTHON_TOOLS_URL;
      else process.env.PYTHON_TOOLS_URL = origUrl;
    }
  });
});

describe('VULULU A04 — Costs Separation, Budget Pagination & UNKNOWN Owner Email', () => {
  it('separates estimated, reported, and reconciled cents and populates uncertain ownerEmail from project relation', async () => {
    const app = await createTestApp(SUPER_ADMIN);
    await app.register(adminCostRoutes);

    prismaMock.executionAccount.findMany.mockResolvedValueOnce([]);
    prismaMock.executionAccount.count
      .mockResolvedValueOnce(150) // accountsTotal
      .mockResolvedValueOnce(40); // accountsEnabled
    prismaMock.executionAccount.aggregate.mockResolvedValueOnce({
      _sum: { limitCents: 50000, reservedCents: 300, spentCents: 1200 }
    });
    // Exact groupBy order in adminCosts.ts Promise.all:
    // 1. byCostStateRows
    prismaMock.executionOperation.groupBy
      .mockResolvedValueOnce([
        { costState: 'ESTIMATED', _count: { _all: 1 }, _sum: { maxCents: 120, reportedCents: null } },
        { costState: 'REPORTED', _count: { _all: 1 }, _sum: { maxCents: 200, reportedCents: 180 } },
        { costState: 'RECONCILED', _count: { _all: 1 }, _sum: { maxCents: 300, reportedCents: 250 } },
        { costState: 'UNKNOWN', _count: { _all: 1 }, _sum: { maxCents: 400, reportedCents: null } }
      ])
      // 2. nullReportedRows (where reportedCents: null)
      .mockResolvedValueOnce([
        { costState: 'ESTIMATED', _sum: { maxCents: 120 } },
        { costState: 'UNKNOWN', _sum: { maxCents: 400 } }
      ])
      // 3. toolStateRows
      .mockResolvedValueOnce([
        { tool: 'media.image@1', costState: 'ESTIMATED', _count: { _all: 1 }, _sum: { maxCents: 120, reportedCents: null } },
        { tool: 'media.image@1', costState: 'REPORTED', _count: { _all: 1 }, _sum: { maxCents: 200, reportedCents: 180 } },
        { tool: 'media.image@1', costState: 'RECONCILED', _count: { _all: 1 }, _sum: { maxCents: 300, reportedCents: 250 } },
        { tool: 'media.image@1', costState: 'UNKNOWN', _count: { _all: 1 }, _sum: { maxCents: 400, reportedCents: null } }
      ])
      // 4. toolNullEstimatedRows
      .mockResolvedValueOnce([{ tool: 'media.image@1', _sum: { maxCents: 120 } }])
      // 5. uncertainByAccount
      .mockResolvedValueOnce([{ accountId: 'acc-offpage', _count: { _all: 1 } }]);

    // recent operations & uncertain operations
    prismaMock.executionOperation.findMany
      .mockResolvedValueOnce([]) // operations (recent)
      .mockResolvedValueOnce([
        {
          id: 'op-unk-1',
          tool: 'media.image@1',
          state: 'UNKNOWN',
          costState: 'UNKNOWN',
          maxCents: 400,
          reportedCents: null,
          correlationId: 'corr-unk-1',
          accountId: 'acc-offpage',
          createdAt: new Date('2026-11-24T09:00:00.000Z'),
          updatedAt: new Date('2026-11-24T09:00:00.000Z'),
          project: { user: { email: 'offpage-owner@vululu.test' } }
        }
      ]);
    prismaMock.executionOperation.count
      .mockResolvedValueOnce(4) // operationsTotal
      .mockResolvedValueOnce(1); // uncertainTotal
    prismaMock.costEvent.groupBy.mockResolvedValueOnce([]);
    prismaMock.billingControl.findUnique.mockResolvedValueOnce({ enabled: false, mode: 'test' });

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/costs/execution?accountsPage=1'
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    // Distinct estimated vs actual (reported) vs reconciled vs confirmed
    expect(body.summary.estimatedCents).toBe(120);
    expect(body.summary.reportedCents).toBe(180);
    expect(body.summary.reconciledCents).toBe(250);
    expect(body.summary.confirmedCents).toBe(430);
    expect(body.summary.uncertainCents).toBe(400);

    // Tool & provider splits match
    const toolRow = body.byTool.find((entry: { tool: string }) => entry.tool === 'media.image@1');
    expect(toolRow).toMatchObject({
      estimatedCents: 120,
      reportedCents: 180,
      reconciledCents: 250,
      confirmedCents: 430,
      uncertainCents: 400
    });

    // Provider exposes configured/verified/healthState
    const providerRow = body.byProvider[0];
    expect(typeof providerRow.configured).toBe('boolean');
    expect(typeof providerRow.verified).toBe('boolean');
    expect(['healthy', 'unverified', 'unavailable']).toContain(providerRow.healthState);

    // Budget pagination metadata
    expect(body.scope.budgets).toMatchObject({
      page: 1,
      pageSize: 100,
      total: 150,
      totalPages: 2,
      hasMore: true,
      truncated: true
    });

    // Off-page uncertain operation still exposes ownerEmail from project.user relation
    expect(body.uncertain[0]).toMatchObject({
      id: 'op-unk-1',
      ownerEmail: 'offpage-owner@vululu.test',
      resolveEligible: true
    });
    await app.close();
  });
});
