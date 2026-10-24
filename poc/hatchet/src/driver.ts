/* eslint-disable @typescript-eslint/no-explicit-any -- POC Hatchet isole, types SDK volontairement souples */
import { seedSchema, pool, getApproval } from './ledger';
import { hatchet, pipeline, timeoutWorkflow } from './pipeline';

function arg(name: string, fallback?: string): string {
  const index = process.argv.indexOf('--' + name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  if (fallback !== undefined) return fallback;
  throw new Error('missing arg --' + name);
}

function flag(name: string): boolean {
  return process.argv.includes('--' + name);
}

function terminal(status: unknown): boolean {
  const text = String(status).toUpperCase();
  return ['COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT', 'TIMEOUT'].some((value) =>
    text.includes(value)
  );
}

async function waitRun(runId: string, timeoutMs = 240000): Promise<any> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const status = await hatchet.runs.get_status(runId);
      console.log('POC_RUN_STATUS', runId, status);
      if (terminal(status)) {
        const details = await hatchet.runs.getDetails(runId);
        console.log('POC_RUN_DETAILS', JSON.stringify(details));
        return details;
      }
    } catch (error) {
      console.log('POC_STATUS_PENDING', runId, (error as Error).message);
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error('run_timeout:' + runId);
}

async function main() {
  await seedSchema();
  const command = process.argv[2];
  if (command === 'start') {
    const runId = arg('runId', 'poc-' + Date.now());
    const projectId = arg('projectId', 'project-poc-1');
    const input = {
      runId,
      projectId,
      sceneDurationSeconds: Number(arg('duration', '2')),
      crashAfterEffect: flag('crash'),
      failMode: arg('failMode', 'none'),
      budgetCents: Number(arg('budget', '10'))
    };
    const ref = await pipeline.runNoWait(input as any);
    const hatchetRunId = await ref.runId;
    console.log('POC_STARTED', JSON.stringify({ runId, hatchetRunId }));
    process.exit(0);
  }
  if (command === 'approve') {
    const runId = arg('runId');
    const approval = await getApproval(runId);
    if (!approval) throw new Error('approval_not_found');
    const checksum = String(approval.checksum);
    await hatchet.events.push('poc-approval-' + runId, { approved: true, checksum });
    console.log('POC_APPROVAL_PUSHED', runId, checksum);
    process.exit(0);
  }
  if (command === 'wait') {
    await waitRun(arg('runId'));
    process.exit(0);
  }
  if (command === 'timeout') {
    const projectId = arg('projectId', 'project-timeout');
    const runId = arg('runId', 'poc-timeout-' + Date.now());
    const ref = await timeoutWorkflow.runNoWait({ runId, projectId } as any);
    const hatchetRunId = await ref.runId;
    console.log('POC_TIMEOUT_RUN', hatchetRunId);
    await waitRun(hatchetRunId);
    process.exit(0);
  }
  if (command === 'status') {
    const details = await hatchet.runs.getDetails(arg('runId'));
    console.log(JSON.stringify(details));
    process.exit(0);
  }
  throw new Error('unknown command');
}

main()
  .catch((error) => {
    console.error('POC_DRIVER_FATAL', error);
    process.exit(1);
  })
  .finally(() => {
    void pool.end();
  });