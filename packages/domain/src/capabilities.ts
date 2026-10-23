import { DomainError } from './errors';
import { assertEntityId, EntityId, requireNonEmpty } from './identifiers';
import { deepFreeze } from './immutability';
import { assertIsoTimestamp, IsoTimestamp } from './timestamp';

export type LicenseType = 'internal' | 'commercial' | 'unknown';

export interface CapabilityRequirement {
  readonly capabilityKey: string;
  readonly maxCostCents?: number;
  readonly minQuality?: number;
  readonly maxLatencyMs?: number;
  readonly allowedLicenses?: readonly LicenseType[];
}

export interface ModelDefinition {
  readonly id: EntityId;
  readonly providerId: EntityId;
  readonly providerKey: string;
  readonly modelKey: string;
  readonly capabilityKeys: readonly string[];
  /** Score qualitatif 0-100 fourni par le registre, jamais invente par le routeur. */
  readonly quality: number;
  readonly latencyMs: number;
  readonly costCentsPerUnit: number;
  readonly license: LicenseType;
  readonly active: boolean;
  readonly qualified: boolean;
}

export interface RouteDecision {
  readonly capabilityKey: string;
  readonly candidateModelIds: readonly EntityId[];
  readonly selectedModelId: EntityId;
  readonly fallbackModelId: EntityId | null;
  readonly criteria: Readonly<Record<string, unknown>>;
  readonly reason: string;
  readonly decidedAt: IsoTimestamp;
}

export const LICENSE_TYPES: readonly LicenseType[] = ['internal', 'commercial', 'unknown'];

export function assertCapabilityKey(value: string): string {
  return requireNonEmpty(value, 'capabilityKey');
}

export function assertLicenseType(value: string): LicenseType {
  if (!LICENSE_TYPES.includes(value as LicenseType)) {
    throw new DomainError('invalid_input', 'Unknown license type.', { license: value });
  }
  return value as LicenseType;
}

export function assertQuality(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    throw new DomainError('invalid_input', 'Quality must be an integer between 0 and 100.', {
      quality: value
    });
  }
  return value;
}

export function assertNonNegativeInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new DomainError('invalid_input', field + ' must be a non-negative integer.', { field, value });
  }
  return value;
}

export function normalizeRequirement(input: CapabilityRequirement): CapabilityRequirement {
  return deepFreeze({
    capabilityKey: assertCapabilityKey(input.capabilityKey),
    maxCostCents:
      input.maxCostCents === undefined
        ? undefined
        : assertNonNegativeInteger(input.maxCostCents, 'maxCostCents'),
    minQuality:
      input.minQuality === undefined ? undefined : assertQuality(input.minQuality),
    maxLatencyMs:
      input.maxLatencyMs === undefined
        ? undefined
        : assertNonNegativeInteger(input.maxLatencyMs, 'maxLatencyMs'),
    allowedLicenses:
      input.allowedLicenses === undefined
        ? undefined
        : deepFreeze(input.allowedLicenses.map((license) => assertLicenseType(license)))
  });
}

export function isModelEligible(model: ModelDefinition, input: CapabilityRequirement): boolean {
  const requirement = normalizeRequirement(input);
  if (!model.active || !model.qualified) {
    return false;
  }
  if (!model.capabilityKeys.includes(requirement.capabilityKey)) {
    return false;
  }
  if (requirement.minQuality !== undefined && model.quality < requirement.minQuality) {
    return false;
  }
  if (requirement.maxLatencyMs !== undefined && model.latencyMs > requirement.maxLatencyMs) {
    return false;
  }
  if (requirement.maxCostCents !== undefined && model.costCentsPerUnit > requirement.maxCostCents) {
    return false;
  }
  if (
    requirement.allowedLicenses !== undefined &&
    !requirement.allowedLicenses.includes(model.license)
  ) {
    return false;
  }
  return true;
}

/**
 * Classement deterministe : qualite decroissante, cout croissant, latence croissante,
 * puis identifiant pour eviter toute dependance a l ordre d arrivee.
 */
export function rankModels(
  models: readonly ModelDefinition[],
  requirement: CapabilityRequirement
): readonly ModelDefinition[] {
  return deepFreeze(
    models
      .filter((model) => isModelEligible(model, requirement))
      .slice()
      .sort((left, right) => {
        if (left.quality !== right.quality) return right.quality - left.quality;
        if (left.costCentsPerUnit !== right.costCentsPerUnit) {
          return left.costCentsPerUnit - right.costCentsPerUnit;
        }
        if (left.latencyMs !== right.latencyMs) return left.latencyMs - right.latencyMs;
        return left.id.localeCompare(right.id);
      })
  );
}

/**
 * Route une capacite. Un modele deja en echec est exclu du choix principal mais
 * peut rester candidat de fallback si un autre modele est disponible.
 */
export function routeCapability(input: {
  readonly models: readonly ModelDefinition[];
  readonly requirement: CapabilityRequirement;
  readonly budgetCents?: number;
  readonly failedModelIds?: readonly EntityId[];
  readonly decidedAt: IsoTimestamp;
}): RouteDecision {
  const requirement = normalizeRequirement(input.requirement);
  const failed = new Set(input.failedModelIds ?? []);
  const candidates = rankModels(input.models, requirement);
  const eligible = candidates.filter((model) => {
    if (input.budgetCents !== undefined && model.costCentsPerUnit > input.budgetCents) {
      return false;
    }
    return true;
  });
  if (eligible.length === 0) {
    throw new DomainError('no_route', 'No eligible model for capability.', {
      capabilityKey: requirement.capabilityKey,
      candidates: candidates.map((model) => model.id)
    });
  }
  const healthy = eligible.filter((model) => !failed.has(model.id));
  if (healthy.length === 0) {
    throw new DomainError('no_route', 'All eligible models are in failure.', {
      capabilityKey: requirement.capabilityKey,
      candidates: eligible.map((model) => model.id)
    });
  }
  const selected = healthy[0];
  const fallback = healthy[1] ?? null;
  return deepFreeze({
    capabilityKey: requirement.capabilityKey,
    candidateModelIds: eligible.map((model) => model.id),
    selectedModelId: selected.id,
    fallbackModelId: fallback?.id ?? null,
    criteria: {
      minQuality: requirement.minQuality ?? null,
      maxLatencyMs: requirement.maxLatencyMs ?? null,
      maxCostCents: requirement.maxCostCents ?? null,
      allowedLicenses: requirement.allowedLicenses ?? null,
      budgetCents: input.budgetCents ?? null,
      failedModelIds: [...failed].sort()
    },
    reason:
      failed.has(selected.id)
        ? 'fallback_selected'
        : fallback === null
          ? 'single_candidate'
          : 'primary_selected',
    decidedAt: assertIsoTimestamp(input.decidedAt, 'decidedAt')
  });
}

/** Compare une estimation a un plafond. */
export function assertWithinBudget(estimatedCents: number, maxCents: number): void {
  if (!Number.isInteger(estimatedCents) || estimatedCents < 0) {
    throw new DomainError('invalid_input', 'Estimated cost must be a non-negative integer.');
  }
  if (!Number.isInteger(maxCents) || maxCents < 0) {
    throw new DomainError('invalid_input', 'Budget must be a non-negative integer.');
  }
  if (estimatedCents > maxCents) {
    throw new DomainError('budget_exceeded', 'Estimated cost exceeds the budget.', {
      estimatedCents,
      maxCents
    });
  }
}

export function routeCapabilityFromIds(
  decision: RouteDecision,
  modelId: EntityId
): ModelDefinition['id'] {
  return assertEntityId(modelId);
}
