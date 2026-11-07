import { api } from './api';

/**
 * Types et client des routes /api/admin/* et /api/ops/*.
 * Les types reproduisent le contrat expose par l API (packages/contracts/src/admin.ts,
 * packages/application/src/ports.ts). Aucun secret n est jamais renvoye par ces routes.
 */

export type AdminFlagStatus = 'CONNECTED' | 'MOCK' | 'NOT_CONNECTED';

export type AdminFlag = {
  key: string;
  label: string;
  status: AdminFlagStatus;
  detail: string;
};

export type AdminPage<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type AdminCounts = {
  users: number;
  superAdmins: number;
  invitations: number;
  pendingInvitations: number;
  contexts: number;
  projects: number;
  jobRuns: number;
  failedRuns: number;
  auditEvents24h: number;
  rbacDenied24h: number;
  costEvents: number;
  costCents: number;
};

export type AdminOverviewError = {
  id: string;
  source: 'job_run' | 'step_run' | 'outbox';
  status: string;
  error: string;
  createdAt: string;
  jobRunId: string | null;
  projectId: string | null;
};

export type AdminOverview = {
  generatedAt: string;
  counts: AdminCounts;
  runsByStatus: Record<string, number>;
  stepsByStatus: Record<string, number>;
  outboxByStatus: Record<string, number>;
  artifactsByState: Record<string, number>;
  workers: { active: number; stale: number; total: number };
  database: 'ok' | 'error';
  storage: { backend: string; ok: boolean; detail: string };
  orchestrator: { mode: 'local' | 'hatchet'; detail: string };
  providers: { mode: 'MOCK' | 'REAL'; detail: string };
  postiz: { mode: 'MOCK' | 'REAL'; detail: string };
  flags: AdminFlag[];
  recentErrors: AdminOverviewError[];
};

export type AdminUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
  projectsCount: number;
  sessionsCount: number;
  lastSessionAt: string | null;
  lastSessionStatus: 'active' | 'expired' | 'revoked' | 'none';
};

