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
  createdAt?: Date;
  updatedAt?: Date;
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
  createdAt?: Date;
  updatedAt?: Date;
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
  createdAt?: Date;
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
  snapshotVersion: number;
  snapshotChecksum: string | null;
  outputs: Record<string, unknown> | null;
  outputsChecksum: string | null;
  traceId?: string | null;
  requestId?: string | null;
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
  createWithRevision(
    input: Omit<ContextRecord, 'id'>,
    revision: { version: number; checksum: string; data: Record<string, unknown> }
  ): Promise<ContextRecord>;
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

export interface SceneRepository {
  listByProject(projectId: string): Promise<SceneRecord[]>;
  findOwned(projectId: string, sceneKey: string, userId: string): Promise<SceneRecord | null>;
  upsertMany(projectId: string, scenes: Array<Omit<SceneRecord, 'id' | 'projectId'>>): Promise<SceneRecord[]>;
  updateDuration(projectId: string, sceneKey: string, durationSeconds: number): Promise<SceneRecord>;
}

export interface MasterRepository {
  latestMaster(projectId: string): Promise<ArtifactVersionRecord | null>;
  findApproval(artifactVersionId: string): Promise<ApprovalRecord | null>;
  createOrUpdateApproval(input: {
    artifactVersionId: string;
    approvedBy: string;
    checksum: string;
  }): Promise<ApprovalRecord>;
  findTransfer(approvalId: string): Promise<TransferRecord | null>;
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
export type BriefInput = {
  objective: string;
  audience: string;
  tone: string;
  cta: string;
  platform: 'TikTok' | 'Instagram' | 'LinkedIn';
  format: 'Affiche' | 'Carrousel' | 'Video' | 'Reel' | 'Motion';
};

export type ReproducibilitySnapshot = {
  schemaVersion: 1;
  capturedAt: string;
  project: {
    id: string;
    platform: string;
    format: string;
    sceneDurationSeconds: number;
    status: string;
  };
  context: {
    revisionId: string | null;
    checksum: string | null;
    data: Record<string, unknown>;
  };
  brief: {
    revisionId: string | null;
    version: number | null;
    checksum: string | null;
    data: Record<string, unknown>;
  };
  scenes: Array<{
    sceneId: string;
    sceneKey: string;
    position: number;
    durationSeconds: number;
    version: number;
    checksum: string;
  }>;
  characters: Array<{
    characterId: string;
    characterKey: string;
    version: number | null;
    checksum: string | null;
    name: string;
    description: string;
  }>;
  providerPolicy: {
    provider: string;
    model: string;
    deterministic: boolean;
  };
  render: {
    width: number;
    height: number;
    fps: number;
    imageFormat: string;
    videoCodec: string;
    audioCodec: string;
    audioSilent: boolean;
  };
  correction?: {
    targetSceneKey: string;
    instruction: string;
  };
};
// ---------------------------------------------------------------------------
// V1-01-A.1 : contrats applicatifs specialises.
// ---------------------------------------------------------------------------

export type BriefContentRecord = {
  objective: string;
  audience: string;
  tone: string;
  cta: string;
  platform: 'TikTok' | 'Instagram' | 'LinkedIn';
  format: 'Affiche' | 'Carrousel' | 'Video' | 'Reel' | 'Motion';
};

export type BriefRevisionRecord = BriefContentRecord & {
  id: string;
  briefId: string;
  version: number;
  checksum: string;
  createdAt: Date;
};

export type BriefWithRevisions = BriefRecord & {
  createdAt: Date;
  updatedAt: Date;
  revisions: BriefRevisionRecord[];
};

export type MessageRecord = {
  id: string;
  projectId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
};

export type CharacterRecord = {
  id: string;
  projectId: string;
  characterKey: string;
  name: string;
  description: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export type CharacterVersionRecord = {
  id: string;
  characterId: string;
  version: number;
  name: string;
  description: string;
  checksum: string;
  createdAt: Date;
};

export type SceneWithVersionsRecord = SceneRecord & {
  createdAt?: Date;
  updatedAt?: Date;
  versions: SceneVersionRecordWithMeta[];
};

export type SceneVersionRecordWithMeta = SceneVersionRecord & {
  createdAt?: Date;
  instruction?: string | null;
};

export type ProductionJobRecord = {
  id: string;
  projectId: string;
  type: string;
  status: string;
  step: string;
  progress: number;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ApprovalView = ApprovalRecord & {
  createdAt?: Date;
  transfer?: TransferRecord | null;
};

export type MasterVersionView = ArtifactVersionRecord & {
  createdAt?: Date;
  approval?: ApprovalView | null;
};

export type ProjectBundleRecord = {
  project: {
    id: string;
    title: string;
    status: string;
    platform: string;
    format: string;
    objective: string;
    sceneDurationSeconds: number;
    contextId: string;
    createdAt: Date;
    updatedAt: Date;
  };
  context: {
    id: string;
    name: string;
    website: string | null;
    description: string;
    audience: string | null;
    tone: string | null;
    colorPrimary: string;
    colorSecondary: string;
    createdAt: Date;
    updatedAt: Date;
  };
  brief: BriefWithRevisions | null;
  messages: MessageRecord[];
  scenes: SceneWithVersionsRecord[];
  characters: CharacterRecord[];
  master: MasterVersionView | null;
  masterVersions: MasterVersionView[];
  job: ProductionJobRecord | null;
};

export type QaView = {
  status: string;
  report: unknown;
  version: number | null;
};

export interface BriefStore {
  findWithRevisions(projectId: string): Promise<BriefWithRevisions | null>;
  saveRevision(input: {
    userId: string;
    projectId: string;
    briefId: string;
    revisionId: string;
    version: number;
    content: BriefContentRecord;
    checksum: string;
    createdAt: Date;
    projectStatus: string;
  }): Promise<BriefWithRevisions>;
}

export type StoryboardCharacterWrite = {
  id: string;
  characterKey: string;
  name: string;
  description: string;
  expectedVersion: number | null;
  nextVersion: {
    id: string;
    version: number;
    checksum: string;
    createdAt: Date;
  } | null;
};

export type StoryboardSceneWrite = {
  id: string;
  sceneKey: string;
  position: number;
  title: string;
  description: string;
  durationSeconds: number;
  characterKey: string | null;
};

export interface StoryboardStore {
  findCharacter(
    projectId: string,
    characterKey: string
  ): Promise<{ character: CharacterRecord; versions: CharacterVersionRecord[] } | null>;
  saveAtomic(input: {
    projectId: string;
    userId: string;
    projectStatus: string;
    character: StoryboardCharacterWrite;
    scenes: StoryboardSceneWrite[];
  }): Promise<void>;
}

export interface MessageStore {
  createPair(input: {
    projectId: string;
    userContent: string;
    assistantContent: string;
  }): Promise<{ userMessage: MessageRecord; assistantMessage: MessageRecord }>;
}

export interface ProjectBundleQueryPort {
  getOwnedBundle(userId: string, projectId: string): Promise<ProjectBundleRecord>;
}

export interface ProductionRunRepository {
  startRun(input: {
    userId: string;
    projectId: string;
    type: 'produce' | 'correction';
    targetSceneKey: string | null;
    instruction: string | null;
    steps: string[];
    outbox?: ProductionOutboxRequest;
    traceId?: string | null;
    requestId?: string | null;
  }): Promise<{ job: ProductionJobRecord; jobRun: JobRunRecord }>;
  updateJob(jobId: string, input: { status?: string; step?: string; progress?: number; error?: string | null }): Promise<void>;
  updateStep(jobRunId: string, name: string, status: string, error?: string): Promise<void>;
  findActiveByProject?(projectId: string): Promise<JobRunRecord | null>;
}

export type ExecutionScene = SceneRecord & {
  latestVersion: SceneVersionRecord | null;
};

export type ExecutionProject = {
  id: string;
  status: string;
  sceneDurationSeconds: number;
  context: {
    name: string;
    colorPrimary: string;
    colorSecondary: string;
  };
  scenes: ExecutionScene[];
};

export type ProductionFinalization = {
  jobRunId: string;
  jobId: string;
  projectId: string;
  masterVersion: number;
  master: {
    relativePath: string;
    checksum: string;
    duration: number;
    expectedDurationSeconds: number;
    videoCodec: string;
    audioCodec: string;
    width: number;
    height: number;
    storage?: ArtifactStorageMetadata;
  };
  qa: QaReport;
  scenes: Array<{
    sceneId: string;
    sceneKey: string;
    position: number;
    version: number;
    imagePath: string;
    prompt: string;
    checksum: string;
    storage?: ArtifactStorageMetadata;
  }>;
  outputs: Record<string, unknown>;
  manifest?: Record<string, unknown>;
};

export interface ProductionExecutionStore {
  markRunning(jobRunId: string): Promise<void>;
  updateJob(jobId: string, input: { status?: string; step?: string; progress?: number; error?: string | null }): Promise<void>;
  updateStep(jobRunId: string, name: string, status: string, error?: string): Promise<void>;
  loadExecutionProject(projectId: string): Promise<ExecutionProject>;
  nextMasterVersion(projectId: string): Promise<number>;
  finalizeRun(input: ProductionFinalization): Promise<void>;
  failRun(input: {
    jobRunId: string;
    jobId: string;
    projectId: string;
    error: string;
  }): Promise<void>;
}

export interface ProductionExecutorPort {
  start(input: {
    projectId: string;
    jobId: string;
    jobRunId: string;
    type: 'produce' | 'correction';
    targetSceneKey: string | null;
    instruction: string | null;
  }): Promise<void>;
}
export type ArtifactFile = {
  /** Chemin local uniquement pour le backend filesystem historique. */
  absolutePath?: string;
  storageKey?: string;
  storageProvider?: string;
  sha256?: string;
  contentType: 'image/png' | 'video/mp4';
  size: number;
  openRead?: (range?: { start: number; end: number }) => Promise<import('node:stream').Readable>;
};

export interface ArtifactAccessPort {
  getSceneImage(userId: string, projectId: string, sceneKey: string): Promise<ArtifactFile>;
  getMaster(userId: string, projectId: string, version?: number): Promise<ArtifactFile>;
}

export interface ArtifactAccessUseCasesPort {
  getSceneImage(actor: Actor, projectId: string, sceneKey: string): Promise<ArtifactFile>;
  getMaster(actor: Actor, projectId: string, version?: number): Promise<ArtifactFile>;
}
// ---------------------------------------------------------------------------
// V1-01-B : Agentic Capabilities (registre configs, providers/modeles,
// routage/fallback, couts). Aucun SDK fournisseur ici.
// ---------------------------------------------------------------------------

export type AgentRoleRecord = 'director' | 'specialist' | 'validator';

export type AgentCapabilityRequirementRecord = {
  capabilityKey: string;
  maxCostCents?: number;
  minQuality?: number;
  maxLatencyMs?: number;
  allowedLicenses?: Array<'internal' | 'commercial' | 'unknown'>;
};

export type AgentDefinitionRecord = {
  id: string;
  key: string;
  name: string;
  role: AgentRoleRecord;
  capabilityRequirements: AgentCapabilityRequirementRecord[];
  activeConfigVersionId: string | null;
  createdAt: Date;
};

export type AgentConfigVersionRecord = {
  id: string;
  agentId: string;
  version: number;
  soul: string;
  instructions: string;
  guardrails: string[];
  checksum: string;
  createdAt: Date;
};

export type ProviderRecord = {
  id: string;
  key: string;
  name: string;
  active: boolean;
  createdAt: Date;
};

export type ModelRecord = {
  id: string;
  providerId: string;
  providerKey: string;
  modelKey: string;
  capabilityKeys: string[];
  quality: number;
  latencyMs: number;
  costCentsPerUnit: number;
  license: 'internal' | 'commercial' | 'unknown';
  active: boolean;
  qualified: boolean;
  createdAt: Date;
};

export type RouteDecisionRecord = {
  id: string;
  capabilityKey: string;
  candidateModelIds: string[];
  selectedModelId: string;
  fallbackModelId: string | null;
  criteria: Record<string, unknown>;
  reason: string;
  createdAt: Date;
};

export type CapabilityInvocation = {
  providerKey: string;
  modelKey: string;
  capabilityKey: string;
  input: Record<string, unknown>;
};

export type CapabilityResult = {
  output: Record<string, unknown>;
  providerKey: string;
  modelKey: string;
  costCents: number;
  latencyMs: number;
  mock: true;
};

export interface AgentRepository {
  createDefinition(input: Omit<AgentDefinitionRecord, 'activeConfigVersionId'>): Promise<AgentDefinitionRecord>;
  findDefinition(agentId: string): Promise<AgentDefinitionRecord | null>;
  findDefinitionByKey(key: string): Promise<AgentDefinitionRecord | null>;
  listDefinitions(): Promise<AgentDefinitionRecord[]>;
  listConfigs(agentId: string): Promise<AgentConfigVersionRecord[]>;
  saveConfigVersion(input: Omit<AgentConfigVersionRecord, 'checksum'> & { checksum: string }): Promise<AgentConfigVersionRecord>;
  setActiveConfig(agentId: string, configVersionId: string): Promise<AgentDefinitionRecord>;
}

export interface ProviderCatalogRepository {
  upsertProvider(input: { key: string; name: string; active: boolean }): Promise<ProviderRecord>;
  listProviders(): Promise<ProviderRecord[]>;
  setProviderActive(providerKey: string, active: boolean): Promise<ProviderRecord>;
  upsertModel(input: {
    providerKey: string;
    modelKey: string;
    capabilityKeys: string[];
    quality: number;
    latencyMs: number;
    costCentsPerUnit: number;
    license: 'internal' | 'commercial' | 'unknown';
    active: boolean;
    qualified: boolean;
  }): Promise<ModelRecord>;
  listModels(capabilityKey?: string): Promise<ModelRecord[]>;
  setModelActive(modelId: string, active: boolean): Promise<ModelRecord>;
  setModelQualified(modelId: string, qualified: boolean): Promise<ModelRecord>;
}

export interface RoutingRepository {
  saveDecision(input: Omit<RouteDecisionRecord, 'id' | 'createdAt'>): Promise<RouteDecisionRecord>;
  listDecisions(limit?: number): Promise<RouteDecisionRecord[]>;
}

export interface CostRepository {
  record(input: {
    projectId: string | null;
    jobRunId: string | null;
    provider: string;
    model: string | null;
    units: number;
    amountCents: number;
  }): Promise<void>;
}

export interface CapabilityProviderPort {
  invoke(input: CapabilityInvocation): Promise<CapabilityResult>;
}
// ---------------------------------------------------------------------------
// V1-01-D : orchestration durable, outbox, etats metier, routage fige.
// ---------------------------------------------------------------------------

export type ProductionOutboxRequest = {
  kind: string;
  payload: Record<string, unknown>;
};

export const DURABLE_PRODUCTION_STEPS = [
  'validate-snapshot',
  'resolve-capabilities',
  'render-scenes',
  'assemble-master',
  'qa',
  'finalize',
  'approval',
  'transfer'
] as const;

export type DurableRunRecord = {
  id: string;
  projectId: string;
  type: 'produce' | 'correction' | string;
  status: string;
  snapshot: ReproducibilitySnapshot | null;
  snapshotChecksum: string | null;
  outputs: Record<string, unknown> | null;
  workflowRunId: string | null;
  jobId: string | null;
};

export type RenderedScene = {
  sceneId: string;
  sceneKey: string;
  position: number;
  version: number;
  imagePath: string;
  absolutePath: string;
  prompt: string;
  checksum: string;
  width: number;
  height: number;
  instruction?: string | null;
};

export type RenderedMaster = {
  version: number;
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

export type DurableRunRoutingSnapshot = {
  agentDefinitionId: string | null;
  agentConfigVersionId: string | null;
  agentConfigChecksum: string | null;
  capabilityKey: string;
  providerId: string | null;
  modelId: string | null;
  providerKey: string;
  modelKey: string;
  fallbackModelId: string | null;
  policy: Record<string, unknown>;
  decisionId: string | null;
  estimatedCents: number;
  actualCents: number;
  usedFallback: boolean;
};

export interface DurableRoutingPort {
  resolve(input: {
    jobRunId: string;
    projectId: string;
    capabilityKey: string;
    budgetCents: number;
    input: Record<string, unknown>;
    idempotencyKey: string;
  }): Promise<DurableRunRoutingSnapshot>;
}

export interface DurableProductionStore {
  loadRun(jobRunId: string): Promise<DurableRunRecord>;
  loadExecutionProject(projectId: string): Promise<ExecutionProject>;
  transitionJob(
    jobRunId: string,
    toState: string,
    source: string,
    metadata?: Record<string, unknown>
  ): Promise<void>;
  transitionStep(
    jobRunId: string,
    name: string,
    toState: string,
    source: string,
    metadata?: Record<string, unknown>
  ): Promise<void>;
  updateJob(jobId: string, input: { status?: string; step?: string; progress?: number; error?: string | null }): Promise<void>;
  saveStepOutput(jobRunId: string, name: string, output: Record<string, unknown>): Promise<void>;
  getStepOutput<T = Record<string, unknown>>(jobRunId: string, name: string): Promise<T | null>;
  nextMasterVersion(projectId: string): Promise<number>;
  finalizeArtifacts(input: ProductionFinalization): Promise<{
    artifactVersionId: string;
    masterVersion: number;
    checksum: string;
  }>;
  completeRun(input: {
    jobRunId: string;
    projectId: string;
    outputs: Record<string, unknown>;
  }): Promise<void>;
  failRun(input: {
    jobRunId: string;
    jobId: string;
    projectId: string;
    error: string;
    state?: 'failed' | 'timed_out' | 'cancelled';
  }): Promise<void>;
  recordRoutingSnapshot(jobRunId: string, snapshot: DurableRunRoutingSnapshot): Promise<void>;
  recordCost(input: {
    idempotencyKey: string;
    jobRunId: string;
    projectId: string;
    provider: string;
    model: string | null;
    units: number;
    amountCents: number;
  }): Promise<void>;
  getRunEvidence(jobRunId: string): Promise<RunEvidence>;
}

export interface DurableOrchestratorPort {
  submitStart(input: {
    outboxId: string;
    jobRunId: string;
    projectId: string;
    type: string;
    traceId?: string | null;
    requestId?: string | null;
  }): Promise<{ workflowRunId: string }>;
  signalApproval(input: {
    jobRunId: string;
    projectId: string;
    artifactVersionId: string;
    checksum: string;
    approvedBy: string;
  }): Promise<void>;
  getRunStatus(workflowRunId: string): Promise<string>;
  getRunEvidence(workflowRunId: string): Promise<Record<string, unknown>>;
  cancelRun(workflowRunId: string): Promise<void>;
  retryFailedStep(workflowRunId: string, stepName: string): Promise<void>;
  resumeRun(workflowRunId: string): Promise<void>;
}

export interface ApprovalSignalPort {
  signal(input: {
    jobRunId: string;
    projectId: string;
    artifactVersionId: string;
    checksum: string;
    approvedBy: string;
  }): Promise<void>;
}

export type OutboxMessage = {
  id: string;
  idempotencyKey: string;
  jobRunId: string | null;
  kind: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
  workflowRunId: string | null;
};

export type RunEvidence = {
  jobRunId: string;
  projectId: string;
  status: string;
  workflowRunId: string | null;
  transitions: Array<{
    fromState: string | null;
    toState: string;
    source: string;
    scope: string;
    createdAt: string;
  }>;
  routing: DurableRunRoutingSnapshot | null;
  stepOutputs: Record<string, Record<string, unknown> | null>;
};
// ---------------------------------------------------------------------------
// V1-01-E : stockage d artefacts interchangeable.
// ---------------------------------------------------------------------------

export type ArtifactStorageMetadata = {
  provider: string;
  key: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  etag?: string | null;
};

export type StoredObjectInfo = ArtifactStorageMetadata & {
  lastModified?: string;
};

export type ArtifactReadRange = {
  start: number;
  /** Inclusif. Si absent, lecture jusqu a la fin. */
  end?: number;
};

export type ArtifactReadStream = {
  stream: import('node:stream').Readable;
  size: number;
  contentType: string;
  sha256?: string;
  range?: ArtifactReadRange;
};

/**
 * Port de stockage d octets. Les cles sont opaques et ne sont pas des chemins
 * metier. Aucun use case ne depend d un fournisseur ou d un bucket.
 */
export interface ArtifactStoragePort {
  readonly provider: string;
  putObject(input: {
    key: string;
    body: Buffer | import('node:stream').Readable;
    contentType: string;
    sha256: string;
    sizeBytes?: number;
  }): Promise<ArtifactStorageMetadata>;
  putFile(input: {
    key: string;
    filePath: string;
    contentType: string;
    sha256: string;
    sizeBytes: number;
  }): Promise<ArtifactStorageMetadata>;
  head(key: string): Promise<StoredObjectInfo | null>;
  get(key: string, range?: ArtifactReadRange): Promise<ArtifactReadStream>;
  verify(key: string, expectedSha256: string): Promise<boolean>;
  getSignedReadUrl(key: string, expiresSeconds: number): Promise<string | null>;
  list(prefix?: string): Promise<StoredObjectInfo[]>;
}

export type ArtifactPublishRequest = {
  kind: 'scene' | 'master';
  jobRunId: string;
  projectId: string;
  sceneId?: string;
  sceneKey?: string;
  version: number;
  filePath: string;
  contentType: string;
  checksum: string;
  manifest?: Record<string, unknown>;
};

export interface ArtifactPublisherPort {
  publish(input: ArtifactPublishRequest): Promise<ArtifactStorageMetadata>;
  verifyPublished(input: ArtifactStorageMetadata): Promise<boolean>;
}