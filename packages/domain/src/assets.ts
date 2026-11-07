import { DomainError } from './errors';
import { assertEntityId } from './identifiers';
import { assertIsoTimestamp } from './timestamp';
import { deepFreeze } from './immutability';

export const MAX_ASSET_BYTES = 32 * 1024 * 1024;
export type AssetKind = 'logo' | 'image' | 'video' | 'audio' | 'document' | 'font';
export type AssetLicense = 'internal' | 'commercial' | 'unknown';
export type PublicationUsage = 'organic' | 'sponsored';
export interface BrandAssetVersion {
  readonly id: string;
  readonly assetId: string;
  readonly version: number;
  readonly name: string;
  readonly kind: AssetKind;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly license: AssetLicense;
  readonly provenance: string;
  readonly createdAt: string;
}
const formats: Record<AssetKind, readonly string[]> = {
  logo: ['image/png', 'image/jpeg', 'image/webp'], image: ['image/png', 'image/jpeg', 'image/webp'],
  video: ['video/mp4'], audio: ['audio/wav', 'audio/mpeg'], document: ['application/pdf', 'text/plain'], font: ['font/ttf', 'font/otf']
};
export function createBrandAssetVersion(input: BrandAssetVersion): BrandAssetVersion {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const provenance = typeof input.provenance === 'string' ? input.provenance.trim() : '';
  // eslint-disable-next-line no-control-regex -- Validation explicite des caractères de contrôle interdits dans un nom.
  if (name.length < 2 || name.length > 160 || /[\\/\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(name)) {
    throw new DomainError('invalid_input', 'Nom de fichier invalide.');
  }
  if (!formats[input.kind]?.includes(input.mimeType) || !['internal', 'commercial', 'unknown'].includes(input.license)) {
    throw new DomainError('invalid_input', 'Format ou droits non pris en charge.');
  }
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > MAX_ASSET_BYTES || !Number.isInteger(input.version) || input.version < 1 || !/^[a-f0-9]{64}$/.test(input.sha256)) {
    throw new DomainError('invalid_input', 'Taille, version ou checksum invalide.');
  }
  if (provenance.length < 3 || provenance.length > 1000) throw new DomainError('invalid_input', 'Une provenance de 3 à 1000 caractères est requise.');
  return deepFreeze({ ...input, id: assertEntityId(input.id), assetId: assertEntityId(input.assetId, 'assetId'), name, provenance, createdAt: assertIsoTimestamp(input.createdAt, 'createdAt') });
}
export function assertAssetUsage(license: AssetLicense, usage: PublicationUsage): void {
  if (!['organic', 'sponsored'].includes(usage) || (license !== 'commercial' && !(license === 'internal' && usage === 'organic'))) {
    throw new DomainError('invalid_input', 'Droits insuffisants pour cet usage ; confirmez une licence compatible dans une nouvelle version.');
  }
}
