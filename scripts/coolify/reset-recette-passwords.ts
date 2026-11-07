import { prisma } from '@vululu/db';
import { resetRecettePasswords } from '../../apps/api/src/infrastructure/demo/resetRecettePasswords';
import { diagnoseDemoConfig } from '../../apps/api/src/infrastructure/demo/demoCredentialPolicy';

// Operation ponctuelle : aucun effet lorsque RECETTE_RESET_PASSWORDS vaut 0.
const hints = [
  'DEMO_MODE=1 et RECETTE_RESET_PASSWORDS=1 sont requis ; le compte demo doit deja exister (demo-seed) et le compte admin doit etre super_admin (admin-seed).',
  'Valeurs courtes assumees (ADR 0028) : definir RECETTE_ALLOW_SHORT_PASSWORDS=1 le temps de la synchronisation.',
  'V1_BOOTSTRAP_EMAIL et DEMO_EMAIL doivent differer et etre des adresses valides.'
];

resetRecettePasswords(prisma, process.env)
  .then((count) => console.log(count === 0 ? 'RECETTE_PASSWORD_RESET_SKIPPED' : 'RECETTE_PASSWORD_RESET_PASS: comptes synchronises, anciennes sessions revoquees.'))
  .catch(() => {
    console.error('RECETTE_PASSWORD_RESET_FAIL: verifier le mode, les identites et la configuration.');
    for (const problem of diagnoseDemoConfig(process.env)) console.error('RECETTE_PASSWORD_RESET_HINT: ' + problem.hint);
    for (const hint of hints) console.error('RECETTE_PASSWORD_RESET_HINT: ' + hint);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
