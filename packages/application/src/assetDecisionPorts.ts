import { assertAssetUsage, contentChecksum, type AssetKind, type AssetLicense, type PublicationUsage } from '@vululu/domain';
import type { Actor, AuditPort, Clock } from './ports';
import { ApplicationError } from './errors';

/** Décision explicite de ressources avant le brainstorming : ressources choisies ou aucune ressource. */
export type AssetDecisionKind = 'assets' | 'none';
export type AssetDecisionReason = 'not_confirmed' | 'selection_changed' | 'version_unavailable' | 'format_incompatible' | 'license_usage_restricted';
export type AssetDecisionItem = {
  assetId: string; versionId: string; version: number; name: string; kind: string;
  mimeType: string; sha256: string; license: string; provenance: string;
};
export type AssetDecisionSnapshot = {
  schemaVersion: 1; decision: AssetDecisionKind; format: string; usage: PublicationUsage;
  confirmedAt: string; items: AssetDecisionItem[];
};
export type AssetDecisionSelectionRow = {
  assetId: string; versionId: string; version: number; name: string; kind: string;
  mimeType: string; sha256: string; license: string; provenance: string; state: string; ownerValid: boolean;
};
export type AssetDecisionRow = {
  projectId: string; contextId: string; format: string; usage: PublicationUsage;
  confirmedAt: Date | null; digest: string | null; snapshot: unknown; selected: AssetDecisionSelectionRow[];
};
export type AssetDecisionState = {
  confirmed: boolean; stale: boolean; reason: AssetDecisionReason | null; compatibleKinds: string[] | null;
  confirmedAt: string | null; digest: string | null; usage: PublicationUsage;
  versionIds: string[]; noAssets: boolean; snapshot: AssetDecisionSnapshot | null;
};
export interface AssetDecisionRepository {
  readOwned(projectId: string, userId: string): Promise<AssetDecisionRow | null>;
  confirmOwned(projectId: string, userId: string, input: {
    usage: PublicationUsage; versionIds: string[]; clearSelection: boolean;
    digest: string; snapshot: AssetDecisionSnapshot;
  }): Promise<void>;
}

/**
 * Types de ressources réellement utilisables par format de production.
 * Le format inconnu ne restreint rien (défense en profondeur, pas un contournement).
 */
const kindsByFormat: Record<string, readonly AssetKind[]> = {
  Affiche: ['logo', 'image'],
  Story: ['logo', 'image'],
  Carrousel: ['logo', 'image'],
  Reel: ['logo', 'image', 'video', 'audio'],
  Video: ['logo', 'image', 'video', 'audio']
};
export function compatibleAssetKinds(format: string): AssetKind[] | null {
  const kinds = kindsByFormat[format];
  return kinds ? [...kinds] : null;
}

export function decisionItem(row: AssetDecisionSelectionRow): AssetDecisionItem {
  return { assetId: row.assetId, versionId: row.versionId, version: row.version, name: row.name, kind: row.kind,
    mimeType: row.mimeType, sha256: row.sha256, license: row.license, provenance: row.provenance };
}

/** Digest de la décision : identifie la sélection exacte, jamais une URL ou un chemin de stockage. */
export function decisionDigest(projectId: string, value: { decision: AssetDecisionKind; format: string; usage: PublicationUsage; items: AssetDecisionItem[] }): string {
  const items = [...value.items].sort((a, b) => a.versionId.localeCompare(b.versionId)).map((item) => ({ versionId: item.versionId, sha256: item.sha256 }));
  return contentChecksum({ schemaVersion: 1, projectId, decision: value.decision, format: value.format, usage: value.usage, items });
}

export function buildAssetDecisionSnapshot(input: {
  projectId: string; format: string; usage: PublicationUsage; decision: AssetDecisionKind;
  items: AssetDecisionItem[]; confirmedAt: string;
}): { snapshot: AssetDecisionSnapshot; digest: string } {
  const items = [...input.items].sort((a, b) => a.versionId.localeCompare(b.versionId));
  const snapshot: AssetDecisionSnapshot = { schemaVersion: 1, decision: input.decision, format: input.format,
    usage: input.usage, confirmedAt: input.confirmedAt, items };
  return { snapshot, digest: decisionDigest(input.projectId, { decision: input.decision, format: input.format, usage: input.usage, items }) };
}

function normalizeSnapshot(value: unknown): AssetDecisionSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.schemaVersion !== 1 || (row.decision !== 'assets' && row.decision !== 'none') || typeof row.format !== 'string'
    || (row.usage !== 'organic' && row.usage !== 'sponsored') || typeof row.confirmedAt !== 'string' || !Array.isArray(row.items)) return null;
  const items: AssetDecisionItem[] = [];
  for (const raw of row.items) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const item = raw as Record<string, unknown>;
    if (typeof item.assetId !== 'string' || typeof item.versionId !== 'string' || typeof item.version !== 'number'
      || typeof item.name !== 'string' || typeof item.kind !== 'string' || typeof item.mimeType !== 'string'
      || typeof item.sha256 !== 'string' || typeof item.license !== 'string' || typeof item.provenance !== 'string') return null;
    items.push({ assetId: item.assetId, versionId: item.versionId, version: item.version, name: item.name,
      kind: item.kind, mimeType: item.mimeType, sha256: item.sha256, license: item.license, provenance: item.provenance });
  }
  return { schemaVersion: 1, decision: row.decision, format: row.format, usage: row.usage,
    confirmedAt: row.confirmedAt, items };
}

