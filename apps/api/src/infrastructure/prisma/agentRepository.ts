import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@vululu/db';
import { ApplicationError } from '@vululu/application';
import type {
  AgentConfigVersionRecord,
  AgentDefinitionRecord,
  AgentRepository,
  AgentRoleRecord,
  AgentCapabilityRequirementRecord
} from '@vululu/application';

function mapDefinition(row: {
  id: string;
  key: string;
  name: string;
  role: string;
  capabilityRequirements: unknown;
  activeConfigVersionId: string | null;
  createdAt: Date;
}): AgentDefinitionRecord {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    role: row.role as AgentRoleRecord,
    capabilityRequirements: row.capabilityRequirements as AgentCapabilityRequirementRecord[],
    activeConfigVersionId: row.activeConfigVersionId,
    createdAt: row.createdAt
  };
}

function mapConfig(row: {
  id: string;
  agentId: string;
  version: number;
  soul: string;
  instructions: string;
  guardrails: unknown;
  checksum: string;
  createdAt: Date;
}): AgentConfigVersionRecord {
  return {
    id: row.id,
    agentId: row.agentId,
    version: row.version,
    soul: row.soul,
    instructions: row.instructions,
    guardrails: row.guardrails as string[],
    checksum: row.checksum,
    createdAt: row.createdAt
  };
}

/** Persistance du registre agents/configs. */
export class PrismaAgentRepository implements AgentRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async createDefinition(input: Omit<AgentDefinitionRecord, 'activeConfigVersionId'>): Promise<AgentDefinitionRecord> {
    const row = await this.db.agentDefinition.create({
      data: {
        id: input.id,
        key: input.key,
        name: input.name,
        role: input.role,
        capabilityRequirements: input.capabilityRequirements as unknown as Prisma.InputJsonValue,
        createdAt: input.createdAt
      }
    });
    return mapDefinition(row);
  }

  async findDefinition(agentId: string): Promise<AgentDefinitionRecord | null> {
    const row = await this.db.agentDefinition.findUnique({ where: { id: agentId } });
    return row ? mapDefinition(row) : null;
  }

  async findDefinitionByKey(key: string): Promise<AgentDefinitionRecord | null> {
    const row = await this.db.agentDefinition.findUnique({ where: { key } });
    return row ? mapDefinition(row) : null;
  }

  async listDefinitions(): Promise<AgentDefinitionRecord[]> {
    const rows = await this.db.agentDefinition.findMany({ orderBy: { createdAt: 'asc' } });
    return rows.map(mapDefinition);
  }

  async listConfigs(agentId: string): Promise<AgentConfigVersionRecord[]> {
    const rows = await this.db.agentConfigVersion.findMany({
      where: { agentId },
      orderBy: { version: 'asc' }
    });
    return rows.map(mapConfig);
  }

  async saveConfigVersion(input: Omit<AgentConfigVersionRecord, 'checksum'> & { checksum: string }): Promise<AgentConfigVersionRecord> {
    const row = await this.db.agentConfigVersion.create({
      data: {
        id: input.id,
        agentId: input.agentId,
        version: input.version,
        soul: input.soul,
        instructions: input.instructions,
        guardrails: input.guardrails as unknown as Prisma.InputJsonValue,
        checksum: input.checksum,
        createdAt: input.createdAt
      }
    });
    return mapConfig(row);
  }

  async setActiveConfig(agentId: string, configVersionId: string): Promise<AgentDefinitionRecord> {
    const config = await this.db.agentConfigVersion.findFirst({
      where: { id: configVersionId, agentId }
    });
    if (!config) {
      throw new ApplicationError('agent_config_not_found', 'Configuration introuvable pour cet agent.', 404);
    }
    const row = await this.db.agentDefinition.update({
      where: { id: agentId },
      data: { activeConfigVersionId: configVersionId }
    });
    return mapDefinition(row);
  }
}
