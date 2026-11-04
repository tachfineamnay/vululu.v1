import type { PrismaClient } from '@prisma/client';
import { prisma } from '@vululu/db';
import {
  routeCapability,
  contentChecksum,
  type CapabilityRequirement,
  type LicenseType
} from '@vululu/domain';
import { ApplicationError } from '@vululu/application';
import type {
  CapabilityProviderPort,
  DurableRoutingPort,
  DurableRunRoutingSnapshot,
  ReproducibilitySnapshot
} from '@vululu/application';
import { PrismaRoutingRepository } from '../prisma/routingRepository';
import { MockCapabilityProvider } from '../providers/mockCapabilityProvider';

/**
 * Routage depuis le snapshot de lancement : aucun catalogue/config actif relu.
 * decision deterministe, fallback mock trace et cout mock idempotent.
 *
 * La decision est persistee dans RoutingDecision et RunRoutingSnapshot. Les
 * modifications ulterieures de la config agent ne reecrivent pas ce snapshot.
 */
export class DurableRoutingService implements DurableRoutingPort {
  private readonly routes: PrismaRoutingRepository;

  constructor(
    private readonly db: PrismaClient = prisma,
    private readonly failedModelKeys?: ReadonlySet<string>,
    private readonly provider?: CapabilityProviderPort
  ) {
    this.routes = new PrismaRoutingRepository(db);
  }

  async resolve(input: {
    jobRunId: string;
    projectId: string;
    capabilityKey: string;
    budgetCents: number;
    input: Record<string, unknown>;
    idempotencyKey: string;
  }): Promise<DurableRunRoutingSnapshot> {
    const run = await this.db.jobRun.findFirst({ where: { id: input.jobRunId, projectId: input.projectId } });
    const snapshot = run?.snapshot as ReproducibilitySnapshot | null;
    const policy = snapshot?.executionPolicy;
    if (!policy) throw new ApplicationError('routing_snapshot_required', 'La politique historique manque ; créez un nouveau run après relecture.', 409);
    if (!run?.snapshotChecksum || contentChecksum(snapshot) !== run.snapshotChecksum) throw new ApplicationError('snapshot_invalid', 'Snapshot de routage altéré.', 409);
    if (!Number.isInteger(input.budgetCents) || input.budgetCents < 0) throw new ApplicationError('invalid_budget', 'Plafond MOCK invalide.', 400);
    const config = policy.agent.config;
    const configured = policy.agent.capabilityRequirements.find((value) => value.capabilityKey === input.capabilityKey);
    if (policy.agent.definitionId && !configured) throw new ApplicationError('capability_not_allowed', 'Capacité absente de la politique de cet agent.', 409);
    const usageLicenses: LicenseType[] = policy.usage === 'sponsored' ? ['commercial'] : ['internal', 'commercial'];
    const requirement: CapabilityRequirement = {
      ...configured,
      capabilityKey: input.capabilityKey,
      allowedLicenses: usageLicenses.filter((license) => !configured?.allowedLicenses || configured.allowedLicenses.includes(license))
    };
    const models = policy.models.filter((model) => model.capabilityKeys.includes(input.capabilityKey));
    const budgetCents = Math.min(input.budgetCents, policy.maxMockCents);
    const provider = this.provider ?? new MockCapabilityProvider(this.failedModelKeys ?? new Set(policy.mockFailedModelKeys));
    const invocationInput = { ...input.input, agentConfig: config, mock: true };
    if (models.length === 0) {
      throw new ApplicationError('no_route', 'Aucun modele pour la capacite ' + input.capabilityKey + '.', 409);
    }
    const failed: string[] = [];
    let decision = routeCapability({
      models,
      requirement,
      budgetCents,
      failedModelIds: failed,
      decidedAt: new Date().toISOString()
    });
    let selected = models.find((model) => model.id === decision.selectedModelId);
    if (!selected) throw new ApplicationError('no_route', 'Modele selectionne introuvable.', 500);
    let usedFallback = false;
    let result: { providerKey: string; modelKey: string; costCents: number };
    try {
      result = await provider.invoke({
        providerKey: selected.providerKey,
        modelKey: selected.modelKey,
        capabilityKey: input.capabilityKey,
        input: invocationInput
      });
    } catch (primaryError) {
      usedFallback = true;
      failed.push(selected.id);
      decision = routeCapability({
        models,
        requirement,
        budgetCents,
        failedModelIds: failed,
        decidedAt: new Date().toISOString()
      });
      const fallback = models.find((model) => model.id === decision.selectedModelId);
      if (!fallback) throw primaryError;
      selected = fallback;
      result = await provider.invoke({
        providerKey: selected.providerKey,
        modelKey: selected.modelKey,
        capabilityKey: input.capabilityKey,
        input: invocationInput
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
      agentDefinitionId: policy.agent.definitionId,
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
        budgetCents,
        priceSource: 'frozen-catalogue-MOCK',
        workflowVersion: policy.workflow.version,
        decisionReason: decision.reason
      },
      decisionId: saved.id,
      estimatedCents: decision.selectedModelId ? (models.find((m) => m.id === decision.selectedModelId)?.costCentsPerUnit ?? 0) : 0,
      actualCents: selected.costCentsPerUnit,
      usedFallback
    };
  }
}
