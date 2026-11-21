'use client';
import { useWorkspace } from '../../components/WorkspacePreferences';
import { useEffect, useMemo, useState } from 'react';
import StudioNav from '../../components/StudioNav';
import { ServiceCases, type Ticket } from '../../components/ServiceCases';
import { api } from '../../lib/api';
import Link from 'next/link';

const KIND_FILTERS = [
  { value: '', label: 'Tous les types' },
  { value: 'SUPPORT', label: 'Assistance' },
  { value: 'BETA_FEEDBACK', label: 'Retour bêta' }
];

// P12-08 — l'état DB est la seule valeur filtrable côté serveur (OPEN / IN_PROGRESS / CLOSED).
// Les états dérivés (en attente, répondu) restent affichés en badge mais ne pilotent plus les totaux.
const STATUS_FILTERS: Array<{ value: '' | 'OPEN' | 'IN_PROGRESS' | 'CLOSED'; label: string }> = [
  { value: '', label: 'Tous les états serveur' },
  { value: 'OPEN', label: 'Ouvert' },
  { value: 'IN_PROGRESS', label: 'En cours' },
  { value: 'CLOSED', label: 'Clôturé' }
];
type SupportPage = {
  items: Ticket[];
  total: number;
  nextCursor: string | null;
  pageSize: number;
  entryLimit: number;
  counts: Record<string, number>;
  filters: { kind: string | null; status: string | null; q: string | null };
};

export default function Support() {
  const { t } = useWorkspace();
  const [rows, list] = useState<Ticket[]>([]),
    [err, fail] = useState('');
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState<'' | 'OPEN' | 'IN_PROGRESS' | 'CLOSED'>('');
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [entryLimit, setEntryLimit] = useState(20);
  const [busy, setBusy] = useState(false);

  function endpoint(cursor: string | null) {
    const params = new URLSearchParams();
    if (kind) params.set('kind', kind);
    if (status) params.set('status', status);
    if (search.trim()) params.set('q', search.trim());
    if (cursor) params.set('cursor', cursor);
    return '/api/support/cases' + (params.toString() ? '?' + params.toString() : '');
  }

  // P12-08 — filtres, totaux et page viennent du serveur : plus de filtrage local qui
  // contredirait les compteurs, et plus de chargement de tous les historiques.
  async function load() {
    setBusy(true);
    try {
      const page = await api<SupportPage>(endpoint(null));
      list(page.items);
      setTotal(page.total);
      setCounts(page.counts);
      setNextCursor(page.nextCursor);
      setEntryLimit(page.entryLimit);
      fail('');
    } finally {
      setBusy(false);
    }
  }

  async function loadMore() {
    if (!nextCursor) return;
    setBusy(true);
    try {
      const page = await api<SupportPage>(endpoint(nextCursor));
      list((previous) => [...previous, ...page.items]);
      setNextCursor(page.nextCursor);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load().catch((e) => fail(e.message));
  }, []);

  const beta = useMemo(
    () => rows.filter((ticket) => ticket.kind === 'BETA_FEEDBACK').length,
    [rows]
  );

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
              État serveur
              <select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value as '' | 'OPEN' | 'IN_PROGRESS' | 'CLOSED');
                  void load().catch((e) => fail(e.message));
                }}
              >
                {STATUS_FILTERS.map((option) => (
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
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void load().catch((e) => fail(e.message));
                  }
                }}
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
          <p className="muted" data-testid="support-totals">
            {t('Dossiers correspondants', 'Matching cases')} : {total} · {t('affichés', 'shown')} : {rows.length} ·{' '}
            {t('ouverts', 'open')} : {counts.OPEN ?? 0} · {t('en cours', 'in progress')} : {counts.IN_PROGRESS ?? 0} ·{' '}
            {t('clôturés', 'closed')} : {counts.CLOSED ?? 0} · {t('retours bêta affichés', 'beta feedback shown')} :{' '}
            {beta}
          </p>
          <p className="muted">
            {t(
              'Chaque dossier n’affiche que ses ' + entryLimit + ' messages les plus récents ; le total réel reste compté côté serveur.',
              'Each case shows only its ' + entryLimit + ' most recent messages; the real total stays counted server-side.'
            )}
          </p>
          <p className="muted">
            {t(
              'Aucune assignation nominative n’est modélisée : la file est partagée et chaque réponse est horodatée dans le dossier. Les pièces jointes ne sont pas prises en charge.',
              'No named assignment is modelled: the queue is shared and every reply is timestamped in the case. Attachments are not supported.'
            )}
          </p>
        </section>

        {err ? <p role="alert">{err}</p> : <ServiceCases items={rows} mode="support" reload={load} />}
        {nextCursor ? (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => void loadMore().catch((e) => fail(e.message))}
          >
            {busy ? t('Chargement…', 'Loading…') : t('Charger les dossiers suivants', 'Load more cases')}
          </button>
        ) : null}
        <Link href="/account#assistance">
          {t('Ouvrir ou suivre ma demande depuis Mon compte', 'Open or follow my case in My account')}
        </Link>
      </main>
    </div>
  );
}
