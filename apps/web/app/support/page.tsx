'use client';
import {useWorkspace} from '../../components/WorkspacePreferences';
import { useEffect, useState } from 'react';
import StudioNav from '../../components/StudioNav';
import { ServiceCases, type Ticket } from '../../components/ServiceCases';
import { api } from '../../lib/api';
export default function Support() {
  const {t}=useWorkspace();
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
        <h1>{t("Assistance clients","Customer support")}</h1>
        <p>{t("Accès support uniquement. Aucune action sur les prix, crédits, paiements ou comptes.","Support staff only. Prices, credits, payments and accounts cannot be changed here.")}</p>
        {err ? <p role="alert">{err}</p> : <ServiceCases items={rows} mode="support" reload={load} />}
      </main>
    </div>
  );
}
