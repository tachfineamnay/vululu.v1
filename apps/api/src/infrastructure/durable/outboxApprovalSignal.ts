import type { PrismaClient } from '@prisma/client';
import { prisma } from '@vululu/db';
import type { ApprovalSignalPort } from '@vululu/application';
import type { OutboxDispatcher } from './outboxDispatcher';

/**
 * Signal d approbation durable : l approbation metier est deja persistee par
 * l API ; l evenement Hatchet est materialise dans l outbox et livre au moins
 * une fois. Un rejeu ne cree pas de second signal logique (cle unique).
 */
export class OutboxApprovalSignal implements ApprovalSignalPort {
  constructor(
    private readonly dispatcher: OutboxDispatcher,
    private readonly db: PrismaClient = prisma
  ) {}

  async signal(input: {
    jobRunId: string;
    projectId: string;
    artifactVersionId: string;
    checksum: string;
    approvedBy: string;
  }): Promise<void> {
    const idempotencyKey = 'approval:' + input.artifactVersionId + ':' + input.checksum;
    try {
      await this.db.orchestrationOutbox.create({
        data: {
          idempotencyKey,
          jobRunId: input.jobRunId,
          kind: 'approval_signal',
          payload: {
            projectId: input.projectId,
            artifactVersionId: input.artifactVersionId,
            checksum: input.checksum,
            approvedBy: input.approvedBy
          },
          status: 'pending'
        }
      });
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? (error as { code?: string }).code : undefined;
      if (code !== 'P2002') throw error;
    }
    await this.dispatcher.dispatchPending();
  }
}
