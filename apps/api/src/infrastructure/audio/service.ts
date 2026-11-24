import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { buffer } from 'node:stream/consumers';
import { prisma } from '@vululu/db';
import {
  audioLanguage,
  audioTranscribeApply,
  audioTranscribeRequest,
  audioTtsApply,
  audioTtsRequest,
  creativeSpec,
  isVideoOutput
} from '@vululu/contracts';
import { createMediaTempDir, inspectAsset, mediaRun, normalizeForAsr } from '@vululu/media';
import { assets, creativeStudio } from '../../application/container';
import { HttpError } from '../../errors';
import { proposeTx } from '../execution/broker';
import type { EngineOutcome } from '../execution/registry';
import { loadOperationResult, resolveOperationRows } from '../execution/operationResults';
import { createArtifactStorageRegistry } from '../storage/storageFactory';
import {
  AudioProviderRejected,
  AudioProviderUnavailable,
  selectTranscriptionProvider,
  selectTtsProvider
} from './providers';
import { GeminiTranscriptionProvider, GeminiTtsProvider } from './vertex';

/**
 * P09B — transcription et synthèse vocale réelles, derrière les garde-fous existants :
 * préparation sans dépense, autorisation humaine du coût, exécution worker, vérification
 * stricte de la sortie, puis application à une NOUVELLE révision. Aucun succès simulé.
 */
export const audioTranscribeTool = 'audio.transcribe@1';
export const audioTtsTool = 'audio.tts@1';
export const audioTools = [audioTranscribeTool, audioTtsTool] as const;

const sourceLimitBytes = 15 * 1024 * 1024;
const outputLimitBytes = 12 * 1024 * 1024;
const maxSourceSeconds = 180;
const fail = (code: string, message: string) => ({ failed: { code, message } });
/** Sortie payée (le fournisseur a répondu) mais inexploitable : coût incertain, jamais gratuit. */
const unverified = (code: string, message: string) => ({ uncertain: { code, message } });

type VersionRow = {
  id: string; assetId: string; name: string; mimeType: string; sha256: string; sizeBytes: number;
  storageProvider: string; storageKey: string; license: string;
};
let readerRegistry: ReturnType<typeof createArtifactStorageRegistry> | null = null;
const readers = () => (readerRegistry ??= createArtifactStorageRegistry());

async function requireAudioVersion(userId: string, contextId: string, versionId: string): Promise<VersionRow> {
  const version = await prisma.brandAssetVersion.findFirst({
    where: { id: versionId, state: 'ready', asset: { userId, contextId, kind: 'audio' } },
    select: { id: true, assetId: true, name: true, mimeType: true, sha256: true, sizeBytes: true,
      storageProvider: true, storageKey: true, license: true }
  });
  if (!version) throw new HttpError(404, 'audio_source_not_found', 'Piste audio introuvable dans cette marque.');
  if (!['audio/wav', 'audio/mpeg'].includes(version.mimeType))
    throw new HttpError(422, 'audio_source_unsupported', 'Format audio non pris en charge (WAV ou MP3).');
  if (version.license === 'unknown')
    throw new HttpError(422, 'audio_source_rights', 'Droits de la piste audio non confirmés : traitement refusé.');
  if (version.sizeBytes > sourceLimitBytes)
    throw new HttpError(413, 'audio_source_too_large', 'Piste audio au-delà de la limite interne.');
  return version;
}

async function readVersionBytes(version: VersionRow): Promise<Buffer> {
  const reader = readers()[version.storageProvider];
  if (!reader) throw new HttpError(503, 'storage_unavailable', 'Stockage de la ressource indisponible.');
  let bytes: Buffer;
  try { bytes = await buffer((await reader.get(version.storageKey)).stream); }
  catch { throw new HttpError(503, 'asset_unreadable', 'Ressource illisible dans le stockage.'); }
  if (createHash('sha256').update(bytes).digest('hex') !== version.sha256)
    throw new HttpError(409, 'asset_integrity', 'Le fichier audio ne correspond pas à sa version enregistrée.');
  if (bytes.length > sourceLimitBytes)
    throw new HttpError(413, 'audio_source_too_large', 'Piste audio au-delà de la limite interne.');
  return bytes;
}

