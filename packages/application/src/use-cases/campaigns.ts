import { createCampaign } from '@vululu/domain';
import type { Actor, AuditPort, CampaignRecord, CampaignRepository, Clock, IdGenerator, ProjectRepository } from '../ports';
import { ApplicationError, assertOwned } from '../errors';

function publicCampaign(row: CampaignRecord) {
  return { id: row.id, name: row.name, description: row.description, createdAt: row.createdAt };
}

/** Groupements explicites, sans modification des briefs ni des snapshots de run. */
export class CampaignUseCases {
  constructor(
    private readonly campaigns: CampaignRepository,
    private readonly projects: ProjectRepository,
    private readonly audit: AuditPort,
    private readonly clock: Clock,
    private readonly ids: IdGenerator
  ) {}

  async create(actor: Actor, input: { name: string; description: string }) {
    const value = createCampaign({ ...input, id: this.ids.next(), userId: actor.id, createdAt: this.clock.now().toISOString() });
    const row = await this.campaigns.create({ ...value, createdAt: new Date(value.createdAt) });
    await this.audit.record({ actorId: actor.id, action: 'campaign.created', targetType: 'campaign', targetId: row.id });
    return publicCampaign(row);
  }

  async list(actor: Actor) { return (await this.campaigns.listOwned(actor.id)).map(publicCampaign); }

  async get(actor: Actor, campaignId: string) {
    const campaign = assertOwned(await this.campaigns.findOwned(campaignId, actor.id), 'campaign_not_found', 'Campagne introuvable.');
    const rows = await this.campaigns.listProjectsOwned(campaignId, actor.id);
    return {
      campaign: publicCampaign(campaign),
      projects: rows.map((row) => ({ id: row.id, title: row.title, platform: row.platform, format: row.format, status: row.status, contextId: row.contextId, campaignId }))
    };
  }

  async assign(actor: Actor, projectId: string, campaignId: string | null) {
    assertOwned(await this.projects.findOwned(projectId, actor.id), 'project_not_found', 'Projet introuvable.');
    if (campaignId !== null) {
      assertOwned(await this.campaigns.findOwned(campaignId, actor.id), 'campaign_not_found', 'Campagne introuvable.');
    }
    if (!await this.campaigns.assignProjectOwned(projectId, campaignId, actor.id)) {
      throw new ApplicationError('project_or_campaign_not_found', 'Projet ou campagne introuvable.', 404);
    }
    await this.audit.record({ actorId: actor.id, action: 'campaign.project_assigned', targetType: 'project', targetId: projectId, metadata: { projectId, campaignId } });
    return { projectId, campaignId };
  }
}
