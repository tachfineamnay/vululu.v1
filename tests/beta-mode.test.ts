import { describe, expect, it } from 'vitest';
import { BETA_MODE_ENV, betaMode, betaPaymentsFrozen, betaStatus, parseBetaMode } from '../apps/api/src/betaMode';
import { billingMessage } from '../apps/api/src/infrastructure/billing/messages';

/**
 * BETA01 — politique de mode, sans base ni réseau.
 *
 * Ces vérifications portent sur la décision elle-même : une variable absente
 * n'ouvre jamais une vente, une valeur inconnue n'est jamais devinée, et le
 * mode commercial reste un choix explicite.
 */
describe('BETA01 beta mode policy (pure fixtures, no database, no network)', () => {
  it('defaults to the safe configuration: beta, payments frozen', () => {
    expect(parseBetaMode(undefined)).toBe('beta');
    expect(parseBetaMode('')).toBe('beta');
    expect(parseBetaMode('   ')).toBe('beta');
    expect(betaStatus({})).toEqual({
      beta: true,
      mode: 'beta',
      paymentsFrozen: true,
      checkout: 'unavailable',
      version: 'BETA01'
    });
  });

  it('reads the documented values 1/0 (and true/false, case-insensitive)', () => {
    for (const beta of ['1', 'true', 'TRUE', ' true ']) expect(parseBetaMode(beta)).toBe('beta');
    for (const commercial of ['0', 'false', 'False', ' 0 ']) expect(parseBetaMode(commercial)).toBe('commercial');
    expect(betaStatus({ [BETA_MODE_ENV]: '0' })).toEqual({
      beta: false,
      mode: 'commercial',
      paymentsFrozen: false,
      checkout: 'gated',
      version: 'BETA01'
    });
  });

  it('refuses to guess an unknown value instead of falling back to selling', () => {
    for (const invalid of ['2', 'yes', 'beta', 'commercial', 'on', '-1']) {
      expect(() => parseBetaMode(invalid)).toThrow(BETA_MODE_ENV);
    }
    expect(() => betaStatus({ [BETA_MODE_ENV]: 'live' })).toThrow();
    expect(() => betaPaymentsFrozen({ [BETA_MODE_ENV]: 'enabled' })).toThrow();
  });

  it('exposes frozen payments only in beta and never freezes them silently in commercial mode', () => {
    expect(betaPaymentsFrozen({})).toBe(true);
    expect(betaPaymentsFrozen({ [BETA_MODE_ENV]: '1' })).toBe(true);
    expect(betaPaymentsFrozen({ [BETA_MODE_ENV]: '0' })).toBe(false);
    expect(betaMode({ [BETA_MODE_ENV]: '0' })).toBe('commercial');
  });

  it('gives the customer a localizable refusal without leaking provider details', () => {
    expect(billingMessage('beta_mode_active')).toContain('bêta');
    expect(billingMessage('beta_mode_active')).not.toMatch(/sk_|whsec_|acct_/);
    expect(billingMessage('beta_mode_inactive')).toContain('bêta');
  });
});
