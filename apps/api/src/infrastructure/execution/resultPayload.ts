import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import type { ArtifactStoragePort } from '@vululu/application';

/**
 * P12-02 — persistance sans perte des résultats d'outils.
 *
 * La colonne `ExecutionOperation.result` reste bornée à 32 Kio de JSON. Au-delà, la valeur est
 * écrite dans le stockage durable existant (`ArtifactStoragePort`, local ou S3) sous une clé
 * immuable et propriétaire, et la base ne conserve qu'une **référence bornée** : version de
 * schéma, fournisseur, clé, empreinte SHA-256, taille. Aucun résultat n'est remplacé
 * silencieusement par un marqueur tronqué : soit il tient en ligne, soit il est stocké, soit
 * l'écriture échoue explicitement.
 *
 * Ce module ne dépend d'aucun environnement : le stockage est injecté, ce qui le rend testable
 * sans base ni fournisseur.
 */

/** Borne inchangée du JSON opérationnel stocké en base (caractères, comme avant P12-02). */
export const INLINE_RESULT_LIMIT = 32768;
/** Garde-fou mémoire/stockage : un résultat d'outil n'a aucune raison de dépasser 16 Mio. */
export const MAX_RESULT_PAYLOAD_BYTES = 16 * 1024 * 1024;

const PREFIX = 'execution-results';
const CONTENT_TYPE = 'application/json';
const SHA256 = /^[a-f0-9]{64}$/;
const ACCOUNT = /^[A-Za-z0-9_-]{1,128}$/;
const OPERATION = /^[A-Za-z0-9-]{1,64}$/;

/** Référence bornée conservée dans `result` quand la valeur réelle vit dans le stockage. */
export type ResultPayloadReference = {
  __resultPayload: 1;
  provider: string;
  key: string;
  sha256: string;
  sizeBytes: number;
  contentType: string;
};

/** Échec de persistance ou de lecture d'un résultat : jamais confondu avec un résultat vide. */
export class ResultPayloadError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ResultPayloadError';
  }
}

const fail = (code: string, message: string): never => {
  throw new ResultPayloadError(code, message);
};

export function isResultPayloadReference(value: unknown): value is ResultPayloadReference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    row.__resultPayload === 1 &&
    typeof row.provider === 'string' &&
    row.provider.length > 0 &&
    typeof row.key === 'string' &&
    typeof row.sha256 === 'string' &&
    SHA256.test(row.sha256) &&
    typeof row.sizeBytes === 'number' &&
    Number.isSafeInteger(row.sizeBytes) &&
    row.sizeBytes > 0 &&
    typeof row.contentType === 'string'
  );
}

/**
 * Clé propriétaire : `execution-results/<compte>/<opération>/v1.json`.
 * L'identifiant de compte est le préfixe de propriété vérifié à chaque lecture, et l'identifiant
 * d'opération rend la clé unique donc l'écriture immuable en pratique.
 */
export function resultPayloadKey(accountId: string, operationId: string): string {
  if (!ACCOUNT.test(accountId)) return fail('result_payload_key_invalid', 'Identifiant de compte invalide.');
  if (!OPERATION.test(operationId)) return fail('result_payload_key_invalid', 'Identifiant d’opération invalide.');
  return PREFIX + '/' + accountId + '/' + operationId + '/v1.json';
}

export type SerializedResult =
  | { kind: 'inline'; json: string; value: unknown }
  | { kind: 'payload'; json: string; bytes: Buffer; sha256: string; key: string };

/** Sérialise une sortie d'outil : en ligne si elle tient dans la borne, sinon payload à stocker. */
export function serializeOperationResult(input: {
  accountId: string;
  operationId: string;
  value: unknown;
}): SerializedResult {
  const json = JSON.stringify(input.value ?? null);
  if (typeof json !== 'string') return fail('result_payload_not_serializable', 'Résultat non sérialisable.');
  if (json.length <= INLINE_RESULT_LIMIT) return { kind: 'inline', json, value: JSON.parse(json) };
  const bytes = Buffer.from(json, 'utf8');
  if (bytes.length > MAX_RESULT_PAYLOAD_BYTES)
    return fail('result_payload_too_large', 'Résultat au-delà de la limite de stockage.');
  return {
    kind: 'payload',
    json,
    bytes,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    key: resultPayloadKey(input.accountId, input.operationId)
  };
}

