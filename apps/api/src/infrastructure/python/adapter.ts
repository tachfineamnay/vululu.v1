import { createHash } from 'node:crypto';
import { buffer } from 'node:stream/consumers';
import { prisma } from '@vululu/db';
import { evaluateAssetDecision } from '@vululu/application';
import { assets } from '../../application/container';
import { readAssetDecisionRow } from '../prisma/assetDecisionRepository';
import { createArtifactStorageRegistry } from '../storage/storageFactory';
import { callPythonTool, pythonToolsConfig, PythonToolsError } from './client';

/** Exécution bornée d'une capacité Python sur une ressource confirmée. Aucun effet payant, stockage via l'AssetStore existant. */
export type PythonToolJob = { id: string; accountId: string; projectId: string; tool: string; maxCents: number; params: unknown };
export type PythonToolParams = { versionId: string; outputs?: Array<'cutout' | 'mask'>; maxDimension?: number };
export type PythonToolFailure = { failed: { code: string; message: string } };
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const maxSourceBytes = 16 * 1024 * 1024;
const maxOutputBytes = 8 * 1024 * 1024;
const fail = (code: string, message: string): PythonToolFailure => ({ failed: { code, message } });
let readerRegistry: ReturnType<typeof createArtifactStorageRegistry> | null = null;
function readers() {
  if (!readerRegistry) readerRegistry = createArtifactStorageRegistry();
  return readerRegistry;
}

function parseParams(tool: string, raw: unknown): PythonToolParams | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.versionId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value.versionId)) return null;
  if (tool === 'image.analyze@1') return { versionId: value.versionId };
  const outputs = value.outputs === undefined ? ['cutout', 'mask'] : value.outputs;
  if (!Array.isArray(outputs) || outputs.length < 1 || outputs.length > 2) return null;
  if (!outputs.every((item) => item === 'cutout' || item === 'mask')) return null;
  const maxDimension = value.maxDimension === undefined ? 2048 : value.maxDimension;
  if (typeof maxDimension !== 'number' || !Number.isInteger(maxDimension) || maxDimension < 256 || maxDimension > 4096) return null;
  return { versionId: value.versionId, outputs: outputs as Array<'cutout' | 'mask'>, maxDimension };
}

