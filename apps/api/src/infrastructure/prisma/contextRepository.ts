import type { PrismaClient } from '@prisma/client';
import { prisma } from '@vululu/db';
import type { ContextRecord, ContextRepository } from '@vululu/application';
import { toContextRecord, toJsonInput } from './mappers';

/**
 * Adaptateur PostgreSQL du port ContextRepository.
 *
 * L'isolation proprietaire est appliquee par le filtre userId de la base
 * (findOwned / listOwned), jamais par le code appelant.
 */
export class PrismaContextRepository implements ContextRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async create(input: Omit<ContextRecord, 'id'>): Promise<ContextRecord> {
    const row = await this.db.brandContext.create({
      data: {
        userId: input.userId,
        name: input.name,
        website: input.website,
        description: input.description,
        audience: input.audience,
        tone: input.tone,
        colorPrimary: input.colorPrimary,
        colorSecondary: input.colorSecondary
      }
    });
    return toContextRecord(row);
  }

  async createWithRevision(
    input: Omit<ContextRecord, 'id'>,
    revision: { version: number; checksum: string; data: Record<string, unknown> }
  ): Promise<ContextRecord> {
    const row = await this.db.$transaction(async (tx) => {
      const created = await tx.brandContext.create({
        data: {
          userId: input.userId,
          name: input.name,
          website: input.website,
          description: input.description,
          audience: input.audience,
          tone: input.tone,
          colorPrimary: input.colorPrimary,
          colorSecondary: input.colorSecondary
        }
      });
      await tx.contextRevision.create({
        data: {
          contextId: created.id,
          version: revision.version,
          checksum: revision.checksum,
          data: toJsonInput(revision.data)
        }
      });
      return created;
    });
    return toContextRecord(row);
  }

  async findOwned(contextId: string, userId: string): Promise<ContextRecord | null> {
    const row = await this.db.brandContext.findFirst({ where: { id: contextId, userId } });
    return row ? toContextRecord(row) : null;
  }

  async listOwned(userId: string): Promise<ContextRecord[]> {
    const rows = await this.db.brandContext.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' }
    });
    return rows.map(toContextRecord);
  }

  async addRevision(
    contextId: string,
    version: number,
    checksum: string,
    data: Record<string, unknown>
  ): Promise<void> {
    await this.db.contextRevision.create({
      data: { contextId, version, checksum, data: toJsonInput(data) }
    });
  }
}