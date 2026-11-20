/**
 * BETA01 — mode bêta gratuite.
 *
 * Commutateur unique, contrôlé côté serveur : `VULULU_BETA_MODE`.
 *
 * - `1` (ou `true`) : mode bêta gratuite. Aucun paiement client ne peut être
 *   ouvert, la facturation commerciale est gelée et l'interface affiche
 *   « accès bêta gratuit ».
 * - `0` (ou `false`) : mode commercial. L'architecture de facturation existante
 *   est intacte et reste soumise à ses propres exigences d'activation
 *   explicites. Désactiver la bêta n'active jamais les paiements.
 *
 * Valeur absente : `beta`. C'est la configuration sûre : une variable oubliée
 * n'ouvre jamais une vente et ne demande jamais de carte.
 *
 * Toute autre valeur est refusée (démarrage en erreur) plutôt que devinée.
 *
 * Ce module est pur : il ne lit `process.env` que lorsque l'appelant ne fournit
 * pas d'environnement, et n'effectue aucun accès base, réseau ou horloge.
 */
export type BetaMode = 'beta' | 'commercial';

export const BETA_MODE_ENV = 'VULULU_BETA_MODE';

export function parseBetaMode(value: string | undefined): BetaMode {
  const raw = (value ?? '').trim().toLowerCase();
  if (raw === '' ) return 'beta';
  if (raw === '1' || raw === 'true') return 'beta';
  if (raw === '0' || raw === 'false') return 'commercial';
  throw new Error(`${BETA_MODE_ENV} invalide: ${value} (attendu 1 ou 0).`);
}

export type BetaEnv = Readonly<Record<string, string | undefined>>;

export function betaMode(env: BetaEnv = process.env): BetaMode {
  return parseBetaMode(env[BETA_MODE_ENV]);
}

/** Vrai lorsque la bêta gratuite est active : aucun paiement client n'est ouvrable. */
export function betaPaymentsFrozen(env: BetaEnv = process.env): boolean {
  return betaMode(env) === 'beta';
}

/**
 * Vue publique et stable du mode, destinée au frontend.
 * Aucun identifiant, secret ni donnée personnelle.
 */
export function betaStatus(env: BetaEnv = process.env) {
  const mode = betaMode(env);
  const beta = mode === 'beta';
  return {
    beta,
    mode,
    paymentsFrozen: beta,
    // En bêta, la vente est fermée par le serveur (pas seulement par l'UI).
    checkout: beta ? 'unavailable' as const : 'gated' as const,
    version: 'BETA01' as const
  };
}
