'use client';

import { useState, type FormEvent } from 'react';
import ErrorState from '../../../components/admin/ErrorState';
import { CheckboxField, SelectField, TextareaField, TextField } from '../../../components/admin/Fields';
import FlagBadge from '../../../components/admin/FlagBadge';
import LoadingState from '../../../components/admin/LoadingState';
import PageHeader from '../../../components/admin/PageHeader';
import SectionCard from '../../../components/admin/SectionCard';
import StatusBadge from '../../../components/admin/StatusBadge';
import { useAdminResource } from '../../../components/admin/useAdminResource';
import {
  adminApi,
  errorMessage,
  formatCents,
  formatDateTime,
  formatJson,
  LICENSE_OPTIONS,
  shortId,
  statusLabel,
  type AdminCapabilityRequirement,
  type AdminLicense,
  type AdminModel,
  type AdminProvider,
  type AdminRoutingDecision,
  type AdminRoutingExecuteResult
} from '../../../lib/admin';

const LICENSE_SELECT_OPTIONS = [
  { value: 'internal', label: 'internal' },
  { value: 'commercial', label: 'commercial' },
  { value: 'unknown', label: 'unknown' }
];

function parseOptionalCount(value: string): { valid: boolean; value?: number } {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { valid: true };
  }
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return { valid: false };
  }
  return { valid: true, value: parsed };
}

function parseOptionalQuality(value: string): { valid: boolean; value?: number } {
  const parsed = parseOptionalCount(value);
  if (!parsed.valid) {
    return parsed;
  }
  if (parsed.value !== undefined && parsed.value > 100) {
    return { valid: false };
  }
  return parsed;
}

