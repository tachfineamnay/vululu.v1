import crypto from 'node:crypto';
import {
  ArtifactAccessUseCases,
  BriefUseCases,
  ContextUseCases,
  MessageUseCases,
  ProductionUseCases,
  ProjectBundleUseCases,
  ProjectUseCases,
  SceneUseCases,
  StoryboardUseCases,
  type Actor
} from '@vululu/application';
import {
  LocalProductionExecutor,
  LocalStoragePort,
  MediaRendererAdapter,
  PostizMockAdapter,
  PrismaArtifactAccess,
  PrismaAuditAdapter,
  PrismaBriefStore,
  PrismaContextRepository,
  PrismaMessageStore,
  PrismaProductionExecutionStore,
  PrismaProductionRepository,
  PrismaProductionRunRepository,
  PrismaProjectBundleQuery,
  PrismaProjectRepository,
  PrismaSceneRepository,
  PrismaStoryboardStore
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
const audit = new PrismaAuditAdapter();
const storage = new LocalStoragePort();
const executor = new LocalProductionExecutor(
  executionStore,
  new MediaRendererAdapter(),
  storage,
  storage.artifactRoot
);

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
  ids
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