import type { Prisma } from '@prisma/client';
import { HttpError } from '../../errors';
import { createArtifactStorage, createArtifactStorageRegistry } from '../storage/storageFactory';
import {
  ResultPayloadError,
  isResultPayloadReference,
  persistSerializedResult,
  readOperationResult,
  serializeOperationResult
} from './resultPayload';

/**
 * P12-02 — liaison entre le broker/les routes et le stockage durable.
 *
 * Les résultats d'outils volumineux sont écrits hors base, puis relus de façon **transparente**
 * pour les consommateurs existants : les routes continuent de renvoyer la valeur d'origine.
 * Une lecture impossible échoue explicitement (409) au lieu de renvoyer un résultat partiel.
 */

const STATUS: Record<string, number> = {
  result_payload_key_invalid: 409,
  result_payload_not_serializable: 409,
  result_payload_too_large: 409,
  result_payload_write_failed: 409,
  result_payload_unavailable: 409,
  result_payload_foreign: 409,
  result_payload_missing: 409,
  result_payload_corrupt: 409
};

function asHttpError(error: unknown): never {
  if (error instanceof ResultPayloadError) throw new HttpError(STATUS[error.code] ?? 409, error.code, error.message);
  throw error;
}

/**
 * Persiste la sortie d'un outil AVANT le règlement : la valeur est rendue durable (ou l'appel
 * échoue explicitement) avant que l'argent ne soit comptabilisé.
 */
export async function storeOperationResult(input: {
  accountId: string;
  operationId: string;
  value: unknown;
}): Promise<Prisma.InputJsonValue | undefined> {
  if (input.value === undefined) return undefined;
  try {
    const serialized = serializeOperationResult(input);
    return (await persistSerializedResult(createArtifactStorage(), serialized)) as Prisma.InputJsonValue;
  } catch (error) {
    return asHttpError(error);
  }
}

/** Relit une sortie d'outil : payload vérifié (propriété, taille, empreinte) ou valeur en ligne. */
export async function loadOperationResult<T = unknown>(row: {
  accountId: string;
  result: unknown;
}): Promise<T | null> {
  const reference = row.result;
  if (!isResultPayloadReference(reference)) return (reference ?? null) as T | null;
  const storage = createArtifactStorageRegistry()[reference.provider];
  if (!storage)
    throw new HttpError(409, 'result_payload_unavailable', 'Stockage du résultat indisponible sur ce serveur.');
  try {
    return (await readOperationResult(storage, row)) as T;
  } catch (error) {
    return asHttpError(error);
  }
}

/**
 * Résolution de liste : un payload illisible ne casse pas l'historique, mais il n'est jamais
 * présenté comme un résultat vide ordinaire — `resultUnavailable` le rend explicite.
 */
export async function resolveOperationRows<T extends { accountId: string; result: unknown }>(rows: T[]) {
  return Promise.all(
    rows.map(async (row) => {
      try {
        return { ...row, result: await loadOperationResult({ accountId: row.accountId, result: row.result }) };
      } catch {
        return { ...row, result: null, resultUnavailable: true as const };
      }
    })
  );
}
