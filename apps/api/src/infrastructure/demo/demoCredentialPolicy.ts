import { z } from 'zod';

/** Politique unique des identifiants de démonstration (amorçage et scripts de recette). */
export const DEMO_PASSWORD_MINIMUM = 12;
export const BCRYPT_MAX_PASSWORD_BYTES = 72;

export type DemoConfigIssueCode = 'demo_mode_required' | 'demo_credentials_invalid';

export type DemoConfigIssue = { code: DemoConfigIssueCode; hint: string };

type DemoConfig = Record<string, string | undefined>;

/** ADR 0028 : valeur courte tolérée uniquement sur activation explicite de la recette. */
export function demoPasswordMinimum(config: DemoConfig): number {
  return config.RECETTE_ALLOW_SHORT_PASSWORDS === '1' ? 1 : DEMO_PASSWORD_MINIMUM;
}

export function demoEmail(config: DemoConfig): string {
  return (config.DEMO_EMAIL ?? '').trim().toLowerCase();
}

/**
 * Diagnostic pur, sans effet de bord et sans valeur sensible : seuls des noms de
 * variables, des règles et des longueurs apparaissent. Les valeurs ne sortent
 * jamais, ni dans les logs, ni dans les rapports.
 */
export function diagnoseDemoConfig(config: DemoConfig): DemoConfigIssue[] {
  const issues: DemoConfigIssue[] = [];

  if (config.DEMO_MODE !== '1') {
    issues.push({
      code: 'demo_mode_required',
      hint: 'DEMO_MODE doit valoir 1 sur cette ressource de recette.'
    });
  }

  if (!z.email().safeParse(demoEmail(config)).success) {
    issues.push({
      code: 'demo_credentials_invalid',
      hint: 'DEMO_EMAIL est absent ou n est pas une adresse email valide.'
    });
  }

  const password = config.DEMO_PASSWORD ?? '';
  const minimum = demoPasswordMinimum(config);
  if (password.length === 0) {
    issues.push({
      code: 'demo_credentials_invalid',
      hint: 'DEMO_PASSWORD est vide : verifier que Coolify injecte SERVICE_PASSWORD_64_DEMO en runtime, ou saisir une valeur.'
    });
  } else if (password.length < minimum) {
    issues.push({
      code: 'demo_credentials_invalid',
      hint:
        'DEMO_PASSWORD est plus court que le minimum de ' + minimum + ' caracteres. ' +
        'Valeur courte assume (ADR 0028) : definir RECETTE_ALLOW_SHORT_PASSWORDS=1 sur cette recette uniquement.'
    });
  } else if (Buffer.byteLength(password, 'utf8') > BCRYPT_MAX_PASSWORD_BYTES) {
    issues.push({
      code: 'demo_credentials_invalid',
      hint:
        'DEMO_PASSWORD depasse ' + BCRYPT_MAX_PASSWORD_BYTES + ' octets ; bcrypt tronque au-dela. ' +
        'Choisir une valeur plus courte.'
    });
  }

  return issues;
}
