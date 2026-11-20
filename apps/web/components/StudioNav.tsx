'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import {LanguageControl,useWorkspace} from './WorkspacePreferences';
import { usePathname } from 'next/navigation';

const PRIMARY = [
  { key: 'home', href: '/', label: 'Mes projets' },
  { key: 'calendar', href: '/calendar', label: 'Calendrier' },
  { key: 'contexts', href: '/contexts', label: 'Marques et références' },
  { key: 'creations', href: '/creations', label: 'Mes créations' },
  { key: 'results', href: '/results', label: 'Résultats' }
];
const SECONDARY = [
  { key:'account',href:'/account',label:'Mon compte' },
  { key: 'campaigns', href: '/campaigns', label: 'Campagnes' },
  { key: 'assets', href: '/assets', label: 'Ressources' },
  { key: 'catalog', href: '/catalog', label: 'Catalogue' }
];

export default function StudioNav({ children }: { children?: ReactNode }) {
  const {t}=useWorkspace();
  const names:Record<string,string>={home:'My projects',calendar:'Calendar',contexts:'Business profiles',creations:'Creations',account:'My account',results:'Results',campaigns:'Campaigns',assets:'Assets',catalog:'Guide'};
  const pathname = usePathname() || '/';
  function renderLink(link: typeof PRIMARY[number]) {
    const active = link.key === 'home'
      ? pathname === '/' || pathname.startsWith('/projects/')
      : link.key === 'contexts'
        ? pathname.startsWith('/contexts')
        : pathname === link.href || pathname.startsWith(link.href + '/');
    return <Link key={link.key} href={link.href} data-testid={'nav-' + link.key} className={'nav-link' + (active ? ' is-active' : '')} aria-current={active ? 'page' : undefined}>{t(link.key==='catalog'?'Guide':link.label,names[link.key])}</Link>;
  }
  return <aside className="studio-sidebar" aria-label={t('Cadre Vululu','Vululu workspace')}>
    <Link href="/" className="brand" aria-label="Vululu, mes projets">vululu</Link>
    <nav className="nav-links" aria-label={t('Navigation principale','Main navigation')}>{PRIMARY.map(renderLink)}</nav>
    <nav className="nav-links secondary-nav" aria-label={t('Outils','Tools')}><span className="secondary-nav-label">{t('Outils','Tools')}</span>{SECONDARY.map(renderLink)}</nav>
    <LanguageControl/>
    {children ? <div className="sidebar-actions">{children}</div> : null}
  </aside>;
}
