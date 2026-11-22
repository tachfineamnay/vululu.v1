import { creativeSpec, type CreativeSpec } from '@vululu/contracts';

const MAX_BYTES = 200_000;
export const CREATIVE_DRAFT_PREFIX = 'vululu:creative-draft:v1:';

export type CreativeDraft = { expectedVersion: number; savedAt: string; spec: CreativeSpec };
export type CreativeDraftRead =
  | { state: 'empty' }
  | { state: 'invalid' }
  | { state: 'stale'; draft: CreativeDraft }
  | { state: 'current'; draft: CreativeDraft };

function key(projectId: string) {
  return CREATIVE_DRAFT_PREFIX + projectId;
}

/** Copie locale de secours : elle ne vaut jamais révision serveur et n'est jamais approuvable. */
export function readCreativeDraft(projectId: string, expectedVersion: number): CreativeDraftRead {
  if (typeof window === 'undefined') return { state: 'empty' };
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(key(projectId));
  } catch {
    return { state: 'empty' };
  }
  if (!raw) return { state: 'empty' };
  if (raw.length > MAX_BYTES) return { state: 'invalid' };
  try {
    const value = JSON.parse(raw) as { schemaVersion?: unknown; expectedVersion?: unknown; savedAt?: unknown; spec?: unknown };
    if (value.schemaVersion !== 1 || !Number.isInteger(value.expectedVersion) || (value.expectedVersion as number) < 0) return { state: 'invalid' };
    if (typeof value.savedAt !== 'string' || Number.isNaN(Date.parse(value.savedAt))) return { state: 'invalid' };
    const parsed = creativeSpec.safeParse(value.spec);
    if (!parsed.success) return { state: 'invalid' };
    const draft: CreativeDraft = { expectedVersion: value.expectedVersion as number, savedAt: value.savedAt, spec: parsed.data };
    return draft.expectedVersion === expectedVersion ? { state: 'current', draft } : { state: 'stale', draft };
  } catch {
    return { state: 'invalid' };
  }
}

export function writeCreativeDraft(projectId: string, expectedVersion: number, spec: CreativeSpec) {
  if (typeof window === 'undefined') return false;
  const payload = JSON.stringify({ schemaVersion: 1, expectedVersion, savedAt: new Date().toISOString(), spec });
  if (payload.length > MAX_BYTES) return false;
  try {
    window.localStorage.setItem(key(projectId), payload);
    return true;
  } catch {
    return false;
  }
}

export function clearCreativeDraft(projectId: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key(projectId));
  } catch {
    /* stockage indisponible : aucune promesse de conservation */
  }
}