/** Convertit les recommandations d'outils Python en exécution réelle, ou en échec déterministe explicite. */
export async function runPythonCapability(job: PythonToolJob): Promise<{ costCents: number; result?: unknown } | PythonToolFailure> {
  if (!pythonToolsConfig()) return fail('python_tools_unavailable', 'Boîte à outils Python non configurée sur ce serveur.');
  if (job.tool !== 'image.analyze@1' && job.tool !== 'image.segment@1') return fail('python_tool_unknown', 'Outil Python inconnu.');
  const params = parseParams(job.tool, job.params);
  if (!params) return fail('python_tool_params_invalid', 'Paramètres d’outil Python invalides.');
  const decisionRow = await readAssetDecisionRow(prisma, job.projectId, job.accountId);
  if (!decisionRow) return fail('project_not_found', 'Projet introuvable.');
  const decision = evaluateAssetDecision(decisionRow);
  if (!decision.confirmed) return fail('assets_required', 'Confirmez vos ressources avant d’exécuter un outil Python.');
  const confirmed = decision.snapshot?.items.find((item) => item.versionId === params.versionId);
  if (!confirmed) return fail('asset_not_confirmed', 'Cette version ne fait pas partie de la sélection confirmée.');
  const version = await prisma.brandAssetVersion.findFirst({
    where: { id: params.versionId, state: 'ready', asset: { userId: job.accountId, contextId: decisionRow.contextId } },
    select: { assetId: true, name: true, mimeType: true, sha256: true, sizeBytes: true, storageProvider: true,
      storageKey: true, license: true, metadata: true, asset: { select: { kind: true } } }
  });
  if (!version) return fail('asset_version_unavailable', 'Version de ressource introuvable ou non prête.');
  if (version.asset.kind !== 'image' && version.asset.kind !== 'logo') return fail('asset_type_unsupported', 'Seules les images et les logos peuvent être traités.');
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(version.mimeType)) return fail('asset_type_unsupported', 'Format d’image non pris en charge par la boîte à outils Python.');
  if (version.license === 'unknown') return fail('asset_license_unknown', 'Droits de la ressource non confirmés : traitement refusé.');
  if (version.sizeBytes > maxSourceBytes) return fail('asset_too_large', 'Ressource au-delà de la limite interne du service Python.');
  const reader = readers()[version.storageProvider];
  if (!reader) return fail('storage_unavailable', 'Stockage de la ressource indisponible.');
  let bytes: Buffer;
  try { bytes = await buffer((await reader.get(version.storageKey)).stream); }
  catch { return fail('asset_unreadable', 'Ressource illisible dans le stockage.'); }
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== version.sha256) return fail('asset_integrity', 'Le fichier source ne correspond pas à sa version enregistrée.');
  const source = { assetVersionId: params.versionId, sha256: version.sha256, mimeType: version.mimeType, imageBase64: bytes.toString('base64') };

  try {
    if (job.tool === 'image.analyze@1') {
      const response = await callPythonTool('image.analyze@1', { requestId: job.id, source });
      const data = (response as { data?: { analysis?: unknown }; version?: unknown } | null)?.data?.analysis;
      if (!data) return fail('python_tools_invalid_response', 'Analyse Python illisible.');
      return { costCents: 0, result: { capability: 'image.analyze@1', sourceVersionId: params.versionId,
        sourceSha256: version.sha256, analysis: data, pythonServiceVersion: (response as { version?: unknown }).version ?? null } };
    }
    const response = await callPythonTool('image.segment@1', { requestId: job.id, source,
      outputs: params.outputs ?? ['cutout', 'mask'], maxDimension: params.maxDimension ?? 2048 });
    const outputs = (response as { data?: { outputs?: Array<{ kind?: unknown; base64?: unknown; sha256?: unknown; width?: unknown; height?: unknown; sizeBytes?: unknown }> } } | null)?.data?.outputs;
    if (!Array.isArray(outputs) || outputs.length < 1 || outputs.length > 2) return fail('python_tools_invalid_response', 'Sorties Python illisibles.');
    const stored: Array<Record<string, unknown>> = [];
    for (const output of outputs) {
      if (output.kind !== 'cutout' && output.kind !== 'mask') return fail('python_tools_invalid_response', 'Type de sortie Python inconnu.');
      if (typeof output.base64 !== 'string' || typeof output.sha256 !== 'string') return fail('python_tools_invalid_response', 'Sortie Python incomplète.');
      if (typeof output.width !== 'number' || typeof output.height !== 'number' || typeof output.sizeBytes !== 'number') return fail('python_tools_invalid_response', 'Dimensions de sortie Python illisibles.');
      const data = Buffer.from(output.base64, 'base64');
      if (!data.length || data.length !== output.sizeBytes || data.length > maxOutputBytes) return fail('python_tools_output_size_mismatch', 'Taille de sortie Python inattendue.');
      if (createHash('sha256').update(data).digest('hex') !== output.sha256) return fail('python_tools_output_checksum_mismatch', 'Empreinte de sortie Python incohérente.');
      if (!data.subarray(0, 8).equals(PNG_SIGNATURE)) return fail('python_tools_output_not_png', 'La sortie Python n’est pas un PNG vérifiable.');
      const uploaded = await assets.upload({ id: job.accountId, role: 'user' }, decisionRow.contextId, {
        kind: 'image', mimeType: 'image/png',
        name: (output.kind === 'cutout' ? 'Détourage' : 'Masque') + ' · ' + version.name.slice(0, 110),
        license: version.license === 'commercial' ? 'commercial' : 'internal',
        provenance: 'python-tools · image.segment@1 · source ' + params.versionId + ' · ' + output.sha256
      }, data);
      stored.push({ kind: output.kind, assetId: uploaded.assetId, assetVersionId: uploaded.id, sha256: output.sha256,
        width: output.width, height: output.height, sizeBytes: output.sizeBytes });
    }
    return { costCents: 0, result: { capability: 'image.segment@1', sourceVersionId: params.versionId,
      sourceSha256: version.sha256, outputs: stored } };
  } catch (error) {
    if (error instanceof PythonToolsError && !error.retryable) return fail(error.code, error.message);
    // Retryable/inconnu : jamais de succès simulé ; le broker enregistre une issue incertaine.
    throw error;
  }
}