/** La confirmation n'est valable que si la sélection serveur actuelle correspond exactement au digest confirmé. */
export function evaluateAssetDecision(row: AssetDecisionRow): AssetDecisionState {
  const versionIds = row.selected.map((item) => item.versionId);
  const base = { confirmed: false, stale: false, reason: null as AssetDecisionReason | null, compatibleKinds: compatibleAssetKinds(row.format),
    confirmedAt: row.confirmedAt ? row.confirmedAt.toISOString() : null, digest: row.digest, usage: row.usage,
    versionIds, noAssets: false, snapshot: null as AssetDecisionSnapshot | null };
  if (!row.confirmedAt || !row.digest) return { ...base, reason: 'not_confirmed' };
  const snapshot = normalizeSnapshot(row.snapshot);
  if (!snapshot) return { ...base, stale: true, reason: 'selection_changed' };
  const noAssets = snapshot.decision === 'none';
  if (row.selected.some((item) => !item.ownerValid || item.state !== 'ready')) return { ...base, stale: true, reason: 'version_unavailable', noAssets };
  if (snapshot.format !== row.format) return { ...base, stale: true, reason: 'format_incompatible', noAssets, snapshot };
  if (noAssets) {
    if (row.selected.length) return { ...base, stale: true, reason: 'selection_changed', noAssets: true };
    const digest = decisionDigest(row.projectId, { decision: 'none', format: row.format, usage: row.usage, items: [] });
    if (digest !== row.digest) return { ...base, stale: true, reason: 'selection_changed', noAssets: true, snapshot };
    return { ...base, confirmed: true, noAssets: true, snapshot };
  }
  if (!row.selected.length) return { ...base, stale: true, reason: 'selection_changed' };
  const items = row.selected.map(decisionItem);
  const kinds = compatibleAssetKinds(row.format);
  if (kinds && items.some((item) => !kinds.includes(item.kind as AssetKind))) return { ...base, stale: true, reason: 'format_incompatible', snapshot };
  for (const item of items) {
    try { assertAssetUsage(item.license as AssetLicense, row.usage); }
    catch { return { ...base, stale: true, reason: 'license_usage_restricted', snapshot }; }
  }
  const digest = decisionDigest(row.projectId, { decision: 'assets', format: row.format, usage: row.usage, items });
  if (digest !== row.digest) return { ...base, stale: true, reason: 'selection_changed', snapshot };
  return { ...base, confirmed: true, snapshot };
}

export class AssetDecisionUseCases {
  constructor(private readonly repository: AssetDecisionRepository, private readonly audit: AuditPort, private readonly clock: Clock) {}

  private async read(actor: Actor, projectId: string): Promise<AssetDecisionRow> {
    const row = await this.repository.readOwned(projectId, actor.id);
    if (!row) throw new ApplicationError('project_not_found', 'Projet introuvable.', 404);
    return row;
  }

  async state(actor: Actor, projectId: string): Promise<AssetDecisionState> {
    return evaluateAssetDecision(await this.read(actor, projectId));
  }

  /** Confirme la sélection courante ou, explicitement, l'absence de ressource. */
  async confirm(actor: Actor, projectId: string, noAssets: boolean): Promise<AssetDecisionState> {
    const row = await this.read(actor, projectId);
    const unavailable = row.selected.filter((item) => !item.ownerValid || item.state !== 'ready');
    if (!noAssets && unavailable.length) {
      throw new ApplicationError('asset_version_unavailable', 'Une ressource sélectionnée n’est plus disponible. Corrigez la sélection puis reconfirmez.', 409);
    }
    const items = row.selected.filter((item) => item.ownerValid && item.state === 'ready').map(decisionItem);
    if (!noAssets) {
      if (!items.length) throw new ApplicationError('assets_required', 'Aucune ressource sélectionnée : choisissez des ressources ou confirmez qu’il n’y en a pas.', 409);
      const kinds = compatibleAssetKinds(row.format);
      if (kinds && items.some((item) => !kinds.includes(item.kind as AssetKind))) {
        throw new ApplicationError('asset_format_incompatible', 'Ces ressources ne conviennent pas au format ' + row.format + '.', 400);
      }
      for (const item of items) {
        try { assertAssetUsage(item.license as AssetLicense, row.usage); }
        catch { throw new ApplicationError('asset_usage_restricted', 'Les droits déclarés ne couvrent pas cet usage.', 400); }
      }
    }
    const built = buildAssetDecisionSnapshot({ projectId, format: row.format, usage: row.usage,
      decision: noAssets ? 'none' : 'assets', items: noAssets ? [] : items, confirmedAt: this.clock.now().toISOString() });
    await this.repository.confirmOwned(projectId, actor.id, {
      usage: row.usage, versionIds: noAssets ? [] : items.map((item) => item.versionId),
      clearSelection: noAssets, digest: built.digest, snapshot: built.snapshot
    });
    await this.audit.record({ actorId: actor.id, action: 'project.assets_confirmed', targetType: 'project', targetId: projectId,
      metadata: { decision: noAssets ? 'none' : 'assets', versionIds: noAssets ? [] : items.map((item) => item.versionId), digest: built.digest } });
    return this.state(actor, projectId);
  }

  /** Prérequis serveur du brainstorming : la décision doit être confirmée et non périmée. */
  async assertConfirmed(actor: Actor, projectId: string): Promise<AssetDecisionState> {
    const state = await this.state(actor, projectId);
    if (!state.confirmed) {
      if (state.reason === 'not_confirmed') throw new ApplicationError('assets_required', 'Confirmez vos ressources (ou l’absence de ressources) avant de lancer le brainstorming.', 409);
      throw new ApplicationError('assets_confirmation_stale', 'La sélection de ressources a changé. Reconfirmez-la avant de lancer le brainstorming.', 409);
    }
    return state;
  }
}
