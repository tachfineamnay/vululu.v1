import type { PrismaClient } from '@prisma/client';
import { prisma } from '@vululu/db';
import type { CampaignRecord, CampaignRepository } from '@vululu/application';
import { toProjectRecord } from './mappers';

export class PrismaCampaignRepository implements CampaignRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async create(input: CampaignRecord) { return this.db.campaign.create({ data: input }); }
  async listOwned(userId: string) {
    return this.db.campaign.findMany({ where: { userId }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] });
  }
  async findOwned(campaignId: string, userId: string) {
    return this.db.campaign.findFirst({ where: { id: campaignId, userId } });
  }
  async listProjectsOwned(campaignId: string, userId: string) {
    const rows = await this.db.project.findMany({ where: { campaignId, userId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    return rows.map(toProjectRecord);
  }
  async assignProjectOwned(projectId: string, campaignId: string | null, userId: string) {
    return this.db.$transaction(async (tx) => {
      if (campaignId !== null && !await tx.campaign.findFirst({ where: { id: campaignId, userId }, select: { id: true } })) return false;
      const result = await tx.project.updateMany({ where: { id: projectId, userId }, data: { campaignId } });
      return result.count === 1;
    });
  }
}
