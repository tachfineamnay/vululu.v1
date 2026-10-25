import '../apps/api/src/env';
import { prisma } from '@vululu/db';
import { ArtifactInventoryService, createArtifactStorage } from '../apps/api/src/infrastructure';

async function main() {
  const storage = createArtifactStorage();
  const service = new ArtifactInventoryService(storage);
  const report = await service.report({
    prefix: process.argv.includes('--prefix') ? process.argv[process.argv.indexOf('--prefix') + 1] : 'artifacts',
    graceHours: 24
  });
  console.log(JSON.stringify(report, null, 2));
  await prisma.$disconnect();
}
main().catch((error) => { console.error(error); process.exit(1); });
