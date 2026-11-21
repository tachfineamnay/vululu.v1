import {prisma} from '@vululu/db';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { RuntimeReconciliationService } from '../infrastructure/operations/runtimeReconciliation';
import { OpsMetricsService } from '../infrastructure/operations/opsMetrics';
import { outboxDispatcher } from '../application/container';
import { cancel } from '../infrastructure/execution/broker';
import { recordAuditEvent } from '../security/audit';
import { pythonToolsConfig } from '../infrastructure/python/client';
import { HttpError } from '../errors';

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null);

export async function opsRoutes(app: FastifyInstance): Promise<void> {
  // Public load-balancer probe: schema is usable. No identifiers, credentials or paid provider calls.
  app.get('/api/ready',async (_r,reply)=>{reply.header('Cache-Control','no-store');try{
    await prisma.$transaction(tx=>tx.billingControl.findUniqueOrThrow({where:{id:'commercial'},select:{id:true}}),{maxWait:1500,timeout:2000});
    return {status:'ready'};
  }catch{return reply.code(503).send({status:'not_ready'});}});
  const adminOnly = { preHandler: [app.authenticate, app.requireSuperAdmin] };

  app.get('/api/ops/health', adminOnly, async () => {
    const snapshot = await new OpsMetricsService().snapshot();
    const activeWorkers = snapshot.workers.filter((worker) => !worker.stale).length;
    const pending = (snapshot.outbox.pending ?? 0) + (snapshot.outbox.failed ?? 0);
    const status = snapshot.database !== 'ok' ? 'degraded' : (process.env.ORCHESTRATOR_MODE === 'hatchet' && activeWorkers === 0) || pending > 50 ? 'degraded' : 'ok';
    return {
      status,
      database: snapshot.database,
      workersActive: activeWorkers,
      outboxPending: pending,
      generatedAt: snapshot.generatedAt
    };
  });

  app.get('/api/ops/metrics', adminOnly, async (_request, reply) => {
    const snapshot = await new OpsMetricsService().snapshot();
    reply.type('text/plain; version=0.0.4');
    return reply.send(OpsMetricsService.prometheus(snapshot));
  });

  app.get('/api/ops/snapshot', adminOnly, async () => {
    return new OpsMetricsService().snapshot();
  });

  app.post('/api/ops/reconcile', adminOnly, async (request) => {
    const body = (request.body ?? {}) as { dryRun?: boolean; staleSeconds?: number; stagedGraceHours?: number };
    return new RuntimeReconciliationService(undefined, outboxDispatcher ?? undefined).report({
      dryRun: body.dryRun !== false,
      staleSeconds: body.staleSeconds,
      stagedGraceHours: body.stagedGraceHours
    });
  });

  // P11-C — operations outillees (ToolBroker) : etats reels, eligibilites, correlation.
  // Aucune relance aveugle d'une operation payante : seules l'annulation d'une operation
  // encore proposee/en file et la resolution manuelle d'une issue UNKNOWN sont permises.
  app.get('/api/admin/ops/execution', adminOnly, async () => {
    const now = Date.now();
    const [states, costStates, rows] = await Promise.all([
      prisma.executionOperation.groupBy({ by: ['state'], _count: { _all: true } }),
      prisma.executionOperation.groupBy({ by: ['costState'], _count: { _all: true } }),
      prisma.executionOperation.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true, tool: true, state: true, costState: true, maxCents: true, reportedCents: true,
          correlationId: true, createdAt: true, claimUntil: true, approvedBy: true,
          accountId: true, projectId: true,
          project: { select: { title: true, user: { select: { email: true } } } }
        }
      })
    ]);
    return {
      generatedAt: new Date(now).toISOString(),
      states: Object.fromEntries(states.map((row) => [row.state, row._count._all])),
      costStates: Object.fromEntries(costStates.map((row) => [row.costState, row._count._all])),
      items: rows.map((row) => ({
        id: row.id,
        tool: row.tool,
        state: row.state,
        costState: row.costState,
        maxCents: row.maxCents,
        reportedCents: row.reportedCents,
        correlationId: row.correlationId,
        createdAt: row.createdAt.toISOString(),
        ageMs: Math.max(0, now - row.createdAt.getTime()),
        claimUntil: row.claimUntil ? row.claimUntil.toISOString() : null,
        approved: row.approvedBy !== null,
        accountId: row.accountId,
        projectId: row.projectId,
        projectTitle: row.project.title,
        ownerEmail: row.project.user.email,
        cancelEligible: ['PROPOSED', 'QUEUED'].includes(row.state),
        resolveEligible: row.state === 'UNKNOWN'
      }))
    };
  });

  app.get('/api/admin/ops/execution/:id', adminOnly, async (request) => {
    const id = z.uuid().parse((request.params as { id?: string }).id);
    const operation = await prisma.executionOperation.findUnique({
      where: { id },
      select: {
        id: true, tool: true, state: true, costState: true, maxCents: true, reportedCents: true,
        correlationId: true, createdAt: true, claimUntil: true, approvedBy: true,
        accountId: true, projectId: true, params: true, result: true,
        project: { select: { title: true, user: { select: { email: true } } } }
      }
    });
    if (!operation) throw new HttpError(404, 'execution_not_found', 'Operation introuvable.');
    const audit = await prisma.auditEvent.findMany({
      where: { traceId: operation.correlationId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, actorId: true, action: true, targetType: true, targetId: true, metadata: true, createdAt: true }
    });
    return {
      ...operation,
      createdAt: operation.createdAt.toISOString(),
      claimUntil: operation.claimUntil ? operation.claimUntil.toISOString() : null,
      audit: audit.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))
    };
  });

  app.post('/api/admin/ops/execution/:id/cancel', adminOnly, async (request) => {
    const id = z.uuid().parse((request.params as { id?: string }).id);
    const operation = await prisma.executionOperation.findUnique({
      where: { id },
      select: { id: true, accountId: true, state: true, tool: true, correlationId: true }
    });
    if (!operation) throw new HttpError(404, 'execution_not_found', 'Operation introuvable.');
    if (!['PROPOSED', 'QUEUED'].includes(operation.state))
      throw new HttpError(409, 'not_cancellable', 'Seule une operation proposee ou en file peut etre annulee.');
    // Le broker reste l'autorite : on rejoue son annulation avec le proprietaire du compte,
    // apres verification du role super-admin et journalisation de l'acteur reel.
    const result = await cancel(operation.accountId, operation.id);
    await recordAuditEvent({
      actorId: request.currentUser!.id,
      action: 'execution.admin_cancelled',
      targetType: 'execution',
      targetId: operation.id,
      metadata: { tool: operation.tool, previousState: operation.state, correlationId: operation.correlationId }
    });
    return result;
  });

  // P11-C — disponibilite du service Python interne et de ses capacites declarees.
  // Aucun jeton renvoye, service borne par un timeout court.
  app.get('/api/admin/ops/python', adminOnly, async () => {
    const config = pythonToolsConfig();
    const checkedAt = new Date().toISOString();
    if (!config) {
      return {
        configured: false, reachable: false, ready: false, checkedAt,
        error: 'python_tools_unconfigured', capabilities: [], dependencies: {}, models: []
      };
    }
    const fetchJson = async (path: string, withToken: boolean) => {
      const response = await fetch(config.url + path, {
        signal: AbortSignal.timeout(5000),
        redirect: 'error',
        headers: withToken ? { authorization: 'Bearer ' + config.token } : {}
      });
      const text = await response.text();
      if (text.length > 256 * 1024) throw new Error('python_tools_response_too_large');
      let body: unknown = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = null;
      }
      return { status: response.status, body };
    };
    try {
      const [ready, catalog] = await Promise.all([fetchJson('/readyz', false), fetchJson('/v1/capabilities', true)]);
      const readyBody = asRecord(ready.body);
      const catalogBody = asRecord(catalog.body);
      const rawCapabilities = Array.isArray(catalogBody.capabilities) ? catalogBody.capabilities : [];
      const capabilities = rawCapabilities
        .map((entry) => {
          const item = asRecord(entry);
          return {
            key: asString(item.key) ?? '',
            name: asString(item.name) ?? '',
            action: asString(item.action) ?? '',
            engine: asString(item.engine) ?? '',
            description: asString(item.description) ?? '',
            limits: asRecord(item.limits)
          };
        })
        .filter((item) => item.key.length > 0);
      return {
        configured: true,
        reachable: true,
        ready: ready.status === 200 && readyBody.status === 'ready',
        checkedAt,
        version: asString(readyBody.version),
        dependencies: asRecord(readyBody.dependencies),
        models: Array.isArray(readyBody.models) ? readyBody.models : [],
        capabilities,
        capabilitiesError: catalog.status === 200 ? null : 'python_capabilities_unavailable'
      };
    } catch (error) {
      return {
        configured: true,
        reachable: false,
        ready: false,
        checkedAt,
        error: error instanceof Error && error.name === 'TimeoutError' ? 'python_tools_timeout' : 'python_tools_unreachable',
        capabilities: [],
        dependencies: {},
        models: []
      };
    }
  });
}
