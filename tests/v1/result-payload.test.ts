import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { ArtifactReadStream, ArtifactStoragePort, StoredObjectInfo } from '@vululu/application';
import {
  INLINE_RESULT_LIMIT,
  ResultPayloadError,
  isResultPayloadReference,
  persistSerializedResult,
  readOperationResult,
  resultPayloadKey,
  serializeOperationResult
} from '../../apps/api/src/infrastructure/execution/resultPayload';

/** Stockage durable en mémoire : même contrat que local/S3, aucun accès disque ni environnement. */
class MemoryStorage implements ArtifactStoragePort {
  readonly provider = 'memory';
  readonly objects = new Map<string, Buffer>();
  reads = 0;
  writes = 0;
  async putObject(input: { key: string; body: Buffer | Readable; contentType: string; sha256: string; sizeBytes?: number }): Promise<StoredObjectInfo> {
    const body = Buffer.isBuffer(input.body) ? input.body : await collect(input.body);
    this.writes += 1;
    this.objects.set(input.key, body);
    return { provider: this.provider, key: input.key, contentType: input.contentType, sizeBytes: body.length, sha256: createHash('sha256').update(body).digest('hex') };
  }
  async putFile(): Promise<StoredObjectInfo> { throw new Error('unused'); }
  async head(key: string): Promise<StoredObjectInfo | null> {
    const body = this.objects.get(key);
    if (!body) return null;
    return { provider: this.provider, key, contentType: 'application/json', sizeBytes: body.length, sha256: createHash('sha256').update(body).digest('hex') };
  }
  async get(key: string): Promise<ArtifactReadStream> {
    const body = this.objects.get(key);
    if (!body) throw new Error('memory_storage_missing');
    this.reads += 1;
    return { stream: Readable.from([body]), size: body.length, contentType: 'application/json' };
  }
  async verify(key: string, expectedSha256: string): Promise<boolean> {
    return (await this.head(key))?.sha256 === expectedSha256;
  }
  async getSignedReadUrl(): Promise<string | null> { return null; }
  async list(): Promise<StoredObjectInfo[]> { return [...this.objects.keys()].map((key) => ({ provider: this.provider, key, contentType: 'application/json', sizeBytes: this.objects.get(key)!.length, sha256: createHash('sha256').update(this.objects.get(key)!).digest('hex') })); }
}
async function collect(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks);
}
const text = (length: number) => 'x'.repeat(length);
/** JSON.stringify({ text }) pèse length + 11 caractères : la borne est exprimée en caractères. */
const sized = (jsonLength: number) => ({ text: text(jsonLength - 11) });

async function roundTrip(accountId: string, operationId: string, value: unknown) {
  const storage = new MemoryStorage();
  const serialized = serializeOperationResult({ accountId, operationId, value });
  const stored = await persistSerializedResult(storage, serialized);
  return { storage, serialized, stored, resolved: await readOperationResult(storage, { accountId, result: stored }) };
}

