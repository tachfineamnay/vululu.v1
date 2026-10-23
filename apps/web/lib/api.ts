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
  characterKey: string | null;
  versions: SceneVersion[];
};

export type Message = {
  id: string;
  role: string;
  content: string;
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

export type ProjectBundle = {
  project: {
    id: string;
    title: string;
    status: string;
    platform: string;
    format: string;
    objective: string;
    sceneDurationSeconds: number;
    contextId: string;
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
  } | null;
  messages: Message[];
  scenes: Scene[];
  characters: Array<{ id: string; characterKey: string; name: string }>;
  master: MasterVersion | null;
  masterVersions: MasterVersion[];
  job: ProductionJob | null;
};

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const response = await fetch(path, {
    ...init,
    headers: { ...headers, ...(init && init.headers ? (init.headers as Record<string, string>) : {}) },
    credentials: 'include',
    cache: 'no-store'
  });
  if (!response.ok) {
    let message = 'Erreur ' + response.status;
    try {
      const data = (await response.json()) as { message?: string };
      if (data.message) {
        message = data.message;
      }
    } catch {
      // Keep the status message.
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

export function postJson<T>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

export function patchJson<T>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
}
