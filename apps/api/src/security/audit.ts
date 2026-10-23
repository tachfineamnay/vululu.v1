import type { Prisma } from '@prisma/client';
import { prisma } from '@vululu/db';

export type AuditEventInput = {
  actorId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Appends a security-relevant audit event. Callers must never pass secrets,
 * passwords, session tokens or CSRF tokens in the metadata.
 */
export async function recordAuditEvent(event: AuditEventInput): Promise<void> {
  await prisma.auditEvent.create({
    data: {
      actorId: event.actorId ?? null,
      action: event.action,
      targetType: event.targetType,
      targetId: event.targetId ?? null,
      metadata: event.metadata ? (event.metadata as Prisma.InputJsonValue) : undefined
    }
  });
}
