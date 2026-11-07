import { afterEach, expect, it, vi } from 'vitest';
vi.hoisted(() => {
  process.env.APP_ENV = 'test'; process.env.V0_TEST_DB = '1';
  process.env.DATABASE_URL_TEST = 'postgresql://vululu@127.0.0.1:55432/vululu_v1_00_test?schema=public';
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST; process.env.SESSION_SECRET = globalThis.crypto.randomUUID();
});
import type { PrismaClient } from '@vululu/db';
import { contentChecksum, type ModelDefinition } from '../../packages/domain/src';
import type { CapabilityInvocation, CapabilityProviderPort, CapabilityResult, ReproducibilitySnapshot, RunExecutionPolicy } from '@vululu/application';
import { ApplicationError } from '@vululu/application';
import { DurableRoutingService } from '../../apps/api/src/infrastructure/durable/durableRoutingService';

afterEach(() => vi.restoreAllMocks());
function result(input: CapabilityInvocation): CapabilityResult {
  return { output: { deterministic: true }, providerKey: input.providerKey, modelKey: input.modelKey, costCents: 2, latencyMs: 5, mock: true };
}
function fixture(options: { fallback?: boolean; timeoutKeys?: string[]; invalidKeys?: string[]; budget?: number } = {}) {
  const models: ModelDefinition[] = ['primary', ...(options.fallback === false ? [] : ['fallback'])].map((key, index) => ({ id: key, providerId: 'mock-provider', providerKey: 'mock-provider', modelKey: key, capabilityKeys: ['scene.generate'], quality: 95 - index * 10, latencyMs: 5, costCentsPerUnit: index ? 2 : 5, license: 'commercial', active: true, qualified: true }));
  const policy: RunExecutionPolicy & { invocationTimeoutMs: number; mockTimeoutModelKeys: string[]; mockInvalidModelKeys: string[] } = {
    schemaVersion: 1, mode: 'MOCK', mockFailedModelKeys: [], invocationTimeoutMs: 20, mockTimeoutModelKeys: options.timeoutKeys ?? [], mockInvalidModelKeys: options.invalidKeys ?? [],
    workflow: { version: 'v1-demo-workflow-2026-11-04', engine: 'hatchet', steps: [{ key: 'resolve-capabilities', dependsOn: [] }] }, usage: 'organic', maxMockCents: options.budget ?? 10,
    agent: { definitionId: null, key: 'production-director', config: null, capabilityRequirements: [] }, models
  };
  // Faux adaptateur DB explicite : seul le snapshot figé et l'écriture de décision sont disponibles.
  const snapshot = { executionPolicy: policy } as unknown as ReproducibilitySnapshot;
  const run = { id: 'run', projectId: 'project', snapshot, snapshotChecksum: contentChecksum(snapshot) };
  const create = vi.fn(async ({ data }) => ({ ...data, id: 'decision', createdAt: new Date() }));
  const db = { jobRun: { findFirst: vi.fn(async () => run) }, routingDecision: { create } } as unknown as PrismaClient;
  const resolve = (provider?: CapabilityProviderPort) => new DurableRoutingService(db, undefined, provider).resolve({ jobRunId: run.id, projectId: run.projectId, capabilityKey: 'scene.generate', budgetCents: 1000, input: {}, idempotencyKey: 'fixture-route' });
  return { resolve, create, run, policy };
}
it('annule une tentative en timeout et utilise uniquement le fallback valide', async () => {
  const f = fixture(); const calls: string[] = []; let aborted = false;
  const invoke = vi.fn(async (input: CapabilityInvocation & { signal?: AbortSignal }) => {
    calls.push(input.modelKey);
    if (input.modelKey === 'primary') return new Promise<CapabilityResult>((_resolve, reject) => input.signal?.addEventListener('abort', () => { aborted = true; reject(new Error('aborted fixture')); }, { once: true }));
    return result(input);
  });
  const routed = await f.resolve({ invoke });
  expect(routed).toMatchObject({ modelKey: 'fallback', usedFallback: true, actualCents: 2, policy: { primaryFailureCode: 'invocation_timeout' } });
  expect(calls).toEqual(['primary', 'fallback']); expect(aborted).toBe(true); expect(f.create).toHaveBeenCalledTimes(1);
}, 1000);
it.each(['wrong-model', 'wrong-provider', 'not-mock', 'negative-cost', 'invalid-latency', 'array-output', 'oversized-output', 'circular-output', 'date-output', 'toJSON-string', 'function-field', 'nonfinite-field', 'map-output', 'nested-map'])('rejette un resultat %s et bascule sans lui faire confiance', async (kind) => {
  const f = fixture();
  const invoke = vi.fn(async (input: CapabilityInvocation) => {
    const value = result(input); if (input.modelKey !== 'primary') return value;
    if (kind === 'wrong-model') value.modelKey = 'forged';
    if (kind === 'wrong-provider') value.providerKey = 'forged';
    if (kind === 'not-mock') (value as unknown as { mock: boolean }).mock = false;
    if (kind === 'negative-cost') value.costCents = -5;
    if (kind === 'invalid-latency') value.latencyMs = NaN;
    if (kind === 'array-output') value.output = [] as unknown as Record<string, unknown>;
    if (kind === 'oversized-output') value.output = { text: 'é'.repeat(40_000) };
    if (kind === 'circular-output') value.output = { self: value };
    if (kind === 'date-output') value.output = new Date() as unknown as Record<string, unknown>;
    if (kind === 'toJSON-string') value.output = { toJSON: () => 'unexpected string' };
    if (kind === 'function-field') value.output = { callback: () => 'non-json' };
    if (kind === 'nonfinite-field') value.output = { number: Infinity };
    if (kind === 'map-output') value.output = new Map([['text', 'lost']]) as unknown as Record<string, unknown>;
    if (kind === 'nested-map') value.output = { nested: new Map([['text', 'lost']]) };
    return value;
  });
  expect(await f.resolve({ invoke })).toMatchObject({ modelKey: 'fallback', usedFallback: true, policy: { primaryFailureCode: 'invocation_invalid_result' } });
  expect(invoke).toHaveBeenCalledTimes(2); expect(f.create).toHaveBeenCalledTimes(1);
});
it('conserve une cause terminale sans enregistrer de decision reussie quand aucun fallback ne reste', async () => {
  const f = fixture({ fallback: false });
  await expect(f.resolve({ invoke: async (input) => ({ ...result(input), modelKey: 'forged' }) })).rejects.toMatchObject({ code: 'invocation_invalid_result' });
  expect(f.create).not.toHaveBeenCalled();
});
it('ignore un resultat tardif apres timeout, sans seconde decision', async () => {
  const f = fixture(); let completedLate = false;
  const invoke = vi.fn(async (input: CapabilityInvocation) => {
    if (input.modelKey === 'primary') await new Promise((resolve) => setTimeout(resolve, 80));
    if (input.modelKey === 'primary') completedLate = true;
    return result(input);
  });
  const routed = await f.resolve({ invoke });
  expect(routed.modelKey).toBe('fallback');
  await new Promise((resolve) => setTimeout(resolve, 90));
  expect(completedLate).toBe(true); expect(f.create).toHaveBeenCalledTimes(1);
});
it.each(['timeout', 'invalid'])('execute le scenario MOCK %s capture sans lire l environnement courant', async (scenario) => {
  const f = fixture({ timeoutKeys: scenario === 'timeout' ? ['primary'] : [], invalidKeys: scenario === 'invalid' ? ['primary'] : [] });
  expect(await f.resolve()).toMatchObject({ modelKey: 'fallback', usedFallback: true });
  expect(f.run.snapshotChecksum).toBe(contentChecksum(f.run.snapshot));
}, 1000);
it('ne choisit pas un fallback au-dessus du plafond pour masquer une reponse invalide', async () => {
  const f = fixture({ budget: 2 });
  const invoke = vi.fn(async (input: CapabilityInvocation) => ({ ...result(input), modelKey: 'forged' }));
  await expect(f.resolve({ invoke })).rejects.toMatchObject({ code: 'invocation_invalid_result' });
  expect(invoke.mock.calls.map(([input]) => input.modelKey)).toEqual(['fallback']); expect(f.create).not.toHaveBeenCalled();
});
it('ne propage pas le message prive d une erreur fournisseur, meme typee ApplicationError', async () => {
  const f = fixture({ fallback: false });
  const error = await f.resolve({ invoke: async () => { throw new ApplicationError('invocation_timeout', 'private_payload_fixture', 504); } }).catch((failure: unknown) => failure);
  expect(error).toMatchObject({ code: 'invocation_failed' }); expect(String(error)).not.toContain('private_payload_fixture'); expect(f.create).not.toHaveBeenCalled();
});
