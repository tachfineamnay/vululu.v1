import { seedSchema } from './ledger';
import { hatchet, workflows } from './pipeline';

async function main() {
  await seedSchema();
  const worker = await hatchet.worker('vululu-poc-worker', {
    workflows,
    slots: 5
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
  console.error('POC_WORKER_FATAL', error);
  process.exit(1);
});
