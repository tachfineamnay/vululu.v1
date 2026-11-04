import { expect, it } from 'vitest';
import { normalizeProductionSettings, profileDimensions, plannedSceneCount } from '../../packages/domain/src/productionProfile';

it('normalise un profil Instagram versionne, sans voix ni musique inventees', () => {
  expect(normalizeProductionSettings('Instagram', 'Video')).toMatchObject({ schemaVersion: 1, profileVersion: 'v1-demo-2026-11-04', ratio: '9:16', defaultSceneDurationSeconds: 2, maxMockCents: 1000, audio: { voiceVersionId: null, musicVersionId: null, spokenText: '', ducking: true } });
});
it('choisit un ratio LinkedIn interne et fige les parametres', () => {
  const result = normalizeProductionSettings('LinkedIn', 'Affiche');
  expect(result.ratio).toBe('1:1'); expect(Object.isFrozen(result.audio)).toBe(true);
});
it('conserve les choix valides et les references de versions exactes', () => {
  const value = normalizeProductionSettings('Instagram', 'Video', { ratio: '4:5', visualStyle: 'bold', direction: ' Plan produit ', defaultSceneDurationSeconds: 4, maxMockCents: 40, audio: { voiceVersionId: 'voice-version', musicVersionId: 'music-version', spokenText: 'Texte de cet enregistrement', voiceGainDb: -6, musicGainDb: -24, ducking: false } });
  expect(value).toMatchObject({ ratio: '4:5', direction: 'Plan produit', defaultSceneDurationSeconds: 4, audio: { voiceVersionId: 'voice-version', voiceGainDb: -6, ducking: false } });
});
it.each([{ ratio: '16:9' }, { defaultSceneDurationSeconds: 0 }, { defaultSceneDurationSeconds: 16 }, { direction: 'x'.repeat(1001) }, { maxMockCents: -1 }, { maxMockCents: 0.5 }, { maxMockCents: 100001 }, { visualStyle: 'unknown' }, { profileVersion: 'future' }, { schemaVersion: 2 }, { audio: { voiceGainDb: 7 } }, { audio: { musicGainDb: -37 } }, { audio: { ducking: 'yes' } }, { audio: { voiceVersionId: '' } }, { audio: { spokenText: 'Pas de voix choisie' } }])('refuse une configuration incoherente (cas %#)', (input) => {
  expect(() => normalizeProductionSettings('Instagram', 'Video', input as any)).toThrow();
});
it('refuse un format hors profil et l audio sur une image', () => {
  expect(() => normalizeProductionSettings('TikTok', 'Affiche')).toThrow();
  expect(() => normalizeProductionSettings('Instagram', 'Affiche', { audio: { musicVersionId: 'version' } })).toThrow();
});
it.each([{ ratio: null }, { visualStyle: null }])('ne transforme pas une valeur nulle explicite en choix valide (cas %#)', (input) => {
  expect(() => normalizeProductionSettings('Instagram', 'Video', input as any)).toThrow();
});
it.each([{ ratio: '9:16', width: 1080, height: 1920 }, { ratio: '4:5', width: 1080, height: 1350 }, { ratio: '1:1', width: 1080, height: 1080 }, { ratio: '16:9', width: 1920, height: 1080 }] as const)('derive les dimensions du ratio $ratio', ({ ratio, width, height }) => {
  expect(profileDimensions(ratio)).toEqual({ width, height });
});
it('distingue affiche unique et storyboard multiscene', () => { expect(plannedSceneCount('Affiche')).toBe(1); expect(plannedSceneCount('Carrousel')).toBe(5); expect(plannedSceneCount('Video')).toBe(5); });
