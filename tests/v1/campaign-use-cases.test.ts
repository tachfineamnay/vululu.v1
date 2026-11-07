import { describe, expect, it, vi } from 'vitest';
import { CampaignUseCases, type CampaignRepository, type ProjectRepository } from '@vululu/application';
import { DomainError } from '../../packages/domain/src/errors';

function fixture() {
  const unexpected = async (): Promise<never> => { throw new Error('Unexpected repository operation'); };
  const write = vi.fn(unexpected);
  const campaigns: CampaignRepository = { create: write, listOwned: unexpected, findOwned: unexpected, listProjectsOwned: unexpected, assignProjectOwned: write };
  const projects: ProjectRepository = { create: unexpected, listOwned: unexpected, findOwned: async () => null, updateStatus: unexpected };
  const useCases = new CampaignUseCases(campaigns, projects, { record: async () => {} }, { now: () => new Date('2026-11-04T12:00:00.000Z') }, { next: () => 'campaign-1' });
  return { useCases, write };
}

describe('Campagnes : garde-fous applicatifs sans transport', () => {
  it('revalide le contenu meme si un appel contourne le schema HTTP', async () => {
    const { useCases, write } = fixture();
    await expect(useCases.create({ id: 'owner', role: 'user' }, { name: ' ', description: '' })).rejects.toBeInstanceOf(DomainError);
    expect(write).not.toHaveBeenCalled();
  });
  it('n accorde pas au super_admin un bypass de propriete sur les projets', async () => {
    const { useCases, write } = fixture();
    await expect(useCases.assign({ id: 'admin', role: 'super_admin' }, 'foreign-project', null)).rejects.toMatchObject({ statusCode: 404 });
    expect(write).not.toHaveBeenCalled();
  });
});
