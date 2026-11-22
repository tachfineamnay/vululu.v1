import { createHash } from 'node:crypto';
import { buffer } from 'node:stream/consumers';
import { prisma } from '@vululu/db';
import { creativeSpec, imageEditApply, imageEditRequest, type ImageEditRequest } from '@vululu/contracts';
import { inspectAsset } from '@vululu/media';
import { assets, creativeStudio } from '../../application/container';
import { HttpError } from '../../errors';
import { proposeTx } from '../execution/broker';
import type { EngineOutcome } from '../execution/registry';
import { loadOperationResult, resolveOperationRows } from '../execution/operationResults';
import { createArtifactStorageRegistry } from '../storage/storageFactory';
import {
  ImageProviderRejected, ImageProviderUncertain, ImageProviderUnavailable, imageProviderCapabilities,
  selectImageProvider, type ImageEditProvider
} from './providers';

export const imageEditTool = 'media.image.edit@1';
const sourceLimitBytes = 4 * 1024 * 1024;
const maskLimitBytes = 2 * 1024 * 1024;
const outputLimitBytes = 12 * 1024 * 1024;
const allowedMime = ['image/png', 'image/jpeg', 'image/webp'];
const fail = (code: string, message: string) => ({ failed: { code, message } });
/** Sortie payée (le fournisseur a répondu) mais inexploitable : coût incertain, jamais gratuit. */
const unverified = (code: string, message: string) => ({ uncertain: { code, message } });
let readerRegistry: ReturnType<typeof createArtifactStorageRegistry> | null = null;
const readers = () => (readerRegistry ??= createArtifactStorageRegistry());

type VersionRow = {
  id: string; assetId: string; name: string; mimeType: string; sha256: string; sizeBytes: number;
  storageProvider: string; storageKey: string; license: string; asset: { kind: string };
};

async function requireImageVersion(userId: string, contextId: string, versionId: string, role: 'source' | 'mask'): Promise<VersionRow> {
  const version = await prisma.brandAssetVersion.findFirst({
    where: { id: versionId, state: 'ready', asset: { userId, contextId } },
    select: { id: true, assetId: true, name: true, mimeType: true, sha256: true, sizeBytes: true,
      storageProvider: true, storageKey: true, license: true, asset: { select: { kind: true } } }
  });
  if (!version) throw new HttpError(404, role === 'source' ? 'image_source_not_found' : 'image_mask_not_found',
    role === 'source' ? 'Image source introuvable dans cette marque.' : 'Masque introuvable dans cette marque.');
  if (version.asset.kind !== 'image' && version.asset.kind !== 'logo')
    throw new HttpError(422, 'image_source_unsupported', 'Seules les images et logos peuvent être édités.');
  if (!allowedMime.includes(version.mimeType))
    throw new HttpError(422, 'image_source_unsupported', 'Format d’image non pris en charge.');
  if (version.license === 'unknown')
    throw new HttpError(422, 'image_source_rights', 'Droits de la ressource non confirmés : édition refusée.');
  const limit = role === 'source' ? sourceLimitBytes : maskLimitBytes;
  if (version.sizeBytes > limit) throw new HttpError(413, role === 'source' ? 'image_source_too_large' : 'image_mask_too_large', 'Fichier au-delà de la limite de l’éditeur.');
  return version as VersionRow;
}

async function readVersionBytes(userId: string, version: VersionRow, limit: number): Promise<Buffer> {
  const reader = readers()[version.storageProvider];
  if (!reader) throw new HttpError(503, 'storage_unavailable', 'Stockage de la ressource indisponible.');
  let bytes: Buffer;
  try { bytes = await buffer((await reader.get(version.storageKey)).stream); }
  catch { throw new HttpError(503, 'asset_unreadable', 'Ressource illisible dans le stockage.'); }
  if (createHash('sha256').update(bytes).digest('hex') !== version.sha256)
    throw new HttpError(409, 'asset_integrity', 'Le fichier source ne correspond pas à sa version enregistrée.');
  if (bytes.length > limit) throw new HttpError(413, 'image_source_too_large', 'Fichier au-delà de la limite de l’éditeur.');
  return bytes;
}

