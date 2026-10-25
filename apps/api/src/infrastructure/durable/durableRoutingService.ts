import type { PrismaClient } from '@prisma/client';
import { prisma } from '@vululu/db';
import {
  routeCapability,
  type CapabilityRequirement,
  type ModelDefinition
} from '@vululu/domain';
import { ApplicationError } from '@vululu/application';
import type {
  CapabilityProviderPort,
  DurableRoutingPort,
  DurableRunRoutingSnapshot,
  ModelRecord
} from '@vululu/application';
import { PrismaAgentRepository } from '../prisma/agentRepository';
import { PrismaProviderCatalogRepository } from '../prisma/providerCatalogRepository';
import { PrismaRoutingRepository } from '../prisma/routingRepository';
import { MockCapabilityProvider } from '../providers/mockCapabilityProvider';

function toDomain(record: ModelRecord): ModelDefinition {
  return {
    id: record.id,
    providerId: record.providerId,
    providerKey: record.providerKey,
    modelKey: record.modelKey,
    capabilityKeys: record.capabilityKeys,
    quality: record.quality,
    latencyMs: record.latencyMs,
    costCentsPerUnit: record.costCentsPerUnit,
    license: record.license,
    active: record.active,
    qualified: record.qualified
  };
}

/**
 * Routage fige du run : configuration agent active, catalogue providers,
 * decision deterministe, fallback mock trace et cout mock idempotent.
 *
 * La decision est persistee dans RoutingDecision et RunRoutingSnapshot. Les
 * modifications ulterieures de la config agent ne reecrivent pas ce snapshot.
 */
export class DurableRoutingService implements DurableRoutingPort {
  private readonly agents: PrismaAgentRepository;
  private readonly catalog: PrismaProviderCatalogRepository;
  private readonly routes: PrismaRoutingRepository;
  private readonly provider: CapabilityProviderPort;

  constructor(
    private readonly db: PrismaClient = prisma,
    failedModelKeys: ReadonlySet<string> = new Set(
      (process.env.DURABLE_MOCK_FAIL_MODEL || '').split(',').map((item) => item.trim()).filter(Boolean)
    ),
    provider?: CapabilityProviderPort
  ) {
    this.agents = new PrismaAgentRepository(db);
    this.catalog = new PrismaProviderCatalogRepository(db);
    this.routes = new PrismaRoutingRepository(db);
    this.provider = provider ?? new MockCapabilityProvider(failedModelKeys);
  }

  async resolve(input: {
    jobRunId: string;
    projectId: string;
    capabilityKey: string;
    budgetCents: number;
    input: Record<string, unknown>;
    idempotencyKey: string;
  }): Promise<DurableRunRoutingSnapshot> {
    const agentKey = process.env.DURABLE_AGENT_KEY || 'production-director';
    const definition = await this.agents.findDefinitionByKey(agentKey);
    const config = definition?.activeConfigVersionId
      ? (await this.agents.listConfigs(definition.id)).find((item) => item.id === definition.activeConfigVersionId)
      : undefined;
    const requirement: CapabilityRequirement = {
      capabilityKey: input.capabilityKey,
      allowedLicenses: ['internal', 'commercial']
    };
    const models = await this.catalog.listModels(input.capabilityKey);
    if (models.length === 0) {
      throw new ApplicationError('no_route', 'Aucun modele pour la capacite ' + input.capabilityKey + '.', 409);
    }
    const failed: string[] = [];
    let decision = routeCapability({
      models: models.map(toDomain),
      requirement,
      budgetCents: input.budgetCents,
      failedModelIds: failed,
      decidedAt: new Date().toISOString()
    });
    let selected = models.find((model) => model.id === decision.selectedModelId);
    if (!selected) throw new ApplicationError('no_route', 'Modele selectionne introuvable.', 500);
    let usedFallback = false;
    let result: { providerKey: string; modelKey: string; costCents: number };
    try {
      result = await this.provider.invoke({
        providerKey: selected.providerKey,
        modelKey: selected.modelKey,
        capabilityKey: input.capabilityKey,
        input: input.input
      });
    } catch (primaryError) {
      usedFallback = true;
      failed.push(selected.id);
      decision = routeCapability({
        models: models.map(toDomain),
        requirement,
        budgetCents: input.budgetCents,
        failedModelIds: failed,
        decidedAt: new Date().toISOString()
      });
      const fallback = models.find((model) => model.id === decision.selectedModelId);
      if (!fallback) throw primaryError;
      selected = fallback;
      result = await this.provider.invoke({
        providerKey: selected.providerKey,
        modelKey: selected.modelKey,
        capabilityKey: input.capabilityKey,
        input: input.input
      });
    }
    const saved = await this.routes.saveDecision({
      capabilityKey: decision.capabilityKey,
      candidateModelIds: [...decision.candidateModelIds],
      selectedModelId: decision.selectedModelId,
      fallbackModelId: decision.fallbackModelId,
      criteria: decision.criteria as Record<string, unknown>,
      reason: decision.reason
    });
    return {
      agentDefinitionId: definition?.id ?? null,
      agentConfigVersionId: config?.id ?? null,
      agentConfigChecksum: config?.checksum ?? null,
      capabilityKey: input.capabilityKey,
      providerId: selected.providerId,
      modelId: selected.id,
      providerKey: result.providerKey,
      modelKey: result.modelKey,
      fallbackModelId: usedFallback ? selected.id : decision.fallbackModelId,
      policy: {
        requirement: requirement as unknown as Record<string, unknown>,
        catalogueSize: models.length,
        failedModelIds: failed,
        usedFallback,
        budgetCents: input.budgetCents,
        decisionReason: decision.reason
      },
      decisionId: saved.id,
      estimatedCents: decision.selectedModelId ? (models.find((m) => m.id === decision.selectedModelId)?.costCentsPerUnit ?? 0) : 0,
      actualCents: selected.costCentsPerUnit,
      usedFallback
    };
  }
}