describe('résultats opérationnels sans perte', () => {
  it('garde 1 Kio en ligne, sans écrire dans le stockage', async () => {
    const value = sized(1024);
    const run = await roundTrip('account-a', 'op-1', value);
    expect(run.serialized.kind).toBe('inline');
    expect(run.storage.writes).toBe(0);
    expect(run.storage.reads).toBe(0);
    expect(run.resolved).toEqual(value);
  });

  it('garde exactement 32 Kio en ligne (borne inchangée)', async () => {
    const value = sized(INLINE_RESULT_LIMIT);
    expect(JSON.stringify(value).length).toBe(INLINE_RESULT_LIMIT);
    const run = await roundTrip('account-a', 'op-2', value);
    expect(run.serialized.kind).toBe('inline');
    expect(run.storage.writes).toBe(0);
    expect(run.resolved).toEqual(value);
  });

  it('bascule 32 Kio + 1 octet vers un payload immuable borné', async () => {
    const value = sized(INLINE_RESULT_LIMIT + 1);
    const run = await roundTrip('account-a', 'op-3', value);
    expect(run.serialized.kind).toBe('payload');
    expect(isResultPayloadReference(run.stored)).toBe(true);
    expect(JSON.stringify(run.stored).length).toBeLessThan(512);
    expect(run.storage.objects.size).toBe(1);
    expect(run.resolved).toEqual(value);
  });

  it('relit un résultat de 40 Kio à l’identique', async () => {
    const value = { report: sized(40 * 1024), items: [1, 2, 3], ok: true };
    const run = await roundTrip('account-a', 'op-4', value);
    expect(isResultPayloadReference(run.stored)).toBe(true);
    expect(run.resolved).toEqual(value);
    const reference = run.stored as { key: string; sha256: string; sizeBytes: number };
    const object = run.storage.objects.get(reference.key)!;
    expect(object.length).toBe(reference.sizeBytes);
    expect(createHash('sha256').update(object).digest('hex')).toBe(reference.sha256);
  });

  it('relit une transcription volumineuse sans marqueur tronqué', async () => {
    const value = {
      tool: 'audio.transcribe@1',
      language: 'fr-FR',
      segments: Array.from({ length: 200 }, (_, index) => ({
        start: index * 1.5,
        end: index * 1.5 + 1.4,
        text: 'segment ' + index + ' ' + text(160)
      }))
    };
    expect(JSON.stringify(value).length).toBeGreaterThan(INLINE_RESULT_LIMIT);
    const run = await roundTrip('account-a', 'op-5', value);
    expect(isResultPayloadReference(run.stored)).toBe(true);
    expect(JSON.stringify(run.stored)).not.toContain('"truncated"');
    expect((run.resolved as { segments: unknown[] }).segments).toHaveLength(200);
  });

  it('refuse un payload corrompu (empreinte) au lieu de renvoyer une valeur fausse', async () => {
    const value = sized(40 * 1024);
    const run = await roundTrip('account-a', 'op-6', value);
    const reference = run.stored as { key: string };
    const original = run.storage.objects.get(reference.key)!;
    run.storage.objects.set(reference.key, Buffer.concat([Buffer.from('X'), original.subarray(1)]));
    await expect(readOperationResult(run.storage, { accountId: 'account-a', result: run.stored })).rejects.toMatchObject({
      code: 'result_payload_corrupt'
    });
  });

  it('refuse un payload absent et une taille incohérente', async () => {
    const run = await roundTrip('account-a', 'op-7', sized(40 * 1024));
    const reference = run.stored as { key: string };
    const original = run.storage.objects.get(reference.key)!;
    run.storage.objects.set(reference.key, Buffer.concat([original, Buffer.from('x')]));
    await expect(readOperationResult(run.storage, { accountId: 'account-a', result: run.stored })).rejects.toMatchObject({
      code: 'result_payload_corrupt'
    });
    run.storage.objects.delete(reference.key);
    await expect(readOperationResult(run.storage, { accountId: 'account-a', result: run.stored })).rejects.toMatchObject({
      code: 'result_payload_missing'
    });
  });

  it('refuse une référence appartenant à un autre compte sans lire l’objet', async () => {
    const run = await roundTrip('account-a', 'op-8', sized(40 * 1024));
    const before = run.storage.reads;
    await expect(readOperationResult(run.storage, { accountId: 'account-b', result: run.stored })).rejects.toMatchObject({
      code: 'result_payload_foreign'
    });
    expect(run.storage.reads).toBe(before);
    const escaped = { ...(run.stored as object), key: resultPayloadKey('account-b', 'op-8') };
    await expect(readOperationResult(run.storage, { accountId: 'account-a', result: escaped })).rejects.toMatchObject({
      code: 'result_payload_foreign'
    });
  });

  it('refuse un stockage dont le fournisseur ne correspond pas à la référence', async () => {
    const run = await roundTrip('account-a', 'op-9', sized(40 * 1024));
    const other = new MemoryStorage();
    Object.defineProperty(other, 'provider', { value: 's3' });
    await expect(readOperationResult(other, { accountId: 'account-a', result: run.stored })).rejects.toMatchObject({
      code: 'result_payload_unavailable'
    });
  });

  it('laisse intact un ancien marqueur tronqué déjà persisté', async () => {
    const legacy = { truncated: true, sizeBytes: 40000 };
    const storage = new MemoryStorage();
    expect(await readOperationResult(storage, { accountId: 'account-a', result: legacy })).toEqual(legacy);
    expect(storage.reads).toBe(0);
  });

  it('refuse un identifiant qui sortirait de l’espace propriétaire', () => {
    expect(() => resultPayloadKey('..', 'op')).toThrow(ResultPayloadError);
    expect(() => resultPayloadKey('account-a', '../op')).toThrow(ResultPayloadError);
    expect(resultPayloadKey('account-a', 'op-1')).toBe('execution-results/account-a/op-1/v1.json');
  });
});
