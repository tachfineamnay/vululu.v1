import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { ArtifactReadStream, ArtifactStoragePort, StoredObjectInfo } from '@vululu/application';
import { LocalFilesystemArtifactStorage } from '../../apps/api/src/infrastructure/storage/localArtifactStorage';
import {
  INLINE_RESULT_LIMIT,
  MAX_RESULT_PAYLOAD_BYTES,
  ResultPayloadError,
  type ResultPayloadReference,
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

function chunkedReadable(buffer: Buffer, chunkSize: number): Readable {
  let offset = 0;
  return new Readable({
    read() {
      if (offset >= buffer.length) {
        this.push(null);
        return;
      }
      const next = buffer.subarray(offset, Math.min(offset + chunkSize, buffer.length));
      offset += next.length;
      this.push(next);
    }
  });
}

function wrapStorage(
  base: ArtifactStoragePort,
  overrides: Partial<Pick<ArtifactStoragePort, 'head' | 'get'>>
): ArtifactStoragePort {
  return {
    provider: base.provider,
    putObject: (input) => base.putObject(input),
    putFile: (input) => base.putFile(input),
    head: overrides.head ?? ((key) => base.head(key)),
    get: overrides.get ?? ((key, range) => base.get(key, range)),
    verify: (key, sha256) => base.verify(key, sha256),
    getSignedReadUrl: (key, exp) => base.getSignedReadUrl(key, exp),
    list: (prefix) => base.list(prefix)
  };
}

describe('flux bornés et garde-fous mémoire des résultats', () => {
  it('rejette immédiatement un morceau unique dépassant MAX_RESULT_PAYLOAD_BYTES et détruit le flux', async () => {
    const run = await roundTrip('account-a', 'op-oversized-chunk', sized(40 * 1024));
    const reference = run.stored as ResultPayloadReference;
    let pulled = 0;
    const stream = new Readable({
      read() {
        pulled += 1;
        setImmediate(() => {
          if (this.destroyed) return;
          if (pulled === 1) {
            this.push(Buffer.alloc(MAX_RESULT_PAYLOAD_BYTES + 1, 0x61));
            return;
          }
          this.push(Buffer.alloc(1024, 0x62));
        });
      }
    });
    const dishonest = wrapStorage(run.storage, {
      get: async () => ({ stream, size: reference.sizeBytes, contentType: 'application/json' })
    });

    await expect(readOperationResult(dishonest, { accountId: 'account-a', result: reference })).rejects.toMatchObject({
      name: 'ResultPayloadError',
      code: 'result_payload_too_large'
    });
    expect(stream.destroyed).toBe(true);
    expect(pulled).toBe(1);
  });

  it('rejette un flux incrémental dépassant la borne même avec des métadonnées malhonnêtes plus petites', async () => {
    const run = await roundTrip('account-a', 'op-dishonest-stream', sized(40 * 1024));
    const reference = run.stored as ResultPayloadReference;
    const chunkSize = 1024 * 1024;
    let pulled = 0;
    const stream = new Readable({
      read() {
        pulled += 1;
        // Un flux non borné produirait 100 Mio ; la lecture doit s'interrompre dès 16 Mio dépassés.
        if (pulled > 100) {
          this.push(null);
          return;
        }
        this.push(Buffer.alloc(chunkSize, 0x61));
      },
      destroy(_err, cb) {
        // Vérifie que même une erreur au teardown ne provoque aucun crash non géré.
        queueMicrotask(() => cb(new Error('teardown_error_ignored')));
      }
    });

    const dishonest = wrapStorage(run.storage, {
      head: async () => ({
        provider: run.storage.provider,
        key: reference.key,
        contentType: 'application/json',
        sizeBytes: reference.sizeBytes,
        sha256: reference.sha256
      }),
      get: async () => ({ stream, size: reference.sizeBytes, contentType: 'application/json' })
    });

    await expect(readOperationResult(dishonest, { accountId: 'account-a', result: reference })).rejects.toMatchObject({
      name: 'ResultPayloadError',
      code: 'result_payload_too_large'
    });
    expect(stream.destroyed).toBe(true);
    // 16 morceaux acceptés + 1 morceau qui franchit la borne (+ au plus 1 prélecture interne Readable).
    expect(pulled).toBeLessThanOrEqual(18);
    expect(pulled).toBeLessThan(100);
    // Laisse passer un tour d'event loop pour vérifier l'absence d'événement `error` non géré.
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  it('compte les octets UTF-8 réels pour les morceaux de texte multi-octets', async () => {
    const run = await roundTrip('account-a', 'op-utf8-chunk', sized(40 * 1024));
    const reference = run.stored as ResultPayloadReference;
    // 'é' occupe 1 unité UTF-16 mais 2 octets UTF-8 : 9M caractères = 18M octets > 16 Mio.
    const multiByte = 'é'.repeat(9 * 1024 * 1024);
    expect(multiByte.length).toBeLessThan(MAX_RESULT_PAYLOAD_BYTES);
    expect(Buffer.byteLength(multiByte, 'utf8')).toBeGreaterThan(MAX_RESULT_PAYLOAD_BYTES);
    const stream = new Readable({
      encoding: 'utf8',
      read() {
        this.push(multiByte);
        this.push(null);
      }
    });
    const dishonest = wrapStorage(run.storage, {
      get: async () => ({ stream, size: reference.sizeBytes, contentType: 'application/json' })
    });

    await expect(readOperationResult(dishonest, { accountId: 'account-a', result: reference })).rejects.toMatchObject({
      name: 'ResultPayloadError',
      code: 'result_payload_too_large'
    });
    expect(stream.destroyed).toBe(true);
  });

  it('rejette les métadonnées de taille incohérentes ou hors borne (référence, head, get et flux)', async () => {
    const run = await roundTrip('account-a', 'op-dishonest-meta', sized(40 * 1024));
    const reference = run.stored as ResultPayloadReference;

    // 1. Référence déclarant > MAX_RESULT_PAYLOAD_BYTES : refus avant tout appel stockage.
    const oversizedRef: ResultPayloadReference = { ...reference, sizeBytes: MAX_RESULT_PAYLOAD_BYTES + 1 };
    const readsBefore = run.storage.reads;
    await expect(readOperationResult(run.storage, { accountId: 'account-a', result: oversizedRef })).rejects.toMatchObject({
      code: 'result_payload_too_large'
    });
    expect(run.storage.reads).toBe(readsBefore);

    // 2. head() annonce > MAX_RESULT_PAYLOAD_BYTES : refus sans appeler get().
    let getCalled = false;
    const oversizedHead = wrapStorage(run.storage, {
      head: async () => ({
        provider: run.storage.provider,
        key: reference.key,
        contentType: 'application/json',
        sizeBytes: MAX_RESULT_PAYLOAD_BYTES + 1,
        sha256: reference.sha256
      }),
      get: async (key) => {
        getCalled = true;
        return run.storage.get(key);
      }
    });
    await expect(readOperationResult(oversizedHead, { accountId: 'account-a', result: reference })).rejects.toMatchObject({
      code: 'result_payload_too_large'
    });
    expect(getCalled).toBe(false);

    // 3. head() ment, mais get() déclare size > MAX_RESULT_PAYLOAD_BYTES : détruit le flux sans lire.
    let pulledOnOversizedGet = 0;
    const unusedStream = new Readable({
      read() {
        pulledOnOversizedGet += 1;
        this.push(Buffer.alloc(1024, 0x61));
      }
    });
    const oversizedGet = wrapStorage(run.storage, {
      get: async () => ({ stream: unusedStream, size: MAX_RESULT_PAYLOAD_BYTES + 1, contentType: 'application/json' })
    });
    await expect(readOperationResult(oversizedGet, { accountId: 'account-a', result: reference })).rejects.toMatchObject({
      code: 'result_payload_too_large'
    });
    expect(unusedStream.destroyed).toBe(true);
    expect(pulledOnOversizedGet).toBe(0);

    // 4. Métadonnées mentent sur un flux légèrement plus grand ou tronqué (sous 16 Mio) : exact-size -> corrupt.
    const original = run.storage.objects.get(reference.key)!;
    const slightlyLarger = wrapStorage(run.storage, {
      get: async () => ({
        stream: chunkedReadable(Buffer.concat([original, Buffer.from('!')]), 8192),
        size: reference.sizeBytes,
        contentType: 'application/json'
      })
    });
    await expect(readOperationResult(slightlyLarger, { accountId: 'account-a', result: reference })).rejects.toMatchObject({
      code: 'result_payload_corrupt'
    });

    const truncated = wrapStorage(run.storage, {
      get: async () => ({
        stream: chunkedReadable(original.subarray(0, original.length - 1), 8192),
        size: reference.sizeBytes,
        contentType: 'application/json'
      })
    });
    await expect(readOperationResult(truncated, { accountId: 'account-a', result: reference })).rejects.toMatchObject({
      code: 'result_payload_corrupt'
    });
  });

  it('détecte une empreinte SHA-256 corrompue sur un flux multi-morceaux de taille exacte', async () => {
    const run = await roundTrip('account-a', 'op-corrupt-chunks', sized(128 * 1024));
    const reference = run.stored as ResultPayloadReference;
    const tampered = Buffer.from(run.storage.objects.get(reference.key)!);
    // Altère 1 octet au milieu tout en gardant la taille strictement identique.
    const mid = Math.floor(tampered.length / 2);
    tampered[mid] = tampered[mid] === 0x78 ? 0x79 : 0x78;
    const storage = wrapStorage(run.storage, {
      get: async () => ({
        stream: chunkedReadable(tampered, 16 * 1024),
        size: reference.sizeBytes,
        contentType: 'application/json'
      })
    });

    await expect(readOperationResult(storage, { accountId: 'account-a', result: reference })).rejects.toMatchObject({
      name: 'ResultPayloadError',
      code: 'result_payload_corrupt'
    });
  });

  it('propage proprement les erreurs de flux et refuse les fermetures prématurées', async () => {
    const run = await roundTrip('account-a', 'op-stream-errors', sized(64 * 1024));
    const reference = run.stored as ResultPayloadReference;

    // 1. Erreur émise en cours de lecture après quelques morceaux valides.
    let sent = 0;
    const failingStream = new Readable({
      read() {
        sent += 1;
        if (sent === 1) {
          this.push(Buffer.alloc(4096, 0x61));
          return;
        }
        this.destroy(new Error('storage_stream_io_error'));
      }
    });
    const failingStorage = wrapStorage(run.storage, {
      get: async () => ({ stream: failingStream, size: reference.sizeBytes, contentType: 'application/json' })
    });
    await expect(readOperationResult(failingStorage, { accountId: 'account-a', result: reference })).rejects.toThrow(
      'storage_stream_io_error'
    );
    expect(failingStream.destroyed).toBe(true);

    // 2. Flux déjà détruit avec erreur avant le début de la lecture.
    const preErroredStream = new Readable({ read() {} });
    preErroredStream.destroy(new Error('pre_existing_stream_failure'));
    const preErroredStorage = wrapStorage(run.storage, {
      get: async () => ({ stream: preErroredStream, size: reference.sizeBytes, contentType: 'application/json' })
    });
    await expect(readOperationResult(preErroredStorage, { accountId: 'account-a', result: reference })).rejects.toThrow(
      'pre_existing_stream_failure'
    );
    await new Promise((resolve) => setTimeout(resolve, 10));

    // 3. Flux détruit sans erreur ni événement `end` : ne doit jamais bloquer indéfiniment.
    const abortedStream = new Readable({
      read() {
        this.push(Buffer.alloc(4096, 0x61));
        this.destroy();
      }
    });
    const abortedStorage = wrapStorage(run.storage, {
      get: async () => ({ stream: abortedStream, size: reference.sizeBytes, contentType: 'application/json' })
    });
    await expect(readOperationResult(abortedStorage, { accountId: 'account-a', result: reference })).rejects.toMatchObject({
      name: 'ResultPayloadError',
      code: 'result_payload_corrupt'
    });
  });

  it('accepte les gros payloads valides jusqu’à la borne exacte MAX_RESULT_PAYLOAD_BYTES et rejette +1 octet', async () => {
    // 1. Payload multi-morceaux Uint8Array de 2 Mio.
    const medium = sized(2 * 1024 * 1024);
    const mediumStorage = new MemoryStorage();
    const mediumSerialized = serializeOperationResult({ accountId: 'account-a', operationId: 'op-large-2m', value: medium });
    const mediumStored = (await persistSerializedResult(mediumStorage, mediumSerialized)) as ResultPayloadReference;
    const mediumRaw = mediumStorage.objects.get(mediumStored.key)!;
    const uint8Stream = new Readable({
      read() {
        let offset = 0;
        while (offset < mediumRaw.length) {
          const end = Math.min(offset + 64 * 1024, mediumRaw.length);
          this.push(new Uint8Array(mediumRaw.buffer, mediumRaw.byteOffset + offset, end - offset));
          offset = end;
        }
        this.push(null);
      }
    });
    const chunkedMediumStorage = wrapStorage(mediumStorage, {
      get: async () => ({ stream: uint8Stream, size: mediumStored.sizeBytes, contentType: 'application/json' })
    });
    expect(await readOperationResult(chunkedMediumStorage, { accountId: 'account-a', result: mediumStored })).toEqual(medium);

    // 2. Payload exactement égal à MAX_RESULT_PAYLOAD_BYTES (16 Mio) lu par morceaux de 256 Kio.
    const exactMax = sized(MAX_RESULT_PAYLOAD_BYTES);
    const maxStorage = new MemoryStorage();
    const maxSerialized = serializeOperationResult({ accountId: 'account-a', operationId: 'op-exact-max', value: exactMax });
    expect(maxSerialized.kind).toBe('payload');
    if (maxSerialized.kind !== 'payload') throw new Error('expected payload');
    expect(maxSerialized.bytes.length).toBe(MAX_RESULT_PAYLOAD_BYTES);
    const maxStored = (await persistSerializedResult(maxStorage, maxSerialized)) as ResultPayloadReference;
    const maxRaw = maxStorage.objects.get(maxStored.key)!;
    const chunkedMaxStorage = wrapStorage(maxStorage, {
      get: async () => ({
        stream: chunkedReadable(maxRaw, 256 * 1024),
        size: maxStored.sizeBytes,
        contentType: 'application/json'
      })
    });
    expect(await readOperationResult(chunkedMaxStorage, { accountId: 'account-a', result: maxStored })).toEqual(exactMax);

    // 3. +1 octet au-delà de MAX_RESULT_PAYLOAD_BYTES refusé à l'écriture et à la lecture.
    expect(() =>
      serializeOperationResult({ accountId: 'account-a', operationId: 'op-over-max', value: sized(MAX_RESULT_PAYLOAD_BYTES + 1) })
    ).toThrow(ResultPayloadError);

    const overByOneStream = chunkedReadable(Buffer.concat([maxRaw, Buffer.from('x')]), 256 * 1024);
    const dishonestMaxStorage = wrapStorage(maxStorage, {
      get: async () => ({ stream: overByOneStream, size: maxStored.sizeBytes, contentType: 'application/json' })
    });
    await expect(readOperationResult(dishonestMaxStorage, { accountId: 'account-a', result: maxStored })).rejects.toMatchObject({
      name: 'ResultPayloadError',
      code: 'result_payload_too_large'
    });
    expect(overByOneStream.destroyed).toBe(true);
  });

  it('préserve l’isolation et détruit un vrai flux disque LocalFilesystemArtifactStorage dépassant la borne', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vululu-result-payload-'));
    try {
      const local = new LocalFilesystemArtifactStorage(dir);
      const value = sized(512 * 1024);
      const serialized = serializeOperationResult({ accountId: 'account-a', operationId: 'op-disk-1', value });
      const stored = (await persistSerializedResult(local, serialized)) as ResultPayloadReference;

      expect(await readOperationResult(local, { accountId: 'account-a', result: stored })).toEqual(value);

      // Un autre compte est toujours refusé sans lecture.
      await expect(readOperationResult(local, { accountId: 'account-b', result: stored })).rejects.toMatchObject({
        code: 'result_payload_foreign'
      });

      // Remplace le fichier disque par 17 Mio tout en faisant mentir head() et get().size.
      const diskPath = path.join(dir, stored.key);
      await fs.writeFile(diskPath, Buffer.alloc(MAX_RESULT_PAYLOAD_BYTES + 1024 * 1024, 0x61));
      let capturedStream: Readable | null = null;
      const dishonestDisk = wrapStorage(local, {
        head: async () => ({
          provider: local.provider,
          key: stored.key,
          contentType: 'application/json',
          sizeBytes: stored.sizeBytes,
          sha256: stored.sha256
        }),
        get: async (key) => {
          const obj = await local.get(key);
          capturedStream = obj.stream;
          return { ...obj, size: stored.sizeBytes };
        }
      });

      await expect(readOperationResult(dishonestDisk, { accountId: 'account-a', result: stored })).rejects.toMatchObject({
        name: 'ResultPayloadError',
        code: 'result_payload_too_large'
      });
      expect(capturedStream).not.toBeNull();
      expect(capturedStream!.destroyed).toBe(true);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
