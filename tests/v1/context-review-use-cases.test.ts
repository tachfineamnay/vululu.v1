import { expect, it, vi } from 'vitest';
import { ContextReviewUseCases, type ContextReviewStore } from '@vululu/application';
import { createBrandContext, contextChecksum } from '../../packages/domain/src/index';
import { DeterministicContextAnalyzer } from '../../apps/api/src/infrastructure/providers/deterministicContextAnalyzer';

const context = createBrandContext({ id: 'context', userId: 'owner', name: 'Atelier fictif', description: 'Description saisie', website: 'http://127.0.0.1:9/private' });
function fixture() {
  const store: ContextReviewStore = { getOwned: vi.fn(async () => ({ context, revisions: [] })), saveOwned: vi.fn() };
  const useCases = new ContextReviewUseCases(store, new DeterministicContextAnalyzer(), { record: vi.fn() }, { now: () => new Date() }, { next: () => 'revision' });
  return { store, useCases };
}
it('ne fabrique pas de contenu distant et ne modifie rien lors de la proposition MOCK', async () => {
  const { store, useCases } = fixture();
  const result = await useCases.propose({ id: 'owner', role: 'user' }, context.id);
  expect(result).toMatchObject({ mode: 'MOCK', websiteFetched: false, sourceVersion: 0, sourceChecksum: contextChecksum(context) });
  expect(result.hypotheses.map((h) => h.field)).toEqual(['audience', 'tone']);
  expect(result.facts.map((f) => f.field)).not.toContain('id');
  expect(store.saveOwned).not.toHaveBeenCalled();
});
it('n invente pas de nouvelles propositions pour des valeurs deja saisies', async () => {
  const analyzer = new DeterministicContextAnalyzer();
  expect((await analyzer.propose({ ...context, audience: 'Audience saisie', tone: 'Ton saisi' })).hypotheses).toEqual([]);
});
it('refuse toute sauvegarde non confirmee avant un appel au store', async () => {
  const { store, useCases } = fixture();
  await expect(useCases.save({ id: 'owner', role: 'user' }, context.id, { content: context, expectedVersion: 0, confirmed: false })).rejects.toMatchObject({ statusCode: 400 });
  expect(store.saveOwned).not.toHaveBeenCalled();
});
it('n accorde pas de bypass de propriete au super-admin', async () => {
  const { store, useCases } = fixture(); vi.mocked(store.getOwned).mockResolvedValue(null);
  await expect(useCases.propose({ id: 'admin', role: 'super_admin' }, context.id)).rejects.toMatchObject({ statusCode: 404 });
  expect(store.getOwned).toHaveBeenCalledWith(context.id, 'admin');
});