export type AdminInvitation = {
  id: string;
  email: string;
  role: string;
  createdBy: string;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export type AdminLicense = 'internal' | 'commercial' | 'unknown';

export type AdminCapabilityRequirement = {
  capabilityKey: string;
  maxCostCents?: number;
  minQuality?: number;
  maxLatencyMs?: number;
  allowedLicenses?: AdminLicense[];
};

export type AdminAgent = {
  id: string;
  key: string;
  name: string;
  role: string;
  capabilityRequirements: AdminCapabilityRequirement[];
  activeConfigVersionId: string | null;
  createdAt: string;
};

export type AdminAgentConfig = {
  id: string;
  agentId: string;
  version: number;
  soul: string;
  instructions: string;
  guardrails: string[];
  checksum: string;
  createdAt: string;
};

export type AdminProvider = {
  credentials?: { configured: boolean; updatedAt: string | null; writable: boolean };
  id: string;
  key: string;
  name: string;
  active: boolean;
  createdAt: string;
};

export type AdminModel = {
  id: string;
  providerId: string;
  providerKey: string;
  modelKey: string;
  capabilityKeys: string[];
  quality: number;
  latencyMs: number;
  costCentsPerUnit: number;
  license: AdminLicense;
  active: boolean;
  qualified: boolean;
  createdAt: string;
};

export type AdminRun = {
  id: string;
  projectId: string;
  projectTitle: string;
  ownerEmail: string;
  type: string;
  status: string;
  orchestrator: string | null;
  workflowRunId: string | null;
  traceId: string | null;
  createdAt: string;
  updatedAt: string;
  stepsTotal: number;
  stepsFailed: number;
  currentStep: string | null;
  error: string | null;
  productionStatus: string | null;
  progress: number | null;
};

export type AdminStep = {
  name: string;
  status: string;
  attempts: number;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

export type AdminOutboxEntry = {
  id: string;
  kind: string;
  status: string;
  attempts: number;
  lastError: string | null;
  workflowRunId: string | null;
  createdAt: string;
};

export type AdminArtifact = {
  id: string;
  artifactVersionId: string;
  masterVersion: number;
  checksum: string;
  createdAt: string;
};

export type AdminRunDetail = AdminRun & {
  steps: AdminStep[];
  outbox: AdminOutboxEntry[];
  artifact: AdminArtifact | null;
};

export type AdminAuditEvent = {
  id: string;
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: unknown;
  traceId: string | null;
  requestId: string | null;
  createdAt: string;
};

export type AdminCostEvent = {
  id: string;
  projectId: string | null;
  projectTitle: string | null;
  jobRunId: string | null;
  provider: string;
  model: string | null;
  units: number;
  amountCents: number;
  createdAt: string;
};

export type AdminCosts = {
  items: AdminCostEvent[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  totalCents: number;
  totalEvents: number;
  byProvider: Array<{ provider: string; events: number; cents: number }>;
  mode: 'MOCK' | 'REAL';
};

export type AdminRoutingDecision = {
  id: string;
  capabilityKey: string;
  candidateModelIds: string[];
  selectedModelId: string;
  fallbackModelId: string | null;
  criteria: unknown;
  reason: string;
  createdAt: string;
};

export type AdminCapabilityResult = {
  output: Record<string, unknown>;
  providerKey: string;
  modelKey: string;
  costCents: number;
  latencyMs: number;
  mock: boolean;
};

export type AdminRoutingExecuteResult = {
  decision: AdminRoutingDecision;
  result: AdminCapabilityResult;
  usedFallback: boolean;
};

export type AdminRuntime = {
  generatedAt: string;
  appEnv: string;
  orchestratorMode: 'local' | 'hatchet';
  storageBackend: 'local' | 's3';
  s3TlsRequired: boolean;
  sessionTtlHours: number;
  invitationTtlHours: number;
  budget: { durableBudgetCents: number | null; maxRunCostCents: number | null };
  flags: AdminFlag[];
  versions: { node: string; prisma: string };
};

export type OpsHealth = {
  status: 'ok' | 'degraded';
  database: 'ok' | 'error';
  workersActive: number;
  outboxPending: number;
  generatedAt: string;
};

export type OpsWorker = {
  id: string;
  name: string;
  status: string;
  lastSeenAt: string;
  stale: boolean;
};

export type OpsSnapshot = {
  generatedAt: string;
  database: 'ok' | 'error';
  workers: OpsWorker[];
  jobRuns: Record<string, number>;
  stepRuns: Record<string, number>;
  outbox: Record<string, number>;
  artifacts: Record<string, number>;
};

export type ReconciliationReport = {
  generatedAt: string;
  dryRun: boolean;
  workers: { active: number; stale: number; staleThresholdSeconds: number };
  outbox: {
    pending: number;
    dispatching: number;
    failed: number;
    stalePending: number;
    staleDispatching: number;
  };
  jobRuns: {
    queuedWithoutWorkflow: number;
    runningStale: number;
    waitingApproval: number;
    terminalMismatch: number;
  };
  steps: { runningOverdue: number };
  artifacts: { stagedOverdue: number };
  actions: Array<{ kind: string; id: string; applied: boolean; detail: string }>;
  incidents: Array<{ classification: string; id: string; detail: string; requiresHuman: boolean }>;
  note: string;
  dispatcherAttached: boolean;
};

export type AdminUserQuery = {
  page: number;
  pageSize: number;
  q?: string;
};

export type AdminRunQuery = {
  page: number;
  pageSize: number;
  status?: string;
};

export type AdminAuditQuery = {
  page: number;
  pageSize: number;
  action?: string;
  actorId?: string;
  targetType?: string;
  from?: string;
  to?: string;
};

export type AdminCostQuery = {
  page: number;
  pageSize: number;
  provider?: string;
  from?: string;
  to?: string;
};

export type AdminModelInput = {
  providerKey: string;
  modelKey: string;
  capabilityKeys: string[];
  quality: number;
  latencyMs: number;
  costCentsPerUnit: number;
  license: AdminLicense;
  qualified: boolean;
};

export type AdminRoutingRequirementInput = AdminCapabilityRequirement;

export type AdminRoutingPreviewInput = {
  requirement: AdminRoutingRequirementInput;
  budgetCents?: number;
};

export type AdminRoutingExecuteInput = AdminRoutingPreviewInput & {
  input: Record<string, unknown>;
};

/** Construit une query string en ignorant les valeurs vides. */
function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') {
      continue;
    }
    search.set(key, String(value));
  }
  const query = search.toString();
  return query.length > 0 ? '?' + query : '';
}

function postJsonAdmin<T>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

function deleteAdmin<T>(path: string): Promise<T> {
  return api<T>(path, { method: 'DELETE' });
}

