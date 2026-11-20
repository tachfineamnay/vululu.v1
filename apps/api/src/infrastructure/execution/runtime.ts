import { prisma } from '@vululu/db';
import { CreativeStudio } from '../../application/creative';
import { PrismaCreativeRepository } from '../prisma/creativeRepository';
import { createArtifactStorage, createArtifactStorageRegistry } from '../storage/storageFactory';
import type { EnginePort } from './registry';
import { dispatchPublication } from '../publishing/service';
import { PostizProvider } from '../publishing/provider';
import { generateAssistantClaim } from '../assistant/service';
import { generateClaim } from '../marketing/service';
import { dispatchMedia } from '../mediaGeneration/service';
import { recover } from './broker';
// Closed dispatch table. External media and publishing are reached only through a reserved claim.
export function studioEngine(creativeStudio: CreativeStudio): EnginePort {
  return {
    async invoke(job, signal) {
      signal.throwIfAborted();
      switch (job.tool) {
        case 'media.image@1':
        case 'media.video@1':
          return dispatchMedia(job, signal);
        case 'assistant.draft@1':
          return generateAssistantClaim(job, signal);
        case 'marketing.plan@1':
          return generateClaim(job, signal);
        case 'postiz.schedule@1':
        case 'postiz.cancel@1':
          return dispatchPublication(job, creativeStudio, new PostizProvider(), signal);
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
export const engine = studioEngine(
  new CreativeStudio(new PrismaCreativeRepository(), createArtifactStorage(), createArtifactStorageRegistry())
);
export const workflowName = 'vululu-secure-execution-v1';
// QUEUED is the transactional outbox. Retry the notification, never the claimed effect.
export async function notifyQueued(send: (id: string) => Promise<string>) {
  await recover();
  const now = new Date();
  const rows = await prisma.executionOperation.findMany({
    where: { state: { in: ['QUEUED', 'POLLING'] }, notifyAfter: { lte: now } },
    orderBy: { notifyAfter: 'asc' },
    select: { id: true, correlationId: true },
    take: 20
  });
  for (const { id, correlationId } of rows) {
    const lease = await prisma.executionOperation.updateMany({
      where: { id, state: { in: ['QUEUED', 'POLLING'] }, notifyAfter: { lte: now } },
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
