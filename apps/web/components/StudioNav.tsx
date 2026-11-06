'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { key: 'home', href: '/', label: 'Mes projets' },
  { key: 'contexts', href: '/contexts', label: 'Marques et références' },
  { key: 'creations', href: '/creations', label: 'Mes créations' },
  { key: 'campaigns', href: '/campaigns', label: 'Campagnes' },
  { key: 'catalog', href: '/catalog', label: 'Catalogue' },
  { key: 'assets', href: '/assets', label: 'Ressources' }
];

export default function StudioNav({ primaryOnly = false }: { primaryOnly?: boolean }) {
  const pathname = usePathname() || '/';
  return (
    <nav className="nav-links" aria-label="Navigation principale">
      {LINKS.filter((link) => !primaryOnly || ['home', 'contexts', 'creations'].includes(link.key)).map((link) => {
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
