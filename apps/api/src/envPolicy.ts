/**
 * Politique de localisation de la base PostgreSQL.
 *
 * Le mode local (V0/V1) refuse une base non locale par défaut. Le déploiement
 * conteneurisé/préproduction exige une exception explicite, opt-in, réservée à
 * APP_ENV=production : ALLOW_NON_LOCAL_DATABASE=1.
 *
 * Cette fonction est pure et testable : elle ne lit pas process.env.
 */
export type DatabaseLocationPolicy = {
  appEnv: string;
  allowNonLocal: boolean;
};

export function isLocalDatabaseHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]';
}

export function assertDatabaseLocation(value: string, policy: DatabaseLocationPolicy): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('DATABASE_URL invalide.');
  }
  if (isLocalDatabaseHost(parsed.hostname)) {
    return;
  }
  if (!policy.allowNonLocal) {
    throw new Error('V0 refuse une base non locale: ' + parsed.hostname);
  }
  if (policy.appEnv !== 'production') {
    throw new Error('ALLOW_NON_LOCAL_DATABASE exige APP_ENV=production.');
  }
}
