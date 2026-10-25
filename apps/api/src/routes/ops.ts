import type { FastifyInstance } from 'fastify';
import { RuntimeReconciliationService } from '../infrastructure/operations/runtimeReconciliation';
import { OpsMetricsService } from '../infrastructure/operations/opsMetrics';
import { outboxDispatcher } from '../application/container';

export async function opsRoutes(app: FastifyInstance): Promise<void> {
  const adminOnly = { preHandler: [app.authenticate, app.requireSuperAdmin] };

  app.get('/api/ops/health', adminOnly, async () => {
    const snapshot = await new OpsMetricsService().snapshot();
    const activeWorkers = snapshot.workers.filter((worker) => !worker.stale).length;
    const pending = (snapshot.outbox.pending ?? 0) + (snapshot.outbox.failed ?? 0);
    const status = snapshot.database !== 'ok' ? 'degraded' : activeWorkers === 0 || pending > 50 ? 'degraded' : 'ok';
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
}
