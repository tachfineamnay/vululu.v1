import type { Prisma } from '@prisma/client';
import { prisma } from '@vululu/db';

export type AuditEventInput = {
  actorId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  traceId?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Appends a security-relevant audit event. Callers must never pass secrets,
 * passwords, session tokens or CSRF tokens in the metadata.
 */
export async function recordAuditEvent(event: AuditEventInput, db: Prisma.TransactionClient = prisma): Promise<void> {
  await db.auditEvent.create({
    data: {
      actorId: event.actorId ?? null,
      action: event.action,
      targetType: event.targetType,
      targetId: event.targetId ?? null,
      ...(event.traceId !== undefined ? { traceId: event.traceId } : {}),
      ...(event.requestId !== undefined ? { requestId: event.requestId } : {}),
      metadata: event.metadata ? (event.metadata as Prisma.InputJsonValue) : undefined
    }
  });
}
