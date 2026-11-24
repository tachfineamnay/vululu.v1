import type { SessionUser } from './api';

export type SupportGateResult =
  | { kind: 'unauthenticated' }
  | { kind: 'forbidden'; user: SessionUser }
  | { kind: 'ok'; user: SessionUser }
  | { kind: 'unavailable'; detail: string };

/**
 * Résolution serveur des droits d'accès à l'espace /support :
 * - 401 ou session vide -> unauthenticated (redirection /login)
 * - rôle autre que support/super_admin -> forbidden (403)
 * - erreur réseau ou 5xx -> unavailable
 */
export async function resolveSupportSession(
  cookieHeader: string,
  apiBaseUrl: string,
  fetcher: typeof fetch = fetch
): Promise<SupportGateResult> {
  const base = apiBaseUrl.replace(/\/+$/, '');
  let response: Response;
  try {
    response = await fetcher(base + '/api/auth/me', {
      headers: cookieHeader.length > 0 ? { cookie: cookieHeader } : undefined,
      cache: 'no-store'
    });
  } catch {
    return {
      kind: 'unavailable',
      detail: "L'API d'assistance est injoignable (" + base + ').'
    };
  }

  if (response.status === 401) {
    return { kind: 'unauthenticated' };
  }
  if (!response.ok) {
    return { kind: 'unavailable', detail: "L'API a repondu avec le statut " + response.status + '.' };
  }

  let user: SessionUser | null;
  try {
    const payload = (await response.json()) as { user?: SessionUser };
    user = payload.user ?? null;
  } catch {
    user = null;
  }
  if (!user) {
    return { kind: 'unauthenticated' };
  }
  if (user.role !== 'support' && user.role !== 'super_admin') {
    return { kind: 'forbidden', user };
  }
  return { kind: 'ok', user };
}
