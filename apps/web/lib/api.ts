import type { ProductionSettings } from '@vululu/contracts';
import type { MessageProposal } from '@vululu/application';
export type { MessageProposal } from '@vululu/application';
export type ProductionPlanView = {
  mode: 'MOCK'; executionMode: 'local' | 'hatchet'; briefVersion: number; checksum: string;
  ready: boolean; sceneCount: number; durationSeconds: number; ratio: string;
  pricing: { estimatedCents: number; maxPossibleCents: number; ceilingCents: number };
  steps: Array<{ key: string; dependsOn: string[]; capability: string }>;
  issues: Array<{ code: string; message: string }>;
};
export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: string;
};

export type BrandContext = {
  id: string;
  name: string;
  website: string | null;
  description: string;
  audience: string | null;
  tone: string | null;
  colorPrimary: string;
  colorSecondary: string;
};

export type ProjectSummary = {
  id: string;
  contextId: string;
  campaignId?: string | null;
  title: string;
  status: string;
  platform: string;
  format: string;
  objective: string;
  sceneDurationSeconds: number;
  context?: BrandContext;
  updatedAt: string;
};

export type SceneVersion = {
  id: string;
  version: number;
  imagePath: string;
  checksum: string;
  createdAt: string;
};

export type Scene = {
  id: string;
  sceneKey: string;
  position: number;
  title: string;
  description: string;
  durationSeconds: number;
  usesBriefDuration?: boolean | null;
  characterKey: string | null;
  versions: SceneVersion[];
};

export type Message = {
  id: string;
  role: string;
  content: string;
  proposal?: MessageProposal;
  createdAt: string;
};

export type Approval = {
  id: string;
  checksum: string;
  invalidatedAt?: string | null;
  createdAt: string;
  transfer?: Transfer | null;
};

export type Transfer = {
  id: string;
  status: string;
  provider: string;
  externalId: string | null;
};

export type MasterVersion = {
  id: string;
  version: number;
  masterPath: string;
  checksum: string;
  qaStatus: string | null;
  qaReport: unknown;
  createdAt: string;
  approval?: Approval | null;
};

export type ProductionJob = {
  id: string;
  type: string;
  status: string;
  step: string;
  progress: number;
  error: string | null;
};

export type JobStep = {
  name: string;
  status: string;
  attempts: number;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

export type JobRunTracking = {
  id: string;
  status: string;
  orchestrator: string | null;
  workflowRunId: string | null;
  traceId: string | null;
  createdAt: string;
  updatedAt: string;
  steps: JobStep[];
};

export type MockCostSummary = {
  totalCents: number;
  events: number;
  mode: 'MOCK';
};

export type ProjectBundle = {
  project: {
    campaignId?: string | null;
    id: string;
    title: string;
    status: string;
    platform: string;
    format: string;
    objective: string;
    sceneDurationSeconds: number;
    contextId: string;
    storyboardBriefVersion?: number | null;
    createdAt: string;
    updatedAt: string;
  };
  context: BrandContext;
  brief: {
    id: string;
    objective: string;
    audience: string;
    tone: string;
    cta: string;
    platform: string;
    format: string;
    version: number;
    revisions: Array<{
      id: string;
      version: number;
      objective: string;
      audience: string;
      tone: string;
      cta: string;
      platform: string;
      format: string;
      checksum: string;
      createdAt: string;
    }>;
    confirmedVersion?: number | null;
    confirmedChecksum?: string | null;
    settings?: ProductionSettings;
  } | null;
  messages: Message[];
  scenes: Scene[];
  characters: Array<{ id: string; characterKey: string; name: string }>;
  master: MasterVersion | null;
  masterVersions: MasterVersion[];
  job: ProductionJob | null;
  jobRun: JobRunTracking | null;
  costs: MockCostSummary;
};

export type CampaignSummary = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
};

export type AssetDecisionItem = {
  assetId: string; versionId: string; version: number; name: string; kind: string;
  mimeType: string; sha256: string; license: string; provenance: string;
};
export type AssetDecisionSnapshot = {
  schemaVersion: 1; decision: 'assets' | 'none'; format: string; usage: 'organic' | 'sponsored';
  confirmedAt: string; items: AssetDecisionItem[];
};
export type ProjectAssetDecision = {
  confirmed: boolean; stale: boolean;
  reason: 'not_confirmed' | 'selection_changed' | 'version_unavailable' | 'format_incompatible' | 'license_usage_restricted' | null;
  compatibleKinds: string[] | null;
  confirmedAt: string | null; digest: string | null; usage: 'organic' | 'sponsored';
  versionIds: string[]; noAssets: boolean; snapshot: AssetDecisionSnapshot | null;
};

