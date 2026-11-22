'use client';

import { useState } from 'react';
import ConfirmDialog from '../../../components/admin/ConfirmDialog';
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
  type AdminExecutionDetail,
  type AdminExecutionItem,
  type AdminRun,
  type AdminRunDetail,
  type ReconciliationReport
} from '../../../lib/admin';

const EXECUTION_STATE_ORDER = [
  'PROPOSED',
  'QUEUED',
  'CLAIMED',
  'POLLING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'UNKNOWN'
];

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

  // P11-C — operations outillees, sante Python et actions administratives sures.
  const execution = useAdminResource(() => adminApi.opsExecution(), 'ops-execution');
  const python = useAdminResource(() => adminApi.opsPython(), 'ops-python');
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);
  const executionDetail = useAdminResource(
    () =>
      selectedExecutionId
        ? adminApi.opsExecutionDetail(selectedExecutionId)
        : Promise.resolve<AdminExecutionDetail | null>(null),
    'execution:' + (selectedExecutionId ?? 'none')
  );
  const [execBusy, setExecBusy] = useState('');
  const [execError, setExecError] = useState('');
  const [execNotice, setExecNotice] = useState('');
  const [cancelTarget, setCancelTarget] = useState<AdminExecutionItem | null>(null);
  const [resolveDraft, setResolveDraft] = useState({ id: '', cents: '0', evidence: '' });

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

  async function confirmCancelOperation() {
    if (!cancelTarget) {
      return;
    }
    setExecBusy('cancel');
    setExecError('');
    setExecNotice('');
    try {
      const result = await adminApi.cancelExecution(cancelTarget.id);
      setExecNotice('Operation ' + shortId(result.id, 10) + ' annulee (etat ' + result.state + ').');
      setCancelTarget(null);
      execution.reload();
      if (selectedExecutionId === result.id) {
        executionDetail.reload();
      }
    } catch (error) {
      setExecError(errorMessage(error));
    } finally {
      setExecBusy('');
    }
  }

  async function resolveIncidentOperation() {
    const cents = Number(resolveDraft.cents);
    if (!Number.isInteger(cents) || cents < 0) {
      setExecError('Le cout constate doit etre un entier positif en centimes.');
      return;
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(resolveDraft.evidence.trim())) {
      setExecError('Une reference de preuve au format UUID est requise.');
      return;
    }
    setExecBusy('resolve');
    setExecError('');
    setExecNotice('');
    try {
      const result = await adminApi.resolveExecutionIncident(resolveDraft.id, {
        cents,
        evidence: resolveDraft.evidence.trim()
      });
      setExecNotice('Operation ' + shortId(result.id, 10) + ' resolue (etat ' + result.state + ').');
      setResolveDraft({ id: '', cents: '0', evidence: '' });
      execution.reload();
      if (selectedExecutionId === result.id) {
        executionDetail.reload();
      }
    } catch (error) {
      setExecError(errorMessage(error));
    } finally {
      setExecBusy('');
    }
  }

  const healthData = health.data;
  const snapshotData = snapshot.data;
  const runsData = runs.data;
  const detailData = detail.data;
  const executionData = execution.data;
  const pythonData = python.data;
  const executionDetailData = executionDetail.data;

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
                        <th>Duree</th>
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
                          <td className="admin-nowrap">
                            {run.durationMs !== undefined && run.durationMs !== null
                              ? Math.round(run.durationMs / 1000) + ' s'
                              : run.stalled
                                ? 'Bloque'
                                : 'En cours'}
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

        <SectionCard
          title="Executions outillees (ToolBroker)"
          description="Etats reels des operations proposees, en file, en cours, terminees ou incertaines. Aucune relance aveugle d une operation payante : seules l annulation avant envoi et la resolution d une issue incertaine sont permises."
          actions={
            <button type="button" className="btn btn-ghost btn-small" onClick={execution.reload} disabled={execution.loading}>
              Actualiser
            </button>
          }
        >
          {execution.loading && !executionData ? <LoadingState label="Chargement des executions..." /> : null}
          {execution.error ? <ErrorState message={execution.error} onRetry={execution.reload} /> : null}
          {executionData ? (
            <div className="admin-sections">
              <div className="admin-kv">
                {EXECUTION_STATE_ORDER.map((state) => (
                  <div key={state}>
                    <span>{statusLabel(state)}</span>
                    <strong>{executionData ? executionData.states[state] ?? 0 : 0}</strong>
                  </div>
                ))}
              </div>
              <p className="admin-meta">
                Couts :{' '}
                {Object.entries(executionData.costStates)
                  .map(([state, count]) => state + ' ' + count)
                  .join(' · ') || 'aucune operation'}
              </p>
              {executionData.items.length === 0 ? (
                <p className="admin-empty">Aucune operation outillee.</p>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Outil</th>
                        <th>Etat</th>
                        <th>Cout</th>
                        <th>Correlation</th>
                        <th>Age</th>
                        <th>Projet</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {executionData.items.map((item) => (
                        <tr key={item.id}>
                          <td className="admin-mono">{item.tool}</td>
                          <td>
                            <StatusBadge status={item.state} />
                            {item.approved ? <span className="admin-meta"> approuvee</span> : null}
                          </td>
                          <td className="admin-nowrap">
                            {item.costState} · {item.reportedCents === null ? '-' : item.reportedCents}/{item.maxCents} c
                          </td>
                          <td className="admin-mono" title={item.correlationId}>
                            {shortId(item.correlationId, 8)}
                          </td>
                          <td className="admin-nowrap">{Math.round(item.ageMs / 1000)} s</td>
                          <td>{item.projectTitle}</td>
                          <td>
                            <div className="admin-actions">
                              <button
                                type="button"
                                className="btn btn-secondary btn-small"
                                onClick={() => setSelectedExecutionId(item.id)}
                              >
                                Details
                              </button>
                              <a
                                className="btn btn-ghost btn-small"
                                href={'/admin/audit?traceId=' + encodeURIComponent(item.correlationId)}
                              >
                                Audit
                              </a>
                              {item.cancelEligible ? (
                                <button
                                  type="button"
                                  className="btn btn-danger btn-small"
                                  onClick={() => setCancelTarget(item)}
                                >
                                  Annuler
                                </button>
                              ) : null}
                              {item.resolveEligible ? (
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-small"
                                  onClick={() => setResolveDraft({ id: item.id, cents: String(item.maxCents), evidence: '' })}
                                >
                                  Resoudre
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {resolveDraft.id ? (
                <div className="admin-form">
                  <p className="admin-meta">
                    Resolution manuelle de l issue incertaine {shortId(resolveDraft.id, 10)} : le cout constate doit etre
                    justifie par une preuve deja journalisee.
                  </p>
                  <div className="admin-form-grid">
                    <TextField
                      id="resolve-cents"
                      label="Cout constate (centimes)"
                      type="number"
                      min={0}
                      step={1}
                      value={resolveDraft.cents}
                      onChange={(value) => setResolveDraft((previous) => ({ ...previous, cents: value }))}
                    />
                    <TextField
                      id="resolve-evidence"
                      label="Reference de preuve (UUID)"
                      value={resolveDraft.evidence}
                      onChange={(value) => setResolveDraft((previous) => ({ ...previous, evidence: value }))}
                      hint="Identifiant d une preuve existante."
                    />
                  </div>
                  <div className="admin-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => void resolveIncidentOperation()}
                      disabled={execBusy === 'resolve'}
                    >
                      {execBusy === 'resolve' ? 'Resolution...' : 'Confirmer la resolution'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      onClick={() => setResolveDraft({ id: '', cents: '0', evidence: '' })}
                    >
                      Fermer
                    </button>
                  </div>
                </div>
              ) : null}
              {execNotice ? (
                <p className="admin-banner admin-banner--success" role="status">
                  {execNotice}
                </p>
              ) : null}
              {execError ? (
                <p className="admin-banner admin-banner--danger" role="alert">
                  {execError}
                </p>
              ) : null}
            </div>
          ) : null}
        </SectionCard>

        {selectedExecutionId ? (
          <SectionCard
            title={'Detail execution ' + shortId(selectedExecutionId, 12)}
            description="Operation, cout, correlation et evenements d audit associes."
            actions={
              <button type="button" className="btn btn-ghost btn-small" onClick={() => setSelectedExecutionId(null)}>
                Fermer
              </button>
            }
          >
            {executionDetail.loading && !executionDetailData ? (
              <LoadingState label="Chargement de l operation..." />
            ) : null}
            {executionDetail.error ? <ErrorState message={executionDetail.error} onRetry={executionDetail.reload} /> : null}
            {executionDetailData ? (
              <div className="admin-sections">
                <div className="admin-kv">
                  <div>
                    <span>Outil</span>
                    <strong className="admin-mono">{executionDetailData.tool}</strong>
                  </div>
                  <div>
                    <span>Etat</span>
                    <strong>
                      <StatusBadge status={executionDetailData.state} />
                    </strong>
                  </div>
                  <div>
                    <span>Cout</span>
                    <strong>
                      {executionDetailData.costState} · {executionDetailData.reportedCents ?? '-'}/
                      {executionDetailData.maxCents} c
                    </strong>
                  </div>
                  <div>
                    <span>Correlation</span>
                    <strong className="admin-mono">{executionDetailData.correlationId}</strong>
                  </div>
                  <div>
                    <span>Projet</span>
                    <strong>{executionDetailData.projectTitle}</strong>
                  </div>
                  <div>
                    <span>Proprietaire</span>
                    <strong>{executionDetailData.ownerEmail}</strong>
                  </div>
                  <div>
                    <span>Cree le</span>
                    <strong>{formatDateTime(executionDetailData.createdAt)}</strong>
                  </div>
                  <div>
                    <span>Claim jusqu a</span>
                    <strong>{formatDateTime(executionDetailData.claimUntil)}</strong>
                  </div>
                </div>
                <details className="admin-details">
                  <summary>Parametres</summary>
                  <pre className="admin-pre">{formatJson(executionDetailData.params)}</pre>
                </details>
                <details className="admin-details">
                  <summary>Resultat</summary>
                  <pre className="admin-pre">{formatJson(executionDetailData.result)}</pre>
                </details>
                <h3 className="admin-subhead">Audit lie (correlation)</h3>
                {executionDetailData.audit.length === 0 ? (
                  <p className="admin-empty">Aucun evenement d audit pour cette correlation.</p>
                ) : (
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Action</th>
                          <th>Acteur</th>
                          <th>Cible</th>
                          <th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {executionDetailData.audit.map((event) => (
                          <tr key={event.id}>
                            <td className="admin-mono">{event.action}</td>
                            <td className="admin-mono">{event.actorId ? shortId(event.actorId, 10) : '-'}</td>
                            <td className="admin-mono">
                              {event.targetType}
                              {event.targetId ? ' · ' + shortId(event.targetId, 10) : ''}
                            </td>
                            <td className="admin-nowrap">{formatDateTime(event.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}
          </SectionCard>
        ) : null}

        <SectionCard
          title="Service Python interne"
          description="Disponibilite reelle lue sur /readyz et /v1/capabilities. Aucun jeton n est affiche ; une indisponibilite n est jamais masquee."
          actions={
            <button type="button" className="btn btn-ghost btn-small" onClick={python.reload} disabled={python.loading}>
              Verifier
            </button>
          }
        >
          {python.loading && !pythonData ? <LoadingState label="Verification du service Python..." /> : null}
          {python.error ? <ErrorState message={python.error} onRetry={python.reload} /> : null}
          {pythonData ? (
            <div className="admin-sections">
              <div className="admin-kv">
                <div>
                  <span>Configure</span>
                  <strong>{pythonData.configured ? 'Oui' : 'Non'}</strong>
                </div>
                <div>
                  <span>Joignable</span>
                  <strong>{pythonData.reachable ? 'Oui' : 'Non'}</strong>
                </div>
                <div>
                  <span>Pret</span>
                  <strong>{pythonData.ready ? 'Oui' : 'Non'}</strong>
                </div>
                <div>
                  <span>Version</span>
                  <strong>{pythonData.version ?? '-'}</strong>
                </div>
                <div>
                  <span>Verifie le</span>
                  <strong>{formatDateTime(pythonData.checkedAt)}</strong>
                </div>
              </div>
              {pythonData.error ? (
                <p className="admin-banner admin-banner--danger" role="alert">
                  Code : {pythonData.error}
                </p>
              ) : null}
              {pythonData.capabilitiesError ? (
                <p className="admin-banner admin-banner--warn" role="status">
                  Capacites indisponibles : {pythonData.capabilitiesError}
                </p>
              ) : null}
              {pythonData.dependencies && Object.keys(pythonData.dependencies).length > 0 ? (
                <>
                  <h3 className="admin-subhead">Dependances</h3>
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Paquet</th>
                          <th>Present</th>
                          <th>Version</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(pythonData.dependencies).map(([name, value]) => {
                          const info =
                            value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
                          return (
                            <tr key={name}>
                              <td className="admin-mono">{name}</td>
                              <td>{info.present === true ? 'Oui' : 'Non'}</td>
                              <td>{typeof info.version === 'string' ? info.version : '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
              <h3 className="admin-subhead">Capacites declarees</h3>
              {pythonData.capabilities.length === 0 ? (
                <p className="admin-empty">Aucune capacite retournee.</p>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Capacite</th>
                        <th>Action</th>
                        <th>Moteur</th>
                        <th>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pythonData.capabilities.map((capability) => (
                        <tr key={capability.key}>
                          <td className="admin-mono">{capability.key}</td>
                          <td>{capability.action}</td>
                          <td>{capability.engine}</td>
                          <td className="admin-meta">{capability.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
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

        <ConfirmDialog
          open={cancelTarget !== null}
          title="Annuler cette operation"
          message={
            cancelTarget
              ? 'L operation ' +
                cancelTarget.tool +
                ' (' +
                shortId(cancelTarget.id, 10) +
                ') sera annulee. Seules les operations encore proposees ou en file peuvent l etre ; la reservation de cout est liberee par le broker.'
              : ''
          }
          confirmLabel="Annuler l operation"
          tone="danger"
          busy={execBusy === 'cancel'}
          onConfirm={() => void confirmCancelOperation()}
          onCancel={() => {
            if (execBusy !== 'cancel') {
              setCancelTarget(null);
            }
          }}
        />
      </div>
    </div>
  );
}
