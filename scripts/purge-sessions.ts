import '../apps/api/src/env';
import { prisma } from '@vululu/db';
import { purgeSessions } from '../apps/api/src/security/session';

async function main() {
  const apply = process.argv.includes('--apply');
  const retentionArg = process.argv.indexOf('--retention-days');
  const retentionDays = retentionArg >= 0 ? Number(process.argv[retentionArg + 1]) : 30;
  const result = await purgeSessions({ retentionDays, dryRun: !apply });
  console.log(JSON.stringify({ dryRun: !apply, retentionDays, ...result }, null, 2));
  await prisma.$disconnect();
}
main().catch((error) => { console.error(error); process.exit(1); });