/** Écrit le payload (une fois par opération) et renvoie la valeur bornée à persister en base. */
export async function persistSerializedResult(
  storage: ArtifactStoragePort,
  serialized: SerializedResult
): Promise<unknown> {
  if (serialized.kind === 'inline') return serialized.value;
  if (serialized.bytes.length > MAX_RESULT_PAYLOAD_BYTES)
    return fail('result_payload_too_large', 'Résultat au-delà de la limite de stockage.');
  const stored = await storage
    .putObject({
      key: serialized.key,
      body: serialized.bytes,
      contentType: CONTENT_TYPE,
      sha256: serialized.sha256,
      sizeBytes: serialized.bytes.length
    })
    .catch((error: unknown) =>
      fail(
        'result_payload_write_failed',
        'Écriture du résultat échouée : ' + (error instanceof Error ? error.message : 'cause inconnue')
      )
    );
  if (stored.sha256 !== serialized.sha256)
    return fail('result_payload_write_failed', 'Empreinte du résultat stocké incohérente.');
  if (stored.sizeBytes !== serialized.bytes.length)
    return fail('result_payload_write_failed', 'Taille du résultat stocké incohérente.');
  return {
    __resultPayload: 1,
    provider: stored.provider,
    key: stored.key,
    sha256: stored.sha256,
    sizeBytes: stored.sizeBytes,
    contentType: CONTENT_TYPE
  } satisfies ResultPayloadReference;
}

type CollectedPayload = {
  bytes: Buffer;
  sha256: string;
};

const noop = () => {};

/** Arrête et détruit un flux de lecture sans exposer d'événement `error` non géré au teardown. */
function destroyStreamSafely(stream: Readable | NodeJS.ReadableStream): void {
  if (typeof stream.on === 'function') {
    stream.on('error', noop);
  }
  if (typeof stream.pause === 'function') {
    try {
      stream.pause();
    } catch {
      // Le flux peut déjà être fermé ou en état terminal.
    }
  }
  const destroyable = stream as { destroy?: () => unknown; destroyed?: boolean };
  if (typeof destroyable.destroy === 'function' && !destroyable.destroyed) {
    try {
      destroyable.destroy();
    } catch {
      // Ne jamais masquer l'erreur métier d'origine si la destruction échoue.
    }
  }
}

function toChunkBuffer(chunk: unknown, remainingBytes: number): Buffer | null {
  if (Buffer.isBuffer(chunk)) {
    return chunk.byteLength > remainingBytes ? null : chunk;
  }
  if (chunk instanceof Uint8Array) {
    return chunk.byteLength > remainingBytes
      ? null
      : Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  }
  if (typeof chunk === 'string') {
    const byteLength = Buffer.byteLength(chunk, 'utf8');
    return byteLength > remainingBytes ? null : Buffer.from(chunk, 'utf8');
  }
  return fail('result_payload_corrupt', 'Flux du résultat illisible.');
}

/**
 * Lit un flux de résultat en bornant strictement la mémoire à `maxBytes` au fil des morceaux
 * et en calculant l'empreinte SHA-256 incrémentalement. Tout dépassement détruit le flux
 * immédiatement avant d'accumuler le morceau fautif.
 */
