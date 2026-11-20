import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import {cookies} from 'next/headers';
import { WorkspacePreferences } from '../components/WorkspacePreferences';
import { connection } from 'next/server';
import './globals.css';
import './atelier-blue.css';

export const metadata: Metadata = {
  title: 'Vululu AI — Studio',
  description: 'Studio de production créative agentique'
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // L'image Coolify peut être construite avant injection du mode d'exécution.
  await connection();
  const locale=(await cookies()).get('vululu_lang')?.value==='en'?'en':'fr';
  const demo=process.env.DEMO_MODE==='1'||(process.env.NODE_ENV!=='production' && process.env.APP_ENV!=='production');
  return (
    <html lang={locale}>
      <body><WorkspacePreferences locale={locale} demo={demo}>
        {process.env.DEMO_MODE === '1' ? (
          <aside className="demo-mode-banner" role="note" aria-label="Mode demonstration">
            <strong>MODE DÉMO</strong> — Le parcours vidéo historique utilise une assistance, des coûts et un transfert simulés. La composition et les exports Studio sont réels.
          </aside>
        ) : null}
        {children}
      </WorkspacePreferences></body>
    </html>
  );
}
