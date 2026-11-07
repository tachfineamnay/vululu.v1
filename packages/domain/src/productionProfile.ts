import { assertPlatform, assertProjectFormat, type Platform, type ProjectFormat } from './project';
import { DomainError } from './errors';
import { deepFreeze } from './immutability';

export type AspectRatio = '9:16' | '4:5' | '1:1' | '16:9';
export type ProductionSettings = {
  schemaVersion: 1; profileVersion: 'v1-demo-2026-11-04'; ratio: AspectRatio;
  defaultSceneDurationSeconds: number; visualStyle: 'editorial' | 'minimal' | 'bold'; direction: string; maxMockCents: number;
  audio: { voiceVersionId: string | null; musicVersionId: string | null; spokenText: string; voiceGainDb: number; musicGainDb: number; ducking: boolean };
};
export type ProductionSettingsInput = Partial<Omit<ProductionSettings, 'audio'>> & { audio?: Partial<ProductionSettings['audio']> };
const profiles: Record<Platform, { ratios: readonly AspectRatio[]; formats: readonly ProjectFormat[] }> = {
  TikTok: { ratios: ['9:16'], formats: ['Video', 'Reel', 'Motion'] },
  Instagram: { ratios: ['9:16', '4:5', '1:1'], formats: ['Affiche', 'Carrousel', 'Video', 'Reel'] },
  LinkedIn: { ratios: ['1:1', '16:9'], formats: ['Affiche', 'Carrousel', 'Video'] }
};
function invalid(): never { throw new DomainError('invalid_input', 'Paramètres de production incompatibles avec le profil démo.'); }
function bounded(value: unknown, min: number, max: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) invalid();
  return value;
}
function versionId(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !value.trim() || value.length > 128) invalid();
  return value;
}
export function normalizeProductionSettings(platform: Platform, format: ProjectFormat, input: ProductionSettingsInput = {}): ProductionSettings {
  const profile = profiles[assertPlatform(platform)]; assertProjectFormat(format);
  if (!profile.formats.includes(format) || !input || typeof input !== 'object' || Array.isArray(input)) invalid();
  const allowed = ['schemaVersion', 'profileVersion', 'ratio', 'defaultSceneDurationSeconds', 'visualStyle', 'direction', 'maxMockCents', 'audio'];
  if (Object.keys(input).some((key) => !allowed.includes(key)) || (input.schemaVersion !== undefined && input.schemaVersion !== 1) || (input.profileVersion !== undefined && input.profileVersion !== 'v1-demo-2026-11-04')) invalid();
  const ratio = input.ratio === undefined ? profile.ratios[0] : input.ratio;
  const visualStyle = input.visualStyle === undefined ? 'editorial' : input.visualStyle;
  const direction = input.direction === undefined ? '' : input.direction;
  if (!profile.ratios.includes(ratio) || !['editorial', 'minimal', 'bold'].includes(visualStyle) || typeof direction !== 'string' || direction.length > 1000) invalid();
  const audio = input.audio === undefined ? {} : input.audio;
  if (!audio || typeof audio !== 'object' || Array.isArray(audio) || Object.keys(audio).some((key) => !['voiceVersionId', 'musicVersionId', 'spokenText', 'voiceGainDb', 'musicGainDb', 'ducking'].includes(key))) invalid();
  const voiceVersionId = versionId(audio.voiceVersionId); const musicVersionId = versionId(audio.musicVersionId);
  const spokenText = audio.spokenText === undefined ? '' : audio.spokenText;
  const ducking = audio.ducking === undefined ? true : audio.ducking;
  if (typeof spokenText !== 'string' || spokenText.length > 2000 || typeof ducking !== 'boolean' || (spokenText.trim() && !voiceVersionId)) invalid();
  if ((format === 'Affiche' || format === 'Carrousel') && (voiceVersionId || musicVersionId || spokenText.trim())) invalid();
  return deepFreeze({ schemaVersion: 1, profileVersion: 'v1-demo-2026-11-04', ratio, visualStyle, direction: direction.trim(),
    defaultSceneDurationSeconds: bounded(input.defaultSceneDurationSeconds === undefined ? 2 : input.defaultSceneDurationSeconds, 1, 15, true),
    maxMockCents: bounded(input.maxMockCents === undefined ? 1000 : input.maxMockCents, 0, 100000, true),
    audio: { voiceVersionId, musicVersionId, spokenText: spokenText.trim(), ducking,
      voiceGainDb: bounded(audio.voiceGainDb === undefined ? -3 : audio.voiceGainDb, -24, 6),
      musicGainDb: bounded(audio.musicGainDb === undefined ? -18 : audio.musicGainDb, -36, 0) }
  });
}
export function profileDimensions(ratio: AspectRatio): { width: number; height: number } {
  const dimensions = { '9:16': { width: 1080, height: 1920 }, '4:5': { width: 1080, height: 1350 }, '1:1': { width: 1080, height: 1080 }, '16:9': { width: 1920, height: 1080 } };
  if (!Object.hasOwn(dimensions, ratio)) invalid();
  return deepFreeze({ ...dimensions[ratio] });
}
export function plannedSceneCount(format: ProjectFormat): number { return assertProjectFormat(format) === 'Affiche' ? 1 : 5; }
