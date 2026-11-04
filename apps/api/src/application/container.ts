import crypto from 'node:crypto';
import {
  AdminQueryUseCases,
  AgentConfigUseCases,
  ArtifactAccessUseCases,
  BriefUseCases,
  ContextUseCases,
  CampaignUseCases,
  AssetUseCases,
  ContextReviewUseCases,
  BriefConfirmationUseCases,
  MessageUseCases,
  ProductionUseCases,
  ProjectBundleUseCases,
  ProjectUseCases,
  ProviderCatalogUseCases,
  RoutingUseCases,
  SceneUseCases,
  StoryboardUseCases,
  type Actor
} from '@vululu/application';
import {
  LocalProductionExecutor,
  LocalStoragePort,
  MediaRendererAdapter,
  PostizMockAdapter,
  MockCapabilityProvider,
  PrismaAdminQuery,
  PrismaAgentRepository,
  PrismaArtifactAccess,
  PrismaAuditAdapter,
  PrismaBriefStore,
  PrismaContextRepository,
  PrismaMessageStore,
  PrismaProductionExecutionStore,
  PrismaProductionRepository,
  PrismaProductionRunRepository,
  PrismaProjectBundleQuery,
  PrismaCostRepository,
  PrismaProjectRepository,
  PrismaProviderCatalogRepository,
  PrismaRoutingRepository,
  PrismaSceneRepository,
  PrismaStoryboardStore,
  PrismaDurableProductionStore,
  PrismaArtifactPublisher,
  createArtifactStorage,
  createArtifactStorageRegistry,
  DurableProductionExecutor,
  HatchetOrchestratorAdapter,
  OutboxApprovalSignal,
  OutboxDispatcher
} from '../infrastructure';
import { PrismaCampaignRepository } from '../infrastructure/prisma/campaignRepository';
import { PrismaAssetRepository } from '../infrastructure/prisma/assetRepository';
import { inspectAsset } from '@vululu/media';
import { PrismaContextReviewStore } from '../infrastructure/prisma/contextReviewStore';
import { DeterministicContextAnalyzer } from '../infrastructure/providers/deterministicContextAnalyzer';

const clock = { now: () => new Date() };
const ids = { next: () => crypto.randomUUID() };

const contextRepository = new PrismaContextRepository();
const projectRepository = new PrismaProjectRepository();
const bundleQuery = new PrismaProjectBundleQuery();
const briefStore = new PrismaBriefStore();
const storyboardStore = new PrismaStoryboardStore();
const messageStore = new PrismaMessageStore();
const sceneRepository = new PrismaSceneRepository();
const productionRepository = new PrismaProductionRepository();
const runRepository = new PrismaProductionRunRepository();
const executionStore = new PrismaProductionExecutionStore();
const durableStore = new PrismaDurableProductionStore();
const audit = new PrismaAuditAdapter();
const storage = new LocalStoragePort();
const artifactStorage = createArtifactStorage();
const artifactStorages = createArtifactStorageRegistry();
export { artifactStorage, artifactStorages, PrismaArtifactPublisher };
const durableMode = process.env.ORCHESTRATOR_MODE === 'hatchet';
const orchestrator = durableMode ? new HatchetOrchestratorAdapter() : null;
const outboxDispatcher = orchestrator ? new OutboxDispatcher(orchestrator) : null;
const approvalSignal = outboxDispatcher ? new OutboxApprovalSignal(outboxDispatcher) : undefined;
const executor = durableMode
  ? new DurableProductionExecutor(outboxDispatcher!)
  : new LocalProductionExecutor(
      executionStore,
      new MediaRendererAdapter(),
      storage,
      storage.artifactRoot
    );

export { outboxDispatcher, durableMode, durableStore };

export const contexts = new ContextUseCases(contextRepository, clock, ids);
export const contextReview = new ContextReviewUseCases(new PrismaContextReviewStore(), new DeterministicContextAnalyzer(), audit, clock, ids);
export const campaigns = new CampaignUseCases(new PrismaCampaignRepository(), projectRepository, audit, clock, ids);
export const assets = new AssetUseCases(new PrismaAssetRepository(), contextRepository, projectRepository, { inspect: inspectAsset }, artifactStorage, artifactStorages, audit, clock, ids);
export const projects = new ProjectUseCases(projectRepository, contextRepository, clock, ids);
export const briefs = new BriefUseCases(projectRepository, briefStore, clock, ids, audit);
export const briefConfirmations = new BriefConfirmationUseCases(projectRepository, briefStore, audit, clock);
export const storyboards = new StoryboardUseCases(
  projectRepository,
  briefStore,
  sceneRepository,
  storyboardStore,
  bundleQuery,
  clock,
  ids,
  audit
);
export const messages = new MessageUseCases(projectRepository, messageStore, bundleQuery, audit);
export const scenes = new SceneUseCases(projectRepository, sceneRepository, audit);
export const bundles = new ProjectBundleUseCases(bundleQuery);
export const artifacts = new ArtifactAccessUseCases(new PrismaArtifactAccess(artifactStorage, undefined, artifactStorages));
export const production = new ProductionUseCases(
  projectRepository,
  runRepository,
  executor,
  productionRepository,
  new PostizMockAdapter(),
  audit,
  clock,
  ids,
  {
    durable: durableMode,
    ...(approvalSignal ? { approvalSignal } : {})
  }
);

export function actorOf(user: { id: string; role: string } | undefined): Actor {
  if (!user) {
    throw new Error('actor_required');
  }
  return {
    id: user.id,
    role: user.role === 'super_admin' ? 'super_admin' : 'user'
  };
}
const agentRepository = new PrismaAgentRepository();
const providerCatalogRepository = new PrismaProviderCatalogRepository();
const routingRepository = new PrismaRoutingRepository();
const costRepository = new PrismaCostRepository();
const mockCapabilityProvider = new MockCapabilityProvider();

const adminQueryPort = new PrismaAdminQuery({ storage: artifactStorage });
export const adminQueries = new AdminQueryUseCases(adminQueryPort);

export const agentConfigs = new AgentConfigUseCases(agentRepository, clock, ids, audit);
export const providerCatalog = new ProviderCatalogUseCases(providerCatalogRepository, audit);
export const routing = new RoutingUseCases(
  providerCatalogRepository,
  routingRepository,
  mockCapabilityProvider,
  costRepository,
  clock,
  audit
);
export const agentRepositoryPort = agentRepository;
export function createDurablePipeline() {
  return { dispatcher: outboxDispatcher, mode: durableMode };
}
