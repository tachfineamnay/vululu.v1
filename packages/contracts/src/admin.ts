import { z } from 'zod';

/** Pagination commune aux lectures d'administration (1-based). */
export const adminPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(200).optional()
});

export const adminRunQuerySchema = adminPaginationSchema.extend({
  status: z.string().trim().max(40).optional()
});

export const adminAuditQuerySchema = adminPaginationSchema.extend({
  action: z.string().trim().max(120).optional(),
  actorId: z.string().trim().max(64).optional(),
  targetType: z.string().trim().max(60).optional(),
  from: z.string().trim().max(40).optional(),
  to: z.string().trim().max(40).optional()
});

export const adminCostQuerySchema = adminPaginationSchema.extend({
  provider: z.string().trim().max(80).optional(),
  from: z.string().trim().max(40).optional(),
  to: z.string().trim().max(40).optional()
});

export const adminRoutingQuerySchema = adminPaginationSchema;

export type AdminPaginationInput = z.infer<typeof adminPaginationSchema>;
export type AdminRunQueryInput = z.infer<typeof adminRunQuerySchema>;
export type AdminAuditQueryInput = z.infer<typeof adminAuditQuerySchema>;
export type AdminCostQueryInput = z.infer<typeof adminCostQuerySchema>;

export type AdminPage<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type AdminFlagStatus = 'CONNECTED' | 'MOCK' | 'NOT_CONNECTED';

export type AdminFlag = {
  key: string;
  label: string;
  status: AdminFlagStatus;
  detail: string;
};

export type AdminOverview = {
  generatedAt: string;
  counts: {
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
  recentErrors: Array<{
    id: string;
    source: 'job_run' | 'step_run' | 'outbox';
    status: string;
    error: string;
    createdAt: string;
    jobRunId: string | null;
    projectId: string | null;
  }>;
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

export type AdminProject = {
  id: string;
  title: string;
  ownerEmail: string;
  status: string;
  platform: string;
  format: string;
  contextName: string;
  scenesCount: number;
  runsCount: number;
  createdAt: string;
  updatedAt: string;
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

export type AdminRunDetail = AdminRun & {
  steps: AdminStep[];
  outbox: Array<{
    id: string;
    kind: string;
    status: string;
    attempts: number;
    lastError: string | null;
    workflowRunId: string | null;
    createdAt: string;
  }>;
  artifact: {
    id: string;
    artifactVersionId: string;
    masterVersion: number;
    checksum: string;
    createdAt: string;
  } | null;
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

export type AdminCostsSummary = {
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

export type AdminAgent = {
  id: string;
  key: string;
  name: string;
  role: string;
  capabilityRequirements: unknown;
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
  license: string;
  active: boolean;
  qualified: boolean;
  createdAt: string;
};

export type AdminRoutingPreview = {
  decision: {
    selectedModelId: string;
    fallbackModelId: string | null;
    reason: string;
    criteria: unknown;
  };
};
