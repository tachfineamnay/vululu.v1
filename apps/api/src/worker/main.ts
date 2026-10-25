import '../env';
import { hatchet, durableWorkerWorkflow } from './pipeline';
import { seedDurableAgentIfMissing } from './bootstrap';
import { prisma } from '@vululu/db';
import { logEvent } from '../observability/logger';

const heartbeatId = process.env.DURABLE_WORKER_ID || ('worker-' + process.pid);

async function heartbeat(status: string): Promise<void> {
  await prisma.workerHeartbeat.upsert({
    where: { id: heartbeatId },
    update: { status, lastSeenAt: new Date(), name: 'vululu-durable-worker' },
    create: { id: heartbeatId, name: 'vululu-durable-worker', status, lastSeenAt: new Date() }
  }).catch((error) => {
    logEvent('error', 'worker.heartbeat_failed', { error: error instanceof Error ? error.message : 'unknown' });
  });
}

async function main() {
  await seedDurableAgentIfMissing();
  await heartbeat('running');
  const timer = setInterval(() => { void heartbeat('running'); }, 10000);
  timer.unref?.();
  logEvent('info', 'worker.started', { workerId: heartbeatId });
  const worker = await hatchet.worker('vululu-durable-worker', {
    workflows: [durableWorkerWorkflow],
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
  console.error('DURABLE_WORKER_FATAL', error);
  process.exit(1);
});