/** Client type des routes d administration. */
export const adminApi = {
  overview: () => api<AdminOverview>('/api/admin/overview'),

  users: (input: AdminUserQuery) =>
    api<AdminPage<AdminUser>>('/api/admin/users' + buildQuery({ page: input.page, pageSize: input.pageSize, q: input.q })),

  revokeUserSessions: (userId: string) =>
    postJsonAdmin<{ ok: boolean; revokedSessions: number }>(
      '/api/admin/users/' + encodeURIComponent(userId) + '/sessions/revoke',
      {}
    ),

  invitations: () => api<{ items: AdminInvitation[] }>('/api/admin/invitations'),

  createInvitation: (input: { email: string; role: string }) =>
    postJsonAdmin<{ invitation: AdminInvitation; token: string }>('/api/admin/invitations', input),

  revokeInvitation: (invitationId: string) =>
    deleteAdmin<{ invitation: AdminInvitation }>('/api/admin/invitations/' + encodeURIComponent(invitationId)),

  agents: () => api<{ items: AdminAgent[] }>('/api/admin/agents'),

  agentConfigs: (agentId: string) =>
    api<{ items: AdminAgentConfig[] }>('/api/admin/agents/' + encodeURIComponent(agentId) + '/configs'),

  createAgentConfig: (agentId: string, input: { soul: string; instructions: string; guardrails: string[] }) =>
    postJsonAdmin<{ config: AdminAgentConfig }>(
      '/api/admin/agents/' + encodeURIComponent(agentId) + '/configs',
      input
    ),

  promoteAgentConfig: (agentId: string, configVersionId: string) =>
    postJsonAdmin<{ agent: AdminAgent }>(
      '/api/admin/agents/' + encodeURIComponent(agentId) + '/promote',
      { configVersionId }
    ),

  rollbackAgentConfig: (agentId: string, configVersionId: string) =>
    postJsonAdmin<{ agent: AdminAgent }>(
      '/api/admin/agents/' + encodeURIComponent(agentId) + '/rollback',
      { configVersionId }
    ),

  providers: () => api<{ items: AdminProvider[] }>('/api/admin/providers'),
  saveProviderCredentials: (key: string, apiKey: string) => api<{ credentials: NonNullable<AdminProvider['credentials']> }>('/api/admin/providers/' + encodeURIComponent(key) + '/credentials', { method: 'PUT', body: JSON.stringify({ apiKey }) }),
  removeProviderCredentials: (key: string) => deleteAdmin<{ credentials: NonNullable<AdminProvider['credentials']> }>('/api/admin/providers/' + encodeURIComponent(key) + '/credentials'),

  createProvider: (input: { key: string; name: string }) =>
    postJsonAdmin<{ provider: AdminProvider }>('/api/admin/providers', input),

  setProviderActive: (providerKey: string, active: boolean) =>
    postJsonAdmin<{ provider: AdminProvider }>(
      '/api/admin/providers/' + encodeURIComponent(providerKey) + '/active',
      { active }
    ),

  models: () => api<{ items: AdminModel[] }>('/api/admin/models'),

  createModel: (input: AdminModelInput) => postJsonAdmin<{ model: AdminModel }>('/api/admin/models', input),

  setModelActive: (modelId: string, active: boolean) =>
    postJsonAdmin<{ model: AdminModel }>('/api/admin/models/' + encodeURIComponent(modelId) + '/active', {
      active
    }),

  qualifyModel: (modelId: string, qualified: boolean) =>
    postJsonAdmin<{ model: AdminModel }>(
      '/api/admin/models/' + encodeURIComponent(modelId) + '/qualification',
      { qualified }
    ),

  routingPreview: (input: AdminRoutingPreviewInput) =>
    postJsonAdmin<{ decision: AdminRoutingDecision }>('/api/admin/routing/preview', input),

  routingExecute: (input: AdminRoutingExecuteInput) =>
    postJsonAdmin<AdminRoutingExecuteResult>('/api/admin/routing/execute', input),

  runs: (input: AdminRunQuery) =>
    api<AdminPage<AdminRun>>(
      '/api/admin/runs' + buildQuery({ page: input.page, pageSize: input.pageSize, status: input.status })
    ),

  run: (runId: string) => api<AdminRunDetail>('/api/admin/runs/' + encodeURIComponent(runId)),

  audit: (input: AdminAuditQuery) =>
    api<AdminPage<AdminAuditEvent>>(
      '/api/admin/audit' +
        buildQuery({
          page: input.page,
          pageSize: input.pageSize,
          action: input.action,
          actorId: input.actorId,
          targetType: input.targetType,
          from: input.from,
          to: input.to
        })
    ),

  costs: (input: AdminCostQuery) =>
    api<AdminCosts>(
      '/api/admin/costs' +
        buildQuery({
          page: input.page,
          pageSize: input.pageSize,
          provider: input.provider,
          from: input.from,
          to: input.to
        })
    ),

  runtime: () => api<AdminRuntime>('/api/admin/runtime'),

  opsHealth: () => api<OpsHealth>('/api/ops/health'),

  opsSnapshot: () => api<OpsSnapshot>('/api/ops/snapshot'),

  reconcile: (input: { dryRun: boolean; staleSeconds: number; stagedGraceHours: number }) =>
    postJsonAdmin<ReconciliationReport>('/api/ops/reconcile', input),

  logout: () => api<{ ok: boolean }>('/api/auth/logout', { method: 'POST' })
};

