import crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@vululu/db';
import type {
  JobRunRecord,
  JobRunRepository,
  ReproducibilitySnapshot
} from '@vululu/application';

function checksum(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function toRecord(row: {
  id: string;
  projectId: string;
  type: string;
  status: string;
  snapshot: unknown;
  snapshotVersion: number;
  snapshotChecksum: string | null;
  outputs: unknown;
  outputsChecksum: string | null;
}): JobRunRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    type: row.type,
    status: row.status,
    snapshot: (row.snapshot as Record<string, unknown> | null) ?? null,
    snapshotVersion: row.snapshotVersion,
    snapshotChecksum: row.snapshotChecksum,
    outputs: (row.outputs as Record<string, unknown> | null) ?? null,
    outputsChecksum: row.outputsChecksum
  };
}

/**
 * Creation transactionnelle du JobRun et de ses StepRun. Si une etape echoue,
 * la transaction Prisma annule l ensemble : aucun run partiel n'est laisse.
 */
export class PrismaJobRunRepository implements JobRunRepository {
  async createWithSteps(input: {
    projectId: string;
    type: string;
    snapshot: ReproducibilitySnapshot;
    steps: string[];
  }): Promise<JobRunRecord> {
    const row = await prisma.$transaction(async (tx) => {
      const jobRun = await tx.jobRun.create({
        data: {
          projectId: input.projectId,
          type: input.type,
          status: 'queued',
          snapshot: input.snapshot as unknown as Prisma.InputJsonValue,
          snapshotVersion: 1,
          snapshotChecksum: checksum(input.snapshot)
        }
      });
      for (const name of input.steps) {
        await tx.stepRun.create({ data: { jobRunId: jobRun.id, name, status: 'pending' } });
      }
      return jobRun;
    });
    return toRecord(row);
  }

  async findRunning(projectId: string): Promise<JobRunRecord | null> {
    const row = await prisma.jobRun.findFirst({
      where: { projectId, status: { in: ['queued', 'running'] } },
      orderBy: { createdAt: 'desc' }
    });
    return row ? toRecord(row) : null;
  }

  async markStatus(jobRunId: string, status: string): Promise<void> {
    await prisma.jobRun.update({ where: { id: jobRunId }, data: { status } });
  }
}