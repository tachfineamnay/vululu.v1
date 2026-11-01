'use client';

import { useState, type FormEvent } from 'react';
import BarChart from '../../../components/admin/BarChart';
import ErrorState from '../../../components/admin/ErrorState';
import FlagBadge from '../../../components/admin/FlagBadge';
import { SelectField, TextField } from '../../../components/admin/Fields';
import LoadingState from '../../../components/admin/LoadingState';
import MetricCard from '../../../components/admin/MetricCard';
import PageHeader from '../../../components/admin/PageHeader';
import Pagination from '../../../components/admin/Pagination';
import SectionCard from '../../../components/admin/SectionCard';
import { useAdminResource } from '../../../components/admin/useAdminResource';
import {
  adminApi,
  formatCents,
  formatDateTime,
  formatNumber,
  shortId
} from '../../../lib/admin';

type Filters = {
  provider: string;
  from: string;
  to: string;
};

const EMPTY_FILTERS: Filters = { provider: '', from: '', to: '' };

export default function AdminCostsPage() {
  const pageSize = 25;
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);

  const resource = useAdminResource(
    () =>
      adminApi.costs({
        page,
        pageSize,
        provider: filters.provider.length > 0 ? filters.provider : undefined,
        from: filters.from.length > 0 ? filters.from + 'T00:00:00.000Z' : undefined,
        to: filters.to.length > 0 ? filters.to + 'T23:59:59.999Z' : undefined
      }),
    'costs:' + JSON.stringify(filters) + ':' + page
  );

  const data = resource.data;

  const uniqueProviders = Array.from(
    new Set(data ? data.byProvider.map((entry) => entry.provider) : [])
  );
  const providerSelectOptions = [{ value: '', label: 'Tous les providers' }].concat(
    uniqueProviders.map((provider) => ({ value: provider, label: provider }))
  );

  function updateField(field: keyof Filters, value: string) {
    setDraft((previous) => ({ ...previous, [field]: value }));
  }

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilters({ provider: draft.provider, from: draft.from, to: draft.to });
    setPage(1);
  }

  function resetFilters() {
    setDraft(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }

  return (
    <div className="admin-page">
      <PageHeader
        eyebrow="Administration"
        title="Couts"
        description="Evenements de cout enregistres par le routeur."
        actions={
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={resource.reload}
            disabled={resource.loading}
          >
            Actualiser
          </button>
        }
      />

      <div className="admin-banner admin-banner--danger" role="alert">
        <strong>COUTS MOCK</strong>
        <span>
          Providers mock uniquement : aucun cout fournisseur reel n est engage ni facture. Les montants
          servent exclusivement a tester les budgets et le routage.
        </span>
        <FlagBadge status="MOCK" />
      </div>

      {resource.loading && !data ? <LoadingState label="Chargement des couts..." /> : null}
      {resource.error ? <ErrorState message={resource.error} onRetry={resource.reload} /> : null}

      {data ? (
        <div className="admin-sections">
          <div className="admin-metric-grid">
            <MetricCard
              label="Total"
              value={formatCents(data.totalCents)}
              badge={<FlagBadge status="MOCK" />}
              hint={formatNumber(data.totalEvents) + ' evenement(s)'}
            />
            <MetricCard
              label="Providers"
              value={formatNumber(data.byProvider.length)}
              hint="Providers ayant emis un cout"
            />
            <MetricCard
              label="Evenements affiches"
              value={formatNumber(data.items.length)}
              hint={'Page ' + data.page + ' / ' + data.totalPages}
            />
            <MetricCard label="Mode" value={data.mode} badge={<FlagBadge status="MOCK" />} hint="Aucune facturation reelle" />
          </div>

          <SectionCard title="Repartition par provider" description="Montants cumules en cents.">
            <BarChart
              title="Couts par provider (cents)"
              data={data.byProvider.map((entry) => ({ label: entry.provider, value: entry.cents }))}
              tone="accent"
              emptyLabel="Aucun cout enregistre."
            />
          </SectionCard>

          <SectionCard title="Filtres" description="Provider et plage de dates (UTC).">
            <form className="admin-form" onSubmit={submitFilters}>
              <div className="admin-form-grid">
                <SelectField
                  id="costs-provider"
                  label="Provider"
                  value={draft.provider}
                  onChange={(value) => updateField('provider', value)}
                  options={providerSelectOptions}
                />
                <TextField
                  id="costs-from"
                  label="Du (UTC)"
                  type="date"
                  value={draft.from}
                  onChange={(value) => updateField('from', value)}
                />
                <TextField
                  id="costs-to"
                  label="Au (UTC)"
                  type="date"
                  value={draft.to}
                  onChange={(value) => updateField('to', value)}
                />
              </div>
              <div className="admin-actions">
                <button type="submit" className="btn btn-primary">
                  Filtrer
                </button>
                <button type="button" className="btn btn-ghost" onClick={resetFilters}>
                  Reinitialiser
                </button>
              </div>
            </form>
          </SectionCard>

          <SectionCard
            title="Evenements de cout"
            description="Chaque evenement est rattache a un provider mock."
            actions={<span className="admin-meta">{formatNumber(data.total)} evenement(s)</span>}
          >
            {data.items.length === 0 ? (
              <p className="admin-empty">Aucun evenement de cout pour ces filtres.</p>
            ) : (
              <>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Provider</th>
                        <th>Modele</th>
                        <th>Projet</th>
                        <th>Run</th>
                        <th>Unites</th>
                        <th>Montant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((event) => (
                        <tr key={event.id}>
                          <td className="admin-nowrap">{formatDateTime(event.createdAt)}</td>
                          <td className="admin-mono">{event.provider}</td>
                          <td className="admin-mono">{event.model ?? '-'}</td>
                          <td>{event.projectTitle ?? (event.projectId ? shortId(event.projectId, 10) : '-')}</td>
                          <td className="admin-mono" title={event.jobRunId ?? undefined}>
                            {shortId(event.jobRunId, 10)}
                          </td>
                          <td>{event.units}</td>
                          <td className="admin-nowrap">{formatCents(event.amountCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={data.page}
                  totalPages={data.totalPages}
                  total={data.total}
                  pageSize={data.pageSize}
                  onPageChange={setPage}
                  disabled={resource.loading}
                />
              </>
            )}
          </SectionCard>
        </div>
      ) : null}
    </div>
  );
}
