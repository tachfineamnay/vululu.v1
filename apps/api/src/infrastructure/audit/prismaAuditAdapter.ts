import type { PrismaClient } from '@prisma/client';
import { prisma } from '@vululu/db';
import type { AuditPort } from '@vululu/application';
import { toJsonInput } from '../prisma/mappers';

/**
 * Adaptateur PostgreSQL du port AuditPort : ecrit un AuditEvent par action
 * (actor, action, cible, metadata, horodatage). Aucun secret ne doit etre
 * place dans metadata : cet adaptateur ne filtre pas le contenu.
 */
export class PrismaAuditAdapter implements AuditPort {
  constructor(private readonly db: PrismaClient = prisma) {}

  async record(input: {
    actorId: string | null;
    action: string;
    targetType: string;
    targetId: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.db.auditEvent.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        metadata: input.metadata === undefined ? undefined : toJsonInput(input.metadata)
      }
    });
  }
}
