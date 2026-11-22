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
import StatusBadge from '../../../components/admin/StatusBadge';
import { useAdminResource } from '../../../components/admin/useAdminResource';
import {
  adminApi,
  errorMessage,
  formatCents,
  formatDateTime,
  formatNumber,
  shortId,
  TOOL_AVAILABILITY_LABELS,
  type AdminExecutionBudgetAlert
} from '../../../lib/admin';

const BUDGET_ALERT_LABELS: Record<AdminExecutionBudgetAlert, string> = {
  ok: 'OK',
  warning: 'Vigilance',
  critical: 'Critique',
  exhausted: 'Epuise',
  unknown: 'Cout incertain'
};

const EVIDENCE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  // P11-D — budgets et couts d execution (lecture seule, aucune ecriture financiere).
  const executionCosts = useAdminResource(() => adminApi.executionCosts(), 'execution-costs');
  const costData = executionCosts.data;
  const [resolveDraft, setResolveDraft] = useState({ id: '', cents: '0', evidence: '' });
  const [resolveBusy, setResolveBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');

  async function resolveCostIncident() {
    const cents = Number(resolveDraft.cents);
    if (!Number.isInteger(cents) || cents < 0) {
      setActionError('Le cout constate doit etre un entier positif en centimes.');
      return;
    }
    if (!EVIDENCE_PATTERN.test(resolveDraft.evidence.trim())) {
      setActionError('Une reference de preuve au format UUID est requise.');
      return;
    }
    setResolveBusy(true);
    setActionError('');
    setNotice('');
    try {
      const result = await adminApi.resolveExecutionIncident(resolveDraft.id, {
        cents,
        evidence: resolveDraft.evidence.trim()
      });
      setNotice('Operation ' + shortId(result.id, 10) + ' resolue (etat ' + result.state + ').');
      setResolveDraft({ id: '', cents: '0', evidence: '' });
      executionCosts.reload();
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setResolveBusy(false);
    }
  }

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
        <strong>Journal de couts de routage (MOCK)</strong>
        <span>
          Les evenements ci-dessous proviennent du routage mock : aucun cout fournisseur reel n est engage ni
          facture. Les budgets d execution reels (reserve, consomme, incertain) sont affiches separement plus bas.
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

      {executionCosts.loading && !costData ? <LoadingState label="Chargement des budgets d execution..." /> : null}
      {executionCosts.error ? <ErrorState message={executionCosts.error} onRetry={executionCosts.reload} /> : null}

      {costData ? (
        <div className="admin-sections">
          <div className="admin-banner admin-banner--info" role="status">
            <strong>Etat commercial</strong>
            <span>
              {costData.commercial.betaMode
                ? 'Beta gratuite active : aucun paiement client n est ouvert et aucune charge reelle n est emise.'
                : 'Mode commercial : la facturation conserve ses propres exigences d activation ; cette interface ne debite rien.'}{' '}
              Stripe live : {costData.commercial.stripeLiveMode ? 'actif' : 'desactive'} · checkout :{' '}
              {costData.commercial.stripeCheckoutEnabled ? 'ouvert' : 'ferme'} · controle commercial :{' '}
              {costData.commercial.billingControlEnabled ? 'actif' : 'gele'}
              {costData.commercial.billingControlMode ? ' (' + costData.commercial.billingControlMode + ')' : ''}.
            </span>
          </div>

          <div className="admin-metric-grid">
            <MetricCard
              label="Estime (propose)"
              value={formatCents(costData.summary.estimatedCents)}
              hint="Operations proposees, aucune reservation engagee"
            />
            <MetricCard
              label="Reserve"
              value={formatCents(costData.summary.reservedCents)}
              hint="Reservations en cours chez le ToolBroker"
            />
            <MetricCard
              label="Confirme"
              value={formatCents(costData.summary.confirmedCents)}
              hint="Couts rapportes ou reconcilies"
            />
            <MetricCard
              label="Incertain"
              value={formatCents(costData.summary.uncertainCents)}
              hint="Reservations UNKNOWN, jamais liberees silencieusement"
            />
            <MetricCard
              label="Exposition max"
              value={formatCents(costData.summary.maxExposureCents)}
              hint="Reserve + incertain"
            />
          </div>

          <div className="admin-metric-grid">
            <MetricCard
              label="Plafonds cumules"
              value={formatCents(costData.budgetTotals.limitCents)}
              hint={costData.budgetTotals.accounts + ' compte(s), ' + costData.budgetTotals.enabledAccounts + ' actif(s)'}
            />
            <MetricCard label="Reserve cumule" value={formatCents(costData.budgetTotals.reservedCents)} />
            <MetricCard label="Consomme cumule" value={formatCents(costData.budgetTotals.spentCents)} />
            <MetricCard
              label="Restant cumule"
              value={formatCents(costData.budgetTotals.remainingCents)}
              hint="Peut etre negatif en cas de depassement"
            />
          </div>

          <SectionCard
            title="Budgets par compte autorise"
            description="Plafond, reserve, consomme et restant reels. Alertes calculees : cout incertain prioritaire, puis epuise, critique (>=90%), vigilance (>=75%)."
            actions={
              <button type="button" className="btn btn-ghost btn-small" onClick={executionCosts.reload} disabled={executionCosts.loading}>
                Actualiser
              </button>
            }
          >
            {costData.budgets.length === 0 ? (
              <p className="admin-empty">Aucun compte d execution configure.</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Compte</th>
                      <th>Execution</th>
                      <th>Plafond</th>
                      <th>Reserve</th>
                      <th>Consomme</th>
                      <th>Restant</th>
                      <th>Utilisation</th>
                      <th>Alerte</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costData.budgets.map((budget) => (
                      <tr key={budget.userId}>
                        <td>
                          {budget.email}
                          <br />
                          <span className="admin-meta">{budget.name}</span>
                        </td>
                        <td>
                          {budget.enabled ? 'Activee' : 'Desactivee'}
                          {budget.status === 'suspended' ? ' · compte suspendu' : ''}
                        </td>
                        <td className="admin-nowrap">{formatCents(budget.limitCents)}</td>
                        <td className="admin-nowrap">{formatCents(budget.reservedCents)}</td>
                        <td className="admin-nowrap">{formatCents(budget.spentCents)}</td>
                        <td className={'admin-nowrap' + (budget.remainingCents < 0 ? ' admin-text-danger' : '')}>
                          {formatCents(budget.remainingCents)}
                        </td>
                        <td className="admin-nowrap">{budget.percentUsed === null ? '-' : budget.percentUsed + ' %'}</td>
                        <td>
                          <StatusBadge
                            status={
                              budget.alert === 'ok'
                                ? 'ok'
                                : budget.alert === 'unknown'
                                  ? 'pending'
                                  : budget.alert === 'warning'
                                    ? 'recovery_pending'
                                    : 'failed'
                            }
                            label={BUDGET_ALERT_LABELS[budget.alert]}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Couts par outil" description="Montants reels par outil du registre : plafond cumule, couts confirmes et exposition incertaine.">
            {costData.byTool.length === 0 ? (
              <p className="admin-empty">Aucune operation outillee.</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Outil</th>
                      <th>Fournisseur</th>
                      <th>Operations</th>
                      <th>Plafond cumule</th>
                      <th>Confirme</th>
                      <th>Incertain</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costData.byTool.map((entry) => (
                      <tr key={entry.tool}>
                        <td className="admin-mono">{entry.tool}</td>
                        <td className="admin-mono">{entry.provider}</td>
                        <td>{formatNumber(entry.operations)}</td>
                        <td className="admin-nowrap">{formatCents(entry.maxCents)}</td>
                        <td className="admin-nowrap">{formatCents(entry.confirmedCents)}</td>
                        <td className="admin-nowrap">{formatCents(entry.uncertainCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Fournisseurs, disponibilite et plafonds"
            description="Disponibilite issue de la configuration serveur (jamais sondee) et exposition par fournisseur."
          >
            {costData.byProvider.length === 0 ? (
              <p className="admin-empty">Aucun fournisseur engage.</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Fournisseur</th>
                      <th>Disponibilite</th>
                      <th>Outils</th>
                      <th>Operations</th>
                      <th>Plafond cumule</th>
                      <th>Confirme</th>
                      <th>Incertain</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costData.byProvider.map((entry) => (
                      <tr key={entry.provider}>
                        <td className="admin-mono">{entry.provider}</td>
                        <td>
                          <StatusBadge
                            status={
                              entry.availability === 'configured'
                                ? 'ok'
                                : entry.availability === 'local'
                                  ? 'active'
                                  : entry.availability === 'disabled'
                                    ? 'none'
                                    : 'pending'
                            }
                            label={TOOL_AVAILABILITY_LABELS[entry.availability]}
                            title={entry.availabilityReason ?? undefined}
                          />
                        </td>
                        <td>{formatNumber(entry.tools)}</td>
                        <td>{formatNumber(entry.operations)}</td>
                        <td className="admin-nowrap">{formatCents(entry.maxCents)}</td>
                        <td className="admin-nowrap">{formatCents(entry.confirmedCents)}</td>
                        <td className="admin-nowrap">{formatCents(entry.uncertainCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Operations a cout incertain"
            description="Reservations UNKNOWN : jamais liberees silencieusement. Resolution manuelle avec cout constate et preuve deja journalisee."
          >
            {costData.uncertain.length === 0 ? (
              <p className="admin-empty">Aucune operation a cout incertain.</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Outil</th>
                      <th>Etats</th>
                      <th>Plafond</th>
                      <th>Compte</th>
                      <th>Correlation</th>
                      <th>Age</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {costData.uncertain.map((entry) => (
                      <tr key={entry.id}>
                        <td className="admin-mono">{entry.tool}</td>
                        <td>
                          {entry.state} / {entry.costState}
                        </td>
                        <td className="admin-nowrap">{formatCents(entry.maxCents)}</td>
                        <td>{entry.ownerEmail ?? shortId(entry.accountId, 10)}</td>
                        <td className="admin-mono" title={entry.correlationId}>
                          {shortId(entry.correlationId, 8)}
                        </td>
                        <td className="admin-nowrap">{Math.round(entry.ageMs / 1000)} s</td>
                        <td>
                          <div className="admin-actions">
                            <button
                              type="button"
                              className="btn btn-secondary btn-small"
                              onClick={() => setResolveDraft({ id: entry.id, cents: String(entry.maxCents), evidence: '' })}
                            >
                              Resoudre
                            </button>
                            <a
                              className="btn btn-ghost btn-small"
                              href={'/admin/audit?traceId=' + encodeURIComponent(entry.correlationId)}
                            >
                              Audit
                            </a>
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
                  Resolution de l operation {shortId(resolveDraft.id, 10)} : le cout constate doit etre justifie par une
                  preuve existante. Aucune reservation n est liberee sans cette procedure.
                </p>
                <div className="admin-form-grid">
                  <TextField
                    id="cost-resolve-cents"
                    label="Cout constate (centimes)"
                    type="number"
                    min={0}
                    step={1}
                    value={resolveDraft.cents}
                    onChange={(value) => setResolveDraft((previous) => ({ ...previous, cents: value }))}
                  />
                  <TextField
                    id="cost-resolve-evidence"
                    label="Reference de preuve (UUID)"
                    value={resolveDraft.evidence}
                    onChange={(value) => setResolveDraft((previous) => ({ ...previous, evidence: value }))}
                    hint="Identifiant d une preuve deja journalisee."
                  />
                </div>
                <div className="admin-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void resolveCostIncident()}
                    disabled={resolveBusy}
                  >
                    {resolveBusy ? 'Resolution...' : 'Confirmer la resolution'}
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
            {notice ? (
              <p className="admin-banner admin-banner--success" role="status">
                {notice}
              </p>
            ) : null}
            {actionError ? (
              <p className="admin-banner admin-banner--danger" role="alert">
                {actionError}
              </p>
            ) : null}
          </SectionCard>
        </div>
      ) : null}

    </div>
  );
}
