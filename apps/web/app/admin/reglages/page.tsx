'use client';

import ErrorState from '../../../components/admin/ErrorState';
import FlagBadge from '../../../components/admin/FlagBadge';
import LoadingState from '../../../components/admin/LoadingState';
import MetricCard from '../../../components/admin/MetricCard';
import PageHeader from '../../../components/admin/PageHeader';
import SectionCard from '../../../components/admin/SectionCard';
import { useAdminResource } from '../../../components/admin/useAdminResource';
import { adminApi, formatCents, formatDateTime, formatNumber } from '../../../lib/admin';

const NOT_CONNECTED_KEYS: string[] = ['mcp', 'audio', 'campaigns', 'assets', 'mfa'];

export default function AdminSettingsPage() {
  const resource = useAdminResource(() => adminApi.runtime(), 'runtime');
  const data = resource.data;
  const notConnected = data
    ? data.flags.filter((flag) => NOT_CONNECTED_KEYS.includes(flag.key))
    : [];

  return (
    <div className="admin-page">
      <PageHeader
        eyebrow="Administration"
        title="Reglages"
        description="Configuration runtime en lecture seule. Aucun secret n est affiche."
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

      {resource.loading && !data ? <LoadingState label="Chargement de la configuration..." /> : null}
      {resource.error ? <ErrorState message={resource.error} onRetry={resource.reload} /> : null}

      {data ? (
        <div className="admin-sections">
          <div className="admin-metric-grid">
            <MetricCard
              label="Orchestrateur"
              value={data.orchestratorMode === 'hatchet' ? 'Hatchet' : 'Local'}
              tone={data.orchestratorMode === 'hatchet' ? 'default' : 'warning'}
              hint={data.orchestratorMode === 'hatchet' ? 'Mode durable configure' : 'Mode local in-process non durable'}
            />
            <MetricCard
              label="Stockage"
              value={data.storageBackend}
              hint={data.storageBackend === 's3' ? 'Backend S3' : 'Backend local filesystem'}
            />
            <MetricCard
              label="TLS S3 requis"
              value={data.s3TlsRequired ? 'Oui' : 'Non'}
              tone={data.s3TlsRequired ? 'default' : 'warning'}
              hint="Variable S3_REQUIRE_TLS"
            />
            <MetricCard
              label="Session TTL"
              value={data.sessionTtlHours + ' h'}
              hint={'Invitations : ' + data.invitationTtlHours + ' h'}
            />
            <MetricCard
              label="Budget durable"
              value={
                data.budget.durableBudgetCents !== null
                  ? formatCents(data.budget.durableBudgetCents)
                  : 'Non configure'
              }
              hint="DURABLE_BUDGET_CENTS"
            />
            <MetricCard
              label="Cout max par run"
              value={
                data.budget.maxRunCostCents !== null
                  ? formatCents(data.budget.maxRunCostCents)
                  : 'Non configure'
              }
              hint="MAX_RUN_COST_CENTS"
            />
          </div>

          <div className="admin-grid-2">
            <SectionCard title="Environnement" description="Versions et variables non sensibles.">
              <div className="admin-kv">
                <div>
                  <span>APP_ENV</span>
                  <strong className="admin-mono">{data.appEnv}</strong>
                </div>
                <div>
                  <span>Node</span>
                  <strong className="admin-mono">{data.versions.node}</strong>
                </div>
                <div>
                  <span>Prisma</span>
                  <strong className="admin-mono">{data.versions.prisma}</strong>
                </div>
                <div>
                  <span>Genere le</span>
                  <strong>{formatDateTime(data.generatedAt)}</strong>
                </div>
                <div>
                  <span>Drapeaux</span>
                  <strong>{formatNumber(data.flags.length)}</strong>
                </div>
                <div>
                  <span>Secrets</span>
                  <strong>Aucun affiche</strong>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Fonctions non connectees"
              description="Listees sans faux bouton : ces fonctionnalites ne sont pas implementees."
            >
              {notConnected.length === 0 ? (
                <p className="admin-empty">Aucune fonction non connectee signalee.</p>
              ) : (
                <ul className="admin-flag-list">
                  {notConnected.map((flag) => (
                    <li className="admin-flag" key={flag.key}>
                      <div className="admin-flag-head">
                        <strong>{flag.label}</strong>
                        <FlagBadge status="NOT_CONNECTED" />
                      </div>
                      <p className="admin-meta">{flag.detail}</p>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>

          <SectionCard
            title="Drapeaux de connexion"
            description="CONNECTED = operationnel, MOCK = simule, NOT_CONNECTED = absent."
          >
            <div className="admin-flag-grid">
              {data.flags.map((flag) => (
                <div className="admin-flag" key={flag.key}>
                  <div className="admin-flag-head">
                    <strong>{flag.label}</strong>
                    <FlagBadge status={flag.status} />
                  </div>
                  <p className="admin-meta admin-mono">{flag.key}</p>
                  <p className="admin-meta">{flag.detail}</p>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      ) : null}
    </div>
  );
}
