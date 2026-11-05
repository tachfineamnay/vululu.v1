import { prisma } from '@vululu/db';
import { resetRecettePasswords } from '../../apps/api/src/infrastructure/demo/resetRecettePasswords';

resetRecettePasswords(prisma, process.env)
  .then((count) => console.log(count === 0 ? 'RECETTE_PASSWORD_RESET_SKIPPED' : 'RECETTE_PASSWORD_RESET_PASS: comptes synchronises, anciennes sessions revoquees.'))
  .catch(() => { console.error('RECETTE_PASSWORD_RESET_FAIL: verifier le mode, les identites et la configuration.'); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
