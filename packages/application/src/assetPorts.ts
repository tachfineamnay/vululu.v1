import type { AssetKind, BrandAssetVersion, PublicationUsage } from '@vululu/domain';

export type AssetInspection = { mimeType: string; extension: string; sizeBytes: number; sha256: string; metadata: Record<string, number | string> };
export interface AssetInspector { inspect(bytes: Buffer, mimeType: string): Promise<AssetInspection> }
export type StoredAssetVersion = BrandAssetVersion & {
  userId: string; contextId: string; storageProvider: string; storageKey: string;
  state: string; metadata: Record<string, number | string>;
};
export type AssetRecord = { id: string; contextId: string; kind: AssetKind; versions: StoredAssetVersion[] };
export interface AssetRepository {
  listOwned(contextId: string, userId: string): Promise<AssetRecord[]>;
  findOwned(assetId: string, userId: string): Promise<AssetRecord | null>;
  reserve(input: Omit<StoredAssetVersion, 'version'>): Promise<StoredAssetVersion>;
  finalize(versionId: string, userId: string, state: 'ready' | 'failed'): Promise<void>;
  getSelection(projectId: string, userId: string): Promise<{ usage: PublicationUsage; versionIds: string[] }>;
  selectOwned(projectId: string, userId: string, usage: PublicationUsage, versionIds: string[]): Promise<void>;
}
