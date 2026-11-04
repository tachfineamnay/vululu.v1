import { expect, it, vi } from 'vitest';
import { AssetUseCases, type AssetRepository, type ProjectRepository } from '@vululu/application';

const actor = { id: 'owner', role: 'super_admin' as const };
function setup() {
  const repository: AssetRepository = {
    findOwned: vi.fn(async () => null), listOwned: vi.fn(async () => []),
    reserve: vi.fn(), finalize: vi.fn(), getSelection: vi.fn(), selectOwned: vi.fn()
  };
  const projects = { findOwned: vi.fn(async () => ({ id: 'project', userId: actor.id, contextId: 'context', title: 'Fixture', platform: 'Instagram', format: 'Video', objective: 'Fixture', sceneDurationSeconds: 2, status: 'draft' })) } as unknown as ProjectRepository;
  // Ports inutilisés dans ces deux opérations : aucune infrastructure réelle.
  const useCases = new AssetUseCases(repository, {} as any, projects, {} as any, {} as any, {}, { record: vi.fn() }, { now: () => new Date() }, { next: () => 'fixture-id' });
  return { useCases, repository };
}
it('le cas d usage ne donne pas de bypass proprietaire au super-admin', async () => {
  const { useCases, repository } = setup();
  await expect(useCases.get(actor, 'foreign')).rejects.toMatchObject({ statusCode: 404 });
  expect(repository.findOwned).toHaveBeenCalledWith('foreign', actor.id);
});
it('le cas d usage refuse des droits internes en sponsorise meme si le repository accepterait', async () => {
  const { useCases, repository } = setup();
  vi.mocked(repository.listOwned).mockResolvedValue([{ id: 'asset', contextId: 'context', kind: 'image', versions: [{ id: 'version', assetId: 'asset', version: 1, name: 'Fixture', kind: 'image', mimeType: 'image/png', sizeBytes: 12, sha256: 'a'.repeat(64), license: 'internal', provenance: 'Fixture autorisee', createdAt: new Date().toISOString(), userId: actor.id, contextId: 'context', storageProvider: 'MOCK', storageKey: 'fixture', state: 'ready', metadata: {} }] }]);
  await expect(useCases.select(actor, 'project', 'sponsored', ['version'])).rejects.toThrow('Droits insuffisants');
  expect(repository.listOwned).toHaveBeenCalledWith('context', actor.id);
  expect(repository.selectOwned).not.toHaveBeenCalled();
});
