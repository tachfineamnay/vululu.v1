import { contentChecksum, DomainError, plannedSceneCount, rankModels, routeCapability, type CapabilityRequirement, type LicenseType, type ProductionSettings } from '@vululu/domain';
import { ApplicationError } from './errors';
import type { ProductionPlan, RunExecutionPolicy } from './ports';

export function frozenRouteInputs(policy: RunExecutionPolicy, capabilityKey: string, requestedBudget: number) {
  if (!Number.isInteger(requestedBudget) || requestedBudget < 0) throw new ApplicationError('invalid_budget', 'Plafond MOCK invalide.', 400);
  const configured = policy.agent.capabilityRequirements.find((value) => value.capabilityKey === capabilityKey);
  if (policy.agent.definitionId && !configured) throw new ApplicationError('capability_not_allowed', 'Capacité absente de la politique de cet agent.', 409);
  const usageLicenses: LicenseType[] = policy.usage === 'sponsored' ? ['commercial'] : ['internal', 'commercial'];
  const requirement: CapabilityRequirement = { ...configured, capabilityKey, allowedLicenses: usageLicenses.filter((license) => !configured?.allowedLicenses || configured.allowedLicenses.includes(license)) };
  return { models: policy.models.filter((model) => model.capabilityKeys.includes(capabilityKey)), requirement, budgetCents: Math.min(requestedBudget, policy.maxMockCents) };
}

const capabilities: Record<string, string> = {
  snapshot: 'snapshot.validate', 'validate-snapshot': 'snapshot.validate', 'resolve-capabilities': 'scene.generate',
  'render-scenes': 'image.render.local', 'correct-scene': 'image.correct.local', 'assemble-master': 'video.assemble.local',
  qa: 'media.qa.local', finalize: 'artifact.version', approval: 'human.approval', transfer: 'postiz.transfer.MOCK'
};

/** Plan déterministe des seules opérations réellement disponibles ; aucun appel fournisseur. */
export function createProductionPlan(input: { settings: ProductionSettings; format: Parameters<typeof plannedSceneCount>[0]; briefVersion: number; briefChecksum: string; policy: RunExecutionPolicy; sceneDurationsSeconds?: number[] }): ProductionPlan {
  const { settings, policy } = input;
  const issues: ProductionPlan['issues'] = [];
  if (input.format !== 'Video') issues.push({ code: 'format_not_qualified', message: 'Ce format attend sa qualification média.' });
  if (settings.audio.voiceVersionId || settings.audio.musicVersionId) issues.push({ code: 'audio_not_qualified', message: 'Les fichiers et le mix audio attendent leur qualification média.' });
  let estimatedCents = 0; let maxPossibleCents = 0;
  if (policy.workflow.engine === 'hatchet') {
    try {
      const route = frozenRouteInputs(policy, 'scene.generate', policy.maxMockCents);
      const eligible = rankModels(route.models, route.requirement);
      if (eligible.length && !eligible.some((model) => model.costCentsPerUnit <= route.budgetCents)) throw new ApplicationError('budget_exceeded', 'Le plafond MOCK est insuffisant pour ce run.', 409);
      const decision = routeCapability({ ...route, decidedAt: new Date().toISOString() });
      estimatedCents = route.models.find((model) => model.id === decision.selectedModelId)!.costCentsPerUnit;
      maxPossibleCents = Math.max(...route.models.filter((model) => decision.candidateModelIds.includes(model.id)).map((model) => model.costCentsPerUnit));
    } catch (error) {
      if (!(error instanceof ApplicationError || error instanceof DomainError)) throw error;
      issues.push({ code: error.code, message: error.code === 'no_route' ? 'Aucun modèle MOCK admissible pour les droits et capacités de ce run.' : error.message });
    }
  }
  const sceneCount = plannedSceneCount(input.format);
  const content = {
    schemaVersion: 1 as const, mode: 'MOCK' as const, executionMode: policy.workflow.engine, workflowVersion: policy.workflow.version,
    briefVersion: input.briefVersion, format: input.format, ratio: settings.ratio, sceneCount,
    durationSeconds: input.sceneDurationsSeconds?.reduce((sum, seconds) => sum + seconds, 0) ?? sceneCount * settings.defaultSceneDurationSeconds,
    steps: policy.workflow.steps.map((step) => ({ ...step, capability: capabilities[step.key] ?? step.key })),
    pricing: { estimatedCents, maxPossibleCents, ceilingCents: policy.maxMockCents }, ready: issues.length === 0, issues
  };
  // Les données privées ne sont pas exposées par le plan ; leur empreinte participe à sa provenance.
  return { ...content, checksum: contentChecksum({ content, briefChecksum: input.briefChecksum, policyChecksum: contentChecksum(policy) }) };
}
