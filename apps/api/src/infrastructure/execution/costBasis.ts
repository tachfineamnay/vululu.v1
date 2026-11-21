/**
 * P12-01 — provenance et classification d'un montant de coût.
 *
 * Aucune intégration ne renvoie de facture : un montant n'est donc jamais présenté comme une
 * charge vérifiée. Quatre niveaux, du moins au plus fiable :
 * - `none`                : travail local, aucune dépense fournisseur engagée ;
 * - `configured_estimate` : prix configuré côté serveur (éventuellement appliqué à un usage
 *                           annoncé par le fournisseur, ex. jetons) : cela reste une estimation ;
 * - `provider_reported`   : montant monétaire renvoyé par le fournisseur pour cet appel ;
 * - `manual`              : montant constaté par un super-administrateur, preuve écrite à l'appui.
 *
 * Un montant estimé est persisté `ESTIMATED` et n'entre jamais dans les totaux « confirmés »
 * (REPORTED/RECONCILED) : une estimation n'est pas une facture.
 */
export type CostBasis = 'none' | 'configured_estimate' | 'provider_reported' | 'manual';

/** États de coût admis par la contrainte SQL de `ExecutionOperation.costState`. */
export type CostState = 'ESTIMATED' | 'RESERVED' | 'UNKNOWN' | 'REPORTED' | 'RECONCILED' | 'RELEASED';

export type CostSettlement =
  | { valid: true; costState: CostState }
  | { valid: false; reason: 'not_integer' | 'negative' | 'above_ceiling' };

/**
 * Règle unique de règlement, partagée par le broker et par les tests.
 *
 * Un montant non entier, négatif ou supérieur au plafond autorisé n'est jamais réglé : il devient
 * un incident (réservation conservée, rapprochement humain requis), jamais un succès silencieux.
 * Une provenance inconnue retombe sur ESTIMATED : le doute ne peut pas produire une charge dite
 * constatée.
 */
export function settlementFor(cents: number, basis: CostBasis, maxCents: number): CostSettlement {
  if (!Number.isInteger(cents)) return { valid: false, reason: 'not_integer' };
  if (cents < 0) return { valid: false, reason: 'negative' };
  if (cents > maxCents) return { valid: false, reason: 'above_ceiling' };
  if (basis === 'manual') return { valid: true, costState: 'RECONCILED' };
  if (basis === 'provider_reported') return { valid: true, costState: 'REPORTED' };
  if (basis === 'none') return { valid: true, costState: cents === 0 ? 'RELEASED' : 'ESTIMATED' };
  return { valid: true, costState: 'ESTIMATED' };
}
