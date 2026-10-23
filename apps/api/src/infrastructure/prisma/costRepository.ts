import type { PrismaClient } from '@prisma/client';
import { prisma } from '@vululu/db';
import type { CostRepository } from '@vululu/application';

export class PrismaCostRepository implements CostRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async record(input: {
    projectId: string | null;
    jobRunId: string | null;
    provider: string;
    model: string | null;
    units: number;
    amountCents: number;
  }): Promise<void> {
    await this.db.costEvent.create({
      data: {
        projectId: input.projectId,
        jobRunId: input.jobRunId,
        provider: input.provider,
        model: input.model,
        units: input.units,
        amountCents: input.amountCents
      }
    });
  }
}
