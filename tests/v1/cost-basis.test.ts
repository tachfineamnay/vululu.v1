import { describe, expect, it } from 'vitest';
import { settlementFor } from '../../apps/api/src/infrastructure/execution/costBasis';

/**
 * P12-01 — règle de règlement partagée par le broker : un montant hors plafond n'est jamais un
 * succès, et une estimation n'est jamais enregistrée comme une charge constatée.
 */
describe('settlementFor', () => {
  it('règle un montant fournisseur sous le plafond en REPORTED', () => {
    expect(settlementFor(4, 'provider_reported', 10)).toEqual({ valid: true, costState: 'REPORTED' });
    expect(settlementFor(10, 'provider_reported', 10)).toEqual({ valid: true, costState: 'REPORTED' });
  });

  it('règle une estimation en ESTIMATED, jamais en REPORTED', () => {
    expect(settlementFor(4, 'configured_estimate', 10)).toEqual({ valid: true, costState: 'ESTIMATED' });
    expect(settlementFor(0, 'configured_estimate', 10)).toEqual({ valid: true, costState: 'ESTIMATED' });
  });

  it('règle un travail local nul en RELEASED sans rien dépenser', () => {
    expect(settlementFor(0, 'none', 0)).toEqual({ valid: true, costState: 'RELEASED' });
  });

  it('constate un coût vérifié en RECONCILED', () => {
    expect(settlementFor(6, 'manual', 10)).toEqual({ valid: true, costState: 'RECONCILED' });
  });

  it('refuse un montant au-dessus du plafond autorisé', () => {
    expect(settlementFor(11, 'provider_reported', 10)).toEqual({ valid: false, reason: 'above_ceiling' });
    expect(settlementFor(11, 'configured_estimate', 10)).toEqual({ valid: false, reason: 'above_ceiling' });
    expect(settlementFor(1, 'provider_reported', 0)).toEqual({ valid: false, reason: 'above_ceiling' });
  });

  it('refuse un montant négatif, non entier ou indéfini', () => {
    expect(settlementFor(-1, 'provider_reported', 10)).toEqual({ valid: false, reason: 'negative' });
    expect(settlementFor(1.5, 'provider_reported', 10)).toEqual({ valid: false, reason: 'not_integer' });
    expect(settlementFor(Number.NaN, 'configured_estimate', 10)).toEqual({ valid: false, reason: 'not_integer' });
  });
});
