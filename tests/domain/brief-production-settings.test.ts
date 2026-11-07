import { expect, it } from 'vitest';
import { createBrief, briefChecksum, reviseBrief } from '../../packages/domain/src/brief';
import { normalizeProductionSettings } from '../../packages/domain/src/productionProfile';
import { nextVersion, appendVersion } from '../../packages/domain/src/versions';
const content = { objective: 'Présenter', audience: 'Public', tone: 'Clair', cta: 'Découvrir', platform: 'Instagram' as const, format: 'Video' as const };
it('inclut les parametres dans la revision et le checksum sans changer les anciens contenus', () => {
  const legacyChecksum = briefChecksum(content);
  const settings = normalizeProductionSettings('Instagram', 'Video', { ratio: '4:5' });
  const result = createBrief({ id: 'brief', projectId: 'project', revisionId: 'revision', content: { ...content, settings }, createdAt: '2026-11-04T12:00:00.000Z' });
  expect(result.revision.settings).toEqual(settings);
  expect(result.revision.checksum).not.toBe(legacyChecksum);
  expect(briefChecksum(content)).toBe(legacyChecksum);
});
it('reprend la version courante d un brief legacy sans inventer ses revisions absentes', () => {
  const result = reviseBrief({ brief: { id: 'brief', projectId: 'project', currentVersion: 3 }, revisions: [], revisionId: 'revision-4', content, createdAt: '2026-11-04T12:00:00.000Z' });
  expect(result.revision.version).toBe(4); expect(result.revisions).toHaveLength(1);
});
it('utilise le dernier numero connu sans fabriquer une version historique', () => {
  expect(nextVersion([], 3)).toBe(4);
  expect(appendVersion([], { version: 4 }, 3).versions).toEqual([{ version: 4 }]);
  expect(() => appendVersion([], { version: 3 }, 3)).toThrow();
});
