import { expect, it } from 'vitest';
import type { MasterVersion } from '../apps/web/lib/api';
import { exactApproval, masterMediaUrl } from '../apps/web/lib/creationDelivery';

it('une approbation invalidée ou d’un autre checksum ne valide pas la version consultée', () => {
  const version = { checksum: 'current', approval: { checksum: 'current', invalidatedAt: null } } as MasterVersion;
  expect(exactApproval(version)).toBe(true);
  version.approval!.invalidatedAt = '2026-11-06T00:00:00Z';
  expect(exactApproval(version)).toBe(false);
  version.approval!.invalidatedAt = null;
  version.approval!.checksum = 'older';
  expect(exactApproval(version)).toBe(false);
});

it('demande réellement une version précise au contrat HTTP des binaires', () => {
  expect(masterMediaUrl('project/with?query', 7)).toBe('/api/projects/project%2Fwith%3Fquery/master?version=7');
});
