import type { Prisma } from '@prisma/client';
import { agentConfigChecksum, assertLicenseType } from '@vululu/domain';
import { ApplicationError, DEFAULT_INVOCATION_TIMEOUT_MS, type RunExecutionPolicy } from '@vululu/application';

/** Appelée dans la transaction sérialisable de lancement, jamais par le worker. */
export async function captureRunPolicy(tx: Prisma.TransactionClient, input: { steps: string[]; durable: boolean; usage: string; maxMockCents: number }): Promise<RunExecutionPolicy> {
  const key = process.env.DURABLE_AGENT_KEY || 'production-director';
  const definition = await tx.agentDefinition.findUnique({ where: { key } });
  const config = definition?.activeConfigVersionId ? await tx.agentConfigVersion.findFirst({ where: { id: definition.activeConfigVersionId, agentId: definition.id } }) : null;
  if ((definition && !config) || (!definition && key !== 'production-director')) throw new ApplicationError('agent_config_required', 'Le directeur configuré doit avoir une version active valide.', 409);
  if (config && (!Array.isArray(config.guardrails) || agentConfigChecksum({ soul: config.soul, instructions: config.instructions, guardrails: config.guardrails as string[] }) !== config.checksum)) throw new ApplicationError('agent_config_invalid', 'La configuration active est altérée.', 409);
  const models = await tx.model.findMany({ include: { provider: true }, orderBy: { id: 'asc' } });
  return {
    schemaVersion: 1, mode: 'MOCK',
    mockFailedModelKeys: (process.env.DURABLE_MOCK_FAIL_MODEL || '').split(',').map((value) => value.trim()).filter(Boolean),
    mockTimeoutModelKeys: (process.env.DURABLE_MOCK_TIMEOUT_MODEL || '').split(',').map((value) => value.trim()).filter(Boolean),
    mockInvalidModelKeys: (process.env.DURABLE_MOCK_INVALID_MODEL || '').split(',').map((value) => value.trim()).filter(Boolean),
    invocationTimeoutMs: DEFAULT_INVOCATION_TIMEOUT_MS,
    workflow: { version: 'v1-demo-workflow-2026-11-04', engine: input.durable ? 'hatchet' : 'local', steps: input.steps.map((step, index) => ({ key: step, dependsOn: index ? [input.steps[index - 1]] : [] })) },
    usage: input.usage === 'sponsored' ? 'sponsored' : 'organic', maxMockCents: input.maxMockCents,
    agent: { definitionId: definition?.id ?? null, key,
      config: config ? { id: config.id, agentId: config.agentId, version: config.version, soul: config.soul, instructions: config.instructions, guardrails: config.guardrails as string[], checksum: config.checksum } : null,
      capabilityRequirements: (definition?.capabilityRequirements ?? []) as RunExecutionPolicy['agent']['capabilityRequirements'] },
    models: models.map((model) => ({ id: model.id, providerId: model.providerId, providerKey: model.provider.key, modelKey: model.modelKey, capabilityKeys: model.capabilityKeys, quality: model.quality, latencyMs: model.latencyMs, costCentsPerUnit: model.costCentsPerUnit, license: assertLicenseType(model.license), active: model.active && model.provider.active, qualified: model.qualified }))
  };
}
