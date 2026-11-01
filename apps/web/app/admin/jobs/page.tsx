'use client';

import { useState } from 'react';
import ErrorState from '../../../components/admin/ErrorState';
import { CheckboxField, SelectField, TextField } from '../../../components/admin/Fields';
import LoadingState from '../../../components/admin/LoadingState';
import MetricCard from '../../../components/admin/MetricCard';
import PageHeader from '../../../components/admin/PageHeader';
import Pagination from '../../../components/admin/Pagination';
import SectionCard from '../../../components/admin/SectionCard';
import StatusBadge from '../../../components/admin/StatusBadge';
import { useAdminResource } from '../../../components/admin/useAdminResource';
import {
  adminApi,
  countSummary,
  errorMessage,
  formatDateTime,
  formatJson,
  formatNumber,
  JOB_RUN_STATUSES,
  shortId,
  statusLabel,
  type AdminRun,
  type AdminRunDetail,
  type ReconciliationReport
} from '../../../lib/admin';

const STATUS_OPTIONS = [{ value: '', label: 'Tous les statuts' }].concat(
  JOB_RUN_STATUSES.map((status) => ({ value: status, label: statusLabel(status) }))
);

function readInteger(value: string, min: number, max: number): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return null;
  }
  return parsed;
}

export default function AdminJobsPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const health = useAdminResource(() => adminApi.opsHealth(), 'ops-health');
  const snapshot = useAdminResource(() => adminApi.opsSnapshot(), 'ops-snapshot');
  const runs = useAdminResource(
    () => adminApi.runs({ page, pageSize, status: statusFilter.length > 0 ? statusFilter : undefined }),
    'runs:' + statusFilter + ':' + page
  );

  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const detail = useAdminResource(
    () =>
      selectedRunId
        ? adminApi.run(selectedRunId)
        : Promise.resolve<AdminRunDetail | null>(null),
    'run:' + (selectedRunId ?? 'none')
  );

  const [dryRun, setDryRun] = useState(true);
  const [staleSecondsDraft, setStaleSecondsDraft] = useState('300');
  const [stagedGraceDraft, setStagedGraceDraft] = useState('24');
  const [reconciling, setReconciling] = useState(false);
  const [reconcileError, setReconcileError] = useState('');
  const [reconcileResult, setReconcileResult] = useState<ReconciliationReport | null>(null);

  async function runReconcile() {
    const staleSeconds = readInteger(staleSecondsDraft, 0, 604800);
    const stagedGraceHours = readInteger(stagedGraceDraft, 0, 8760);
    if (staleSeconds === null) {
      setReconcileError('staleSeconds doit etre un entier entre 0 et 604800.');
      return;
    }
    if (stagedGraceHours === null) {
      setReconcileError('stagedGraceHours doit etre un entier entre 0 et 8760.');
      return;
    }
    setReconciling(true);
    setReconcileError('');
    try {
      const result = await adminApi.reconcile({ dryRun, staleSeconds, stagedGraceHours });
      setReconcileResult(result);
    } catch (error) {
      setReconcileError(errorMessage(error));
    } finally {
      setReconciling(false);
    }
  }

  const healthData = health.data;
  const snapshotData = snapshot.data;
  const runsData = runs.data;
  const detailData = detail.data;

  return (
    <div className="admin-page">
      <PageHeader
        eyebrow="Administration"
        title="Jobs"
        description="Runs, etapes, outbox et sante runtime. Aucune action de relance ou d annulation n est exposee ici."
        actions={
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              health.reload();
              snapshot.reload();
              runs.reload();
            }}
            disabled={runs.loading || health.loading || snapshot.loading}
          >
            Actualiser
          </button>
        }
      />

      <div className="admin-sections">
        <div className="admin-metric-grid">
          {health.loading && !healthData ? (
            <LoadingState label="Chargement de la sante..." />
          ) : null}
          {healthData ? (
            <>
              <MetricCard
                label="Statut ops"
                value={healthData.status === 'ok' ? 'OK' : 'Degrade'}
                tone={healthData.status === 'ok' ? 'default' : 'warning'}
                hint={'Genere le ' + formatDateTime(healthData.generatedAt)}
              />
              <MetricCard
                label="Workers actifs"
                value={formatNumber(healthData.workersActive)}
                hint="Heartbeat de moins de 30 s"
              />
              <MetricCard
                label="Outbox en attente"
                value={formatNumber(healthData.outboxPending)}
                tone={healthData.outboxPending > 50 ? 'warning' : 'default'}
                hint="pending + failed"
              />
              <MetricCard
                label="Base de donnees"
                value={healthData.database === 'ok' ? 'OK' : 'Erreur'}
                tone={healthData.database === 'ok' ? 'default' : 'danger'}
              />
            </>
          ) : null}
        </div>

        <SectionCard
          title="Snapshot operations"
          description="Compteurs internes et heartbeats workers."
          actions={
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={snapshot.reload}
              disabled={snapshot.loading}
            >
              Actualiser
            </button>
          }
        >
          {snapshot.loading && !snapshotData ? <LoadingState label="Chargement du snapshot..." /> : null}
          {snapshot.error ? <ErrorState message={snapshot.error} onRetry={snapshot.reload} /> : null}
          {snapshotData ? (
            <>
              <div className="admin-kv">
                <div>
                  <span>Runs</span>
                  <strong>{countSummary(snapshotData.jobRuns)}</strong>
                </div>
                <div>
                  <span>Etapes</span>
                  <strong>{countSummary(snapshotData.stepRuns)}</strong>
                </div>
                <div>
                  <span>Outbox</span>
                  <strong>{countSummary(snapshotData.outbox)}</strong>
                </div>
                <div>
                  <span>Artefacts</span>
                  <strong>{countSummary(snapshotData.artifacts)}</strong>
                </div>
              </div>
              <h3 className="admin-subhead">Workers</h3>
              {snapshotData.workers.length === 0 ? (
                <p className="admin-empty">Aucun worker enregistre.</p>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Nom</th>
                        <th>Statut</th>
                        <th>Derniere activite</th>
                        <th>Stale</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshotData.workers.map((worker) => (
                        <tr key={worker.id}>
                          <td>
                            {worker.name} <span className="admin-meta admin-mono">{shortId(worker.id, 8)}</span>
                          </td>
                          <td>{worker.status}</td>
                          <td className="admin-nowrap">{formatDateTime(worker.lastSeenAt)}</td>
                          <td>
                            <StatusBadge
                              status={worker.stale ? 'stale' : 'active'}
                              label={worker.stale ? 'Stale' : 'Actif'}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : null}
        </SectionCard>

        <SectionCard
          title="Runs"
          description="Filtrez par statut et ouvrez un run pour voir ses etapes, son outbox et son artefact."
        >
          <div className="admin-controls">
            <SelectField
              id="runs-status"
              label="Statut"
              value={statusFilter}
              onChange={(value) => {
                setStatusFilter(value);
                setPage(1);
              }}
              options={STATUS_OPTIONS}
            />
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={runs.reload}
              disabled={runs.loading}
            >
              Actualiser
            </button>
          </div>

          {runs.loading && !runsData ? <LoadingState label="Chargement des runs..." /> : null}
          {runs.error ? <ErrorState message={runs.error} onRetry={runs.reload} /> : null}
          {runsData ? (
            runsData.items.length === 0 ? (
              <p className="admin-empty">Aucun run pour ce filtre.</p>
            ) : (
              <>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Projet</th>
                        <th>Type</th>
                        <th>Statut</th>
                        <th>Etapes</th>
                        <th>Trace</th>
                        <th>Workflow</th>
                        <th>Erreur</th>
                        <th>Date</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {runsData.items.map((run: AdminRun) => (
                        <tr
                          key={run.id}
                          className="admin-row-click"
                          onClick={() => setSelectedRunId(run.id)}
                          title="Cliquer pour ouvrir le detail"
                        >
                          <td className="admin-mono admin-nowrap" title={run.id}>
                            {shortId(run.id, 10)}
                          </td>
                          <td>{run.projectTitle}</td>
                          <td className="admin-nowrap">{run.type}</td>
                          <td>
                            <StatusBadge status={run.status} />
                          </td>
                          <td className="admin-nowrap">
                            <span className={run.stepsFailed > 0 ? 'admin-text-danger' : undefined}>
                              {run.stepsFailed}/{run.stepsTotal}
                            </span>
                          </td>
                          <td className="admin-mono admin-nowrap" title={run.traceId ?? undefined}>
                            {shortId(run.traceId, 8)}
                          </td>
                          <td className="admin-mono admin-nowrap" title={run.workflowRunId ?? undefined}>
                            {shortId(run.workflowRunId, 8)}
                          </td>
                          <td className="admin-cell-wrap">
                            {run.error ? (
                              <span className="admin-text-danger" title={run.error}>
                                {run.error}
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="admin-nowrap">{formatDateTime(run.createdAt)}</td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-secondary btn-small"
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedRunId(run.id);
                              }}
                            >
                              Details
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={runsData.page}
                  totalPages={runsData.totalPages}
                  total={runsData.total}
                  pageSize={runsData.pageSize}
                  onPageChange={setPage}
                  disabled={runs.loading}
                />
              </>
            )
          ) : null}
        </SectionCard>

        {selectedRunId ? (
          <SectionCard
            title={'Detail du run ' + shortId(selectedRunId, 12)}
            description="Etapes, outbox et artefact figes pour ce run."
            actions={
              <button type="button" className="btn btn-ghost btn-small" onClick={() => setSelectedRunId(null)}>
                Fermer
              </button>
            }
          >
            {detail.loading && !detailData ? <LoadingState label="Chargement du run..." /> : null}
            {detail.error ? <ErrorState message={detail.error} onRetry={detail.reload} /> : null}
            {detailData ? (
              <div className="admin-sections">
                <div className="admin-kv">
                  <div>
                    <span>Projet</span>
                    <strong>{detailData.projectTitle}</strong>
                  </div>
                  <div>
                    <span>Type</span>
                    <strong>{detailData.type}</strong>
                  </div>
                  <div>
                    <span>Statut</span>
                    <strong>
                      <StatusBadge status={detailData.status} />
                    </strong>
                  </div>
                  <div>
                    <span>Orchestrateur</span>
                    <strong>{detailData.orchestrator ?? '-'}</strong>
                  </div>
                  <div>
                    <span>Workflow run</span>
                    <strong className="admin-mono">{detailData.workflowRunId ?? '-'}</strong>
                  </div>
                  <div>
                    <span>Trace</span>
                    <strong className="admin-mono">{detailData.traceId ?? '-'}</strong>
                  </div>
                  <div>
                    <span>Etape courante</span>
                    <strong>{detailData.currentStep ?? '-'}</strong>
                  </div>
                  <div>
                    <span>Progression</span>
                    <strong>{detailData.progress !== null ? detailData.progress + ' %' : '-'}</strong>
                  </div>
                  <div>
                    <span>Cree le</span>
                    <strong>{formatDateTime(detailData.createdAt)}</strong>
                  </div>
                  <div>
                    <span>Mis a jour</span>
                    <strong>{formatDateTime(detailData.updatedAt)}</strong>
                  </div>
                </div>

                {detailData.error ? (
                  <p className="admin-banner admin-banner--danger" role="alert">
                    {detailData.error}
                  </p>
                ) : null}

                <h3 className="admin-subhead">Etapes</h3>
                {detailData.steps.length === 0 ? (
                  <p className="admin-empty">Aucune etape enregistree.</p>
                ) : (
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Nom</th>
                          <th>Statut</th>
                          <th>Attempts</th>
                          <th>Debut</th>
                          <th>Fin</th>
                          <th>Erreur</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailData.steps.map((step, index) => (
                          <tr key={detailData.id + ':step:' + index}>
                            <td>{step.name}</td>
                            <td>
                              <StatusBadge status={step.status} />
                            </td>
                            <td>{step.attempts}</td>
                            <td className="admin-nowrap">{formatDateTime(step.startedAt)}</td>
                            <td className="admin-nowrap">{formatDateTime(step.finishedAt)}</td>
                            <td className="admin-cell-wrap">{step.error ?? '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <h3 className="admin-subhead">Outbox</h3>
                {detailData.outbox.length === 0 ? (
                  <p className="admin-empty">Aucune entree outbox.</p>
                ) : (
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Kind</th>
                          <th>Statut</th>
                          <th>Attempts</th>
                          <th>Derniere erreur</th>
                          <th>Workflow</th>
                          <th>Cree le</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailData.outbox.map((entry) => (
                          <tr key={entry.id}>
                            <td>{entry.kind}</td>
                            <td>
                              <StatusBadge status={entry.status} />
                            </td>
                            <td>{entry.attempts}</td>
                            <td className="admin-cell-wrap">{entry.lastError ?? '-'}</td>
                            <td className="admin-mono admin-nowrap" title={entry.workflowRunId ?? undefined}>
                              {shortId(entry.workflowRunId, 8)}
                            </td>
                            <td className="admin-nowrap">{formatDateTime(entry.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <h3 className="admin-subhead">Artefact</h3>
                {detailData.artifact ? (
                  <div className="admin-kv">
                    <div>
                      <span>Version master</span>
                      <strong>v{detailData.artifact.masterVersion}</strong>
                    </div>
                    <div>
                      <span>Version artefact</span>
                      <strong className="admin-mono">{shortId(detailData.artifact.artifactVersionId, 14)}</strong>
                    </div>
                    <div>
                      <span>Checksum</span>
                      <strong className="admin-mono" title={detailData.artifact.checksum}>
                        {shortId(detailData.artifact.checksum, 16)}
                      </strong>
                    </div>
                    <div>
                      <span>Cree le</span>
                      <strong>{formatDateTime(detailData.artifact.createdAt)}</strong>
                    </div>
                  </div>
                ) : (
                  <p className="admin-empty">Aucun artefact pour ce run.</p>
                )}
              </div>
            ) : null}
          </SectionCard>
        ) : null}

        <SectionCard
          title="Reconciliation runtime"
          description="Dry-run par defaut : aucune action n est appliquee tant que dryRun reste coche."
        >
          <div className="admin-form">
            <CheckboxField
              id="reconcile-dry-run"
              label="Dry-run (aucune action appliquee)"
              checked={dryRun}
              onChange={setDryRun}
              hint="Decochez uniquement pour appliquer la recuperation des claims outbox orphelins."
            />
            <div className="admin-form-grid">
              <TextField
                id="reconcile-stale-seconds"
                label="staleSeconds"
                type="number"
                min={0}
                max={604800}
                step={1}
                value={staleSecondsDraft}
                onChange={setStaleSecondsDraft}
              />
              <TextField
                id="reconcile-staged-grace"
                label="stagedGraceHours"
                type="number"
                min={0}
                max={8760}
                step={1}
                value={stagedGraceDraft}
                onChange={setStagedGraceDraft}
              />
            </div>
            {reconcileError ? (
              <p className="admin-banner admin-banner--danger" role="alert">
                {reconcileError}
              </p>
            ) : null}
            <div className="admin-actions">
              <button
                type="button"
                className={'btn ' + (dryRun ? 'btn-secondary' : 'btn-danger')}
                onClick={() => void runReconcile()}
                disabled={reconciling}
              >
                {reconciling ? 'Reconciliation...' : dryRun ? 'Simuler la reconciliation' : 'Appliquer la reconciliation'}
              </button>
              <span className="admin-meta">
                {reconcileResult
                  ? 'Dernier rapport : dryRun=' +
                    String(reconcileResult.dryRun) +
                    ', incidents=' +
                    reconcileResult.incidents.length
                  : 'Aucun rapport lance dans cette session.'}
              </span>
            </div>
            {reconcileResult ? (
              <details className="admin-details" open>
                <summary>Rapport JSON</summary>
                <pre className="admin-pre" data-testid="reconcile-report">
                  {formatJson(reconcileResult)}
                </pre>
              </details>
            ) : null}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