/** Prépare une opération audio (PROPOSED) : la dépense n'est engagée qu'après autorisation humaine. */
export async function prepareAudioJob(
  userId: string,
  projectId: string,
  tool: typeof audioTranscribeTool | typeof audioTtsTool,
  raw: unknown
) {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId }, select: { contextId: true } });
  if (!project) throw new HttpError(404, 'project_not_found', 'Projet introuvable.');
  if (tool === audioTranscribeTool) {
    const request = audioTranscribeRequest.parse(raw);
    const selection = selectTranscriptionProvider();
    if ('code' in selection) throw new HttpError(503, selection.code, selection.message);
    await requireAudioVersion(userId, project.contextId, request.sourceVersionId);
    return prisma.$transaction((tx) => proposeTx(tx, userId, projectId,
      { key: request.requestId, tool, revision: request.revision }, { params: request }));
  }
  const request = audioTtsRequest.parse(raw);
  const selection = selectTtsProvider();
  if ('code' in selection) throw new HttpError(503, selection.code, selection.message);
  if (!selection.config.voices.includes(request.voice))
    throw new HttpError(422, 'audio_voice_unsupported', 'Voix absente du catalogue fournisseur.');
  return prisma.$transaction((tx) => proposeTx(tx, userId, projectId,
    { key: request.requestId, tool, revision: request.revision }, { params: request }));
}

export async function audioHistory(userId: string, projectId: string) {
  const rows = await prisma.executionOperation.findMany({
    where: { projectId, accountId: userId, tool: { in: [...audioTools] }, project: { userId } },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: { id: true, accountId: true, tool: true, state: true, costState: true, maxCents: true, reportedCents: true,
      digest: true, result: true, params: true, approvedBy: true, createdAt: true }
  });
  // Une transcription volumineuse est relue depuis son payload vérifié : jamais un marqueur tronqué.
  return { items: await resolveOperationRows(rows) };
}

/** Exécution worker : fournisseur réel, vérification stricte, stockage immuable. */
export async function runAudioJob(
  job: { id: string; accountId: string; projectId: string; tool: string; maxCents: number; params: unknown },
  signal: AbortSignal
): Promise<EngineOutcome> {
  const project = await prisma.project.findFirst({ where: { id: job.projectId, userId: job.accountId }, select: { contextId: true } });
  if (!project) return fail('project_not_found', 'Projet introuvable.');
  if (job.tool === audioTranscribeTool) return transcribe(job, project.contextId, signal);
  if (job.tool === audioTtsTool) return synthesize(job, project.contextId, signal);
  return fail('audio_tool_unknown', 'Outil audio inconnu.');
}

