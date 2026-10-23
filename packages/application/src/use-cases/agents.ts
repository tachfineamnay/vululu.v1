import {
  agentConfigChecksum,
  assertAgentRole,
  createAgentConfigVersion,
  createAgentDefinition,
  selectAgentConfigVersion,
  type AgentConfigContent,
  type AgentConfigVersion as DomainAgentConfigVersion,
  type AgentDefinition as DomainAgentDefinition
} from '@vululu/domain';
import { ApplicationError } from '../errors';
import type {
  Actor,
  AgentCapabilityRequirementRecord,
  AgentConfigVersionRecord,
  AgentDefinitionRecord,
  AgentRepository,
  AgentRoleRecord,
  AuditPort,
  Clock,
  IdGenerator
} from '../ports';

function assertAdmin(actor: Actor): void {
  if (actor.role !== 'super_admin') {
    throw new ApplicationError('forbidden', 'Acces reserve au super administrateur.', 403);
  }
}

function toDomainDefinition(record: AgentDefinitionRecord): DomainAgentDefinition {
  return {
    id: record.id,
    key: record.key,
    name: record.name,
    role: record.role,
    capabilityRequirements: record.capabilityRequirements.map((requirement) => ({
      capabilityKey: requirement.capabilityKey,
      maxCostCents: requirement.maxCostCents,
      minQuality: requirement.minQuality,
      maxLatencyMs: requirement.maxLatencyMs,
      allowedLicenses: requirement.allowedLicenses
    })),
    activeConfigVersionId: record.activeConfigVersionId,
    createdAt: record.createdAt.toISOString()
  };
}

function toDomainConfig(record: AgentConfigVersionRecord): DomainAgentConfigVersion {
  return {
    id: record.id,
    agentId: record.agentId,
    version: record.version,
    soul: record.soul,
    instructions: record.instructions,
    guardrails: record.guardrails,
    checksum: record.checksum,
    createdAt: record.createdAt.toISOString()
  };
}

/**
 * Registre des agents et de leurs configurations versionnees.
 * Promotion et rollback sont explicites ; un run doit figer une version.
 */
export class AgentConfigUseCases {
  constructor(
    private readonly agents: AgentRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly audit: AuditPort
  ) {}

  async list(actor: Actor): Promise<AgentDefinitionRecord[]> {
    assertAdmin(actor);
    return this.agents.listDefinitions();
  }

  async listConfigs(actor: Actor, agentId: string): Promise<AgentConfigVersionRecord[]> {
    assertAdmin(actor);
    const definition = await this.agents.findDefinition(agentId);
    if (!definition) {
      throw new ApplicationError('agent_not_found', 'Agent introuvable.', 404);
    }
    return this.agents.listConfigs(agentId);
  }

  async create(actor: Actor, input: {
    key: string;
    name: string;
    role: AgentRoleRecord;
    capabilityRequirements: AgentCapabilityRequirementRecord[];
  }): Promise<AgentDefinitionRecord> {
    assertAdmin(actor);
    const createdAt = this.clock.now().toISOString();
    const domain = createAgentDefinition({
      id: this.ids.next(),
      key: input.key,
      name: input.name,
      role: assertAgentRole(input.role),
      capabilityRequirements: input.capabilityRequirements,
      createdAt
    });
    const created = await this.agents.createDefinition({
      id: domain.id,
      key: domain.key,
      name: domain.name,
      role: domain.role,
      capabilityRequirements: input.capabilityRequirements,
      createdAt: new Date(createdAt)
    });
    await this.audit.record({
      actorId: actor.id,
      action: 'agent.created',
      targetType: 'agent',
      targetId: created.id,
      metadata: { key: created.key, role: created.role }
    });
    return created;
  }

  async addConfig(actor: Actor, agentId: string, content: AgentConfigContent): Promise<AgentConfigVersionRecord> {
    assertAdmin(actor);
    const definition = await this.agents.findDefinition(agentId);
    if (!definition) {
      throw new ApplicationError('agent_not_found', 'Agent introuvable.', 404);
    }
    const existing = await this.agents.listConfigs(agentId);
    const createdAt = this.clock.now().toISOString();
    const version = createAgentConfigVersion({
      id: this.ids.next(),
      agent: toDomainDefinition(definition),
      versions: existing.map(toDomainConfig),
      content,
      createdAt
    });
    const saved = await this.agents.saveConfigVersion({
      id: version.id,
      agentId: version.agentId,
      version: version.version,
      soul: version.soul,
      instructions: version.instructions,
      guardrails: [...version.guardrails],
      checksum: version.checksum,
      createdAt: new Date(version.createdAt)
    });
    await this.audit.record({
      actorId: actor.id,
      action: 'agent.config_created',
      targetType: 'agent',
      targetId: agentId,
      metadata: { version: saved.version, checksum: saved.checksum }
    });
    return saved;
  }

  async promote(actor: Actor, agentId: string, configVersionId: string): Promise<AgentDefinitionRecord> {
    assertAdmin(actor);
    const definition = await this.agents.findDefinition(agentId);
    if (!definition) {
      throw new ApplicationError('agent_not_found', 'Agent introuvable.', 404);
    }
    const configs = await this.agents.listConfigs(agentId);
    const target = selectAgentConfigVersion(configs.map(toDomainConfig), configVersionId);
    const updated = await this.agents.setActiveConfig(agentId, target.id);
    await this.audit.record({
      actorId: actor.id,
      action: 'agent.config_promoted',
      targetType: 'agent',
      targetId: agentId,
      metadata: { version: target.version, checksum: target.checksum }
    });
    return updated;
  }

  async rollback(actor: Actor, agentId: string, configVersionId: string): Promise<AgentDefinitionRecord> {
    assertAdmin(actor);
    const definition = await this.agents.findDefinition(agentId);
    if (!definition) {
      throw new ApplicationError('agent_not_found', 'Agent introuvable.', 404);
    }
    const configs = await this.agents.listConfigs(agentId);
    const target = selectAgentConfigVersion(configs.map(toDomainConfig), configVersionId);
    const updated = await this.agents.setActiveConfig(agentId, target.id);
    await this.audit.record({
      actorId: actor.id,
      action: 'agent.config_rolled_back',
      targetType: 'agent',
      targetId: agentId,
      metadata: { version: target.version, checksum: target.checksum }
    });
    return updated;
  }

  async activeForRun(actor: Actor, agentKey: string): Promise<{ definition: AgentDefinitionRecord; config: AgentConfigVersionRecord }> {
    const definition = await this.agents.findDefinitionByKey(agentKey);
    if (!definition) {
      throw new ApplicationError('agent_not_found', 'Agent introuvable.', 404);
    }
    if (!definition.activeConfigVersionId) {
      throw new ApplicationError('agent_config_required', 'Aucune configuration active.', 400);
    }
    const configs = await this.agents.listConfigs(definition.id);
    const config = configs.find((item) => item.id === definition.activeConfigVersionId);
    if (!config) {
      throw new ApplicationError('agent_config_not_found', 'Configuration active introuvable.', 404);
    }
    await this.audit.record({
      actorId: actor.id,
      action: 'agent.config_frozen',
      targetType: 'agent',
      targetId: definition.id,
      metadata: { version: config.version, checksum: config.checksum }
    });
    return { definition, config };
  }

  static checksum(content: AgentConfigContent): string {
    return agentConfigChecksum(content);
  }
}