import crypto from 'node:crypto';
import {
  AgentConfigUseCases,
  ArtifactAccessUseCases,
  BriefUseCases,
  ContextUseCases,
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
  DurableProductionExecutor,
  HatchetOrchestratorAdapter,
  OutboxApprovalSignal,
  OutboxDispatcher
} from '../infrastructure';

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
export const projects = new ProjectUseCases(projectRepository, contextRepository, clock, ids);
export const briefs = new BriefUseCases(projectRepository, briefStore, clock, ids, audit);
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
export const artifacts = new ArtifactAccessUseCases(new PrismaArtifactAccess());
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