function parseRequiredInt(value: string, min: number, max: number): number | null {
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

function toLicense(value: string): AdminLicense {
  if (value === 'internal' || value === 'commercial') {
    return value;
  }
  return 'unknown';
}

type RequirementBuild =
  | { ok: true; requirement: AdminCapabilityRequirement; budgetCents?: number }
  | { ok: false; message: string };

export default function AdminProvidersPage() {
  const providers = useAdminResource(() => adminApi.providers(), 'providers');
  const models = useAdminResource(() => adminApi.models(), 'models');

  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyKey, setBusyKey] = useState('');

  const [providerKeyDraft, setProviderKeyDraft] = useState('');
  const [providerNameDraft, setProviderNameDraft] = useState('');
  const [providerFormError, setProviderFormError] = useState('');
  const [creatingProvider, setCreatingProvider] = useState(false);

  const [modelProviderKey, setModelProviderKey] = useState('');
  const [modelKeyDraft, setModelKeyDraft] = useState('');
  const [capabilityKeysDraft, setCapabilityKeysDraft] = useState('');
  const [qualityDraft, setQualityDraft] = useState('80');
  const [latencyDraft, setLatencyDraft] = useState('100');
  const [costDraft, setCostDraft] = useState('1');
  const [licenseDraft, setLicenseDraft] = useState<AdminLicense>('internal');
  const [qualifiedDraft, setQualifiedDraft] = useState(false);
  const [modelFormError, setModelFormError] = useState('');
  const [creatingModel, setCreatingModel] = useState(false);

  const [capabilityKeyDraft, setCapabilityKeyDraft] = useState('');
  const [budgetDraft, setBudgetDraft] = useState('');
  const [maxCostDraft, setMaxCostDraft] = useState('');
  const [minQualityDraft, setMinQualityDraft] = useState('');
  const [licenses, setLicenses] = useState<AdminLicense[]>(['internal', 'commercial', 'unknown']);
  const [executeInputJson, setExecuteInputJson] = useState('{}');
  const [routingError, setRoutingError] = useState('');
  const [routingBusy, setRoutingBusy] = useState<'' | 'preview' | 'execute'>('');
  const [decision, setDecision] = useState<AdminRoutingDecision | null>(null);
  const [executeResult, setExecuteResult] = useState<AdminRoutingExecuteResult | null>(null);

  const providerItems = providers.data ? providers.data.items : [];
  const modelItems = models.data ? models.data.items : [];
  const capabilityOptions = Array.from(
    new Set(modelItems.flatMap((model) => model.capabilityKeys))
  );
  const providerOptions = providerItems.map((provider) => ({
    value: provider.key,
    label: provider.key + ' - ' + provider.name
  }));

  async function toggleProvider(provider: AdminProvider) {
    setBusyKey('provider:' + provider.id);
    setActionError('');
    setNotice('');
    try {
      await adminApi.setProviderActive(provider.key, !provider.active);
      setNotice('Fournisseur ' + provider.key + (provider.active ? ' desactive.' : ' active.'));
      providers.reload();
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusyKey('');
    }
  }

  async function createProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const key = providerKeyDraft.trim();
    const name = providerNameDraft.trim();
    if (key.length === 0 || name.length === 0) {
      setProviderFormError('La cle et le nom du fournisseur sont obligatoires.');
      return;
    }
    setCreatingProvider(true);
    setProviderFormError('');
    try {
      const result = await adminApi.createProvider({ key, name });
      setNotice('Fournisseur ' + result.provider.key + ' enregistre.');
      setProviderKeyDraft('');
      setProviderNameDraft('');
      providers.reload();
    } catch (error) {
      setProviderFormError(errorMessage(error));
    } finally {
      setCreatingProvider(false);
    }
  }

  async function toggleModelActive(model: AdminModel) {
    setBusyKey('model-active:' + model.id);
    setActionError('');
    setNotice('');
    try {
      await adminApi.setModelActive(model.id, !model.active);
      setNotice('Modele ' + model.modelKey + (model.active ? ' desactive.' : ' active.'));
      models.reload();
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusyKey('');
    }
  }

  async function toggleModelQualification(model: AdminModel) {
    setBusyKey('model-qualified:' + model.id);
    setActionError('');
    setNotice('');
    try {
      await adminApi.qualifyModel(model.id, !model.qualified);
      setNotice('Modele ' + model.modelKey + (model.qualified ? ' disqualifie.' : ' qualifie.'));
      models.reload();
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusyKey('');
    }
  }

  async function createModel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const providerKey = modelProviderKey;
    const modelKey = modelKeyDraft.trim();
    const capabilityKeys = capabilityKeysDraft
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    const quality = parseRequiredInt(qualityDraft, 0, 100);
    const latencyMs = parseRequiredInt(latencyDraft, 0, Number.MAX_SAFE_INTEGER);
    const costCentsPerUnit = parseRequiredInt(costDraft, 0, Number.MAX_SAFE_INTEGER);
    if (providerKey.length === 0) {
      setModelFormError('Selectionnez un fournisseur.');
      return;
    }
    if (modelKey.length === 0) {
      setModelFormError('La cle du modele est obligatoire.');
      return;
    }
    if (capabilityKeys.length === 0) {
      setModelFormError('Au moins une capacite est requise (separees par des virgules).');
      return;
    }
    if (quality === null) {
      setModelFormError('La qualite doit etre un entier entre 0 et 100.');
      return;
    }
    if (latencyMs === null) {
      setModelFormError('La latence doit etre un entier positif ou nul (ms).');
      return;
    }
    if (costCentsPerUnit === null) {
      setModelFormError('Le cout par unite doit etre un entier positif ou nul (cents).');
      return;
    }
    setCreatingModel(true);
    setModelFormError('');
    try {
      const result = await adminApi.createModel({
        providerKey,
        modelKey,
        capabilityKeys,
        quality,
        latencyMs,
        costCentsPerUnit,
        license: licenseDraft,
        qualified: qualifiedDraft
      });
      setNotice('Modele ' + result.model.modelKey + ' enregistre.');
      setModelKeyDraft('');
      setCapabilityKeysDraft('');
      setQualifiedDraft(false);
      models.reload();
    } catch (error) {
      setModelFormError(errorMessage(error));
    } finally {
      setCreatingModel(false);
    }
  }

  function toggleLicense(license: AdminLicense) {
    setLicenses((previous) =>
      previous.includes(license) ? previous.filter((item) => item !== license) : [...previous, license]
    );
  }

  function buildRequirement(): RequirementBuild {
    const capabilityKey = capabilityKeyDraft.trim();
    if (capabilityKey.length === 0) {
      return { ok: false, message: 'La capacite est obligatoire pour simuler un routage.' };
    }
    const maxCostCents = parseOptionalCount(maxCostDraft);
    if (!maxCostCents.valid) {
      return { ok: false, message: 'maxCostCents doit etre un entier positif ou nul.' };
    }
    const minQuality = parseOptionalQuality(minQualityDraft);
    if (!minQuality.valid) {
      return { ok: false, message: 'minQuality doit etre un entier entre 0 et 100.' };
    }
    const budgetCents = parseOptionalCount(budgetDraft);
    if (!budgetCents.valid) {
      return { ok: false, message: 'budgetCents doit etre un entier positif ou nul.' };
    }
    const requirement: AdminCapabilityRequirement = { capabilityKey };
    if (maxCostCents.value !== undefined) {
      requirement.maxCostCents = maxCostCents.value;
    }
    if (minQuality.value !== undefined) {
      requirement.minQuality = minQuality.value;
    }
    if (licenses.length > 0) {
      requirement.allowedLicenses = licenses;
    }
    const built: RequirementBuild = { ok: true, requirement };
    if (budgetCents.value !== undefined) {
      built.budgetCents = budgetCents.value;
    }
    return built;
  }

  async function runPreview() {
    const built = buildRequirement();
    if (!built.ok) {
      setRoutingError(built.message);
      return;
    }
    setRoutingBusy('preview');
    setRoutingError('');
    setExecuteResult(null);
    try {
      const result = await adminApi.routingPreview({
        requirement: built.requirement,
        budgetCents: built.budgetCents
      });
      setDecision(result.decision);
    } catch (error) {
      setRoutingError(errorMessage(error));
    } finally {
      setRoutingBusy('');
    }
  }

  async function runExecute() {
    const built = buildRequirement();
    if (!built.ok) {
      setRoutingError(built.message);
      return;
    }
    let input: Record<string, unknown>;
    try {
      const parsed: unknown = executeInputJson.trim().length > 0 ? JSON.parse(executeInputJson) : {};
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        setRoutingError("L entree JSON doit etre un objet.");
        return;
      }
      input = parsed as Record<string, unknown>;
    } catch {
      setRoutingError("JSON d entree invalide.");
      return;
    }
    setRoutingBusy('execute');
    setRoutingError('');
    try {
      const result = await adminApi.routingExecute({
        requirement: built.requirement,
        budgetCents: built.budgetCents,
        input
      });
      setExecuteResult(result);
      setDecision(result.decision);
    } catch (error) {
      setRoutingError(errorMessage(error));
    } finally {
      setRoutingBusy('');
    }
  }

  return (
    <div className="admin-page">
      <PageHeader
        eyebrow="Administration"
        title="Fournisseurs"
        description="Registre des fournisseurs, catalogue de modeles et simulation de routage deterministe."
      />

      <div className="admin-banner admin-banner--warn" role="note">
        <strong>Registre MOCK</strong>
        <span>
          Aucune cle fournisseur n est stockee ni renvoyee. Les appels providers sont mock
          deterministes : aucun cout fournisseur reel n est engage.
        </span>
      </div>

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

      <div className="admin-sections">
        <SectionCard
          title="Fournisseurs"
          description="Activer ou desactiver un fournisseur du registre."
          actions={
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={providers.reload}
              disabled={providers.loading}
            >
              Actualiser
            </button>
          }
        >
          {providers.loading && !providers.data ? <LoadingState label="Chargement des fournisseurs..." /> : null}
          {providers.error ? <ErrorState message={providers.error} onRetry={providers.reload} /> : null}
          {providers.data ? (
            providerItems.length === 0 ? (
              <p className="admin-empty">Aucun fournisseur enregistre.</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Cle</th>
                      <th>Nom</th>
                      <th>Actif</th>
                      <th>Cree le</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {providerItems.map((provider) => (
                      <tr key={provider.id}>
                        <td className="admin-mono">{provider.key}</td>
                        <td>{provider.name}</td>
                        <td>
                          <StatusBadge status={provider.active ? 'active' : 'none'} label={provider.active ? 'Actif' : 'Inactif'} />
                        </td>
                        <td className="admin-nowrap">{formatDateTime(provider.createdAt)}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-secondary btn-small"
                            disabled={busyKey === 'provider:' + provider.id}
                            onClick={() => void toggleProvider(provider)}
                          >
                            {provider.active ? 'Desactiver' : 'Activer'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : null}
          <form className="admin-form admin-form--inline" onSubmit={createProvider}>
            <div className="admin-form-grid">
              <TextField
                id="provider-key"
                label="Cle"
                value={providerKeyDraft}
                onChange={setProviderKeyDraft}
                placeholder="mock-provider"
                required
              />
              <TextField
                id="provider-name"
                label="Nom"
                value={providerNameDraft}
                onChange={setProviderNameDraft}
                placeholder="Fournisseur mock"
                required
              />
            </div>
            {providerFormError ? (
              <p className="admin-banner admin-banner--danger" role="alert">
                {providerFormError}
              </p>
            ) : null}
            <div className="admin-actions">
              <button type="submit" className="btn btn-primary" disabled={creatingProvider}>
                {creatingProvider ? 'Enregistrement...' : 'Enregistrer le fournisseur'}
              </button>
            </div>
          </form>
        </SectionCard>

        <SectionCard
          title="Modeles"
          description="Catalogue des modeles simules : qualite, latence, cout et licence."
          actions={
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={models.reload}
              disabled={models.loading}
            >
              Actualiser
            </button>
          }
        >
          {models.loading && !models.data ? <LoadingState label="Chargement des modeles..." /> : null}
          {models.error ? <ErrorState message={models.error} onRetry={models.reload} /> : null}
          {models.data ? (
            modelItems.length === 0 ? (
              <p className="admin-empty">Aucun modele enregistre.</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Fournisseur</th>
                      <th>Modele</th>
                      <th>Capacites</th>
                      <th>Qualite</th>
                      <th>Latence</th>
                      <th>Cout / unite</th>
                      <th>Licence</th>
                      <th>Actif</th>
                      <th>Qualifie</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modelItems.map((model) => (
                      <tr key={model.id}>
                        <td className="admin-mono">{model.providerKey}</td>
                        <td className="admin-mono">{model.modelKey}</td>
                        <td>
                          <div className="admin-badge-row">
                            {model.capabilityKeys.map((capability) => (
                              <span className="admin-badge admin-badge--info" key={model.id + ':' + capability}>
                                {capability}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>{model.quality}</td>
                        <td className="admin-nowrap">{model.latencyMs} ms</td>
                        <td className="admin-nowrap">{formatCents(model.costCentsPerUnit)}</td>
                        <td>{statusLabel(model.license)}</td>
                        <td>
                          <StatusBadge status={model.active ? 'active' : 'none'} label={model.active ? 'Actif' : 'Inactif'} />
                        </td>
                        <td>
                          <StatusBadge
                            status={model.qualified ? 'ok' : 'pending'}
                            label={model.qualified ? 'Qualifie' : 'Non qualifie'}
                          />
                        </td>
                        <td>
                          <div className="admin-actions">
                            <button
                              type="button"
                              className="btn btn-secondary btn-small"
                              disabled={busyKey === 'model-active:' + model.id}
                              onClick={() => void toggleModelActive(model)}
                            >
                              {model.active ? 'Desactiver' : 'Activer'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-small"
                              disabled={busyKey === 'model-qualified:' + model.id}
                              onClick={() => void toggleModelQualification(model)}
                            >
                              {model.qualified ? 'Disqualifier' : 'Qualifier'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : null}

          <form className="admin-form admin-form--inline" onSubmit={createModel}>
            <div className="admin-form-grid">
              <SelectField
                id="model-provider"
                label="Fournisseur"
                value={modelProviderKey}
                onChange={setModelProviderKey}
                options={providerOptions}
                placeholder={providerOptions.length === 0 ? 'Aucun fournisseur' : 'Selectionner'}
                required
                disabled={providerOptions.length === 0}
              />
              <TextField
                id="model-key"
                label="Cle du modele"
                value={modelKeyDraft}
                onChange={setModelKeyDraft}
                placeholder="mock-model-v1"
                required
              />
              <TextField
                id="model-capabilities"
                label="Capacites"
                value={capabilityKeysDraft}
                onChange={setCapabilityKeysDraft}
                placeholder="image.generate, video.render"
                hint="Separees par des virgules."
                required
              />
              <TextField
                id="model-quality"
                label="Qualite (0-100)"
                type="number"
                min={0}
                max={100}
                step={1}
                value={qualityDraft}
                onChange={setQualityDraft}
                required
              />
              <TextField
                id="model-latency"
                label="Latence (ms)"
                type="number"
                min={0}
                step={1}
                value={latencyDraft}
                onChange={setLatencyDraft}
                required
              />
              <TextField
                id="model-cost"
                label="Cout par unite (cents)"
                type="number"
                min={0}
                step={1}
                value={costDraft}
                onChange={setCostDraft}
                required
              />
              <SelectField
                id="model-license"
                label="Licence"
                value={licenseDraft}
                onChange={(value) => setLicenseDraft(toLicense(value))}
                options={LICENSE_SELECT_OPTIONS}
                required
              />
              <CheckboxField
                id="model-qualified"
                label="Modele qualifie"
                checked={qualifiedDraft}
                onChange={setQualifiedDraft}
              />
            </div>
            {modelFormError ? (
              <p className="admin-banner admin-banner--danger" role="alert">
                {modelFormError}
              </p>
            ) : null}
            <div className="admin-actions">
              <button type="submit" className="btn btn-primary" disabled={creatingModel || providerOptions.length === 0}>
                {creatingModel ? 'Enregistrement...' : 'Enregistrer le modele'}
              </button>
            </div>
          </form>
        </SectionCard>

        <SectionCard
          title="Simulation de routage"
          description="Decision deterministe, puis execution mock. Aucun appel fournisseur reel."
        >
          <div className="admin-form">
            <div className="admin-form-grid">
              <TextField
                id="routing-capability"
                label="Capacite"
                value={capabilityKeyDraft}
                onChange={setCapabilityKeyDraft}
                placeholder="image.generate"
                hint={
                  capabilityOptions.length > 0
                    ? 'Capacites connues : ' + capabilityOptions.join(', ')
                    : 'Aucune capacite connue dans le catalogue.'
                }
                required
              />
              <TextField
                id="routing-budget"
                label="Budget (cents, optionnel)"
                type="number"
                min={0}
                step={1}
                value={budgetDraft}
                onChange={setBudgetDraft}
              />
              <TextField
                id="routing-max-cost"
                label="Cout max par unite (cents, optionnel)"
                type="number"
                min={0}
                step={1}
                value={maxCostDraft}
                onChange={setMaxCostDraft}
              />
              <TextField
                id="routing-min-quality"
                label="Qualite minimale (0-100, optionnel)"
                type="number"
                min={0}
                max={100}
                step={1}
                value={minQualityDraft}
                onChange={setMinQualityDraft}
              />
            </div>
            <div className="admin-field">
              <span className="label">Licences autorisees</span>
              <div className="admin-checkbox-group">
                {LICENSE_OPTIONS.map((license) => (
                  <label className="admin-checkbox" key={license}>
                    <input
                      type="checkbox"
                      checked={licenses.includes(license)}
                      onChange={() => toggleLicense(license)}
                    />
                    <span>{license}</span>
                  </label>
                ))}
              </div>
              <span className="admin-field-hint">
                Aucune case cochee = toutes les licences sont acceptees.
              </span>
            </div>
            <div className="admin-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void runPreview()}
                disabled={routingBusy !== ''}
              >
                {routingBusy === 'preview' ? 'Simulation...' : 'Simuler la decision'}
              </button>
            </div>
            <TextareaField
              id="routing-input"
              label="Entree JSON d execution"
              value={executeInputJson}
              onChange={setExecuteInputJson}
              rows={4}
              hint="Objet JSON transmis au provider mock lors de l execution."
            />
            <div className="admin-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void runExecute()}
                disabled={routingBusy !== ''}
              >
                {routingBusy === 'execute' ? 'Execution...' : 'Executer (mock)'}
              </button>
              <span className="admin-meta">
                L execution enregistre un CostEvent mock et une trace d audit.
              </span>
            </div>
            {routingError ? (
              <p className="admin-banner admin-banner--danger" role="alert">
                {routingError}
              </p>
            ) : null}
          </div>

          {decision ? (
            <div className="admin-decision">
              <div className="admin-section-head">
                <h3>Decision de routage</h3>
                <FlagBadge status="MOCK" />
              </div>
              <div className="admin-kv">
                <div>
                  <span>Modele selectionne</span>
                  <strong className="admin-mono">{shortId(decision.selectedModelId, 16)}</strong>
                </div>
                <div>
                  <span>Fallback</span>
                  <strong className="admin-mono">{decision.fallbackModelId ? shortId(decision.fallbackModelId, 16) : 'Aucun'}</strong>
                </div>
                <div>
                  <span>Capacite</span>
                  <strong>{decision.capabilityKey}</strong>
                </div>
                <div>
                  <span>Decide le</span>
                  <strong>{formatDateTime(decision.createdAt)}</strong>
                </div>
              </div>
              <p className="admin-meta">
                <strong>Raison :</strong> {decision.reason}
              </p>
              <p className="admin-meta">
                <strong>Candidats :</strong>{' '}
                {decision.candidateModelIds.length > 0
                  ? decision.candidateModelIds.map((item) => shortId(item, 10)).join(', ')
                  : 'Aucun'}
              </p>
              <details className="admin-details">
                <summary>Criteres de decision</summary>
                <pre className="admin-pre">{formatJson(decision.criteria)}</pre>
              </details>
            </div>
          ) : null}

          {executeResult ? (
            <div className="admin-decision">
              <div className="admin-section-head">
                <h3>Resultat d execution</h3>
                <div className="admin-actions">
                  <FlagBadge status="MOCK" />
                  <StatusBadge
                    status={executeResult.usedFallback ? 'recovery_pending' : 'succeeded'}
                    label={executeResult.usedFallback ? 'Fallback utilise' : 'Modele primaire'}
                  />
                </div>
              </div>
              <div className="admin-kv">
                <div>
                  <span>Provider</span>
                  <strong className="admin-mono">{executeResult.result.providerKey}</strong>
                </div>
                <div>
                  <span>Modele</span>
                  <strong className="admin-mono">{executeResult.result.modelKey}</strong>
                </div>
                <div>
                  <span>Cout mock</span>
                  <strong>{formatCents(executeResult.result.costCents)}</strong>
                </div>
                <div>
                  <span>Latence</span>
                  <strong>{executeResult.result.latencyMs} ms</strong>
                </div>
              </div>
              <details className="admin-details" open>
                <summary>Sortie mock</summary>
                <pre className="admin-pre">{formatJson(executeResult.result.output)}</pre>
              </details>
            </div>
          ) : null}
        </SectionCard>
      </div>
    </div>
  );
}