export const ROLE_LABELS: Record<string, string> = {
  user: 'Utilisateur',
  super_admin: 'Super administrateur'
};

export const JOB_RUN_STATUSES = [
  'queued',
  'running',
  'waiting_approval',
  'recovery_pending',
  'succeeded',
  'failed',
  'cancelled',
  'timed_out'
] as const;

export const LICENSE_OPTIONS: AdminLicense[] = ['internal', 'commercial', 'unknown'];

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  expired: 'Expiree',
  revoked: 'Revoquee',
  none: 'Aucune',
  used: 'Utilisee',
  pending: 'En attente',
  queued: 'En file',
  running: 'En cours',
  waiting_approval: 'Approbation',
  recovery_pending: 'Recuperation',
  succeeded: 'Reussi',
  failed: 'Echoue',
  cancelled: 'Annule',
  timed_out: 'Expire',
  dispatching: 'Dispatch',
  staged: 'Staged',
  committed: 'Committed',
  ok: 'OK',
  error: 'Erreur',
  degraded: 'Degrade',
  connected: 'Connecte',
  mock: 'Mock',
  not_connected: 'Non connecte',
  internal: 'Interne',
  commercial: 'Commercial',
  unknown: 'Inconnue'
};

export type StatusTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral';

/** Libelle lisible d un statut brut renvoye par l API. */
export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

/** Tonalite visuelle d un statut. */
export function statusTone(status: string): StatusTone {
  switch (status) {
    case 'ok':
    case 'succeeded':
    case 'active':
    case 'approved':
    case 'committed':
    case 'connected':
      return 'success';
    case 'error':
    case 'failed':
    case 'revoked':
    case 'denied':
    case 'timed_out':
      return 'danger';
    case 'running':
    case 'queued':
    case 'pending':
    case 'waiting_approval':
    case 'recovery_pending':
    case 'dispatching':
    case 'expired':
    case 'degraded':
    case 'stale':
      return 'warning';
    case 'cancelled':
    case 'staged':
    case 'used':
    case 'mock':
      return 'info';
    default:
      return 'neutral';
  }
}

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return 'Erreur inconnue.';
}

function parseDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return '-';
  }
  const date = parseDate(value);
  if (!date) {
    return value;
  }
  return date.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'medium' });
}

export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return '-';
  }
  const date = parseDate(value);
  if (!date) {
    return value;
  }
  return date.toLocaleDateString('fr-FR', { dateStyle: 'medium' });
}

export function formatNumber(value: number): string {
  return value.toLocaleString('fr-FR');
}

/** Montants stockes en cents : affichage honnete, sans supposer une devise. */
export function formatCents(cents: number): string {
  return formatNumber(cents) + ' cents';
}

export function shortId(value: string | null | undefined, length = 10): string {
  if (!value) {
    return '-';
  }
  return value.length <= length ? value : value.slice(0, length) + '...';
}

export function formatJson(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  try {
    const serialized = JSON.stringify(value, null, 2);
    return serialized === undefined ? String(value) : serialized;
  } catch {
    return String(value);
  }
}

/** Transforme une map statut -> compteur en donnees de graphique. */
export function countEntries(map: Record<string, number>): Array<{ label: string; value: number }> {
  return Object.entries(map ?? {})
    .map(([label, value]) => ({ label: statusLabel(label), value }))
    .sort((left, right) => right.value - left.value);
}

/** Resume compact d une map statut -> compteur (ex: "en cours: 2 - echoue: 1"). */
export function countSummary(map: Record<string, number>): string {
  const parts = Object.entries(map ?? {}).map(
    ([status, value]) => statusLabel(status) + ': ' + formatNumber(value)
  );
  return parts.length > 0 ? parts.join(' - ') : 'Aucune donnee';
}

export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
