import '../../apps/api/src/env';
import { prisma } from '@vululu/db';
import { bootstrapDemo } from '../../apps/api/src/infrastructure/demo/bootstrapDemo';
import { diagnoseDemoConfig } from '../../apps/api/src/infrastructure/demo/demoCredentialPolicy';

// Credentials injectés par Coolify ; aucun argument ni valeur sensible imprimé.
const known = ['demo_mode_required', 'demo_credentials_invalid', 'demo_account_collision', 'demo_resource_collision'];
const collision = ['demo_account_collision', 'demo_resource_collision'];

async function main() {
  try {
    await bootstrapDemo(prisma, process.env);
    console.log('DEMO_BOOTSTRAP_PASS: utilisateur ordinaire et exemples initialises ; donnees existantes preservees.');
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const reported = known.includes(code) ? code : 'bootstrap_failed';
    // Le code seul ne permet pas de corriger la configuration : les indices
    // nomment les variables et les regles, jamais les valeurs.
    console.error('DEMO_BOOTSTRAP_FAIL: ' + reported);
    const hints = diagnoseDemoConfig(process.env).map((issue) => issue.hint);
    if (hints.length === 0 && !collision.includes(reported)) {
      hints.push(
        'Echec inattendu : verifier la connexion PostgreSQL (DATABASE_URL, db saine, migrations appliquees) puis rejouer ce service.'
      );
    }
    for (const hint of hints) console.error('DEMO_BOOTSTRAP_HINT: ' + hint);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
void main();
