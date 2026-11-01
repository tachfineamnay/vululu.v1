'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { adminApi, roleLabel } from '../../lib/admin';
import type { SessionUser } from '../../lib/api';

type NavItem = { key: string; href: string; label: string };

const NAV_ITEMS: NavItem[] = [
  { key: 'overview', href: '/admin', label: "Vue d'ensemble" },
  { key: 'utilisateurs', href: '/admin/utilisateurs', label: 'Utilisateurs' },
  { key: 'agents', href: '/admin/agents', label: 'Agents' },
  { key: 'fournisseurs', href: '/admin/fournisseurs', label: 'Fournisseurs' },
  { key: 'jobs', href: '/admin/jobs', label: 'Jobs' },
  { key: 'audit', href: '/admin/audit', label: 'Audit' },
  { key: 'couts', href: '/admin/couts', label: 'Couts' },
  { key: 'reglages', href: '/admin/reglages', label: 'Reglages' }
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') {
    return pathname === '/admin' || pathname === '/admin/';
  }
  return pathname === href || pathname.startsWith(href + '/');
}

export default function AdminShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout(): Promise<void> {
    setBusy(true);
    try {
      await adminApi.logout();
    } catch {
      // La session sera de toute facon reverifiee par la garde serveur.
    }
    router.push('/login');
  }

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <Link href="/" className="brand" aria-label="Vululu AI - retour au studio">
          <span className="brand-mark small">V</span>
          <span>Vululu AI</span>
          <span className="admin-topbar-tag">Admin</span>
        </Link>
        <div className="admin-topbar-actions">
          <Link className="btn btn-ghost" href="/">
            Studio
          </Link>
          <div className="admin-user">
            <strong>{user.name}</strong>
            <span className="admin-user-role">{roleLabel(user.role)}</span>
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => void logout()} disabled={busy}>
            {busy ? 'Sortie...' : 'Sortir'}
          </button>
        </div>
      </header>
      <div className="admin-body">
        <aside className="admin-sidebar" aria-label="Navigation administration">
          <nav className="admin-nav">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname ?? '', item.href);
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={'admin-nav-link' + (active ? ' is-active' : '')}
                  aria-current={active ? 'page' : undefined}
                  data-testid={'admin-nav-' + item.key}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="admin-content">{children}</main>
      </div>
    </div>
  );
}
