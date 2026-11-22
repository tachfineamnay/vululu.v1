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
  return {
    __resultPayload: 1,
    provider: stored.provider,
    key: stored.key,
    sha256: stored.sha256,
    sizeBytes: stored.sizeBytes,
    contentType: CONTENT_TYPE
  } satisfies ResultPayloadReference;
}

async function collect(stream: Readable | NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer | string | Uint8Array>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string | Uint8Array));
  }
  return Buffer.concat(chunks);
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
  if (!reference.key.startsWith(PREFIX + '/' + row.accountId + '/') || reference.key.includes('..'))
    return fail('result_payload_foreign', 'Référence de résultat hors du compte de l’opération.');
  if (reference.sizeBytes > MAX_RESULT_PAYLOAD_BYTES)
    return fail('result_payload_too_large', 'Résultat stocké au-delà de la limite lisible.');
  const info = await storage.head(reference.key).catch(() => null);
  if (!info) return fail('result_payload_missing', 'Résultat stocké introuvable.');
  if (info.sizeBytes !== reference.sizeBytes)
    return fail('result_payload_corrupt', 'Taille du résultat stocké incohérente.');
  const object = await storage.get(reference.key).catch(() => null);
  if (!object) return fail('result_payload_missing', 'Résultat stocké illisible.');
  const bytes = await collect(object.stream);
  if (bytes.length !== reference.sizeBytes)
    return fail('result_payload_corrupt', 'Taille du résultat lu incohérente.');
  if (createHash('sha256').update(bytes).digest('hex') !== reference.sha256)
    return fail('result_payload_corrupt', 'Empreinte du résultat incohérente.');
  try {
    return JSON.parse(bytes.toString('utf8')) as unknown;
  } catch {
    return fail('result_payload_corrupt', 'Résultat stocké illisible.');
  }
}
