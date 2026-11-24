'use client';

import { useEffect, useState, type FormEvent } from 'react';
import ConfirmDialog from '../../../components/admin/ConfirmDialog';
import ErrorState from '../../../components/admin/ErrorState';
import { CheckboxField, SelectField, TextField, TextareaField } from '../../../components/admin/Fields';
import LoadingState from '../../../components/admin/LoadingState';
import PageHeader from '../../../components/admin/PageHeader';
import SectionCard from '../../../components/admin/SectionCard';
import StatusBadge from '../../../components/admin/StatusBadge';
import { useAdminResource } from '../../../components/admin/useAdminResource';
import {
  adminApi,
  availabilityBadge,
  errorMessage,
  formatDateTime,
  roleLabel,
  shortId,
  TOOL_AVAILABILITY_LABELS,
  type AdminAgent,
  type AdminAgentConfig
} from '../../../lib/admin';

type PendingAction = { kind: 'promote' | 'rollback'; config: AdminAgentConfig };

export default function AdminAgentsPage() {
  const agents = useAdminResource(() => adminApi.agents(), 'agents');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedId !== null) {
      return;
    }
    const items = agents.data ? agents.data.items : [];
    if (items.length > 0) {
      setSelectedId(items[0].id);
    }
  }, [agents.data, selectedId]);

  const selectedAgent: AdminAgent | null = agents.data
    ? agents.data.items.find((agent) => agent.id === selectedId) ?? null
    : null;

  const configs = useAdminResource(
    () =>
      selectedId
        ? adminApi.agentConfigs(selectedId)
        : Promise.resolve<{ items: AdminAgentConfig[] }>({ items: [] }),
    'configs:' + (selectedId ?? 'none')
  );

  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');

  const [soul, setSoul] = useState('');
  const [instructions, setInstructions] = useState('');
  const [guardrailsText, setGuardrailsText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  async function confirmAction() {
    if (!selectedAgent || !pendingAction) {
      return;
    }
    const config = pendingAction.config;
    const kind = pendingAction.kind;
    setActionBusy(true);
    setActionError('');
    try {
      if (kind === 'promote') {
        await adminApi.promoteAgentConfig(selectedAgent.id, config.id);
      } else {
        await adminApi.rollbackAgentConfig(selectedAgent.id, config.id);
      }
      setNotice(
        'Version ' +
          config.version +
          (kind === 'promote' ? ' promue' : ' restauree') +
          ' comme configuration active.'
      );
      setPendingAction(null);
      agents.reload();
      configs.reload();
    } catch (error) {
      setPendingAction(null);
      setActionError(errorMessage(error));
    } finally {
      setActionBusy(false);
    }
  }

  async function submitNewVersion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAgent) {
      return;
    }
    if (soul.trim().length === 0 || instructions.trim().length === 0) {
      setFormError('Le soul et les instructions sont obligatoires.');
      return;
    }
    const guardrails = guardrailsText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    setSubmitting(true);
    setFormError('');
    try {
      const result = await adminApi.createAgentConfig(selectedAgent.id, {
        soul: soul.trim(),
        instructions: instructions.trim(),
        guardrails
      });
      setNotice(
        'Version ' +
          result.config.version +
          ' creee. Elle doit etre promue explicitement pour devenir active.'
      );
      setSoul('');
      setInstructions('');
      setGuardrailsText('');
      configs.reload();
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  const configItems = configs.data ? configs.data.items : [];
  const activeConfig = selectedAgent
    ? configItems.find((config) => config.id === selectedAgent.activeConfigVersionId)
    : undefined;

  return (
    <div className="admin-page">
      <PageHeader
        eyebrow="Administration"
        title="Agents"
        description="Registre des agents et de leurs configurations versionnees. Promotion et rollback explicites."
      />

      {agents.loading && !agents.data ? <LoadingState label="Chargement des agents..." /> : null}
      {agents.error ? <ErrorState message={agents.error} onRetry={agents.reload} /> : null}

      {agents.data ? (
        agents.data.items.length === 0 ? (
          <SectionCard title="Aucun agent" description="Le registre est vide.">
            <p className="admin-empty">
              Aucun agent n est enregistre. La creation d agent n est pas exposee par cette interface.
            </p>
          </SectionCard>
        ) : (
          <div className="admin-split">
            <SectionCard title="Agents" description="Selectionnez un agent.">
              <div className="admin-select-list">
                {agents.data.items.map((agent) => (
                  <button
                    key={agent.id}
                    type="button"
                    className={'admin-select-item' + (agent.id === selectedId ? ' is-active' : '')}
                    aria-pressed={agent.id === selectedId}
                    onClick={() => {
                      setSelectedId(agent.id);
                      setNotice('');
                      setActionError('');
                      setFormError('');
                    }}
                  >
                    <span className="admin-select-item-title">{agent.name}</span>
                    <span className="admin-meta">{agent.key}</span>
                    <span className="admin-meta">
                      {roleLabel(agent.role)} - {agent.capabilityRequirements.length} capacite(s)
                    </span>
                  </button>
                ))}
              </div>
            </SectionCard>

            <div className="admin-sections">
              {selectedAgent ? (
                <SectionCard
                  title={selectedAgent.name}
                  description={'Cle ' + selectedAgent.key + ' - role ' + roleLabel(selectedAgent.role)}
                  actions={
                    activeConfig ? (
                      <StatusBadge status="ok" label={'Version active v' + activeConfig.version} />
                    ) : (
                      <StatusBadge status="not_connected" label="Aucune version active" />
                    )
                  }
                >
                  <div className="admin-kv">
                    <div>
                      <span>Identifiant</span>
                      <strong className="admin-mono">{selectedAgent.id}</strong>
                    </div>
                    <div>
                      <span>Cree le</span>
                      <strong>{formatDateTime(selectedAgent.createdAt)}</strong>
                    </div>
                    <div>
                      <span>Configuration active</span>
                      <strong>
                        {activeConfig
                          ? 'v' + activeConfig.version + ' (' + shortId(activeConfig.checksum, 12) + ')'
                          : 'Aucune'}
                      </strong>
                    </div>
                  </div>
                  <div className="admin-capabilities">
                    <span className="admin-metric-label">Capacites requises</span>
                    {selectedAgent.capabilityRequirements.length === 0 ? (
                      <p className="admin-empty">Aucune exigence de capacite.</p>
                    ) : (
                      <div className="admin-badge-row">
                        {selectedAgent.capabilityRequirements.map((requirement) => (
                          <span className="admin-badge admin-badge--info" key={requirement.capabilityKey}>
                            {requirement.capabilityKey}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </SectionCard>
              ) : (
                <SectionCard title="Agent" description="Aucun agent selectionne.">
                  <p className="admin-empty">Selectionnez un agent dans la liste.</p>
                </SectionCard>
              )}

              {selectedAgent ? (
                <SectionCard
                  title="Versions de configuration"
                  description="Chaque version est immuable ; la promotion est explicite."
                  actions={
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      onClick={configs.reload}
                      disabled={configs.loading}
                    >
                      Actualiser
                    </button>
                  }
                >
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
                  {configs.loading && !configs.data ? (
                    <LoadingState label="Chargement des configurations..." />
                  ) : null}
                  {configs.error ? <ErrorState message={configs.error} onRetry={configs.reload} /> : null}
                  {configs.data ? (
                    configItems.length === 0 ? (
                      <p className="admin-empty">Aucune configuration. Creez une premiere version.</p>
                    ) : (
                      <div className="admin-table-wrap">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>Version</th>
                              <th>Etat</th>
                              <th>Checksum</th>
                              <th>Guardrails</th>
                              <th>Creee le</th>
                              <th>Contenu</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {configItems.map((config) => {
                              const isActive = config.id === selectedAgent.activeConfigVersionId;
                              return (
                                <tr key={config.id}>
                                  <td className="admin-nowrap">v{config.version}</td>
                                  <td>
                                    {isActive ? (
                                      <StatusBadge status="ok" label="Active" />
                                    ) : (
                                      <StatusBadge status="pending" label="Non active" />
                                    )}
                                  </td>
                                  <td className="admin-mono" title={config.checksum}>
                                    {shortId(config.checksum, 12)}
                                  </td>
                                  <td>{config.guardrails.length}</td>
                                  <td className="admin-nowrap">{formatDateTime(config.createdAt)}</td>
                                  <td>
                                    <details className="admin-details">
                                      <summary>Voir</summary>
                                      <div className="admin-details-body">
                                        <p className="admin-metric-label">Soul</p>
                                        <pre className="admin-pre">{config.soul}</pre>
                                        <p className="admin-metric-label">Instructions</p>
                                        <pre className="admin-pre">{config.instructions}</pre>
                                        <p className="admin-metric-label">Guardrails</p>
                                        {config.guardrails.length === 0 ? (
                                          <p className="admin-empty">Aucun guardrail.</p>
                                        ) : (
                                          <ul className="admin-list-tight">
                                            {config.guardrails.map((guardrail, index) => (
                                              <li key={config.id + ':' + index}>{guardrail}</li>
                                            ))}
                                          </ul>
                                        )}
                                      </div>
                                    </details>
                                  </td>
                                  <td>
                                    <div className="admin-actions">
                                      <button
                                        type="button"
                                        className="btn btn-secondary btn-small"
                                        disabled={isActive}
                                        onClick={() => setPendingAction({ kind: 'promote', config })}
                                      >
                                        Promouvoir
                                      </button>
                                      <button
                                        type="button"
                                        className="btn btn-ghost btn-small"
                                        disabled={isActive}
                                        onClick={() => setPendingAction({ kind: 'rollback', config })}
                                      >
                                        Rollback
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )
                  ) : null}
                </SectionCard>
              ) : null}

              {selectedAgent ? (
                <SectionCard
                  title="Nouvelle version de configuration"
                  description="La nouvelle version n est jamais active automatiquement."
                >
                  <form className="admin-form" onSubmit={submitNewVersion}>
                    <TextareaField
                      id="agent-config-soul"
                      label="Soul"
                      value={soul}
                      onChange={setSoul}
                      rows={4}
                      required
                      hint="Identite et posture de l agent."
                    />
                    <TextareaField
                      id="agent-config-instructions"
                      label="Instructions"
                      value={instructions}
                      onChange={setInstructions}
                      rows={5}
                      required
                      hint="Consignes operationnelles de l agent."
                    />
                    <TextareaField
                      id="agent-config-guardrails"
                      label="Guardrails"
                      value={guardrailsText}
                      onChange={setGuardrailsText}
                      rows={4}
                      hint="Une regle par ligne."
                    />
                    {formError ? (
                      <p className="admin-banner admin-banner--danger" role="alert">
                        {formError}
                      </p>
                    ) : null}
                    <div className="admin-actions">
                      <button type="submit" className="btn btn-primary" disabled={submitting}>
                        {submitting ? 'Creation...' : 'Creer la version'}
                      </button>
                    </div>
                  </form>
                </SectionCard>
              ) : null}
            </div>
          </div>
        )
      ) : null}

      <ToolCatalogSection />
      <ExecutionPolicySection />

      <ConfirmDialog
        open={pendingAction !== null}
        title={pendingAction && pendingAction.kind === 'promote' ? 'Promouvoir cette version' : 'Restaurer cette version'}
        message={
          pendingAction
            ? 'La version v' +
              pendingAction.config.version +
              ' deviendra la configuration active de ' +
              (selectedAgent ? selectedAgent.name : 'cet agent') +
              '. L action est journalisee dans l audit.'
            : ''
        }
        confirmLabel={pendingAction && pendingAction.kind === 'promote' ? 'Promouvoir' : 'Rollback'}
        tone={pendingAction && pendingAction.kind === 'promote' ? 'primary' : 'danger'}
        busy={actionBusy}
        onConfirm={() => void confirmAction()}
        onCancel={() => {
          if (!actionBusy) {
            setPendingAction(null);
          }
        }}
      />
    </div>
  );
}

/**
 * P11-B — catalogue fermé des outils : permissions, restrictions et disponibilité réelle.
 * Aucun outil ne peut être créé ici ; le registre serveur reste l'unique source.
 */
function ToolCatalogSection() {
  const tools = useAdminResource(() => adminApi.tools(), 'admin-tools');
  return (
    <SectionCard
      title="Outils et permissions"
      description="Catalogue fermé du registre serveur, capacités Python incluses. La disponibilité décrit la configuration : aucun appel fournisseur n'est sondé ici."
      actions={
        <button type="button" className="btn btn-ghost btn-small" onClick={tools.reload} disabled={tools.loading}>
          Actualiser
        </button>
      }
    >
      {tools.loading && !tools.data ? <LoadingState label="Chargement du catalogue..." /> : null}
      {tools.error ? <ErrorState message={tools.error} onRetry={tools.reload} /> : null}
      {tools.data ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Outil</th>
                <th>Fournisseur</th>
                <th>Action</th>
                <th>Portee</th>
                <th>Approbation</th>
                <th>Plafond</th>
                <th>Agent</th>
                <th>Disponibilite</th>
              </tr>
            </thead>
            <tbody>
              {tools.data.items.map((tool) => (
                <tr key={tool.key}>
                  <td>
                    <strong>{tool.key}</strong>
                    <br />
                    <span className="admin-meta">{tool.description}</span>
                  </td>
                  <td className="admin-mono">{tool.provider}</td>
                  <td>{tool.action}</td>
                  <td>{tool.scope}</td>
                  <td>{tool.approval === 'human' ? 'Humaine' : 'Automatique'}</td>
                  <td className="admin-nowrap">{tool.maxCents} c</td>
                  <td>{tool.agentProposable ? 'Proposable' : 'Reserve utilisateur'}</td>
                  <td>
                    {(() => {
                      const badge = availabilityBadge(tool);
                      return (
                        <StatusBadge
                          status={badge.status}
                          label={badge.label}
                          title={tool.availabilityReason ?? undefined}
                        />
                      );
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <p className="admin-meta">
        Un outil non autorise pour un compte est refuse par le broker (tool_disabled), meme si le fournisseur est
        configure. Les jalons de qualification des modeles restent geres dans Fournisseurs.
      </p>
    </SectionCard>
  );
}

/** P11-B — politique d'execution par compte : plafond, activation et outils autorises. */
function ExecutionPolicySection() {
  const accounts = useAdminResource(() => adminApi.executionAccounts(), 'execution-accounts');
  const tools = useAdminResource(() => adminApi.tools(), 'execution-tools');
  const [accountId, setAccountId] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [limitCents, setLimitCents] = useState('0');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const current = accounts.data ? accounts.data.items.find((item) => item.userId === accountId) ?? null : null;

  useEffect(() => {
    if (!current) {
      setEnabled(false);
      setLimitCents('0');
      setSelected([]);
      return;
    }
    setEnabled(current.enabled);
    setLimitCents(String(current.limitCents));
    setSelected(current.tools);
  }, [accountId, current]);

  const accountOptions = (accounts.data ? accounts.data.items : []).map((item) => ({
    value: item.userId,
    label: item.userId + (item.enabled ? ' - actif' : ' - desactive') + ' (' + item.tools.length + ' outil(s))'
  }));

  function toggleTool(key: string, checked: boolean) {
    setSelected((previous) => (checked ? [...previous.filter((item) => item !== key), key] : previous.filter((item) => item !== key)));
  }

  async function savePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accountId) {
      return;
    }
    const rawLimit = limitCents.trim();
    const parsedLimit = rawLimit.length > 0 ? Number(rawLimit) : Number.NaN;
    if (!Number.isInteger(parsedLimit) || parsedLimit < 0 || parsedLimit > 1000000000) {
      setError('Le plafond doit etre un entier compris entre 0 et 1 000 000 000 centimes.');
      setNotice('');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await adminApi.setExecutionAccount(accountId, {
        enabled,
        limitCents: parsedLimit,
        tools: selected
      });
      setNotice(
        'Politique enregistree pour ' +
          result.userId +
          ' : execution ' +
          (result.enabled ? 'autorisee' : 'desactivee') +
          ', ' +
          result.tools.length +
          ' outil(s) autorise(s), plafond ' +
          result.limitCents +
          ' c.'
      );
      accounts.reload();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard
      title="Politique d'execution par compte"
      description="Seuls les outils coches peuvent etre proposes et autorises pour ce compte. Le broker applique ensuite plafond, reservation de cout et approbation humaine."
    >
      {accounts.loading && !accounts.data ? <LoadingState label="Chargement des comptes..." /> : null}
      {accounts.error ? <ErrorState message={accounts.error} onRetry={accounts.reload} /> : null}
      {tools.error ? <ErrorState message={tools.error} onRetry={tools.reload} /> : null}
      <form className="admin-form" onSubmit={savePolicy}>
        <SelectField
          id="policy-account-existing"
          label="Comptes existants"
          value={accountOptions.some((option) => option.value === accountId) ? accountId : ''}
          onChange={(value) => {
            if (value) {
              setAccountId(value);
              setNotice('');
              setError('');
            }
          }}
          options={accountOptions}
          placeholder="Selectionner un compte"
          hint="Les comptes sans politique n'ont aucun droit d'execution."
        />
        <TextField
          id="policy-account"
          label="Identifiant du compte (userId)"
          value={accountId}
          onChange={(value) => {
            setAccountId(value.trim());
            setNotice('');
            setError('');
          }}
          required
          hint="La politique est creee ou mise a jour pour ce compte."
        />
        <TextField
          id="policy-limit"
          label="Plafond (centimes USD)"
          type="number"
          min={0}
          step={1}
          value={limitCents}
          onChange={setLimitCents}
          hint="Montant maximal reserve pour une operation de ce compte."
        />
        <CheckboxField
          id="policy-enabled"
          label="Autoriser l'execution d'outils pour ce compte"
          checked={enabled}
          onChange={setEnabled}
          hint="Desactive par defaut : aucune operation ne peut etre approuvee sans cette activation."
        />
        {current ? (
          <p className="admin-meta">
            Consommation enregistree : reserve {current.reservedCents} c, depense {current.spentCents} c, plafond{' '}
            {current.limitCents} c.
          </p>
        ) : accountId ? (
          <p className="admin-meta">Aucune politique existante pour ce compte.</p>
        ) : null}
        {tools.data ? (
          <div className="admin-checkbox-group" role="group" aria-label="Outils autorises pour ce compte">
            {tools.data.items.map((tool) => (
              <CheckboxField
                key={tool.key}
                id={'policy-tool-' + tool.key}
                label={tool.key + ' · ' + tool.provider}
                checked={selected.includes(tool.key)}
                onChange={(checked) => toggleTool(tool.key, checked)}
                hint={TOOL_AVAILABILITY_LABELS[tool.availability]}
              />
            ))}
          </div>
        ) : null}
        {notice ? (
          <p className="admin-banner admin-banner--success" role="status">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="admin-banner admin-banner--danger" role="alert">
            {error}
          </p>
        ) : null}
        <div className="admin-actions">
          <button type="submit" className="btn btn-primary" disabled={busy || !accountId}>
            {busy ? 'Enregistrement...' : 'Enregistrer la politique'}
          </button>
        </div>
      </form>
    </SectionCard>
  );
}
