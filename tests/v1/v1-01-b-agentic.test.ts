import { describe, expect, it } from 'vitest';
import {
  AgentConfigUseCases,
  ProviderCatalogUseCases,
  RoutingUseCases,
  type Actor,
  type AgentConfigVersionRecord,
  type AgentDefinitionRecord,
  type AgentRepository,
  type AuditPort,
  type CapabilityProviderPort,
  type CapabilityResult,
  type CostRepository,
  type ModelRecord,
  type ProviderCatalogRepository,
  type RouteDecisionRecord,
  type RoutingRepository
} from '@vululu/application';

const admin: Actor = { id: 'admin-1', role: 'super_admin' };
const user: Actor = { id: 'user-1', role: 'user' };
const clock = { now: () => new Date('2026-10-23T00:00:00.000Z') };
let seq = 0;
const ids = { next: () => 'id-' + ++seq };

class FakeAudit implements AuditPort {
  actions: string[] = [];
  async record(input: { action: string }): Promise<void> {
    this.actions.push(input.action);
  }
}

class FakeAgents implements AgentRepository {
  defs: AgentDefinitionRecord[] = [];
  configs: AgentConfigVersionRecord[] = [];
  async createDefinition(input: Omit<AgentDefinitionRecord, 'activeConfigVersionId'>): Promise<AgentDefinitionRecord> {
    const row = { ...input, activeConfigVersionId: null };
    this.defs.push(row);
    return row;
  }
  async findDefinition(id: string): Promise<AgentDefinitionRecord | null> {
    return this.defs.find((item) => item.id === id) ?? null;
  }
  async findDefinitionByKey(key: string): Promise<AgentDefinitionRecord | null> {
    return this.defs.find((item) => item.key === key) ?? null;
  }
  async listDefinitions(): Promise<AgentDefinitionRecord[]> {
    return this.defs;
  }
  async listConfigs(agentId: string): Promise<AgentConfigVersionRecord[]> {
    return this.configs.filter((item) => item.agentId === agentId);
  }
  async saveConfigVersion(input: AgentConfigVersionRecord): Promise<AgentConfigVersionRecord> {
    this.configs.push(input);
    return input;
  }
  async setActiveConfig(agentId: string, configVersionId: string): Promise<AgentDefinitionRecord> {
    const def = this.defs.find((item) => item.id === agentId)!;
    def.activeConfigVersionId = configVersionId;
    return def;
  }
}

class FakeCatalog implements ProviderCatalogRepository {
  models: ModelRecord[] = [];
  async upsertProvider(): Promise<any> { return {}; }
  async listProviders(): Promise<any[]> { return []; }
  async setProviderActive(): Promise<any> { return {}; }
  async upsertModel(): Promise<ModelRecord> { return this.models[0]; }
  async listModels(capabilityKey?: string): Promise<ModelRecord[]> {
    return this.models.filter((model) => !capabilityKey || model.capabilityKeys.includes(capabilityKey));
  }
  async setModelActive(): Promise<ModelRecord> { return this.models[0]; }
  async setModelQualified(): Promise<ModelRecord> { return this.models[0]; }
}

class FakeRoutes implements RoutingRepository {
  saved: RouteDecisionRecord[] = [];
  async saveDecision(input: Omit<RouteDecisionRecord, 'id' | 'createdAt'>): Promise<RouteDecisionRecord> {
    const row = { ...input, id: 'route-' + this.saved.length, createdAt: clock.now() };
    this.saved.push(row);
    return row;
  }
  async listDecisions(): Promise<RouteDecisionRecord[]> { return this.saved; }
}

class FakeCosts implements CostRepository {
  entries: number[] = [];
  async record(input: { amountCents: number }): Promise<void> {
    this.entries.push(input.amountCents);
  }
}

class FakeProvider implements CapabilityProviderPort {
  failedModels = new Set<string>();
  calls: string[] = [];
  async invoke(input: { providerKey: string; modelKey: string; capabilityKey: string; input: Record<string, unknown> }): Promise<CapabilityResult> {
    this.calls.push(input.modelKey);
    if (this.failedModels.has(input.modelKey)) {
      throw new Error('mock_provider_failure:' + input.modelKey);
    }
    return {
      output: { mock: true },
      providerKey: input.providerKey,
      modelKey: input.modelKey,
      costCents: 2,
      latencyMs: 5,
      mock: true
    };
  }
}

function model(id: string, quality: number, cost = 2): ModelRecord {
  return {
    id,
    providerId: 'provider-' + id,
    providerKey: 'mock-' + id,
    modelKey: 'model-' + id,
    capabilityKeys: ['copy'],
    quality,
    latencyMs: 10,
    costCentsPerUnit: cost,
    license: 'commercial',
    active: true,
    qualified: true,
    createdAt: clock.now()
  };
}

