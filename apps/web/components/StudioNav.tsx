'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const PRIMARY = [
  { key: 'home', href: '/', label: 'Mes projets' },
  { key: 'contexts', href: '/contexts', label: 'Marques et références' },
  { key: 'creations', href: '/creations', label: 'Mes créations' }
];
const SECONDARY = [
  { key: 'campaigns', href: '/campaigns', label: 'Campagnes' },
  { key: 'assets', href: '/assets', label: 'Ressources' },
  { key: 'catalog', href: '/catalog', label: 'Catalogue' }
];

export default function StudioNav({ children }: { children?: ReactNode }) {
  const pathname = usePathname() || '/';
  function renderLink(link: typeof PRIMARY[number]) {
    const active = link.key === 'home'
      ? pathname === '/' || pathname.startsWith('/projects/') || pathname.startsWith('/campaigns')
      : link.key === 'contexts'
        ? pathname.startsWith('/contexts') || pathname.startsWith('/assets')
        : pathname === link.href || pathname.startsWith(link.href + '/');
    return <Link key={link.key} href={link.href} data-testid={'nav-' + link.key} className={'nav-link' + (active ? ' is-active' : '')} aria-current={active ? 'page' : undefined}>{link.label}</Link>;
  }
  return <aside className="studio-sidebar" aria-label="Cadre Vululu">
    <Link href="/" className="brand" aria-label="Vululu, mes projets">vululu</Link>
    <nav className="nav-links" aria-label="Navigation principale">{PRIMARY.map(renderLink)}</nav>
    <nav className="nav-links secondary-nav" aria-label="Outils"><span className="secondary-nav-label">Outils</span>{SECONDARY.map(renderLink)}</nav>
    {children ? <div className="sidebar-actions">{children}</div> : null}
  </aside>;
}
