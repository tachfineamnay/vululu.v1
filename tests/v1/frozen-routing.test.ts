import crypto from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
vi.hoisted(() => {
  process.env.APP_ENV = 'test'; process.env.V0_TEST_DB = '1';
  process.env.DATABASE_URL_TEST = 'postgresql://vululu@127.0.0.1:55432/vululu_v1_00_test?schema=public';
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST; process.env.SESSION_SECRET = globalThis.crypto.randomUUID();
});
import { prisma as db } from '@vululu/db';
import { agentConfigChecksum, normalizeProductionSettings } from '../../packages/domain/src';
import { confirmFixtureBrief } from '../helpers/confirmFixtureBrief';
import { PrismaProductionRunRepository } from '../../apps/api/src/infrastructure/prisma/productionRunRepository';
import { DurableRoutingService } from '../../apps/api/src/infrastructure/durable/durableRoutingService';

const stamp = crypto.randomUUID(); const capabilityKey = 'frozen.scene.' + stamp;
const previousAgentKey = process.env.DURABLE_AGENT_KEY;
let userId: string; let providerId: string; let agentId: string; let configId: string; let configChecksum: string; let modelId: string;
beforeAll(async () => {
  userId = (await db.user.create({ data: { email: 'frozen-' + stamp + '@example.test', name: 'Fixture', passwordHash: 'fixture-only' } })).id;
  providerId = (await db.provider.create({ data: { key: 'frozen-' + stamp, name: 'MOCK fixture' } })).id;
  modelId = (await db.model.create({ data: { providerId, modelKey: 'original-' + stamp, capabilityKeys: [capabilityKey, 'scene.generate'], quality: 90, latencyMs: 5, costCentsPerUnit: 5, license: 'commercial', qualified: true } })).id;
  agentId = (await db.agentDefinition.create({ data: { key: 'frozen-' + stamp, name: 'Directeur fixture', role: 'director', capabilityRequirements: [capabilityKey, 'scene.generate'].map((key) => ({ capabilityKey: key, minQuality: 80, allowedLicenses: ['commercial'] })) } })).id;
  const content = { soul: 'MOCK directeur initial', instructions: 'Instructions initiales', guardrails: ['Aucun appel externe'] };
  configChecksum = agentConfigChecksum(content);
  configId = (await db.agentConfigVersion.create({ data: { agentId, version: 1, ...content, checksum: configChecksum } })).id;
  await db.agentDefinition.update({ where: { id: agentId }, data: { activeConfigVersionId: configId } });
  process.env.DURABLE_AGENT_KEY = 'frozen-' + stamp;
});
afterAll(async () => {
  if (previousAgentKey === undefined) delete process.env.DURABLE_AGENT_KEY; else process.env.DURABLE_AGENT_KEY = previousAgentKey;
  await db.project.deleteMany({ where: { userId } }); await db.brandContext.deleteMany({ where: { userId } }); await db.user.delete({ where: { id: userId } });
  await db.provider.delete({ where: { id: providerId } }); await db.agentDefinition.delete({ where: { id: agentId } }); await db.$disconnect();
});
async function start(usage = 'organic', maxMockCents = 100) {
  const context = await db.brandContext.create({ data: { userId, name: 'Marque fictive', description: 'Fixture' } });
  const project = await db.project.create({ data: { userId, contextId: context.id, title: 'Politique figée', usage, platform: 'Instagram', format: 'Video', objective: 'Fixture',
    brief: { create: { objective: 'Fixture', audience: 'Audience', tone: 'Direct', cta: 'Découvrir', platform: 'Instagram', format: 'Video', settings: normalizeProductionSettings('Instagram', 'Video', { maxMockCents }) } },
    scenes: { create: Array.from({ length: 5 }, (_, i) => ({ sceneKey: 'SCENE-00' + (i + 1), position: i + 1, title: 'Fixture', description: 'Fixture' })) }
  } });
  await confirmFixtureBrief(db, project.id);
  const run = await new PrismaProductionRunRepository(db).startRun({ userId, projectId: project.id, type: 'produce', targetSceneKey: null, instruction: null, steps: ['validate-snapshot', 'resolve-capabilities'], outbox: { kind: 'start_run', payload: {} } });
  return { project, run: run.jobRun };
}
it('garde la configuration et le catalogue du lancement apres une promotion et une modification du modele', async () => {
  const { project, run } = await start();
  expect(run.snapshot).toMatchObject({ executionPolicy: { mode: 'MOCK', workflow: { version: 'v1-demo-workflow-2026-11-04', engine: 'hatchet', steps: [{ key: 'validate-snapshot', dependsOn: [] }, { key: 'resolve-capabilities', dependsOn: ['validate-snapshot'] }] } } });
  const next = { soul: 'MOCK nouveau directeur', instructions: 'Nouvelle instruction', guardrails: ['Nouvelle règle'] };
  const config = await db.agentConfigVersion.create({ data: { agentId, version: 2, ...next, checksum: agentConfigChecksum(next) } });
  await db.agentDefinition.update({ where: { id: agentId }, data: { activeConfigVersionId: config.id, capabilityRequirements: [{ capabilityKey, minQuality: 100 }] } });
  await db.model.update({ where: { id: modelId }, data: { active: false, costCentsPerUnit: 999 } });
  process.env.DURABLE_AGENT_KEY = 'changed-after-launch';
  const invoke = vi.fn(async (input) => ({ output: { deterministic: true }, providerKey: input.providerKey, modelKey: input.modelKey, costCents: 5, latencyMs: 5, mock: true as const }));
  const routed = await new DurableRoutingService(db, new Set(), { invoke }).resolve({ jobRunId: run.id, projectId: project.id, capabilityKey, budgetCents: 10, input: {}, idempotencyKey: 'frozen:' + run.id });
  expect(routed).toMatchObject({ agentDefinitionId: agentId, agentConfigVersionId: configId, agentConfigChecksum: configChecksum, modelId, actualCents: 5 });
  expect(invoke).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ agentConfig: expect.objectContaining({ instructions: 'Instructions initiales' }) }) }));
  expect(await db.jobRun.findUniqueOrThrow({ where: { id: run.id } })).toMatchObject({ snapshot: run.snapshot, snapshotChecksum: run.snapshotChecksum });
});
it('refuse une resolution sans politique historique et ne consulte pas le catalogue courant', async () => {
  const project = await db.project.findFirstOrThrow({ where: { userId } });
  const run = await db.jobRun.create({ data: { projectId: project.id, type: 'produce', status: 'succeeded', snapshot: { legacy: true } } });
  const invoke = vi.fn();
  await expect(new DurableRoutingService(db, new Set(), { invoke }).resolve({ jobRunId: run.id, projectId: project.id, capabilityKey, budgetCents: 1000, input: {}, idempotencyKey: 'legacy:' + run.id })).rejects.toMatchObject({ code: 'routing_snapshot_required' });
  expect(invoke).not.toHaveBeenCalled();
});
async function resetFixture() {
  process.env.DURABLE_AGENT_KEY = 'frozen-' + stamp;
  await db.agentDefinition.update({ where: { id: agentId }, data: { activeConfigVersionId: configId, capabilityRequirements: [capabilityKey, 'scene.generate'].map((key) => ({ capabilityKey: key, minQuality: 80, allowedLicenses: ['internal', 'commercial'] })) } });
  await db.model.update({ where: { id: modelId }, data: { active: true, costCentsPerUnit: 5, license: 'commercial' } });
}
it('ne permet pas d augmenter le plafond capture depuis le worker', async () => {
  await resetFixture();
  const expensive = await db.model.create({ data: { providerId, modelKey: 'expensive-' + stamp, capabilityKeys: [capabilityKey, 'scene.generate'], quality: 100, latencyMs: 1, costCentsPerUnit: 20, license: 'commercial', qualified: true } });
  try {
    const { project, run } = await start('organic', 5);
    const invoke = vi.fn(async (input) => ({ output: {}, providerKey: input.providerKey, modelKey: input.modelKey, costCents: 5, latencyMs: 5, mock: true as const }));
    const result = await new DurableRoutingService(db, undefined, { invoke }).resolve({ jobRunId: run.id, projectId: project.id, capabilityKey, budgetCents: 1000, input: {}, idempotencyKey: 'budget:' + run.id });
    expect(result).toMatchObject({ modelId, actualCents: 5, policy: { budgetCents: 5 } });
    expect(invoke).toHaveBeenCalledWith(expect.objectContaining({ modelKey: 'original-' + stamp }));
  } finally { await db.model.update({ where: { id: expensive.id }, data: { active: false } }); }
});
it('ne lit pas une injection de panne ajoutee dans l environnement apres lancement', async () => {
  await resetFixture(); const previous = process.env.DURABLE_MOCK_FAIL_MODEL;
  try {
    delete process.env.DURABLE_MOCK_FAIL_MODEL;
    const { project, run } = await start();
    process.env.DURABLE_MOCK_FAIL_MODEL = 'original-' + stamp;
    const result = await new DurableRoutingService(db).resolve({ jobRunId: run.id, projectId: project.id, capabilityKey, budgetCents: 10, input: {}, idempotencyKey: 'env:' + run.id });
    expect(result).toMatchObject({ modelId, usedFallback: false });
  } finally { if (previous === undefined) delete process.env.DURABLE_MOCK_FAIL_MODEL; else process.env.DURABLE_MOCK_FAIL_MODEL = previous; }
});
it.each(['usage', 'agent'])('intersecte les droits du modele avec la contrainte $0', async (constraint) => {
  await resetFixture();
  if (constraint === 'usage') await db.model.update({ where: { id: modelId }, data: { license: 'internal' } });
  else await db.agentDefinition.update({ where: { id: agentId }, data: { capabilityRequirements: [capabilityKey, 'scene.generate'].map((key) => ({ capabilityKey: key, minQuality: 80, allowedLicenses: ['internal'] })) } });
  const before = await db.jobRun.count({ where: { project: { userId } } });
  await expect(start(constraint === 'usage' ? 'sponsored' : 'organic')).rejects.toMatchObject({ code: 'no_route' });
  expect(await db.jobRun.count({ where: { project: { userId } } })).toBe(before);
});
it('verifie le projet et le checksum du run avant toute invocation', async () => {
  await resetFixture(); const a = await start(); const b = await start(); const invoke = vi.fn(); const routing = new DurableRoutingService(db, undefined, { invoke });
  await expect(routing.resolve({ jobRunId: a.run.id, projectId: b.project.id, capabilityKey, budgetCents: 100, input: {}, idempotencyKey: 'wrong-project' })).rejects.toMatchObject({ code: 'routing_snapshot_required' });
  await db.jobRun.update({ where: { id: a.run.id }, data: { snapshotChecksum: '0'.repeat(64) } });
  await expect(routing.resolve({ jobRunId: a.run.id, projectId: a.project.id, capabilityKey, budgetCents: 100, input: {}, idempotencyKey: 'altered' })).rejects.toMatchObject({ code: 'snapshot_invalid' });
  expect(invoke).not.toHaveBeenCalled();
});
it('refuse un agent configure sans version active avant de creer un run', async () => {
  await resetFixture(); await db.agentDefinition.update({ where: { id: agentId }, data: { activeConfigVersionId: null } });
  const before = await db.jobRun.count({ where: { project: { userId } } });
  await expect(start()).rejects.toMatchObject({ code: 'agent_config_required' });
  expect(await db.jobRun.count({ where: { project: { userId } } })).toBe(before);
});
