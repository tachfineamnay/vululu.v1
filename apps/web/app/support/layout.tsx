import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { resolveSupportSession } from '../../lib/supportGate';

export const dynamic = 'force-dynamic';

const API_INTERNAL_URL = (process.env.API_INTERNAL_URL || 'http://127.0.0.1:3101').replace(/\/+$/, '');

/**
 * Garde serveur de l'espace /support : vérifie la session via /api/auth/me (no-store)
 * et n'autorise que les rôles support et super_admin.
 */
async function loadMe() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((cookie) => cookie.name + '=' + cookie.value)
    .join('; ');
  return resolveSupportSession(cookieHeader, API_INTERNAL_URL);
}

function SupportGate(input: { title: string; message: string; children?: ReactNode }) {
  return (
    <main className="admin-gate">
      <section className="admin-gate-card">
        <div className="brand-mark">V</div>
        <p className="eyebrow">Assistance</p>
        <h1>{input.title}</h1>
        <p className="admin-subtitle">{input.message}</p>
        <div className="admin-gate-actions">{input.children}</div>
      </section>
    </main>
  );
}

export default async function SupportLayout({ children }: { children: ReactNode }) {
  const me = await loadMe();

  if (me.kind === 'unauthenticated') {
    redirect('/login?next=/support');
  }

  if (me.kind === 'unavailable') {
    return (
      <SupportGate title="Assistance indisponible" message={me.detail}>
        <a className="btn btn-primary" href="/support">
          Reessayer
        </a>
        <Link className="btn btn-ghost" href="/">
          Retour au studio
        </Link>
      </SupportGate>
    );
  }

  if (me.kind === 'forbidden') {
    return (
      <SupportGate
        title="Accès refusé"
        message={
          "Cette file est réservée au personnel d'assistance et aux super administrateurs. Session active : " +
          me.user.email +
          '.'
        }
      >
        <Link className="btn btn-primary" href="/">
          Retour au studio
        </Link>
      </SupportGate>
    );
  }

  return <>{children}</>;
}
