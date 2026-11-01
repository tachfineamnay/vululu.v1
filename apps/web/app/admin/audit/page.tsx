'use client';

import { useState, type FormEvent } from 'react';
import ErrorState from '../../../components/admin/ErrorState';
import { TextField } from '../../../components/admin/Fields';
import LoadingState from '../../../components/admin/LoadingState';
import PageHeader from '../../../components/admin/PageHeader';
import Pagination from '../../../components/admin/Pagination';
import SectionCard from '../../../components/admin/SectionCard';
import { useAdminResource } from '../../../components/admin/useAdminResource';
import { adminApi, formatJson, shortId } from '../../../lib/admin';

type Filters = {
  action: string;
  actorId: string;
  targetType: string;
  from: string;
  to: string;
};

const EMPTY_FILTERS: Filters = { action: '', actorId: '', targetType: '', from: '', to: '' };

export default function AdminAuditPage() {
  const pageSize = 25;
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);

  const resource = useAdminResource(
    () =>
      adminApi.audit({
        page,
        pageSize,
        action: filters.action.length > 0 ? filters.action : undefined,
        actorId: filters.actorId.length > 0 ? filters.actorId : undefined,
        targetType: filters.targetType.length > 0 ? filters.targetType : undefined,
        from: filters.from.length > 0 ? filters.from + 'T00:00:00.000Z' : undefined,
        to: filters.to.length > 0 ? filters.to + 'T23:59:59.999Z' : undefined
      }),
    'audit:' + JSON.stringify(filters) + ':' + page
  );

  function updateField(field: keyof Filters, value: string) {
    setDraft((previous) => ({ ...previous, [field]: value }));
  }

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilters({
      action: draft.action.trim(),
      actorId: draft.actorId.trim(),
      targetType: draft.targetType.trim(),
      from: draft.from,
      to: draft.to
    });
    setPage(1);
  }

  function resetFilters() {
    setDraft(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }

  const data = resource.data;

  return (
    <div className="admin-page">
      <PageHeader
        eyebrow="Administration"
        title="Audit"
        description="Journal des evenements d audit. Dates filtrees en UTC, affichage ISO."
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

      <SectionCard title="Filtres" description="Action, acteur, type de cible et plage de dates (UTC).">
        <form className="admin-form" onSubmit={submitFilters}>
          <div className="admin-form-grid">
            <TextField
              id="audit-action"
              label="Action"
              value={draft.action}
              onChange={(value) => updateField('action', value)}
              placeholder="invitation.created"
            />
            <TextField
              id="audit-actor"
              label="Acteur (ID)"
              value={draft.actorId}
              onChange={(value) => updateField('actorId', value)}
              placeholder="identifiant utilisateur"
            />
            <TextField
              id="audit-target-type"
              label="Type de cible"
              value={draft.targetType}
              onChange={(value) => updateField('targetType', value)}
              placeholder="invitation, user, session..."
            />
            <TextField
              id="audit-from"
              label="Du (UTC)"
              type="date"
              value={draft.from}
              onChange={(value) => updateField('from', value)}
            />
            <TextField
              id="audit-to"
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
        title="Evenements"
        description="Pagination serveur. Details metadata depliables."
        actions={data ? <span className="admin-meta">{data.total} evenement(s)</span> : null}
      >
        {resource.loading && !data ? <LoadingState label="Chargement de l audit..." /> : null}
        {resource.error ? <ErrorState message={resource.error} onRetry={resource.reload} /> : null}
        {data ? (
          data.items.length === 0 ? (
            <p className="admin-empty">Aucun evenement ne correspond a ces filtres.</p>
          ) : (
            <>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Date (ISO)</th>
                      <th>Action</th>
                      <th>Acteur</th>
                      <th>Cible</th>
                      <th>Trace</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((event) => (
                      <tr key={event.id}>
                        <td className="admin-nowrap admin-mono">{event.createdAt}</td>
                        <td className="admin-mono">{event.action}</td>
                        <td className="admin-mono" title={event.actorId ?? undefined}>
                          {event.actorId ? shortId(event.actorId, 12) : 'systeme'}
                        </td>
                        <td>
                          <span className="admin-mono">
                            {event.targetType}
                            {event.targetId ? ':' + shortId(event.targetId, 10) : ''}
                          </span>
                        </td>
                        <td className="admin-mono" title={event.traceId ?? undefined}>
                          {event.traceId ? shortId(event.traceId, 10) : '-'}
                        </td>
                        <td>
                          <details className="admin-details">
                            <summary>Voir</summary>
                            <div className="admin-details-body">
                              <p className="admin-meta">
                                requestId : <span className="admin-mono">{event.requestId ?? '-'}</span>
                              </p>
                              <pre className="admin-pre">{formatJson(event.metadata)}</pre>
                            </div>
                          </details>
                        </td>
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
          )
        ) : null}
      </SectionCard>
    </div>
  );
}
