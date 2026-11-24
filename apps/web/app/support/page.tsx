'use client';
import { useWorkspace } from '../../components/WorkspacePreferences';
import { useEffect, useMemo, useRef, useState } from 'react';
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

type SupportFilters = {
  kind: string;
  status: '' | 'OPEN' | 'IN_PROGRESS' | 'CLOSED';
  search: string;
};

const EMPTY_FILTERS: SupportFilters = { kind: '', status: '', search: '' };

type SupportPage = {
  items: Ticket[];
  total: number;
  nextCursor: string | null;
  pageSize: number;
  entryLimit: number;
  counts: Record<string, number>;
  filters: { kind: string | null; status: string | null; q: string | null };
};

function supportEndpoint(filters: SupportFilters, cursor: string | null) {
  const params = new URLSearchParams();
  if (filters.kind) params.set('kind', filters.kind);
  if (filters.status) params.set('status', filters.status);
  if (filters.search.trim()) params.set('q', filters.search.trim());
  if (cursor) params.set('cursor', cursor);
  return '/api/support/cases' + (params.toString() ? '?' + params.toString() : '');
}

export default function Support() {
  const { t } = useWorkspace();
  const [rows, list] = useState<Ticket[]>([]),
    [err, fail] = useState('');
  const [filters, setFilters] = useState<SupportFilters>(EMPTY_FILTERS);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [entryLimit, setEntryLimit] = useState(20);
  const [busy, setBusy] = useState(false);
  const requestSeq = useRef(0);
  const filtersRef = useRef<SupportFilters>(filters);
  filtersRef.current = filters;

  // P12-08 — filtres, totaux et page viennent du serveur : jamais de closure obsolète
  // ni de filtrage local qui contredirait les compteurs serveur.
  async function load(override?: SupportFilters) {
    const active = override ?? filtersRef.current;
    const seq = ++requestSeq.current;
    setBusy(true);
    setNextCursor(null);
    try {
      const page = await api<SupportPage>(supportEndpoint(active, null));
      if (seq !== requestSeq.current) return;
      list(page.items);
      setTotal(page.total);
      setCounts(page.counts);
      setNextCursor(page.nextCursor);
      setEntryLimit(page.entryLimit);
      fail('');
    } catch (error) {
      if (seq !== requestSeq.current) return;
      fail(error instanceof Error ? error.message : 'Erreur lors du chargement des dossiers.');
    } finally {
      if (seq === requestSeq.current) {
        setBusy(false);
      }
    }
  }

  async function loadMore() {
    if (!nextCursor || busy) return;
    const active = filtersRef.current;
    const seq = ++requestSeq.current;
    setBusy(true);
    try {
      const page = await api<SupportPage>(supportEndpoint(active, nextCursor));
      if (seq !== requestSeq.current) return;
      list((previous) => {
        const seen = new Set(previous.map((item) => item.id));
        const appended = page.items.filter((item) => !seen.has(item.id));
        return [...previous, ...appended];
      });
      setTotal(page.total);
      setCounts(page.counts);
      setNextCursor(page.nextCursor);
      fail('');
    } catch (error) {
      if (seq !== requestSeq.current) return;
      fail(error instanceof Error ? error.message : 'Erreur lors du chargement des dossiers suivants.');
    } finally {
      if (seq === requestSeq.current) {
        setBusy(false);
      }
    }
  }

  function applyFilterChange(next: SupportFilters) {
    setFilters(next);
    filtersRef.current = next;
    void load(next);
  }

  useEffect(() => {
    void load(EMPTY_FILTERS);
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
          <form
            className="stack"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              void load(filters);
            }}
          >
            <label>
              Type de dossier
              <select
                value={filters.kind}
                onChange={(event) => applyFilterChange({ ...filters, kind: event.target.value })}
              >
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
                value={filters.status}
                onChange={(event) =>
                  applyFilterChange({
                    ...filters,
                    status: event.target.value as '' | 'OPEN' | 'IN_PROGRESS' | 'CLOSED'
                  })
                }
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
                value={filters.search}
                maxLength={120}
                placeholder="Objet, email ou référence"
                onChange={(event) => setFilters((previous) => ({ ...previous, search: event.target.value }))}
              />
            </label>
            <div className="admin-actions">
              <button type="submit" disabled={busy}>
                {busy ? t('Chargement…', 'Loading…') : t('Actualiser', 'Refresh')}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => applyFilterChange(EMPTY_FILTERS)}
              >
                {t('Réinitialiser', 'Reset')}
              </button>
            </div>
          </form>
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

        {err ? <p role="alert">{err}</p> : null}
        <ServiceCases items={rows} mode="support" reload={() => load(filtersRef.current)} />
        {nextCursor ? (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => void loadMore()}
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
