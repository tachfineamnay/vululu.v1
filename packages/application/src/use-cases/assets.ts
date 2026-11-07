import { createBrandAssetVersion, assertAssetUsage, type AssetKind, type AssetLicense, type PublicationUsage } from '@vululu/domain';
import type { Actor, ArtifactStoragePort, AuditPort, Clock, ContextRepository, IdGenerator, ProjectRepository } from '../ports';
import type { AssetInspector, AssetRecord, AssetRepository, StoredAssetVersion } from '../assetPorts';
import { ApplicationError, assertOwned } from '../errors';

export type AssetUploadInput = { assetId?: string; name: string; kind: AssetKind; mimeType: string; license: AssetLicense; provenance: string };
function publicVersion(row: StoredAssetVersion) {
  const { userId: _user, contextId: _context, storageKey: _key, storageProvider: _provider, state: _state, ...value } = row;
  return value;
}
function publicAsset(row: AssetRecord) { return { ...row, versions: row.versions.filter((v) => v.state === 'ready').map(publicVersion) }; }

/** Même accès applicatif pour Web et MCP ; aucun SDK fournisseur dans ce cas d’usage. */
export class AssetUseCases {
  constructor(private readonly repository: AssetRepository, private readonly contexts: ContextRepository,
    private readonly projects: ProjectRepository, private readonly inspector: AssetInspector,
    private readonly storage: ArtifactStoragePort, private readonly readers: Record<string, ArtifactStoragePort>,
    private readonly audit: AuditPort, private readonly clock: Clock, private readonly ids: IdGenerator) {}

  async list(actor: Actor, contextId: string) {
    assertOwned(await this.contexts.findOwned(contextId, actor.id), 'context_not_found', 'Contexte introuvable.');
    return (await this.repository.listOwned(contextId, actor.id)).map(publicAsset).filter((a) => a.versions.length);
  }
  async get(actor: Actor, assetId: string) {
    return publicAsset(assertOwned(await this.repository.findOwned(assetId, actor.id), 'asset_not_found', 'Actif introuvable.'));
  }
  async upload(actor: Actor, contextId: string, input: AssetUploadInput, bytes: Buffer) {
    assertOwned(await this.contexts.findOwned(contextId, actor.id), 'context_not_found', 'Contexte introuvable.');
    if (input.assetId) {
      const asset = assertOwned(await this.repository.findOwned(input.assetId, actor.id), 'asset_not_found', 'Actif introuvable.');
      if (asset.contextId !== contextId || asset.kind !== input.kind) throw new ApplicationError('asset_context_mismatch', 'Contexte ou type incompatible.', 400);
    }
    const id = this.ids.next(); const assetId = input.assetId ?? this.ids.next();
    const draft = createBrandAssetVersion({ ...input, id, assetId, sizeBytes: bytes.length, sha256: '0'.repeat(64), version: 1, createdAt: this.clock.now().toISOString() });
    let inspected;
    try { inspected = await this.inspector.inspect(bytes, input.mimeType); }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'asset_inspector_unavailable') throw new ApplicationError('asset_inspector_unavailable', 'Outil d’inspection indisponible sur le serveur.', 503);
      throw new ApplicationError('asset_invalid_file', 'Fichier invalide ou format non pris en charge.', 400);
    }
    const row = await this.repository.reserve({ ...draft, sha256: inspected.sha256, userId: actor.id, contextId, storageProvider: this.storage.provider,
      storageKey: `library/${assetId}/${id}.${inspected.extension}`, state: 'staged', metadata: inspected.metadata });
    try {
      await this.storage.putObject({ key: row.storageKey, body: bytes, contentType: row.mimeType, sizeBytes: row.sizeBytes, sha256: row.sha256 });
      if (!await this.storage.verify(row.storageKey, row.sha256)) throw new Error('verification_failed');
      await this.repository.finalize(row.id, actor.id, 'ready');
    } catch {
      await this.repository.finalize(row.id, actor.id, 'failed');
      throw new ApplicationError('asset_storage_failed', 'Le fichier n’a pas pu être conservé et vérifié.', 503);
    }
    await this.audit.record({ actorId: actor.id, action: 'asset.version_created', targetType: 'asset', targetId: assetId, metadata: { versionId: row.id, version: row.version, sha256: row.sha256, sizeBytes: row.sizeBytes } });
    return publicVersion(row);
  }
  async content(actor: Actor, assetId: string, versionId: string) {
    const asset = assertOwned(await this.repository.findOwned(assetId, actor.id), 'asset_not_found', 'Actif introuvable.');
    const version = assertOwned(asset.versions.find((v) => v.id === versionId && v.state === 'ready') ?? null, 'asset_version_not_found', 'Version introuvable.');
    const storage = this.readers[version.storageProvider];
    if (!storage) throw new ApplicationError('asset_storage_unavailable', 'Stockage indisponible.', 503);
    try {
      if (!await storage.verify(version.storageKey, version.sha256)) throw new Error('invalid_checksum');
    } catch { throw new ApplicationError('asset_storage_unavailable', 'Fichier indisponible ou altéré.', 503); }
    return { version: publicVersion(version), openRead: async (range?: { start: number; end?: number }) => (await storage.get(version.storageKey, range)).stream };
  }
  async selection(actor: Actor, projectId: string) {
    assertOwned(await this.projects.findOwned(projectId, actor.id), 'project_not_found', 'Projet introuvable.');
    return this.repository.getSelection(projectId, actor.id);
  }
  async select(actor: Actor, projectId: string, usage: PublicationUsage, versionIds: string[]) {
    const project = assertOwned(await this.projects.findOwned(projectId, actor.id), 'project_not_found', 'Projet introuvable.');
    if (!['organic', 'sponsored'].includes(usage) || versionIds.length > 20 || new Set(versionIds).size !== versionIds.length) throw new ApplicationError('invalid_selection', 'Sélection invalide.', 400);
    const candidates = (await this.repository.listOwned(project.contextId, actor.id)).flatMap((a) => a.versions).filter((v) => v.state === 'ready' && versionIds.includes(v.id));
    if (candidates.length !== versionIds.length) throw new ApplicationError('asset_version_not_found', 'Actif introuvable dans ce contexte.', 404);
    if (new Set(candidates.map((v) => v.assetId)).size !== candidates.length) throw new ApplicationError('invalid_selection', 'Choisissez une seule version par actif.', 400);
    for (const candidate of candidates) assertAssetUsage(candidate.license, usage);
    await this.repository.selectOwned(projectId, actor.id, usage, versionIds);
    await this.audit.record({ actorId: actor.id, action: 'project.assets_selected', targetType: 'project', targetId: projectId, metadata: { versionIds, usage } });
    return this.selection(actor, projectId);
  }
}
