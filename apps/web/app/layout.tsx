import type { Metadata } from 'next';
import type { ReactNode } from 'react';
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
  return (
    <html lang="fr">
      <body>
        {process.env.DEMO_MODE === '1' ? (
          <aside className="demo-mode-banner" role="note" aria-label="Mode demonstration">
            <strong>MODE DÉMO</strong> — IA simulée. Médias déterministes, coûts et transfert Postiz simulés.
          </aside>
        ) : null}
        {children}
      </body>
    </html>
  );
}
