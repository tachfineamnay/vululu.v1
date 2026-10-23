import { describe, expect, it } from 'vitest';
import {
  assertAgentConfigFrozen,
  assertWithinBudget,
  createAgentConfigVersion,
  createAgentDefinition,
  isModelEligible,
  rankModels,
  routeCapability,
  selectAgentConfigVersion,
  type ModelDefinition
} from '../../packages/domain/src/index';

const now = '2026-10-23T00:00:00.000Z';

const agents = () => {
  const agent = createAgentDefinition({
    id: 'agent-1',
    key: 'director',
    name: 'Director',
    role: 'director',
    capabilityRequirements: [{ capabilityKey: 'plan' }],
    createdAt: now
  });
  const v1 = createAgentConfigVersion({
    id: 'config-1',
    agent,
    versions: [],
    content: { soul: 'Soul 1', instructions: 'Instructions 1', guardrails: ['No budget overrun'] },
    createdAt: now
  });
  const v2 = createAgentConfigVersion({
    id: 'config-2',
    agent,
    versions: [v1],
    content: { soul: 'Soul 2', instructions: 'Instructions 2', guardrails: ['No budget overrun'] },
    createdAt: now
  });
  return { agent, v1, v2 };
};

const model = (overrides: Partial<ModelDefinition> = {}): ModelDefinition => ({
  id: 'model-a',
  providerId: 'provider-a',
  providerKey: 'mock-a',
  modelKey: 'm-a',
  capabilityKeys: ['image'],
  quality: 80,
  latencyMs: 100,
  costCentsPerUnit: 10,
  license: 'commercial',
  active: true,
  qualified: true,
  ...overrides
});

describe('AgentDefinition et AgentConfigVersion', () => {
  it('versionne les configs et scelle le contenu par checksum', () => {
    const { v1, v2 } = agents();
    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);
    expect(v1.checksum).toHaveLength(64);
    expect(v2.checksum).not.toBe(v1.checksum);
    expect(selectAgentConfigVersion([v1, v2], 'config-1').id).toBe('config-1');
  });

  it('gele une version active et refuse une version stale', () => {
    const { agent, v1, v2 } = agents();
    expect(assertAgentConfigFrozen('config-2', v2).id).toBe('config-2');
    expect(() => assertAgentConfigFrozen('config-2', v1)).toThrow(/configuration changed|agent configuration/i);
    expect(agent.activeConfigVersionId).toBeNull();
  });
});

describe('Registre et routage de capacites', () => {
  it('filtre les modeles inactifs, non qualifies, licences et seuils', () => {
    const requirement = { capabilityKey: 'image', minQuality: 70, maxCostCents: 20, allowedLicenses: ['commercial'] as const };
    expect(isModelEligible(model(), requirement)).toBe(true);
    expect(isModelEligible(model({ active: false }), requirement)).toBe(false);
    expect(isModelEligible(model({ qualified: false }), requirement)).toBe(false);
    expect(isModelEligible(model({ license: 'unknown' }), requirement)).toBe(false);
    expect(isModelEligible(model({ quality: 10 }), requirement)).toBe(false);
    expect(isModelEligible(model({ costCentsPerUnit: 99 }), requirement)).toBe(false);
  });

  it('classe qualite, cout, latence puis id de facon deterministe', () => {
    const ranked = rankModels(
      [
        model({ id: 'b', quality: 90, costCentsPerUnit: 20 }),
        model({ id: 'a', quality: 90, costCentsPerUnit: 10 }),
        model({ id: 'c', quality: 70, costCentsPerUnit: 1 })
      ],
      { capabilityKey: 'image' }
    );
    expect(ranked.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('selectionne primaire et fallback, et trace la decision', () => {
    const decision = routeCapability({
      models: [
        model({ id: 'primary', quality: 90 }),
        model({ id: 'fallback', quality: 80 }),
        model({ id: 'disabled', active: false })
      ],
      requirement: { capabilityKey: 'image' },
      decidedAt: now
    });
    expect(decision.selectedModelId).toBe('primary');
    expect(decision.fallbackModelId).toBe('fallback');
    expect(decision.candidateModelIds).toEqual(['primary', 'fallback']);
    expect(decision.criteria).toMatchObject({ budgetCents: null });
  });

  it('refuse un modele deja en echec et un budget depasse', () => {
    const models = [model({ id: 'primary' }), model({ id: 'fallback', quality: 70 })];
    const decision = routeCapability({
      models,
      requirement: { capabilityKey: 'image' },
      failedModelIds: ['primary'],
      decidedAt: now
    });
    expect(decision.selectedModelId).toBe('fallback');
    expect(() =>
      routeCapability({
        models,
        requirement: { capabilityKey: 'image' },
        budgetCents: 1,
        decidedAt: now
      })
    ).toThrow(/No eligible model|no eligible/i);
  });

  it('refuse un budget negatif ou depasse', () => {
    expect(() => assertWithinBudget(10, 10)).not.toThrow();
    expect(() => assertWithinBudget(11, 10)).toThrow(/budget/i);
    expect(() => assertWithinBudget(-1, 10)).toThrow(/cost|non-negative/i);
  });
});