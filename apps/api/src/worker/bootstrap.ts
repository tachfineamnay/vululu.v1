import { prisma } from '@vululu/db';
import { contentChecksum } from '@vululu/domain';

/**
 * Bootstrap local D : agent producteur, deux providers mock et deux modeles
 * interchangeables. Idempotent ; ne s execute jamais pour un provider payant.
 * Les secrets ne sont pas concernes.
 */
export async function seedDurableAgentIfMissing(): Promise<void> {
  if (process.env.DURABLE_SEED_AGENT === '0') return;
  const providerA = await prisma.provider.upsert({
    where: { key: 'mock-a' },
    update: { active: true },
    create: { key: 'mock-a', name: 'Mock A', active: true }
  });
  const providerB = await prisma.provider.upsert({
    where: { key: 'mock-b' },
    update: { active: true },
    create: { key: 'mock-b', name: 'Mock B', active: true }
  });
  for (const [provider, key, quality, cost] of [
    [providerA, 'mock-a-primary', 90, 5],
    [providerB, 'mock-b-fallback', 70, 2]
  ] as const) {
    await prisma.model.upsert({
      where: { providerId_modelKey: { providerId: provider.id, modelKey: key } },
      update: { capabilityKeys: ['scene.generate'], quality, costCentsPerUnit: cost, latencyMs: 20, license: 'internal', active: true, qualified: true },
      create: {
        providerId: provider.id,
        modelKey: key,
        capabilityKeys: ['scene.generate'],
        quality,
        latencyMs: 20,
        costCentsPerUnit: cost,
        license: 'internal',
        active: true,
        qualified: true
      }
    });
  }
  const agent = await prisma.agentDefinition.upsert({
    where: { key: 'production-director' },
    update: { name: 'Production Director', role: 'director' },
    create: {
      key: 'production-director',
      name: 'Production Director',
      role: 'director',
      capabilityRequirements: [{ capabilityKey: 'scene.generate', allowedLicenses: ['internal'] }]
    }
  });
  const configs = await prisma.agentConfigVersion.findMany({ where: { agentId: agent.id } });
  let activeConfigId = agent.activeConfigVersionId;
  if (configs.length === 0) {
    const content = {
      soul: 'Director de production mock',
      instructions: 'Router les scenes vers un provider mock en respectant budget et fallback.',
      guardrails: ['no_real_provider', 'no_external_publish']
    };
    const config = await prisma.agentConfigVersion.create({
      data: {
        agentId: agent.id,
        version: 1,
        soul: content.soul,
        instructions: content.instructions,
        guardrails: content.guardrails,
        checksum: contentChecksum(content)
      }
    });
    activeConfigId = config.id;
    await prisma.agentDefinition.update({
      where: { id: agent.id },
      data: { activeConfigVersionId: config.id }
    });
  }
  if (!activeConfigId) {
    await prisma.agentDefinition.update({
      where: { id: agent.id },
      data: { activeConfigVersionId: configs[0].id }
    });
  }
}
