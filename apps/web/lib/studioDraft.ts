import { productionSettingsInputSchema, type ProductionSettings } from '@vululu/contracts';

export type CorrectionDraft = { instruction: string; edited: boolean };

export type StudioDraft = {
  schemaVersion: 1; baseVersion: number | null; baseChecksum: string | null;
  objective: string; audience: string; tone: string; cta: string; settings: ProductionSettings;
  briefEdited: boolean; correction: string; correctionScene: string; correctionEdited: boolean; chatInput: string;
  correctionDrafts?: Record<string, CorrectionDraft>; unassignedCorrection?: CorrectionDraft;
};

function isCorrectionDraft(value: unknown): value is CorrectionDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const draft = value as Partial<CorrectionDraft>;
  return typeof draft.instruction === 'string' && draft.instruction.length <= 500 && typeof draft.edited === 'boolean';
}

/** Le brouillon de l'onglet est une saisie locale non fiable, jamais une révision serveur. */
export function readStudioDraft(raw: string | null): StudioDraft | null {
  if (!raw || raw.length > 300000) return null;
  try {
    const value = JSON.parse(raw) as Partial<StudioDraft>;
    if (!value || value.schemaVersion !== 1 || !(value.baseVersion === null || (Number.isInteger(value.baseVersion) && value.baseVersion! > 0)) || !(value.baseChecksum === null || (typeof value.baseChecksum === 'string' && /^[a-f0-9]{64}$/.test(value.baseChecksum)))) return null;
    if ((value.baseVersion === null) !== (value.baseChecksum === null)) return null;
    if (['objective', 'audience', 'tone', 'cta'].some((key) => typeof value[key as keyof StudioDraft] !== 'string' || (value[key as keyof StudioDraft] as string).length > 65536)) return null;
    if (typeof value.correction !== 'string' || value.correction.length > 500 || typeof value.correctionScene !== 'string' || value.correctionScene.length > 128 || typeof value.chatInput !== 'string' || value.chatInput.length > 2000 || typeof value.briefEdited !== 'boolean' || typeof value.correctionEdited !== 'boolean') return null;
    if (value.correctionDrafts !== undefined && (!value.correctionDrafts || typeof value.correctionDrafts !== 'object' || Array.isArray(value.correctionDrafts) || Object.entries(value.correctionDrafts).some(([key, draft]) => !key || key.length > 128 || !isCorrectionDraft(draft)))) return null;
    if (value.unassignedCorrection !== undefined && !isCorrectionDraft(value.unassignedCorrection)) return null;
    const settings = productionSettingsInputSchema.required().safeParse(value.settings);
    if (!settings.success || Object.keys(settings.data.audio).length !== 6) return null;
    return { schemaVersion: 1, baseVersion: value.baseVersion!, baseChecksum: value.baseChecksum!, objective: value.objective!, audience: value.audience!, tone: value.tone!, cta: value.cta!, settings: settings.data as ProductionSettings, briefEdited: value.briefEdited, correction: value.correction, correctionScene: value.correctionScene, correctionEdited: value.correctionEdited, chatInput: value.chatInput, ...(value.correctionDrafts !== undefined ? { correctionDrafts: value.correctionDrafts } : {}), ...(value.unassignedCorrection !== undefined ? { unassignedCorrection: value.unassignedCorrection } : {}) };
  } catch { return null; }
}

export function matchesStudioRevision(draft: StudioDraft, version: number | null, checksum: string | null) {
  return draft.baseVersion === version && draft.baseChecksum === checksum;
}
