import '../apps/api/src/env';
import { prisma } from '@vululu/db';
import { OutboxDispatcher, HatchetOrchestratorAdapter } from '../apps/api/src/infrastructure';
import { RuntimeReconciliationService } from '../apps/api/src/infrastructure/operations/runtimeReconciliation';
import { logEvent } from '../apps/api/src/observability/logger';

async function main() {
  const apply = process.argv.includes('--apply');
  const dispatcher = apply ? new OutboxDispatcher(new HatchetOrchestratorAdapter()) : undefined;
  const service = new RuntimeReconciliationService(prisma, dispatcher);
  const report = await service.report({ dryRun: !apply });
  console.log(JSON.stringify(report, null, 2));
  logEvent(apply ? 'info' : 'warn', 'ops.reconcile', { dryRun: report.dryRun, incidents: report.incidents.length });
  dispatcher?.stop();
  await prisma.$disconnect();
}
main().catch((error) => { console.error(error); process.exit(1); });
