import { DomainError } from './errors';
import { assertEntityId, EntityId, requireNonEmpty } from './identifiers';
import { deepFreeze } from './immutability';
import { contentChecksum } from './checksum';
import { assertIsoTimestamp, IsoTimestamp } from './timestamp';
import { CapabilityRequirement, normalizeRequirement } from './capabilities';

export type AgentRole = 'director' | 'specialist' | 'validator';

export interface AgentDefinition {
  readonly id: EntityId;
  readonly key: string;
  readonly name: string;
  readonly role: AgentRole;
  readonly capabilityRequirements: readonly CapabilityRequirement[];
  readonly activeConfigVersionId: EntityId | null;
  readonly createdAt: IsoTimestamp;
}

export interface AgentConfigVersion {
  readonly id: EntityId;
  readonly agentId: EntityId;
  readonly version: number;
  readonly soul: string;
  readonly instructions: string;
  readonly guardrails: readonly string[];
  readonly checksum: string;
  readonly createdAt: IsoTimestamp;
}

export type AgentConfigContent = {
  readonly soul: string;
  readonly instructions: string;
  readonly guardrails: readonly string[];
};

export function assertAgentRole(value: string): AgentRole {
  if (value !== 'director' && value !== 'specialist' && value !== 'validator') {
    throw new DomainError('invalid_input', 'Unknown agent role.', { role: value });
  }
  return value;
}

export function normalizeAgentConfigContent(input: AgentConfigContent): AgentConfigContent {
  return deepFreeze({
    soul: requireNonEmpty(input.soul, 'soul'),
    instructions: requireNonEmpty(input.instructions, 'instructions'),
    guardrails: deepFreeze(
      input.guardrails.map((guardrail, index) => requireNonEmpty(guardrail, 'guardrails[' + index + ']'))
    )
  });
}

export function agentConfigChecksum(content: AgentConfigContent): string {
  return contentChecksum(normalizeAgentConfigContent(content));
}

export function createAgentDefinition(input: {
  readonly id: EntityId;
  readonly key: string;
  readonly name: string;
  readonly role: AgentRole;
  readonly capabilityRequirements: readonly CapabilityRequirement[];
  readonly createdAt: IsoTimestamp;
}): AgentDefinition {
  if (input.capabilityRequirements.length === 0) {
    throw new DomainError('invalid_input', 'An agent requires at least one capability.', {});
  }
  return deepFreeze({
    id: assertEntityId(input.id),
    key: requireNonEmpty(input.key, 'key'),
    name: requireNonEmpty(input.name, 'name'),
    role: assertAgentRole(input.role),
    capabilityRequirements: deepFreeze(
      input.capabilityRequirements.map((requirement) => normalizeRequirement(requirement))
    ),
    activeConfigVersionId: null,
    createdAt: assertIsoTimestamp(input.createdAt, 'createdAt')
  });
}

export function createAgentConfigVersion(input: {
  readonly id: EntityId;
  readonly agent: AgentDefinition;
  readonly versions: readonly AgentConfigVersion[];
  readonly content: AgentConfigContent;
  readonly createdAt: IsoTimestamp;
}): AgentConfigVersion {
  const content = normalizeAgentConfigContent(input.content);
  const version =
    input.versions.length === 0
      ? 1
      : Math.max(...input.versions.map((item) => item.version)) + 1;
  return deepFreeze({
    id: assertEntityId(input.id),
    agentId: input.agent.id,
    version,
    ...content,
    checksum: agentConfigChecksum(content),
    createdAt: assertIsoTimestamp(input.createdAt, 'createdAt')
  });
}

/** Selectionne une version existante ; l historique reste immuable. */
export function selectAgentConfigVersion(
  versions: readonly AgentConfigVersion[],
  configVersionId: EntityId
): AgentConfigVersion {
  const target = versions.find((version) => version.id === assertEntityId(configVersionId));
  if (!target) {
    throw new DomainError('agent_config_not_found', 'Agent config version does not exist.', {
      configVersionId
    });
  }
  return target;
}

/** Verifie que la version active est bien la version attendue par le run. */
export function assertAgentConfigFrozen(
  activeConfigVersionId: EntityId | null,
  version: AgentConfigVersion
): AgentConfigVersion {
  if (activeConfigVersionId === null || activeConfigVersionId !== version.id) {
    throw new DomainError('agent_config_stale', 'Agent configuration changed during the run.', {
      activeConfigVersionId,
      configVersionId: version.id
    });
  }
  return version;
}

export function latestAgentConfigVersion(
  versions: readonly AgentConfigVersion[]
): AgentConfigVersion | null {
  if (versions.length === 0) {
    return null;
  }
  return versions.reduce((latest, version) =>
    version.version > latest.version ? version : latest
  );
}