/** Prépare une opération d'édition (PROPOSED) : la dépense n'est engagée qu'après autorisation humaine. */
export async function prepareImageEdit(userId: string, projectId: string, raw: unknown) {
  const request = imageEditRequest.parse(raw);
  if (request.rightsConfirmed !== true) throw new HttpError(422, 'image_rights_unconfirmed', 'Confirmez les droits d’utilisation de l’image avant l’édition.');
  const project = await prisma.project.findFirst({ where: { id: projectId, userId }, select: { contextId: true } });
  if (!project) throw new HttpError(404, 'project_not_found', 'Projet introuvable.');
  if (request.sourceVersionId) await requireImageVersion(userId, project.contextId, request.sourceVersionId, 'source');
  if (request.maskVersionId) await requireImageVersion(userId, project.contextId, request.maskVersionId, 'mask');
  const selection = selectImageProvider();
  if ('code' in selection) throw new HttpError(503, selection.code, selection.message);
  return prisma.$transaction((tx) => proposeTx(tx, userId, projectId,
    { key: request.requestId, tool: imageEditTool, revision: 1 }, { params: request }));
}

export async function imageEditHistory(userId: string, projectId: string) {
  const rows = await prisma.executionOperation.findMany({
    where: { projectId, accountId: userId, tool: imageEditTool, project: { userId } },
    orderBy: { createdAt: 'desc' }, take: 30,
    select: { id: true, accountId: true, state: true, costState: true, maxCents: true, reportedCents: true, params: true,
      result: true, digest: true, createdAt: true, approvedBy: true }
  });
  // Résolution transparente du résultat (payload vérifié si la valeur dépasse la borne inline).
  return { items: await resolveOperationRows(rows) };
}

/** Exécution worker : fournisseur réel, vérification stricte, stockage immuable. Aucune sortie fabriquée. */
export async function runImageEdit(
  job: { id: string; accountId: string; projectId: string; maxCents: number; params: unknown },
  signal: AbortSignal
): Promise<EngineOutcome> {
  const parsed = imageEditRequest.safeParse(job.params);
  if (!parsed.success) return fail('image_edit_params_invalid', 'Paramètres d’édition invalides.');
  const request: ImageEditRequest = parsed.data;
  if (request.rightsConfirmed !== true) return fail('image_rights_unconfirmed', 'Droits d’utilisation non confirmés.');
  const project = await prisma.project.findFirst({ where: { id: job.projectId, userId: job.accountId }, select: { contextId: true } });
  if (!project) return fail('project_not_found', 'Projet introuvable.');
  let sourceVersion: VersionRow | undefined;
  let source: { bytes: Buffer; mimeType: string } | undefined;
  let mask: { bytes: Buffer; mimeType: string } | undefined;
  try {
    if (request.sourceVersionId) {
      sourceVersion = await requireImageVersion(job.accountId, project.contextId, request.sourceVersionId, 'source');
      source = { bytes: await readVersionBytes(job.accountId, sourceVersion, sourceLimitBytes), mimeType: sourceVersion.mimeType };
    }
    if (request.maskVersionId) {
      const maskVersion = await requireImageVersion(job.accountId, project.contextId, request.maskVersionId, 'mask');
      mask = { bytes: await readVersionBytes(job.accountId, maskVersion, maskLimitBytes), mimeType: maskVersion.mimeType };
    }
  } catch (error) {
    if (error instanceof HttpError) return fail(error.code, error.message);
    throw error;
  }
  const selection = selectImageProvider();
  if ('code' in selection) return fail(selection.code, selection.message);
  let result: Awaited<ReturnType<ImageEditProvider['run']>>;
  try {
    result = await selection.provider.run({ request, source, mask }, signal);
  } catch (error) {
    if (error instanceof ImageProviderRejected) return fail(error.code, error.message);
    if (error instanceof ImageProviderUnavailable) return fail(error.code, error.message);
    // Issue incertaine après envoi : le broker l'enregistre, aucune relance automatique.
    if (error instanceof ImageProviderUncertain) throw error;
    throw error;
  }
  // À partir d'ici le fournisseur a répondu : un rejet local ne peut pas rendre l'appel gratuit.
  if (!result.bytes.length || result.bytes.length > outputLimitBytes) return unverified('image_output_too_large', 'Image de sortie au-delà de la limite.');
  let inspection;
  try { inspection = await inspectAsset(result.bytes, result.mimeType); }
  catch { return unverified('image_output_invalid', 'Image du fournisseur invalide ou illisible.'); }
  const width = Number(inspection.metadata.width);
  const height = Number(inspection.metadata.height);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 64 || height < 64 || width > 4096 || height > 4096)
    return unverified('image_output_invalid', 'Dimensions de sortie hors limites.');
  const uploaded = await assets.upload({ id: job.accountId, role: 'user' }, project.contextId, {
    kind: 'image', mimeType: result.mimeType,
    name: (request.operation === 'generate' ? 'Image générée' : 'Image éditée') + ' · ' + request.prompt.slice(0, 80),
    license: sourceVersion?.license === 'commercial' ? 'commercial' : 'internal',
    provenance: [result.provider, result.model, request.operation, 'source ' + (request.sourceVersionId ?? 'aucune'),
      'requête ' + job.id, result.providerRequestId ? 'fournisseur ' + result.providerRequestId : null].filter(Boolean).join(' · ')
  }, result.bytes);
  // Montant annoncé par le fournisseur = estimation configurée : jamais rogné au plafond, le
  // broker refuse un dépassement au lieu de le masquer, et l'état reste ESTIMATED.
  return { costCents: result.costCents, costBasis: 'configured_estimate', result: {
    assetId: uploaded.assetId, assetVersionId: uploaded.id, sha256: inspection.sha256, mimeType: result.mimeType,
    width, height, provider: result.provider, model: result.model, operation: request.operation,
    aspectRatio: request.aspectRatio, preserveSubject: request.preserveSubject,
    sourceVersionId: request.sourceVersionId, maskVersionId: request.maskVersionId,
    prompt: request.prompt, warnings: result.warnings, providerRequestId: result.providerRequestId,
    estimatedCents: result.costCents
  } };
}

