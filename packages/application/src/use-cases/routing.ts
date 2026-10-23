import {
  routeCapability,
  type ModelDefinition as DomainModel,
  type RouteDecision
} from '@vululu/domain';
import { ApplicationError } from '../errors';
import type {
  Actor,
  AuditPort,
  CapabilityProviderPort,
  AgentCapabilityRequirementRecord,
  CapabilityResult,
  Clock,
  CostRepository,
  ModelRecord,
  ProviderCatalogRepository,
  RouteDecisionRecord,
  RoutingRepository
} from '../ports';

function toDomainModel(record: ModelRecord): DomainModel {
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

function toRecord(decision: RouteDecision): {
  capabilityKey: string;
  candidateModelIds: string[];
  selectedModelId: string;
  fallbackModelId: string | null;
  criteria: Record<string, unknown>;
  reason: string;
} {
  return {
    capabilityKey: decision.capabilityKey,
    candidateModelIds: [...decision.candidateModelIds],
    selectedModelId: decision.selectedModelId,
    fallbackModelId: decision.fallbackModelId,
    criteria: decision.criteria as Record<string, unknown>,
    reason: decision.reason
  };
}

/**
 * Routeur applicatif : selection deterministe + fallback trace.
 * Aucun appel fournisseur pendant la decision ; l execution est explicite.
 */
export class RoutingUseCases {
  constructor(
    private readonly catalog: ProviderCatalogRepository,
    private readonly routes: RoutingRepository,
    private readonly provider: CapabilityProviderPort,
    private readonly costs: CostRepository,
    private readonly clock: Clock,
    private readonly audit: AuditPort
  ) {}

  private async decide(
    actor: Actor,
    requirement: AgentCapabilityRequirementRecord,
    budgetCents: number | undefined,
    failedModelIds: string[]
  ): Promise<{ record: RouteDecisionRecord; models: ModelRecord[] }> {
    const models = await this.catalog.listModels(requirement.capabilityKey);
    if (models.length === 0) {
      throw new ApplicationError('no_route', 'Aucun modele pour cette capacite.', 400);
    }
    const decision = routeCapability({
      models: models.map(toDomainModel),
      requirement,
      budgetCents,
      failedModelIds,
      decidedAt: this.clock.now().toISOString()
    });
    const saved = await this.routes.saveDecision(toRecord(decision));
    await this.audit.record({
      actorId: actor.id,
      action: 'routing.decided',
      targetType: 'capability',
      targetId: requirement.capabilityKey,
      metadata: {
        decisionId: saved.id,
        selectedModelId: saved.selectedModelId,
        fallbackModelId: saved.fallbackModelId,
        reason: saved.reason
      }
    });
    return { record: saved, models };
  }

  async preview(
    actor: Actor,
    requirement: AgentCapabilityRequirementRecord,
    budgetCents?: number
  ): Promise<RouteDecisionRecord> {
    return (await this.decide(actor, requirement, budgetCents, [])).record;
  }

  async execute(
    actor: Actor,
    requirement: AgentCapabilityRequirementRecord,
    input: Record<string, unknown>,
    options: { budgetCents?: number; projectId?: string; jobRunId?: string } = {}
  ): Promise<{
    decision: RouteDecisionRecord;
    result: CapabilityResult;
    usedFallback: boolean;
  }> {
    const first = await this.decide(actor, requirement, options.budgetCents, []);
    const selected = first.models.find((model) => model.id === first.record.selectedModelId);
    if (!selected) {
      throw new ApplicationError('no_route', 'Modele selectionne introuvable.', 500);
    }
    let decision = first.record;
    let model = selected;
    let usedFallback = false;
    let result: CapabilityResult;
    try {
      result = await this.provider.invoke({
        providerKey: model.providerKey,
        modelKey: model.modelKey,
        capabilityKey: requirement.capabilityKey,
        input
      });
    } catch (primaryError) {
      usedFallback = true;
      const retry = await this.decide(actor, requirement, options.budgetCents, [model.id]);
      const fallback = retry.models.find((item) => item.id === retry.record.selectedModelId);
      if (!fallback) {
        throw primaryError;
      }
      decision = retry.record;
      model = fallback;
      result = await this.provider.invoke({
        providerKey: model.providerKey,
        modelKey: model.modelKey,
        capabilityKey: requirement.capabilityKey,
        input
      });
    }
    await this.costs.record({
      projectId: options.projectId ?? null,
      jobRunId: options.jobRunId ?? null,
      provider: result.providerKey,
      model: result.modelKey,
      units: 1,
      amountCents: result.costCents
    });
    await this.audit.record({
      actorId: actor.id,
      action: 'capability.executed',
      targetType: 'capability',
      targetId: requirement.capabilityKey,
      metadata: {
        decisionId: decision.id,
        providerKey: result.providerKey,
        modelKey: result.modelKey,
        costCents: result.costCents,
        usedFallback
      }
    });
    return { decision, result, usedFallback };
  }
}