'use client';

import BarChart from '../../components/admin/BarChart';
import ErrorState from '../../components/admin/ErrorState';
import FlagBadge from '../../components/admin/FlagBadge';
import LoadingState from '../../components/admin/LoadingState';
import MetricCard from '../../components/admin/MetricCard';
import PageHeader from '../../components/admin/PageHeader';
import SectionCard from '../../components/admin/SectionCard';
import StatusBadge from '../../components/admin/StatusBadge';
import { useAdminResource } from '../../components/admin/useAdminResource';
import { adminApi, countEntries, formatCents, formatDateTime, formatNumber } from '../../lib/admin';

const ERROR_SOURCE_LABELS: Record<string, string> = {
  job_run: 'Run',
  step_run: 'Etape',
  outbox: 'Outbox'
};

export default function AdminOverviewPage() {
  const resource = useAdminResource(() => adminApi.overview(), 'overview');
  const data = resource.data;
  const stepsTotal = data
    ? Object.values(data.stepsByStatus).reduce((total, value) => total + value, 0)
    : 0;

  return (
    <div className="admin-page">
      <PageHeader
        eyebrow="Administration"
        title="Vue d'ensemble"
        description={
          data
            ? 'Etat consolide genere le ' + formatDateTime(data.generatedAt) + '.'
            : 'Etat consolide de la plateforme Vululu V1.'
        }
        actions={
          <button
            type="button"
            className="btn btn-secondary"
            onClick={resource.reload}
            disabled={resource.loading}
          >
            {resource.loading ? 'Actualisation...' : 'Actualiser'}
          </button>
        }
      />

      {resource.loading && !data ? <LoadingState label="Chargement de la vue d'ensemble..." /> : null}
      {resource.error ? <ErrorState message={resource.error} onRetry={resource.reload} /> : null}

      {data ? (
        <div className="admin-sections">
          {data.database === 'error' ? (
            <div className="admin-banner admin-banner--danger" role="alert">
              <strong>Base de donnees en erreur.</strong>
              <span>
                Les compteurs peuvent etre indisponibles. Verifiez PostgreSQL puis actualisez la vue.
              </span>
            </div>
          ) : null}

          <div className="admin-metric-grid">
            <MetricCard
              label="Utilisateurs"
              value={formatNumber(data.counts.users)}
              hint={
                formatNumber(data.counts.superAdmins) +
                ' super admin - ' +
                formatNumber(data.counts.pendingInvitations) +
                ' invitation(s) en attente'
              }
            />
            <MetricCard
              label="Projets"
              value={formatNumber(data.counts.projects)}
              hint={formatNumber(data.counts.contexts) + ' contexte(s) de marque'}
            />
            <MetricCard
              label="Runs"
              value={formatNumber(data.counts.jobRuns)}
              hint={formatNumber(stepsTotal) + ' etape(s) suivie(s)'}
            />
            <MetricCard
              label="Runs en echec"
              value={formatNumber(data.counts.failedRuns)}
              tone={data.counts.failedRuns > 0 ? 'danger' : 'default'}
              hint={formatNumber(data.counts.rbacDenied24h) + ' refus RBAC sur 24 h'}
            />
            <MetricCard
              label="Workers actifs"
              value={data.workers.active + ' / ' + data.workers.total}
              hint={formatNumber(data.workers.stale) + ' worker(s) stale'}
            />
            <MetricCard
              label="Couts"
              value={formatCents(data.counts.costCents)}
              badge={<FlagBadge status="MOCK" />}
              hint={formatNumber(data.counts.costEvents) + ' evenement(s) de cout mock'}
            />
          </div>

          <div className="admin-grid-2">
            <SectionCard title="Sante de la plateforme" description="Services internes et modes actifs.">
              <div className="admin-kv">
                <div>
                  <span>Base de donnees</span>
                  <strong>
                    <StatusBadge status={data.database} />
                  </strong>
                </div>
                <div>
                  <span>Stockage</span>
                  <strong>
                    {data.storage.backend}{' '}
                    <StatusBadge status={data.storage.ok ? 'ok' : 'error'} />
                  </strong>
                  <small className="admin-meta">{data.storage.detail}</small>
                </div>
                <div>
                  <span>Orchestrateur</span>
                  <strong>{data.orchestrator.mode === 'hatchet' ? 'Hatchet' : 'Local'}</strong>
                  <small className="admin-meta">{data.orchestrator.detail}</small>
                </div>
                <div>
                  <span>Providers</span>
                  <strong>
                    <FlagBadge status={data.providers.mode === 'REAL' ? 'CONNECTED' : 'MOCK'} />
                  </strong>
                  <small className="admin-meta">{data.providers.detail}</small>
                </div>
                <div>
                  <span>Postiz</span>
                  <strong>
                    <FlagBadge status={data.postiz.mode === 'REAL' ? 'CONNECTED' : 'MOCK'} />
                  </strong>
                  <small className="admin-meta">{data.postiz.detail}</small>
                </div>
                <div>
                  <span>Audit 24 h</span>
                  <strong>{formatNumber(data.counts.auditEvents24h)}</strong>
                  <small className="admin-meta">{formatNumber(data.counts.invitations)} invitation(s) au total</small>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Drapeaux de connexion"
              description="CONNECTED = operationnel, MOCK = simule, NOT_CONNECTED = absent."
            >
              <div className="admin-flag-list">
                {data.flags.map((flag) => (
                  <div className="admin-flag" key={flag.key}>
                    <div className="admin-flag-head">
                      <strong>{flag.label}</strong>
                      <FlagBadge status={flag.status} />
                    </div>
                    <p className="admin-meta">{flag.detail}</p>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>

          <div className="admin-grid-2">
            <BarChart title="Runs par statut" data={countEntries(data.runsByStatus)} tone="primary" />
            <BarChart
              title="Artefacts par etat"
              data={countEntries(data.artifactsByState)}
              tone="accent"
              emptyLabel="Aucun artefact enregistre."
            />
          </div>

          <SectionCard
            title="Erreurs recentes"
            description="Derniers echecs consolides (runs, etapes, outbox)."
            actions={<span className="admin-meta">{data.recentErrors.length} entree(s)</span>}
          >
            {data.recentErrors.length === 0 ? (
              <p className="admin-empty">Aucune erreur recente.</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th>Statut</th>
                      <th>Message</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentErrors.map((item) => (
                      <tr key={item.source + ':' + item.id}>
                        <td className="admin-nowrap">
                          {ERROR_SOURCE_LABELS[item.source] ?? item.source}
                        </td>
                        <td>
                          <StatusBadge status={item.status} />
                        </td>
                        <td className="admin-cell-wrap">{item.error}</td>
                        <td className="admin-nowrap">{formatDateTime(item.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>
      ) : null}
    </div>
  );
}
