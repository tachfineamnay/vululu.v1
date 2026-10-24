import '../env';
import { hatchet, durableWorkerWorkflow } from './pipeline';
import { seedDurableAgentIfMissing } from './bootstrap';

async function main() {
  await seedDurableAgentIfMissing();
  const worker = await hatchet.worker('vululu-durable-worker', {
    workflows: [durableWorkerWorkflow],
    slots: 2
  });
  process.on('SIGTERM', () => {
    void worker.stop().finally(() => process.exit(0));
  });
  process.on('SIGINT', () => {
    void worker.stop().finally(() => process.exit(0));
  });
  await worker.start();
}

main().catch((error) => {
  console.error('DURABLE_WORKER_FATAL', error);
  process.exit(1);
});