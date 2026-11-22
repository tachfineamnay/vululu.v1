import { createServer, type Server } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { callPythonTool, pythonToolsConfig, PythonToolsError } from '../../apps/api/src/infrastructure/python/client';

/**
 * Contrat du client worker→python-tools : enveloppe, bornes, mapping d'erreurs.
 * Aucun Python n'est lancé ici (serveur HTTP local) : ces tests vérifient le contrat TypeScript ;
 * la parité avec le vrai service est couverte par les tests Python (tests/test_capability_quality.py).
 */

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAIklEQVR4nGOUi5rGQApgIkk1w6gG4gATkergYFQDMYBkDQBsiQEuTFSdAAAAAABJRU5ErkJggg==',
  'base64'
);
const sha = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');
const body = () => ({
  requestId: randomUUID(),
  source: { assetVersionId: 'asset-version-contract', sha256: sha(PNG), mimeType: 'image/png', imageBase64: PNG.toString('base64') }
});

let server: Server;
let port = 0;
const calls: Array<{ path: string; authorization: string | undefined }> = [];
// Jeton attendu par le stub : figé ici. Comparer au process.env mutable rendait le refus 401
// impossible dès que le test changeait le jeton courant du client.
const CONTRACT_TOKEN = 'contract-token-0123456789abcdef0123456789';

beforeAll(async () => {
  server = createServer((request, response) => {
    calls.push({ path: request.url ?? '', authorization: request.headers.authorization });
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      if (request.headers.authorization !== 'Bearer ' + CONTRACT_TOKEN) {
        response.writeHead(401, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: { code: 'unauthorized', message: 'refusé', retryable: false } }));
        return;
      }
      if (payload.source?.imageBase64?.length > 4096) {
        response.writeHead(413, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: { code: 'payload_too_large', message: 'trop gros', retryable: false } }));
        return;
      }
      if (request.url?.includes('broken')) {
        response.writeHead(200, { 'content-type': 'text/plain' });
        response.end('pas du json');
        return;
      }
      if (payload.source?.sha256 !== sha(PNG)) {
        response.writeHead(422, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: { code: 'source_checksum_mismatch', message: 'empreinte', retryable: false } }));
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          requestId: payload.requestId,
          capability: 'image.analyze@1',
          capabilityVersion: 1,
          version: '0.1.0',
          durationMs: 1.5,
          data: { analysis: { width: 16, height: 16, format: 'PNG', mode: 'RGB', transparent: false } },
          source: payload.source
        })
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  port = typeof address === 'object' && address ? address.port : 0;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  calls.length = 0;
  process.env.PYTHON_TOOLS_TOKEN = CONTRACT_TOKEN;
  process.env.PYTHON_TOOLS_URL = 'http://127.0.0.1:' + port + '/';
  process.env.PYTHON_TOOLS_TIMEOUT_MS = '20000';
});

describe('pythonToolsConfig', () => {
  it('exige une URL et un jeton d au moins 24 caractères', () => {
    process.env.PYTHON_TOOLS_URL = '';
    expect(pythonToolsConfig()).toBeNull();
    process.env.PYTHON_TOOLS_URL = 'http://127.0.0.1:' + port + '/';
    process.env.PYTHON_TOOLS_TOKEN = 'court';
    expect(pythonToolsConfig()).toBeNull();
  });

  it('borne le délai entre 1 s et 120 s et retire la barre finale', () => {
    process.env.PYTHON_TOOLS_TIMEOUT_MS = '5';
    expect(pythonToolsConfig()?.timeoutMs).toBe(1000);
    process.env.PYTHON_TOOLS_TIMEOUT_MS = '999999';
    expect(pythonToolsConfig()?.timeoutMs).toBe(120000);
    expect(pythonToolsConfig()?.url).toBe('http://127.0.0.1:' + port);
  });
});

describe('callPythonTool', () => {
  it('envoie le corps attendu avec le jeton et renvoie la réponse typée', async () => {
    const response = (await callPythonTool('image.analyze@1', body())) as { capability: string; data: { analysis: { width: number } } };
    expect(response.capability).toBe('image.analyze@1');
    expect(response.data.analysis.width).toBe(16);
    expect(calls[0]?.path).toBe('/v1/tools/image.analyze@1');
    expect(calls[0]?.authorization).toBe('Bearer ' + process.env.PYTHON_TOOLS_TOKEN);
  });

  it('refuse sans succès simulé : 401, 413 et empreinte incohérente', async () => {
    process.env.PYTHON_TOOLS_TOKEN = 'mauvais-jeton-0123456789abcdef';
    await expect(callPythonTool('image.analyze@1', body())).rejects.toMatchObject({
      name: 'PythonToolsError', code: 'unauthorized', retryable: false, status: 401
    });
    process.env.PYTHON_TOOLS_TOKEN = CONTRACT_TOKEN;
    const oversized = body();
    oversized.source.imageBase64 = Buffer.alloc(8192, 0x41).toString('base64');
    await expect(callPythonTool('image.analyze@1', oversized)).rejects.toMatchObject({ code: 'payload_too_large', retryable: false });
    const tampered = body();
    tampered.source.sha256 = '0'.repeat(64);
    await expect(callPythonTool('image.analyze@1', tampered)).rejects.toMatchObject({ code: 'source_checksum_mismatch', retryable: false });
  });

  it('distingue une réponse illisible et un service injoignable', async () => {
    await expect(callPythonTool('broken' as 'image.analyze@1', body())).rejects.toMatchObject({ code: 'python_tools_invalid_response' });
    process.env.PYTHON_TOOLS_URL = 'http://127.0.0.1:9';
    await expect(callPythonTool('image.analyze@1', body())).rejects.toMatchObject({ code: 'python_tools_unreachable', retryable: true });
    expect(PythonToolsError.prototype).toBeInstanceOf(Error);
  });
});
