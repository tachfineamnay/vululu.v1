import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import AdminShell from '../../components/admin/AdminShell';
import type { SessionUser } from '../../lib/api';

export const dynamic = 'force-dynamic';

const API_INTERNAL_URL = (process.env.API_INTERNAL_URL || 'http://127.0.0.1:3101').replace(/\/+$/, '');

type MeResult =
  | { kind: 'unauthenticated' }
  | { kind: 'forbidden'; user: SessionUser }
  | { kind: 'ok'; user: SessionUser }
  | { kind: 'unavailable'; detail: string };

/**
 * Garde serveur de l espace /admin : lit le cookie de session, interroge
 * /api/auth/me en interne (no-store) puis n autorise que super_admin.
 * Aucune boucle de redirection : 401 -> login, autre role -> ecran 403.
 */
async function loadMe(): Promise<MeResult> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((cookie) => cookie.name + '=' + cookie.value)
    .join('; ');

  let response: Response;
  try {
    response = await fetch(API_INTERNAL_URL + '/api/auth/me', {
      headers: cookieHeader.length > 0 ? { cookie: cookieHeader } : undefined,
      cache: 'no-store'
    });
  } catch {
    return {
      kind: 'unavailable',
      detail: "L'API d'administration est injoignable (" + API_INTERNAL_URL + ').'
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
  if (user.role !== 'super_admin') {
    return { kind: 'forbidden', user };
  }
  return { kind: 'ok', user };
}

function AdminGate(input: { title: string; message: string; children?: ReactNode }) {
  return (
    <main className="admin-gate">
      <section className="admin-gate-card">
        <div className="brand-mark">V</div>
        <p className="eyebrow">Administration</p>
        <h1>{input.title}</h1>
        <p className="admin-subtitle">{input.message}</p>
        <div className="admin-gate-actions">{input.children}</div>
      </section>
    </main>
  );
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const me = await loadMe();

  if (me.kind === 'unauthenticated') {
    redirect('/login?next=/admin');
  }

  if (me.kind === 'unavailable') {
    return (
      <AdminGate title="Administration indisponible" message={me.detail}>
        <a className="btn btn-primary" href="/admin">
          Reessayer
        </a>
        <Link className="btn btn-ghost" href="/">
          Retour au studio
        </Link>
      </AdminGate>
    );
  }

  if (me.kind === 'forbidden') {
    return (
      <AdminGate
        title="Accès refusé"
        message={
          'Cette interface est reservee aux super administrateurs. Session active : ' + me.user.email + '.'
        }
      >
        <Link className="btn btn-primary" href="/">
          Retour au studio
        </Link>
      </AdminGate>
    );
  }

  return <AdminShell user={me.user}>{children}</AdminShell>;
}
