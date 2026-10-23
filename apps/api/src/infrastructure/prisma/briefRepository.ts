import type { PrismaClient } from '@prisma/client';
import { prisma } from '@vululu/db';
import type { BriefRecord } from '@vululu/application';
import { toBriefRecord } from './mappers';

/**
 * Adaptateur PostgreSQL du port BriefRepository.
 *
 * BriefRevision est immuable : une revision ne peut etre ajoutee qu'avec la
 * version suivante du brief courant (append-only, contrainte unique en base).
 */
export class PrismaBriefRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async findCurrent(projectId: string): Promise<BriefRecord | null> {
    const row = await this.db.brief.findUnique({ where: { projectId } });
    return row ? toBriefRecord(row) : null;
  }

  async createRevision(input: Omit<BriefRecord, 'id'> & { checksum: string }): Promise<BriefRecord> {
    const data = {
      objective: input.objective,
      audience: input.audience,
      tone: input.tone,
      cta: input.cta,
      platform: input.platform,
      format: input.format
    };

    const row = await this.db.$transaction(async (tx) => {
      const existing = await tx.brief.findUnique({ where: { projectId: input.projectId } });
      if (existing) {
        if (input.version !== existing.version + 1) {
          throw new Error(
            'brief_version_invalide: version ' +
              input.version +
              ' alors que la version courante est ' +
              existing.version +
              ' (revision append-only)'
          );
        }
        const updated = await tx.brief.update({
          where: { projectId: input.projectId },
          data: { ...data, version: input.version }
        });
        await tx.briefRevision.create({
          data: {
            briefId: updated.id,
            version: input.version,
            ...data,
            checksum: input.checksum
          }
        });
        return updated;
      }

      const created = await tx.brief.create({
        data: { projectId: input.projectId, ...data, version: input.version }
      });
      await tx.briefRevision.create({
        data: {
          briefId: created.id,
          version: input.version,
          ...data,
          checksum: input.checksum
        }
      });
      return created;
    });

    return toBriefRecord(row);
  }
}