async function transcribe(
  job: { id: string; accountId: string; projectId: string; maxCents: number; params: unknown },
  contextId: string,
  signal: AbortSignal
): Promise<EngineOutcome> {
  const parsed = audioTranscribeRequest.safeParse(job.params);
  if (!parsed.success) return fail('audio_params_invalid', 'Paramètres de transcription invalides.');
  const request = parsed.data;
  let version: VersionRow, bytes: Buffer;
  try {
    version = await requireAudioVersion(job.accountId, contextId, request.sourceVersionId);
    bytes = await readVersionBytes(version);
  } catch (error) {
    if (error instanceof HttpError) return fail(error.code, error.message);
    throw error;
  }
  const selection = selectTranscriptionProvider();
  if ('code' in selection) return fail(selection.code, selection.message);
  const provider = new GeminiTranscriptionProvider(selection.config);
  const dir = await createMediaTempDir('vululu-asr-');
  try {
    const source = path.join(dir, 'source.' + (version.mimeType === 'audio/wav' ? 'wav' : 'mp3'));
    await fs.writeFile(source, bytes);
    const normalized = path.join(dir, 'input.wav');
    await normalizeForAsr({ source, out: normalized, maxSeconds: maxSourceSeconds, run: mediaRun });
    const wav = await fs.readFile(normalized);
    const duration = Number((await inspectAsset(wav, 'audio/wav')).metadata.duration);
    let result;
    try {
      result = await provider.transcribe({ bytes: wav, mimeType: 'audio/wav', language: request.language, durationSeconds: duration }, signal);
    } catch (error) {
      if (error instanceof AudioProviderRejected) return fail(error.code, error.message);
      if (error instanceof AudioProviderUnavailable) return fail(error.code, error.message);
      throw error;
    }
    return {
      // Montant annoncé par le fournisseur = estimation configurée, jamais rogné au plafond.
      costCents: result.costCents,
      costBasis: 'configured_estimate',
      result: {
        tool: audioTranscribeTool,
        sourceVersionId: request.sourceVersionId,
        sourceSha256: version.sha256,
        language: result.language,
        segments: result.segments,
        segmentCount: result.segments.length,
        sourceDurationSeconds: duration,
        provider: result.provider,
        model: result.model,
        providerRequestId: result.providerRequestId
      }
    };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function synthesize(
  job: { id: string; accountId: string; projectId: string; maxCents: number; params: unknown },
  contextId: string,
  signal: AbortSignal
): Promise<EngineOutcome> {
  const parsed = audioTtsRequest.safeParse(job.params);
  if (!parsed.success) return fail('audio_params_invalid', 'Paramètres de synthèse vocale invalides.');
  const request = parsed.data;
  const selection = selectTtsProvider();
  if ('code' in selection) return fail(selection.code, selection.message);
  const provider = new GeminiTtsProvider(selection.config);
  let result;
  try {
    result = await provider.synthesize({ text: request.text, language: request.language, voice: request.voice }, signal);
  } catch (error) {
    if (error instanceof AudioProviderRejected) return fail(error.code, error.message);
    if (error instanceof AudioProviderUnavailable) return fail(error.code, error.message);
    throw error;
  }
  // À partir d'ici le fournisseur a répondu : un rejet local ne peut pas rendre l'appel gratuit.
  if (!result.bytes.length || result.bytes.length > outputLimitBytes)
    return unverified('audio_tts_size', 'Audio de sortie au-delà de la limite.');
  let inspection;
  try { inspection = await inspectAsset(result.bytes, 'audio/wav'); }
  catch { return unverified('audio_tts_invalid', 'Audio du fournisseur invalide ou illisible.'); }
  const duration = Number(inspection.metadata.duration);
  if (!Number.isFinite(duration) || duration < 0.4 || duration > 60)
    return unverified('audio_tts_duration', 'Durée de la voix off hors limites (0,4 à 60 s).');
  const uploaded = await assets.upload({ id: job.accountId, role: 'user' }, contextId, {
    kind: 'audio',
    mimeType: 'audio/wav',
    name: 'Voix off · ' + request.text.slice(0, 60),
    license: 'internal',
    provenance: ['gemini-tts@1', result.model, 'voix ' + request.voice, request.language, 'requête ' + job.id].join(' · ')
  }, result.bytes);
  return {
    // Montant annoncé par le fournisseur = estimation configurée, jamais rogné au plafond.
    costCents: result.costCents,
    costBasis: 'configured_estimate',
    result: {
      tool: audioTtsTool,
      assetId: uploaded.assetId,
      assetVersionId: uploaded.id,
      sha256: inspection.sha256,
      mimeType: 'audio/wav',
      durationSeconds: duration,
      language: request.language,
      voice: request.voice,
      provider: result.provider,
      model: result.model,
      providerRequestId: result.providerRequestId
    }
  };
}

/** Applique un résultat audio réussi à une NOUVELLE révision de composition. */
export async function applyAudioResult(
  userId: string,
  projectId: string,
  operationId: string,
  raw: unknown
) {
  const operation = await prisma.executionOperation.findFirst({
    // RESOLVED : sortie payée déjà produite, coût constaté par un administrateur ; aucune relance payante.
    where: { id: operationId, projectId, accountId: userId, tool: { in: [...audioTools] }, state: { in: ['SUCCEEDED', 'RESOLVED'] }, project: { userId } },
    select: { tool: true, accountId: true, result: true }
  });
  if (!operation) throw new HttpError(404, 'audio_result_missing', 'Résultat audio introuvable ou non appliquable.');
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { userId: true } });
  if (project.userId !== userId) throw new HttpError(404, 'project_not_found', 'Projet introuvable.');
  const result = (await loadOperationResult<Record<string, unknown>>({
    accountId: operation.accountId,
    result: operation.result
  })) ?? null;
  if (operation.tool === audioTranscribeTool) {
    const apply = audioTranscribeApply.parse(raw);
    const row = await creativeStudio.get(userId, projectId, apply.expectedRevision);
    const spec = creativeSpec.parse(row.spec);
    if (!(spec.delivery && isVideoOutput(spec.delivery.kind)))
      throw new HttpError(422, 'audio_video_required', 'Les sous-titres nécessitent une composition vidéo.');
    const segments = Array.isArray(result?.segments)
      ? (result!.segments as Array<{ start?: unknown; end?: unknown; text?: unknown }>)
      : [];
    const cues = segments
      .map((segment) => ({
        start: Math.max(0, Number(segment.start)),
        end: Math.max(0, Number(segment.end)),
        text: String(segment.text ?? '').slice(0, 200)
      }))
      .filter((cue) => cue.text.length > 0 && Number.isFinite(cue.start) && Number.isFinite(cue.end) && cue.end > cue.start);
    if (!cues.length) throw new HttpError(422, 'audio_result_missing', 'Aucune transcription exploitable.');
    const language = audioLanguage.safeParse(result?.language);
    const existing = apply.mode === 'append' ? (spec.audio?.subtitles?.cues ?? []) : [];
    spec.audio = {
      tracks: spec.audio?.tracks ?? [],
      subtitles: {
        enabled: true,
        language: language.success ? language.data : 'fr-FR',
        cues: [...existing, ...cues].slice(0, 200),
        ...(spec.audio?.subtitles?.style ? { style: spec.audio.subtitles.style } : {})
      }
    };
    return creativeStudio.save(userId, projectId, apply.expectedRevision, spec);
  }
  const apply = audioTtsApply.parse(raw);
  const row = await creativeStudio.get(userId, projectId, apply.expectedRevision);
  const spec = creativeSpec.parse(row.spec);
  if (!(spec.delivery && isVideoOutput(spec.delivery.kind)))
    throw new HttpError(422, 'audio_video_required', 'La voix off nécessite une composition vidéo.');
  const versionId = typeof result?.assetVersionId === 'string' ? result.assetVersionId : null;
  if (!versionId) throw new HttpError(422, 'audio_result_missing', 'Voix off introuvable dans le résultat.');
  const tracks = spec.audio?.tracks ?? [];
  if (tracks.length >= 4) throw new HttpError(422, 'audio_track_limit', 'Quatre pistes audio au maximum.');
  spec.audio = {
    tracks: [...tracks, { id: randomUUID(), kind: 'voiceover', versionId, start: apply.start, gain: apply.gain, fadeIn: 0, fadeOut: 0 }],
    ...(spec.audio?.subtitles ? { subtitles: spec.audio.subtitles } : {})
  };
  return creativeStudio.save(userId, projectId, apply.expectedRevision, spec);
}