describe('V1-01-B Agentic Capabilities', () => {
  it('cree, versionne, promeut et rollback une configuration agent', async () => {
    const repo = new FakeAgents();
    const useCases = new AgentConfigUseCases(repo, clock, ids, new FakeAudit());
    const agent = await useCases.create(admin, {
      key: 'director',
      name: 'Director',
      role: 'director',
      capabilityRequirements: [{ capabilityKey: 'plan' }]
    });
    const v1 = await useCases.addConfig(admin, agent.id, { soul: 'S1', instructions: 'I1', guardrails: [] });
    const v2 = await useCases.addConfig(admin, agent.id, { soul: 'S2', instructions: 'I2', guardrails: [] });
    await useCases.promote(admin, agent.id, v2.id);
    expect((await repo.findDefinition(agent.id))?.activeConfigVersionId).toBe(v2.id);
    await useCases.rollback(admin, agent.id, v1.id);
    expect((await repo.findDefinition(agent.id))?.activeConfigVersionId).toBe(v1.id);
    expect(v1.checksum).not.toBe(v2.checksum);
  });

  it('gele la configuration active au moment du run', async () => {
    const repo = new FakeAgents();
    const useCases = new AgentConfigUseCases(repo, clock, ids, new FakeAudit());
    const agent = await useCases.create(admin, {
      key: 'frozen-agent',
      name: 'Frozen',
      role: 'specialist',
      capabilityRequirements: [{ capabilityKey: 'copy' }]
    });
    const v1 = await useCases.addConfig(admin, agent.id, { soul: 'S1', instructions: 'I1', guardrails: [] });
    await useCases.promote(admin, agent.id, v1.id);
    const frozen = await useCases.activeForRun(admin, 'frozen-agent');
    expect(frozen.config.id).toBe(v1.id);
    expect(frozen.config.checksum).toHaveLength(64);
  });

  it('refuse la configuration agent a un utilisateur non admin', async () => {
    const useCases = new AgentConfigUseCases(new FakeAgents(), clock, ids, new FakeAudit());
    await expect(useCases.create(user, {
      key: 'director',
      name: 'Director',
      role: 'director',
      capabilityRequirements: [{ capabilityKey: 'plan' }]
    })).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('refuse un modele non qualifie ou une licence incompatible', async () => {
    const catalog = new FakeCatalog();
    catalog.models = [
      { ...model('unqualified', 99), qualified: false },
      { ...model('unknown-license', 99), license: 'unknown' }
    ];
    const routes = new FakeRoutes();
    const costs = new FakeCosts();
    const useCases = new RoutingUseCases(catalog, routes, new FakeProvider(), costs, clock, new FakeAudit());
    await expect(useCases.preview(admin, {
      capabilityKey: 'copy',
      allowedLicenses: ['commercial']
    })).rejects.toThrow(/No eligible model|no eligible/i);
  });

  it('selectionne le meilleur modele et enregistre la decision', async () => {
    const catalog = new FakeCatalog();
    catalog.models = [model('best', 95), model('cheap', 80, 1)];
    const routes = new FakeRoutes();
    const useCases = new RoutingUseCases(catalog, routes, new FakeProvider(), new FakeCosts(), clock, new FakeAudit());
    const decision = await useCases.preview(admin, { capabilityKey: 'copy' }, 10);
    expect(decision.selectedModelId).toBe('best');
    expect(decision.fallbackModelId).toBe('cheap');
    expect(routes.saved).toHaveLength(1);
  });

  it('bascule sur le fallback quand le provider principal echoue et enregistre le cout', async () => {
    const catalog = new FakeCatalog();
    catalog.models = [model('primary', 95), model('fallback', 80)];
    const routes = new FakeRoutes();
    const costs = new FakeCosts();
    const provider = new FakeProvider();
    provider.failedModels.add('model-primary');
    const useCases = new RoutingUseCases(catalog, routes, provider, costs, clock, new FakeAudit());
    const result = await useCases.execute(admin, { capabilityKey: 'copy' }, { text: 'bonjour' }, { budgetCents: 10 });
    expect(result.usedFallback).toBe(true);
    expect(result.decision.selectedModelId).toBe('fallback');
    expect(result.result.modelKey).toBe('model-fallback');
    expect(costs.entries).toEqual([2]);
    expect(provider.calls).toEqual(['model-primary', 'model-fallback']);
  });

  it('refuse un budget inferieur au cout du modele', async () => {
    const catalog = new FakeCatalog();
    catalog.models = [model('expensive', 90, 50)];
    const useCases = new RoutingUseCases(catalog, new FakeRoutes(), new FakeProvider(), new FakeCosts(), clock, new FakeAudit());
    await expect(useCases.preview(admin, { capabilityKey: 'copy' }, 10)).rejects.toThrow(/No eligible model|no eligible/i);
  });

  it('cree un provider et un modele via le catalogue admin', async () => {
    const catalog = new FakeCatalog();
    catalog.models = [model('model-1', 90)];
    const useCases = new ProviderCatalogUseCases(catalog, new FakeAudit());
    const agent = await useCases.listProviders(admin);
    expect(agent).toEqual([]);
    await expect(useCases.registerProvider(user, { key: 'mock', name: 'Mock' })).rejects.toMatchObject({ code: 'forbidden' });
  });
});