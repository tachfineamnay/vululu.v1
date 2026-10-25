import type { PrismaClient } from '@prisma/client';
import { prisma } from '@vululu/db';

export type OpsSnapshot = {
  generatedAt: string;
  database: 'ok' | 'error';
  workers: Array<{ id: string; name: string; status: string; lastSeenAt: string; stale: boolean }>;
  jobRuns: Record<string, number>;
  stepRuns: Record<string, number>;
  outbox: Record<string, number>;
  artifacts: Record<string, number>;
};

export class OpsMetricsService {
  constructor(private readonly db: PrismaClient = prisma) {}

  async snapshot(): Promise<OpsSnapshot> {
    let database: 'ok' | 'error' = 'ok';
    try {
      await this.db.$queryRawUnsafe('SELECT 1');
    } catch {
      database = 'error';
    }
    if (database === 'error') {
      return {
        generatedAt: new Date().toISOString(),
        database,
        workers: [],
        jobRuns: {},
        stepRuns: {},
        outbox: {},
        artifacts: {}
      };
    }
    const [workers, jobRuns, stepRuns, outbox, artifacts] = await Promise.all([
      this.db.workerHeartbeat.findMany({ orderBy: { lastSeenAt: 'desc' }, take: 20 }),
      this.db.jobRun.groupBy({ by: ['status'], _count: { _all: true } }),
      this.db.stepRun.groupBy({ by: ['status'], _count: { _all: true } }),
      this.db.orchestrationOutbox.groupBy({ by: ['status'], _count: { _all: true } }),
      this.db.artifactObject.groupBy({ by: ['state'], _count: { _all: true } })
    ]);
    const now = Date.now();
    return {
      generatedAt: new Date(now).toISOString(),
      database,
      workers: workers.map((worker) => ({
        id: worker.id,
        name: worker.name,
        status: worker.status,
        lastSeenAt: worker.lastSeenAt.toISOString(),
        stale: now - worker.lastSeenAt.getTime() > 30_000
      })),
      jobRuns: Object.fromEntries(jobRuns.map((row) => [row.status, row._count._all])),
      stepRuns: Object.fromEntries(stepRuns.map((row) => [row.status, row._count._all])),
      outbox: Object.fromEntries(outbox.map((row) => [row.status, row._count._all])),
      artifacts: Object.fromEntries(artifacts.map((row) => [row.state, row._count._all]))
    };
  }

  static prometheus(snapshot: OpsSnapshot): string {
    const lines: string[] = [
      '# HELP vululu_workers_active Nombre de workers avec heartbeat recent.',
      '# TYPE vululu_workers_active gauge',
      'vululu_workers_active ' + snapshot.workers.filter((worker) => !worker.stale).length
    ];
    const map = (prefix: string, values: Record<string, number>) => {
      for (const [key, value] of Object.entries(values)) {
        lines.push(prefix + '{status="' + key + '"} ' + value);
      }
    };
    map('vululu_job_runs', snapshot.jobRuns);
    map('vululu_step_runs', snapshot.stepRuns);
    map('vululu_outbox', snapshot.outbox);
    map('vululu_artifacts', snapshot.artifacts);
    return lines.join('\n') + '\n';
  }
}