function readCookie(name: string): string {
  if (typeof document === 'undefined') {
    return '';
  }
  const prefix = name + '=';
  for (const part of document.cookie.split(';')) {
    const value = part.trim();
    if (value.startsWith(prefix)) {
      return decodeURIComponent(value.slice(prefix.length));
    }
  }
  return '';
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly retryAfterSeconds?: number
  ) {
    super(message);
  }
}

function parseRetryAfterSeconds(header: string | null, bodyValue: unknown): number | undefined {
  if (typeof bodyValue === 'number' && Number.isFinite(bodyValue) && bodyValue > 0) {
    return Math.min(30, Math.max(1, Math.ceil(bodyValue)));
  }
  if (!header) return undefined;
  const numeric = Number(header.trim());
  if (Number.isFinite(numeric) && numeric > 0) {
    return Math.min(30, Math.max(1, Math.ceil(numeric)));
  }
  const timestamp = Date.parse(header);
  if (Number.isFinite(timestamp)) {
    const delta = Math.ceil((timestamp - Date.now()) / 1000);
    if (delta > 0) return Math.min(30, delta);
  }
  return undefined;
}

type BusyRetryOptions = {
  attempts?: number;
  delaysMs?: number[];
  signal?: AbortSignal;
  onWait?: (attempt: number, attempts: number) => void;
};

function abortError(): Error {
  return typeof DOMException === 'function'
    ? new DOMException('Opération annulée.', 'AbortError')
    : Object.assign(new Error('Opération annulée.'), { name: 'AbortError' });
}

async function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (!signal) {
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    return;
  }
  if (signal.aborted) throw abortError();
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => { clearTimeout(timer); reject(abortError()); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, delayMs);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Attend un créneau de rendu borné sans relever les limites de concurrence : une lecture
 * idempotente (aperçu) qui reçoit 429 « rendu en cours » est rejouée quelques fois avec un
 * délai croissant, puis abandonne en conservant l'erreur du serveur. Les autres erreurs
 * (409, 422, 5xx) ne sont jamais rejouées.
 */
export async function withBusyRetry<T>(operation: () => Promise<T>, options: BusyRetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 5);
  const delays = options.delaysMs && options.delaysMs.length ? options.delaysMs : [400, 900, 1600, 2500];
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const busy = error instanceof ApiRequestError && error.status === 429;
      if (!busy || attempt >= attempts) throw error;
      options.onWait?.(attempt, attempts);
      await waitForRetry(delays[Math.min(attempt - 1, delays.length - 1)], options.signal);
    }
  }
}

export async function apiResponse(path: string, init?: RequestInit): Promise<Response> {
  const method = (init && init.method ? init.method : 'GET').toUpperCase();
  const headers: Record<string, string> = init && init.body ? { 'Content-Type': 'application/json' } : {};
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const csrf = readCookie('vululu_csrf');
    if (csrf) {
      headers['x-csrf-token'] = csrf;
    }
  }
  const response = await fetch(path, {
    ...init,
    headers: { ...headers, ...(init && init.headers ? (init.headers as Record<string, string>) : {}) },
    credentials: 'include',
    cache: 'no-store'
  });
  if (!response.ok) {
    let message = 'Erreur ' + response.status;
    let code: string | undefined;
    let retryAfterBody: unknown;
    try {
      const data = (await response.json()) as { error?: string; message?: string; retryAfterSeconds?: number };
      if (data.message) {
        message = data.message;
      }
      if (typeof data.error === 'string' && data.error.length > 0) {
        code = data.error;
      }
      retryAfterBody = data.retryAfterSeconds;
    } catch {
      // Keep the status message.
    }
    const retryAfterSeconds = parseRetryAfterSeconds(response.headers.get('Retry-After'), retryAfterBody);
    throw new ApiRequestError(message, response.status, code, retryAfterSeconds);
  }
  return response;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  return (await (await apiResponse(path, init)).json()) as T;
}

export function postJson<T>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

export function patchJson<T>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
}
