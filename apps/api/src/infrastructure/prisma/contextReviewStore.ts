import type { PrismaClient } from '@prisma/client';
import { prisma } from '@vululu/db';
import { ApplicationError, type ContextReviewStore } from '@vululu/application';
import type { ContextSnapshot } from '@vululu/domain';
import { toContextRecord, toJsonInput } from './mappers';

export class PrismaContextReviewStore implements ContextReviewStore {
  constructor(private readonly db: PrismaClient = prisma) {}
  async getOwned(contextId: string, userId: string) {
    const row = await this.db.brandContext.findFirst({ where: { id: contextId, userId }, include: { revisions: { orderBy: { version: 'asc' } } } });
    if (!row) return null;
    return { context: toContextRecord(row), revisions: row.revisions.map((r) => ({ id: r.id, contextId: r.contextId, version: r.version, checksum: r.checksum, snapshot: r.data as unknown as ContextSnapshot, createdAt: r.createdAt.toISOString() })) };
  }
  async saveOwned(input: Parameters<ContextReviewStore['saveOwned']>[0]) {
    return this.db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "BrandContext" WHERE "id" = ${input.contextId} AND "userId" = ${input.userId} FOR UPDATE`;
      if (!locked.length) throw new ApplicationError('context_not_found', 'Contexte introuvable.', 404);
      const latest = await tx.contextRevision.findFirst({ where: { contextId: input.contextId }, orderBy: { version: 'desc' } });
      if (latest?.checksum === input.revision.checksum) return { changed: false };
      if ((latest?.version ?? 0) !== input.expectedVersion || input.revision.version !== input.expectedVersion + 1) throw new ApplicationError('context_revision_conflict', 'La fiche a changé. Rechargez-la avant de confirmer.', 409);
      await tx.brandContext.update({ where: { id: input.contextId }, data: input.content });
      await tx.contextRevision.create({ data: { id: input.revision.id, contextId: input.contextId, version: input.revision.version, checksum: input.revision.checksum, data: toJsonInput(input.content as unknown as Record<string, unknown>), createdAt: new Date(input.revision.createdAt) } });
      return { changed: true };
    });
  }
}
