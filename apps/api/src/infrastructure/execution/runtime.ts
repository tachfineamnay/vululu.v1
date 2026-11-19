import { prisma } from '@vululu/db';
import { CreativeStudio } from '../../application/creative';
import { PrismaCreativeRepository } from '../prisma/creativeRepository';
import { LocalFilesystemArtifactStorage } from '../storage/localArtifactStorage';
import { env } from '../../env';
import type { EnginePort } from './registry';
import { recover } from './broker';
// Closed dispatch table: no network transport, dynamic imports, credentials or arbitrary URLs.
export function studioEngine(creativeStudio: CreativeStudio): EnginePort {
  return {
    async invoke(job, signal) {
      signal.throwIfAborted();
      switch (job.tool) {
        case 'studio.inspect@1':
          await creativeStudio.get(job.accountId, job.projectId, job.revision);
          return { costCents: 0 };
        case 'studio.render@1':
          await creativeStudio.render(job.accountId, job.projectId, job.revision);
          return { costCents: 0 };
        case 'sandbox.generate@1':
        case 'sandbox.publish@1':
          return { costCents: job.maxCents }; // synthetic units only; never publishes
        default:
          throw new Error('unregistered_tool');
      }
    }
  };
}
const local = new LocalFilesystemArtifactStorage(env.artifactRoot);
export const engine = studioEngine(new CreativeStudio(new PrismaCreativeRepository(), local, { local }));
export const workflowName = 'vululu-secure-execution-v1';
// QUEUED is the transactional outbox. Retry the notification, never the claimed effect.
export async function notifyQueued(send: (id: string) => Promise<string>) {
  await recover();
  const now = new Date();
  const rows = await prisma.executionOperation.findMany({
    where: { state: 'QUEUED', notifyAfter: { lte: now } },
    orderBy: { notifyAfter: 'asc' },
    select: { id: true, correlationId: true },
    take: 20
  });
  for (const { id, correlationId } of rows) {
    const lease = await prisma.executionOperation.updateMany({
      where: { id, state: 'QUEUED', notifyAfter: { lte: now } },
      data: { notifyAfter: new Date(Date.now() + 60000) }
    });
    if (lease.count) {
      const workflowRunId = await send(id);
      await prisma.auditEvent.create({
        data: {
          targetType: 'execution',
          targetId: id,
          traceId: correlationId,
          action: 'execution.notified',
          metadata: { workflowRunId }
        }
      });
    }
  }
}
