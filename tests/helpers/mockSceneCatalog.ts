import type { PrismaClient } from '@vululu/db';

/** Précondition explicite des tests de pipeline avec ports MOCK ; jamais exécutée par l’application. */
export async function ensureMockSceneCatalog(db: PrismaClient) {
  const provider = await db.provider.upsert({ where: { key: 'test-pipeline-fixture' }, update: {}, create: { key: 'test-pipeline-fixture', name: 'Catalogue MOCK de fixture' } });
  await db.model.upsert({
    where: { providerId_modelKey: { providerId: provider.id, modelKey: 'scene-fixture' } }, update: {},
    create: { providerId: provider.id, modelKey: 'scene-fixture', capabilityKeys: ['scene.generate'], quality: 10, latencyMs: 1, costCentsPerUnit: 2, license: 'commercial', qualified: true }
  });
}
