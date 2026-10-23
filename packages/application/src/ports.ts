export type Role = 'super_admin' | 'user';

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  next(): string;
}

export type Actor = {
  id: string;
  role: Role;
};

export type ContextRecord = {
  id: string;
  userId: string;
  name: string;
  website: string | null;
  description: string;
  audience: string | null;
  tone: string | null;
  colorPrimary: string;
  colorSecondary: string;
};

export type ContextRevisionRecord = {
  id: string;
  contextId: string;
  version: number;
  checksum: string;
  data: Record<string, unknown>;
};

export type ProjectRecord = {
  id: string;
  userId: string;
  contextId: string;
  title: string;
  platform: string;
  format: string;
  objective: string;
  sceneDurationSeconds: number;
  status: string;
};

export type BriefRecord = {
  id: string;
  projectId: string;
  objective: string;
  audience: string;
  tone: string;
  cta: string;
  platform: string;
  format: string;
  version: number;
};

export type SceneRecord = {
  id: string;
  projectId: string;
  sceneKey: string;
  position: number;
  title: string;
  description: string;
  durationSeconds: number;
  characterKey: string | null;
};

export type SceneVersionRecord = {
  id: string;
  sceneId: string;
  version: number;
  imagePath: string;
  prompt: string;
  checksum: string;
};

export type ArtifactVersionRecord = {
  id: string;
  artifactId: string;
  version: number;
  masterPath: string;
  checksum: string;
  qaStatus: string | null;
  qaReport: unknown;
};

export type ApprovalRecord = {
  id: string;
  artifactVersionId: string;
  approvedBy: string;
  checksum: string;
  invalidatedAt: Date | null;
};

export type TransferRecord = {
  id: string;
  approvalId: string;
  status: string;
  provider: string;
  externalId: string | null;
};

export type JobRunRecord = {
  id: string;
  projectId: string;
  type: string;
  status: string;
  snapshot: Record<string, unknown> | null;
};

export type SceneRenderRequest = {
  projectId: string;
  artifactRoot: string;
  sceneKey: string;
  position: number;
  title: string;
  description: string;
  brandName: string;
  colorPrimary: string;
  colorSecondary: string;
  version: number;
  instruction?: string;
};

export type SceneRenderResult = {
  relativePath: string;
  absolutePath: string;
  checksum: string;
  width: number;
  height: number;
};

export type MasterRenderRequest = {
  projectId: string;
  artifactRoot: string;
  version: number;
  scenePaths: string[];
  sceneDurationsSeconds: number[];
};

export type MasterRenderResult = {
  relativePath: string;
  absolutePath: string;
  checksum: string;
  duration: number;
  expectedDurationSeconds: number;
  videoCodec: string;
  audioCodec: string;
  width: number;
  height: number;
};

export type QaCheck = {
  name: string;
  status: string;
  detail: string;
};

export type QaReport = {
  status: string;
  checks: QaCheck[];
};

export interface ContextRepository {
  create(input: Omit<ContextRecord, 'id'>): Promise<ContextRecord>;
  findOwned(contextId: string, userId: string): Promise<ContextRecord | null>;
  listOwned(userId: string): Promise<ContextRecord[]>;
  addRevision(contextId: string, version: number, checksum: string, data: Record<string, unknown>): Promise<void>;
}

export interface ProjectRepository {
  create(input: Omit<ProjectRecord, 'id'>): Promise<ProjectRecord>;
  findOwned(projectId: string, userId: string): Promise<ProjectRecord | null>;
  listOwned(userId: string): Promise<ProjectRecord[]>;
  updateStatus(projectId: string, status: string): Promise<void>;
}

export interface BriefRepository {
  findCurrent(projectId: string): Promise<BriefRecord | null>;
  createRevision(input: Omit<BriefRecord, 'id'> & { checksum: string }): Promise<BriefRecord>;
}

export interface SceneRepository {
  listByProject(projectId: string): Promise<SceneRecord[]>;
  findOwned(projectId: string, sceneKey: string, userId: string): Promise<SceneRecord | null>;
  upsertMany(projectId: string, scenes: Array<Omit<SceneRecord, 'id' | 'projectId'>>): Promise<SceneRecord[]>;
  updateDuration(projectId: string, sceneKey: string, durationSeconds: number): Promise<SceneRecord>;
}

export interface ProductionRepository {
  latestSceneVersions(projectId: string): Promise<Array<{ scene: SceneRecord; version: SceneVersionRecord | null }>>;
  createSceneVersion(input: Omit<SceneVersionRecord, 'id'>): Promise<SceneVersionRecord>;
  latestMaster(projectId: string): Promise<ArtifactVersionRecord | null>;
  nextMasterVersion(projectId: string): Promise<number>;
  createMasterVersion(input: Omit<ArtifactVersionRecord, 'id'>): Promise<ArtifactVersionRecord>;
  updateQa(artifactId: string, status: string, report: unknown): Promise<void>;
  findApproval(artifactId: string): Promise<ApprovalRecord | null>;
  createOrUpdateApproval(input: { artifactVersionId: string; approvedBy: string; checksum: string }): Promise<ApprovalRecord>;
  invalidateApprovals(projectId: string): Promise<void>;
  findTransfer(approvalId: string): Promise<TransferRecord | null>;
  createTransfer(input: { approvalId: string; status: string; provider: string; externalId: string | null }): Promise<TransferRecord>;
  updateTransferStatus(transferId: string, status: string): Promise<void>;
  findJobRun(jobRunId: string): Promise<JobRunRecord | null>;
  createJobRun(input: Omit<JobRunRecord, 'id'>): Promise<JobRunRecord>;
  updateJobRunStatus(jobRunId: string, status: string): Promise<void>;
}

export interface UserRepository {
  findByEmail(email: string): Promise<{ id: string; email: string; name: string; role: Role; passwordHash: string } | null>;
  findById(id: string): Promise<{ id: string; email: string; name: string; role: Role } | null>;
}

export interface StoragePort {
  resolve(relativePath: string): string;
  exists(absolutePath: string): boolean;
  readBuffer(absolutePath: string): Buffer;
  checksum(absolutePath: string): string;
}

export interface MediaRendererPort {
  renderScene(input: SceneRenderRequest): Promise<SceneRenderResult>;
  assembleMaster(input: MasterRenderRequest): Promise<MasterRenderResult>;
  runQa(scenes: SceneRenderResult[], master: MasterRenderResult): Promise<QaReport>;
}

export interface ProviderPort {
  name: string;
  generateScene(input: SceneRenderRequest): Promise<SceneRenderResult>;
}

export interface OrchestratorPort {
  enqueue(input: { projectId: string; type: string; snapshot: Record<string, unknown> }): Promise<JobRunRecord>;
  markRunning(jobRunId: string): Promise<void>;
  markSucceeded(jobRunId: string): Promise<void>;
  markFailed(jobRunId: string, error: string): Promise<void>;
}

export interface PostizPort {
  transfer(input: { approvalId: string; checksum: string; artifactVersionId: string }): Promise<TransferRecord>;
}

export interface AuditPort {
  record(input: { actorId: string | null; action: string; targetType: string; targetId: string | null; metadata?: Record<string, unknown> }): Promise<void>;
}