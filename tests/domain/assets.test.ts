import { describe, expect, it } from 'vitest';
import { createBrandAssetVersion, assertAssetUsage, MAX_ASSET_BYTES, type BrandAssetVersion } from '../../packages/domain/src/assets';
import { DomainError } from '../../packages/domain/src/errors';

const input: BrandAssetVersion = { id: 'version-1', assetId: 'asset-1', version: 1, name: ' Logo fictif ', kind: 'logo', mimeType: 'image/png', sizeBytes: 150, sha256: 'a'.repeat(64), license: 'commercial', provenance: ' Création fictive autorisée ', createdAt: '2026-11-04T12:00:00.000Z' };
describe('Actifs de marque : versions et droits explicites', () => {
  it('normalise les metadonnees sans perdre checksum, identite ou version', () => {
    const version = createBrandAssetVersion(input);
    expect(version).toEqual({ ...input, name: 'Logo fictif', provenance: 'Création fictive autorisée' });
    expect(Object.isFrozen(version)).toBe(true);
  });
  it.each(['../logo', 'C:\\secret', 'logo\r\nheader', 'x', 'x'.repeat(161)])('refuse un nom dangereux ou hors limite', (name) => {
    expect(() => createBrandAssetVersion({ ...input, name })).toThrow(DomainError);
  });
  it.each([0, -1, MAX_ASSET_BYTES + 1, 1.5])('borne la taille du fichier', (sizeBytes) => {
    expect(() => createBrandAssetVersion({ ...input, sizeBytes })).toThrow(DomainError);
  });
  it('refuse les formats non declares et les checksums invalides', () => {
    expect(() => createBrandAssetVersion({ ...input, mimeType: 'text/html' })).toThrow(DomainError);
    expect(() => createBrandAssetVersion({ ...input, sha256: '../file' })).toThrow(DomainError);
    expect(() => createBrandAssetVersion({ ...input, version: 0 })).toThrow(DomainError);
    expect(() => createBrandAssetVersion({ ...input, provenance: '' })).toThrow(DomainError);
  });
  it('accepte les droits commerciaux pour une intention sponsorisee', () => { expect(() => assertAssetUsage('commercial', 'sponsored')).not.toThrow(); });
  it('accepte les droits internes uniquement pour un usage organique', () => {
    expect(() => assertAssetUsage('internal', 'organic')).not.toThrow();
    expect(() => assertAssetUsage('internal', 'sponsored')).toThrow(DomainError);
  });
  it.each(['organic', 'sponsored'] as const)('refuse des droits inconnus pour %s', (usage) => { expect(() => assertAssetUsage('unknown', usage)).toThrow(DomainError); });
});