/** Applique une édition réussie à une composition éditable : nouvelle révision, jamais d'écrasement. */
export async function applyImageEdit(userId: string, projectId: string, operationId: string, raw: unknown) {
  const apply = imageEditApply.parse(raw);
  const operation = await prisma.executionOperation.findFirst({
    // RESOLVED : sortie payée déjà produite, coût constaté par un administrateur ; aucune relance payante.
    where: { id: operationId, projectId, accountId: userId, tool: imageEditTool, state: { in: ['SUCCEEDED', 'RESOLVED'] }, project: { userId } },
    select: { accountId: true, result: true }
  });
  const result = operation
    ? await loadOperationResult<{ assetVersionId?: unknown; mimeType?: unknown }>({
        accountId: operation.accountId,
        result: operation.result
      })
    : null;
  if (!result || typeof result.assetVersionId !== 'string' || !allowedMime.includes(String(result.mimeType)))
    throw new HttpError(404, 'image_edit_result_missing', 'Résultat d’édition introuvable ou non appliquable.');
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { contextId: true, userId: true } });
  if (project.userId !== userId) throw new HttpError(404, 'project_not_found', 'Projet introuvable.');
  const version = await prisma.brandAssetVersion.findFirst({
    where: { id: result.assetVersionId, state: 'ready', asset: { userId, contextId: project.contextId } },
    select: { id: true }
  });
  if (!version) throw new HttpError(404, 'image_edit_result_missing', 'Version éditée introuvable.');
  const row = await creativeStudio.get(userId, projectId, apply.expectedRevision);
  const spec = creativeSpec.parse(row.spec);
  const scene = apply.sceneKey ? spec.scenes.find((item) => item.key === apply.sceneKey) : spec.scenes[0];
  if (!scene) throw new HttpError(404, 'creative_scene_missing', 'Scène de composition introuvable.');
  const hero = scene.layers.findIndex((layer) => layer.type === 'image' && layer.x === 0 && layer.y === 0 && layer.w === 1);
  const height = scene.clip ? 0.65 : 1;
  if (hero >= 0) {
    const layer = scene.layers[hero];
    if (layer.type === 'image') { layer.versionId = version.id; layer.fit = apply.fit; layer.opacity = 1; layer.h = height; }
  } else {
    scene.layers.unshift({ type: 'image', versionId: version.id, x: 0, y: 0, w: 1, h: height, fit: apply.fit, gravity: 'centre', opacity: 1 });
  }
  return creativeStudio.save(userId, projectId, apply.expectedRevision, spec);
}

export function imageEditingCapabilities() {
  return { tool: imageEditTool, providers: imageProviderCapabilities() };
}
