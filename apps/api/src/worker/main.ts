import '../env';
import { execute } from '../infrastructure/execution/broker';
import { engine, notifyQueued, workflowName } from '../infrastructure/execution/runtime';
import { hatchet, durableWorkerWorkflow } from './pipeline';
import { seedDurableAgentIfMissing } from './bootstrap';
import { prisma } from '@vululu/db';
import { logEvent } from '../observability/logger';

const heartbeatId = process.env.DURABLE_WORKER_ID || 'worker-' + process.pid;

async function heartbeat(status: string): Promise<void> {
  await prisma.workerHeartbeat
    .upsert({
      where: { id: heartbeatId },
      update: { status, lastSeenAt: new Date(), name: 'vululu-durable-worker' },
      create: { id: heartbeatId, name: 'vululu-durable-worker', status, lastSeenAt: new Date() }
    })
    .catch((error) => {
      logEvent('error', 'worker.heartbeat_failed', {
        error: error instanceof Error ? error.name : 'unknown'
      });
    });
}

async function main() {
  await seedDurableAgentIfMissing();
  await heartbeat('running');
  const timer = setInterval(() => {
    void heartbeat('running');
  }, 10000);
  timer.unref?.();
  logEvent('info', 'worker.started', { workerId: heartbeatId });
  const secure = hatchet.workflow({ name: workflowName });
  secure.task({
    name: 'invoke-once',
    retries: 0,
    fn: async (input: { id: string }) => {
      await execute(input.id, engine);
      return { handled: true };
    }
  });
  let ticking = false;
  const pump = setInterval(async () => {
    if (ticking) return;
    ticking = true;
    try {
      await notifyQueued(async (id) => {
        const ref = await hatchet.runNoWait(workflowName, { id });
        return await ref.runId;
      });
    } catch {
      logEvent('error', 'execution.notification_unavailable', {});
    } finally {
      ticking = false;
    }
  }, 5000);
  pump.unref();
  const worker = await hatchet.worker('vululu-durable-worker', {
    workflows: [durableWorkerWorkflow, secure],
    slots: 2
  });
  process.on('SIGTERM', () => {
    void heartbeat('stopped').finally(() => worker.stop().finally(() => process.exit(0)));
  });
  process.on('SIGINT', () => {
    void heartbeat('stopped').finally(() => worker.stop().finally(() => process.exit(0)));
  });
  await worker.start();
}

main().catch((error) => {
  logEvent('error', 'worker.fatal', { error: error instanceof Error ? error.name : 'unknown' });
  process.exit(1);
});
