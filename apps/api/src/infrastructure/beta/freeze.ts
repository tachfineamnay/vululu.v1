import { prisma } from '@vululu/db';
import { logEvent } from '../../observability/logger';
import { betaPaymentsFrozen } from '../../betaMode';

/**
 * BETA01 — gel commercial appliqué au démarrage.
 *
 * Les contrôles d'autorisation existants (réservations `billing_hold`,
 * `checkClaim`, déclencheurs SQL `billing_job` / `billing_start_job`) ne
 * s'appliquent que lorsque `BillingControl.enabled` vaut vrai. En bêta gratuite,
 * un bras de fer commercial laissé actif bloquerait donc des parcours ordinaires
 * (rendu, production, exports) faute de pass.
 *
 * Le gel consiste à remettre ce commutateur à `false` — jamais à toucher aux
 * commandes, produits, droits, reçus, crédits ou migrations. L'opération est :
 *
 * - idempotente (aucune écriture si le commutateur est déjà fermé) ;
 * - unidirectionnelle (elle ferme, elle n'ouvre jamais) ;
 * - auditée (`commerce.beta.frozen`) pour rester lisible après la bêta ;
 * - réversible : après `VULULU_BETA_MODE=0`, un super-administrateur peut
 *   réactiver explicitement les contrôles via le parcours F05 inchangé.
 *
 * En mode commercial, la fonction ne fait rien du tout.
 */
export async function freezeCommercialForBeta(
  env: Readonly<Record<string, string | undefined>> = process.env
): Promise<{ beta: boolean; frozen: boolean }> {
  if (!betaPaymentsFrozen(env)) return { beta: false, frozen: false };
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "BillingControl" WHERE id='commercial' FOR UPDATE`;
    const control = await tx.billingControl.findUniqueOrThrow({ where: { id: 'commercial' } });
    if (!control.enabled) return { beta: true, frozen: false };
    await tx.billingControl.update({ where: { id: 'commercial' }, data: { enabled: false } });
    await tx.auditEvent.create({
      data: {
        actorId: null,
        action: 'commerce.beta.frozen',
        targetType: 'commercial',
        targetId: 'commercial',
        metadata: { source: 'VULULU_BETA_MODE', previousMode: control.mode, beta: true }
      }
    });
    return { beta: true, frozen: true };
  });
}

/**
 * Gel au démarrage du serveur. En bêta, un échec fait échouer le démarrage :
 * mieux vaut une instance qui ne sert pas qu'une instance bêta dont les
 * parcours ordinaires resteraient bloqués par un état commercial résiduel.
 */
export async function applyBetaFreezeOnBoot(
  env: Readonly<Record<string, string | undefined>> = process.env
): Promise<void> {
  if (!betaPaymentsFrozen(env)) {
    logEvent('info', 'beta.mode_commercial', {});
    return;
  }
  const result = await freezeCommercialForBeta(env);
  logEvent('info', 'beta.commercial_frozen', { changed: result.frozen });
}
