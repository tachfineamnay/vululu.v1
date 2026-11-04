import '../../apps/api/src/env';
import { prisma } from '@vululu/db';
import { bootstrapDemo } from '../../apps/api/src/infrastructure/demo/bootstrapDemo';

// Credentials injectés par Coolify ; aucun argument ni valeur sensible imprimé.
async function main() {
  try {
    await bootstrapDemo(prisma, process.env);
    console.log('DEMO_BOOTSTRAP_PASS: utilisateur ordinaire et exemples initialises ; donnees existantes preservees.');
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const known = ['demo_mode_required', 'demo_credentials_invalid', 'demo_account_collision', 'demo_resource_collision'];
    console.error('DEMO_BOOTSTRAP_FAIL: ' + (known.includes(code) ? code : 'bootstrap_failed'));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
void main();
