import { describe, expect, it, vi } from 'vitest';
import { vertexProvider, type VertexConfig } from '../apps/api/src/infrastructure/assistant/vertex';
import { vettedChanges, vettedCopy } from '../apps/api/src/infrastructure/assistant/safety';
import { businesses } from './fixtures/assistant-businesses';

const config: VertexConfig = { project: 'test-project', location: 'europe-west4', model: 'gemini-2.5-flash-lite', inputRate: 1, outputRate: 2 };
const options = { signal: new AbortController().signal, maxCostCents: 8, idempotencyKey: 'fixture-operation' };
const data = { kind: 'marketing' as const, data: { request: 'Présentez mon offre.' } };
function fromModel(finishReason = 'STOP', includeUsage = true) {
  return Response.json({ candidates: [{ finishReason, content: { parts: [{ text: '{"campaign":"Un premier pas"}' }] } }],
    ...(includeUsage ? { usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 15, totalTokenCount: 215 } } : {}) });
}
describe('Vertex adapter (mocked HTTP only)', () => {
  it('makes one authorized, schema-constrained call with a fixed endpoint and reports bounded cost', async () => {
    const fetch = vi.fn().mockImplementation(async () => fromModel());
    const token = vi.fn().mockResolvedValue('fixture');
    const response = await vertexProvider(config, { fetch, token }).generate(data, options);
    expect(response).toEqual({ status: 'complete', output: { campaign: 'Un premier pas' }, costCents: 1 });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://europe-west4-aiplatform.googleapis.com/v1/projects/test-project/locations/europe-west4/publishers/google/models/gemini-2.5-flash-lite:generateContent');
    expect(init).toMatchObject({ method: 'POST', redirect: 'error', headers: { Authorization: 'Bearer fixture' } });
    const body = JSON.parse(init.body);
    expect(body.generationConfig).toMatchObject({ candidateCount: 1, maxOutputTokens: 3072, responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: 0 }, responseJsonSchema: { type: 'object', additionalProperties: false } });
    expect(body.tools).toBeUndefined();
  });
  it('never calls the provider without budget, refuses truncation, and distinguishes unknown cost', async () => {
    const fetch = vi.fn().mockImplementationOnce(async () => fromModel('MAX_TOKENS')).mockImplementationOnce(async () => fromModel('STOP', false));
    const token = vi.fn().mockResolvedValue('fixture');
    const provider = vertexProvider(config, { fetch, token });
    expect(await provider.generate(data, { ...options, maxCostCents: 0 })).toEqual({ status: 'budget', costCents: 0 });
    expect(fetch).not.toHaveBeenCalled();
    expect(token).not.toHaveBeenCalled();
    expect(await provider.generate(data, options)).toEqual({ status: 'truncated', costCents: 1 });
    expect(await provider.generate(data, options)).toEqual({ status: 'invalid', costCents: null });
  });
  it('interrupts in-flight calls without retrying or claiming a zero-cost receipt', async () => {
    const ctrl = new AbortController();
    const fetch = vi.fn().mockImplementation(async () => { ctrl.abort(); return new Promise(() => {}); });
    const provider = vertexProvider(config, { fetch, token: async () => 'fixture' });
    expect(await provider.generate(data, { ...options, signal: ctrl.signal })).toEqual({ status: 'deadline', costCents: null });
    expect(fetch).toHaveBeenCalledOnce();
  });
});

for (const b of businesses) {
  it(`accepts useful neutral copy and rejects unverified claims for ${b.name}`, () => {
    const post = { headline: b.headline, caption: 'Parlons de ce que vous aimeriez découvrir.', cta: 'Posez votre question',
      storyboard: Array.from({ length: 3 }, () => ({ shot: 'Préparer une vue de détail', onScreen: 'Par où commencer ?' })) };
    const content = { campaign: 'Une première découverte', strategy: 'Ouvrir une conversation et proposer une prochaine étape.', posts: [post, post, post] };
    expect(vettedCopy(content)).toEqual(content);
    expect(vettedCopy({ ...content, posts: [{ ...post, caption: b.rejected }, post, post] })).toBeNull();
  });
}
it('rejects provider-assigned media IDs and claim-bearing creative copy', () => {
  expect(vettedChanges({ changes: [{ operation: 'replace', parameters: { layer: 0, versionId: 'elsewhere' } }] })).toBeNull();
  expect(vettedChanges({ changes: [{ operation: 'cta', parameters: { text: 'Résultat garanti' } }] })).toBeNull();
  expect(vettedChanges({ changes: [{ operation: 'cta', parameters: { text: 'Parlons ensemble' } }] })).toHaveLength(1);
});
