import '../apps/api/src/env';
import { prisma } from '@vululu/db';
import {
  ArtifactMigrationService,
  LocalFilesystemArtifactStorage,
  PrismaArtifactPublisher,
  createArtifactStorage
} from '../apps/api/src/infrastructure';
import { env } from '../apps/api/src/env';

async function main() {
  const apply = process.argv.includes('--apply');
  const limitArg = process.argv.indexOf('--limit');
  const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : 50;
  const storage = createArtifactStorage();
  const local = new LocalFilesystemArtifactStorage(env.artifactRoot);
  const publisher = new PrismaArtifactPublisher(storage, prisma);
  const migration = new ArtifactMigrationService(storage, publisher, prisma, local);
  const plan = await migration.plan(limit);
  console.log('DRY_RUN=' + String(!apply));
  console.log('CANDIDATES=' + plan.length);
  console.log(JSON.stringify(plan, null, 2));
  if (apply) {
    const result = await migration.migrate({ apply: true, limit });
    console.log('MIGRATED=' + result.migrated.length);
    console.log('SKIPPED=' + result.skipped.length);
    console.log(JSON.stringify(result, null, 2));
  }
  await prisma.$disconnect();
}
main().catch((error) => { console.error(error); process.exit(1); });
