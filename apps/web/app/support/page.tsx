'use client';
import { useWorkspace } from '../../components/WorkspacePreferences';
import { useEffect, useMemo, useState } from 'react';
import StudioNav from '../../components/StudioNav';
import {
  ServiceCases,
  ticketState,
  TICKET_STATE_LABELS,
  type Ticket,
  type TicketState
} from '../../components/ServiceCases';
import { api } from '../../lib/api';
import Link from 'next/link';

const KIND_FILTERS = [
  { value: '', label: 'Tous les types' },
  { value: 'SUPPORT', label: 'Assistance' },
  { value: 'BETA_FEEDBACK', label: 'Retour bêta' }
];

const STATE_ORDER: TicketState[] = ['awaiting_support', 'answered', 'in_progress', 'open', 'closed'];
const STATE_FILTERS: Array<{ value: '' | TicketState; label: string }> = [
  { value: '', label: 'Tous les états' },
  ...STATE_ORDER.map((value) => ({ value, label: TICKET_STATE_LABELS[value] }))
];

export default function Support() {
  const { t } = useWorkspace();
  const [rows, list] = useState<Ticket[]>([]),
    [err, fail] = useState('');
  const [kind, setKind] = useState('');
  const [state, setState] = useState<'' | TicketState>('');
  const [search, setSearch] = useState('');

  async function load() {
    list(await api<Ticket[]>('/api/support/cases'));
  }

  useEffect(() => {
    load().catch((e) => fail(e.message));
  }, []);

  const counts = useMemo(() => {
    const base: Record<TicketState, number> = {
      open: 0,
      awaiting_support: 0,
      answered: 0,
      in_progress: 0,
      closed: 0
    };
    let beta = 0;
    for (const ticket of rows) {
      base[ticketState(ticket)] += 1;
      if (ticket.kind === 'BETA_FEEDBACK') beta += 1;
    }
    return { ...base, beta };
  }, [rows]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((ticket) => {
      if (kind && ticket.kind !== kind) return false;
      if (state && ticketState(ticket) !== state) return false;
      if (!query) return true;
      const haystack = [
        ticket.subject,
        ticket.id,
        ticket.user?.email ?? '',
        ticket.user?.name ?? '',
        ticket.userId
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [rows, kind, state, search]);

  return (
    <div className="shell" data-vululu-theme="blue">
      <StudioNav />
      <main className="page stack">
        <h1>{t('Assistance clients', 'Customer support')}</h1>
        <p>
          {t(
            'Accès support uniquement. Aucune action sur les prix, crédits, paiements ou comptes.',
            'Support staff only. Prices, credits, payments and accounts cannot be changed here.'
          )}
        </p>
        <p>
          {t(
            'Les retours de bêta (bugs, suggestions) arrivent dans cette même file, étiquetés « Retour bêta », et restent distincts des incidents de facturation.',
            'Beta feedback (bugs, suggestions) arrives in this same queue, labelled “Beta feedback”, and stays distinct from billing incidents.'
          )}
        </p>

        <section className="card stack" aria-label="Filtres des dossiers">
          <div className="stack" role="search">
            <label>
              Type de dossier
              <select value={kind} onChange={(event) => setKind(event.target.value)}>
                {KIND_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              État
              <select value={state} onChange={(event) => setState(event.target.value as '' | TicketState)}>
                {STATE_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Recherche
              <input
                type="search"
                value={search}
                maxLength={120}
                placeholder="Objet, email ou référence"
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <button
              type="button"
              onClick={() => {
                fail('');
                void load().catch((e) => fail(e.message));
              }}
            >
              Actualiser
            </button>
          </div>
          <p className="muted">
            Dossiers : {rows.length} · En attente d’assistance : {counts.awaiting_support} · Répondus :{' '}
            {counts.answered} · En cours : {counts.in_progress} · Clôturés : {counts.closed} · Retours bêta :{' '}
            {counts.beta}
          </p>
          <p className="muted">
            {t(
              'Aucune assignation nominative n’est modélisée : la file est partagée et chaque réponse est horodatée dans le dossier. Les pièces jointes ne sont pas prises en charge.',
              'No named assignment is modelled: the queue is shared and every reply is timestamped in the case. Attachments are not supported.'
            )}
          </p>
        </section>

        {err ? <p role="alert">{err}</p> : <ServiceCases items={visible} mode="support" reload={load} />}
        <Link href="/account#assistance">
          {t('Ouvrir ou suivre ma demande depuis Mon compte', 'Open or follow my case in My account')}
        </Link>
      </main>
    </div>
  );
}
