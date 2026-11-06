import { expect, it } from 'vitest';
import { matchesStudioRevision, readStudioDraft, type StudioDraft } from '../apps/web/lib/studioDraft';

const draft: StudioDraft = {
  schemaVersion: 1, baseVersion: 3, baseChecksum: 'a'.repeat(64), objective: 'Idée en cours', audience: 'Public', tone: 'Clair', cta: 'Découvrir', briefEdited: true,
  correction: 'Instruction conservée', correctionScene: 'SCENE-017', correctionEdited: true, chatInput: 'Message non envoyé',
  settings: { schemaVersion: 1, profileVersion: 'v1-demo-2026-11-04', ratio: '4:5', defaultSceneDurationSeconds: 2, visualStyle: 'editorial', direction: 'Direction en cours', maxMockCents: 100, audio: { voiceVersionId: null, musicVersionId: null, spokenText: '', voiceGainDb: -3, musicGainDb: -18, ducking: true } }
};
it('conserve les saisies de tous les panneaux et vérifie la révision exacte avant reprise', () => {
  const restored = readStudioDraft(JSON.stringify(draft))!;
  expect(restored).toEqual(draft);
  expect(matchesStudioRevision(restored, 3, 'a'.repeat(64))).toBe(true);
  expect(matchesStudioRevision(restored, 3, 'b'.repeat(64))).toBe(false);
  expect(matchesStudioRevision(restored, 4, 'a'.repeat(64))).toBe(false);
});
it('refuse stockage corrompu, réglages incomplets et champs hors limites', () => {
  expect(readStudioDraft('{broken')).toBeNull();
  expect(readStudioDraft(JSON.stringify({ ...draft, settings: { ...draft.settings, audio: {} } }))).toBeNull();
  expect(readStudioDraft(JSON.stringify({ ...draft, correction: 'x'.repeat(501) }))).toBeNull();
  expect(readStudioDraft(JSON.stringify({ ...draft, baseVersion: null }))).toBeNull();
  expect(readStudioDraft(JSON.stringify({ ...draft, settings: { ...draft.settings, ratio: 'unknown' } }))).toBeNull();
});
