import { describe, expect, it } from 'vitest';
import {
  BCRYPT_MAX_PASSWORD_BYTES,
  DEMO_PASSWORD_MINIMUM,
  demoEmail,
  demoPasswordMinimum,
  diagnoseDemoConfig
} from '../../apps/api/src/infrastructure/demo/demoCredentialPolicy';

// Diagnostic pur : aucun acces a PostgreSQL ni a Coolify.
const valid = { DEMO_MODE: '1', DEMO_EMAIL: ' Demo@Example.test ', DEMO_PASSWORD: 'mot-de-passe-long-et-solide' };

describe('Diagnostic de configuration demo', () => {
  it('ne signale rien pour une configuration valide et normalise l email', () => {
    expect(diagnoseDemoConfig(valid)).toEqual([]);
    expect(demoEmail(valid)).toBe('demo@example.test');
    expect(demoPasswordMinimum(valid)).toBe(DEMO_PASSWORD_MINIMUM);
  });

  it('signale le mode demo absent avant toute autre regle', () => {
    const issues = diagnoseDemoConfig({ ...valid, DEMO_MODE: '0', DEMO_PASSWORD: '' });
    expect(issues.map((issue) => issue.code)).toEqual(['demo_mode_required', 'demo_credentials_invalid']);
    expect(issues[0].hint).toContain('DEMO_MODE');
  });

  it('explique comment obtenir une valeur courte sur la seule recette', () => {
    const issues = diagnoseDemoConfig({ ...valid, DEMO_PASSWORD: 'court' });
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('demo_credentials_invalid');
    expect(issues[0].hint).toContain('12');
    expect(issues[0].hint).toContain('RECETTE_ALLOW_SHORT_PASSWORDS=1');
    expect(diagnoseDemoConfig({ ...valid, DEMO_PASSWORD: 'court', RECETTE_ALLOW_SHORT_PASSWORDS: '1' })).toEqual([]);
  });

  it('distingue une variable absente d une valeur refusee', () => {
    const empty = diagnoseDemoConfig({ ...valid, DEMO_PASSWORD: '' });
    expect(empty[0].hint).toContain('SERVICE_PASSWORD_64_DEMO');
    const tooLong = diagnoseDemoConfig({ ...valid, DEMO_PASSWORD: 'a'.repeat(BCRYPT_MAX_PASSWORD_BYTES + 1) });
    expect(tooLong[0].hint).toContain(String(BCRYPT_MAX_PASSWORD_BYTES));
  });

  it('refuse une adresse invalide et n affiche jamais la valeur du mot de passe', () => {
    const secret = 'valeur-secrete-courte';
    const issues = diagnoseDemoConfig({ ...valid, DEMO_EMAIL: 'invalid', DEMO_PASSWORD: secret });
    expect(issues).toHaveLength(1);
    expect(issues[0].hint).toContain('DEMO_EMAIL');
    for (const issue of diagnoseDemoConfig({ ...valid, DEMO_PASSWORD: secret })) {
      expect(issue.hint).not.toContain(secret);
    }
    for (const issue of issues) expect(issue.hint).not.toContain(secret);
  });
});
