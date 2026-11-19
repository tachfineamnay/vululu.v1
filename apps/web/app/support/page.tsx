'use client';
import { useEffect, useState } from 'react';
import StudioNav from '../../components/StudioNav';
import { ServiceCases, type Ticket } from '../../components/ServiceCases';
import { api } from '../../lib/api';
export default function Support() {
  const [rows, list] = useState<Ticket[]>([]),
    [err, fail] = useState('');
  async function load() {
    list(await api<Ticket[]>('/api/support/cases'));
  }
  useEffect(() => {
    load().catch((e) => fail(e.message));
  }, []);
  return (
    <div className="shell" data-vululu-theme="blue">
      <StudioNav />
      <main className="page stack">
        <h1>Assistance clients</h1>
        <p>Accès support uniquement. Aucune action sur les prix, crédits, paiements ou comptes.</p>
        {err ? <p role="alert">{err}</p> : <ServiceCases items={rows} mode="support" reload={load} />}
      </main>
    </div>
  );
}
