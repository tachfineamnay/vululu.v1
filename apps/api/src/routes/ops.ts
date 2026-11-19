import {prisma} from '@vululu/db';
import type { FastifyInstance } from 'fastify';
import { RuntimeReconciliationService } from '../infrastructure/operations/runtimeReconciliation';
import { OpsMetricsService } from '../infrastructure/operations/opsMetrics';
import { outboxDispatcher } from '../application/container';

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
}