async function collect(
  stream: Readable | NodeJS.ReadableStream,
  maxBytes: number = MAX_RESULT_PAYLOAD_BYTES
): Promise<CollectedPayload> {
  const readable = stream as { errored?: unknown; destroyed?: boolean; readableEnded?: boolean };
  if (readable.errored) {
    destroyStreamSafely(stream);
    throw readable.errored;
  }
  if (readable.readableEnded) {
    return { bytes: Buffer.alloc(0), sha256: createHash('sha256').digest('hex') };
  }
  if (readable.destroyed) {
    destroyStreamSafely(stream);
    return fail('result_payload_corrupt', 'Flux du résultat interrompu avant la fin.');
  }

  return new Promise<CollectedPayload>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const hash = createHash('sha256');
    let totalBytes = 0;
    let settled = false;

    const cleanup = () => {
      stream.removeListener('data', onData);
      stream.removeListener('end', onEnd);
      stream.removeListener('error', onError);
      stream.removeListener('close', onClose);
    };

    const abort = (error: unknown) => {
      if (settled) return;
      settled = true;
      chunks.length = 0;
      cleanup();
      destroyStreamSafely(stream);
      reject(error);
    };

    const onData = (chunk: unknown) => {
      if (settled) return;
      try {
        const buffer = toChunkBuffer(chunk, maxBytes - totalBytes);
        if (buffer === null) {
          abort(new ResultPayloadError('result_payload_too_large', 'Résultat stocké au-delà de la limite lisible.'));
          return;
        }
        if (buffer.byteLength === 0) return;
        totalBytes += buffer.byteLength;
        chunks.push(buffer);
        hash.update(buffer);
      } catch (error) {
        abort(error);
      }
    };

    const onEnd = () => {
      if (settled) return;
      settled = true;
      cleanup();
      const bytes =
        chunks.length === 0 ? Buffer.alloc(0) : chunks.length === 1 ? chunks[0] : Buffer.concat(chunks, totalBytes);
      chunks.length = 0;
      resolve({ bytes, sha256: hash.digest('hex') });
    };

    const onError = (error: unknown) => {
      abort(error);
    };

    const onClose = () => {
      if (settled) return;
      const streamError = (stream as { errored?: unknown }).errored;
      if (streamError) {
        abort(streamError);
        return;
      }
      if ((stream as { readableEnded?: boolean }).readableEnded) {
        onEnd();
        return;
      }
      abort(new ResultPayloadError('result_payload_corrupt', 'Flux du résultat interrompu avant la fin.'));
    };

    stream.on('error', onError);
    stream.on('end', onEnd);
    stream.on('close', onClose);
    stream.on('data', onData);

    if (!settled && typeof stream.resume === 'function') {
      stream.resume();
    }
  });
}

/**
 * Relit une sortie d'outil en vérifiant propriété, fournisseur, taille, empreinte et lisibilité.
 * Une référence étrangère, absente ou corrompue échoue explicitement : jamais de valeur vide
 * silencieuse à la place d'un résultat exigé.
 */
export async function readOperationResult(
  storage: ArtifactStoragePort,
  row: { accountId: string; result: unknown }
): Promise<unknown> {
  const reference = row.result;
  if (!isResultPayloadReference(reference)) return reference ?? null;
  if (reference.provider !== storage.provider)
    return fail('result_payload_unavailable', 'Stockage du résultat indisponible sur ce serveur.');
  if (
    !ACCOUNT.test(row.accountId) ||
    !reference.key.startsWith(PREFIX + '/' + row.accountId + '/') ||
    reference.key.includes('..') ||
    reference.key.includes('\\')
  )
    return fail('result_payload_foreign', 'Référence de résultat hors du compte de l’opération.');
  if (reference.sizeBytes > MAX_RESULT_PAYLOAD_BYTES)
    return fail('result_payload_too_large', 'Résultat stocké au-delà de la limite lisible.');
  const info = await storage.head(reference.key).catch(() => null);
  if (!info) return fail('result_payload_missing', 'Résultat stocké introuvable.');
  if (info.sizeBytes > MAX_RESULT_PAYLOAD_BYTES)
    return fail('result_payload_too_large', 'Résultat stocké au-delà de la limite lisible.');
  if (info.sizeBytes !== reference.sizeBytes)
    return fail('result_payload_corrupt', 'Taille du résultat stocké incohérente.');
  const object = await storage.get(reference.key).catch(() => null);
  if (!object) return fail('result_payload_missing', 'Résultat stocké illisible.');
  if (object.size > MAX_RESULT_PAYLOAD_BYTES) {
    destroyStreamSafely(object.stream);
    return fail('result_payload_too_large', 'Résultat stocké au-delà de la limite lisible.');
  }
  const { bytes, sha256 } = await collect(object.stream, MAX_RESULT_PAYLOAD_BYTES);
  if (bytes.length !== reference.sizeBytes)
    return fail('result_payload_corrupt', 'Taille du résultat lu incohérente.');
  if (sha256 !== reference.sha256)
    return fail('result_payload_corrupt', 'Empreinte du résultat incohérente.');
  try {
    return JSON.parse(bytes.toString('utf8')) as unknown;
  } catch {
    return fail('result_payload_corrupt', 'Résultat stocké illisible.');
  }
}
