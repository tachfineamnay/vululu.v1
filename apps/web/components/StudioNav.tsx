'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { key: 'home', href: '/', label: 'Accueil' },
  { key: 'contexts', href: '/contexts', label: 'Contextes' },
  { key: 'catalog', href: '/catalog', label: 'Catalogue' },
  { key: 'assets', href: '/assets', label: 'Actifs' }
];

export default function StudioNav() {
  const pathname = usePathname() || '/';
  return (
    <nav className="nav-links" aria-label="Navigation principale">
      {LINKS.map((link) => {
        const active = link.href === '/' ? pathname === '/' : pathname === link.href || pathname.startsWith(link.href + '/');
        return (
          <Link key={link.key} href={link.href} data-testid={'nav-' + link.key} className={'nav-link' + (active ? ' is-active' : '')} aria-current={active ? 'page' : undefined}>
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
