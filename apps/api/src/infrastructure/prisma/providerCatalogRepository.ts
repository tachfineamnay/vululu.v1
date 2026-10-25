import type { PrismaClient } from '@prisma/client';
import { prisma } from '@vululu/db';
import { ApplicationError } from '@vululu/application';
import type {
  ModelRecord,
  ProviderCatalogRepository,
  ProviderRecord
} from '@vululu/application';

type License = 'internal' | 'commercial' | 'unknown';

function mapProvider(row: {
  id: string;
  key: string;
  name: string;
  active: boolean;
  createdAt: Date;
}): ProviderRecord {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    active: row.active,
    createdAt: row.createdAt
  };
}

function mapModel(row: {
  id: string;
  providerId: string;
  modelKey: string;
  capabilityKeys: string[];
  quality: number;
  latencyMs: number;
  costCentsPerUnit: number;
  license: string;
  active: boolean;
  qualified: boolean;
  createdAt: Date;
  provider: { key: string; active: boolean };
}): ModelRecord {
  return {
    id: row.id,
    providerId: row.providerId,
    providerKey: row.provider.key,
    modelKey: row.modelKey,
    capabilityKeys: row.capabilityKeys,
    quality: row.quality,
    latencyMs: row.latencyMs,
    costCentsPerUnit: row.costCentsPerUnit,
    license: row.license as License,
    active: row.active && row.provider.active,
    qualified: row.qualified,
    createdAt: row.createdAt
  };
}

/** Catalogue providers/modeles/capacites. */
export class PrismaProviderCatalogRepository implements ProviderCatalogRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async upsertProvider(input: { key: string; name: string; active: boolean }): Promise<ProviderRecord> {
    const row = await this.db.provider.upsert({
      where: { key: input.key },
      update: { name: input.name, active: input.active },
      create: { key: input.key, name: input.name, active: input.active }
    });
    return mapProvider(row);
  }

  async listProviders(): Promise<ProviderRecord[]> {
    const rows = await this.db.provider.findMany({ orderBy: { createdAt: 'asc' } });
    return rows.map(mapProvider);
  }

  async setProviderActive(providerKey: string, active: boolean): Promise<ProviderRecord> {
    const existing = await this.db.provider.findUnique({ where: { key: providerKey } });
    if (!existing) {
      throw new ApplicationError('provider_not_found', 'Provider introuvable.', 404);
    }
    const row = await this.db.provider.update({ where: { id: existing.id }, data: { active } });
    return mapProvider(row);
  }

  async upsertModel(input: {
    providerKey: string;
    modelKey: string;
    capabilityKeys: string[];
    quality: number;
    latencyMs: number;
    costCentsPerUnit: number;
    license: string;
    active: boolean;
    qualified: boolean;
  }): Promise<ModelRecord> {
    const provider = await this.db.provider.findUnique({ where: { key: input.providerKey } });
    if (!provider) {
      throw new ApplicationError('provider_not_found', 'Provider introuvable.', 404);
    }
    const row = await this.db.model.upsert({
      where: { providerId_modelKey: { providerId: provider.id, modelKey: input.modelKey } },
      update: {
        capabilityKeys: input.capabilityKeys,
        quality: input.quality,
        latencyMs: input.latencyMs,
        costCentsPerUnit: input.costCentsPerUnit,
        license: input.license,
        active: input.active,
        qualified: input.qualified
      },
      create: {
        providerId: provider.id,
        modelKey: input.modelKey,
        capabilityKeys: input.capabilityKeys,
        quality: input.quality,
        latencyMs: input.latencyMs,
        costCentsPerUnit: input.costCentsPerUnit,
        license: input.license,
        active: input.active,
        qualified: input.qualified
      },
      include: { provider: { select: { key: true, active: true } } }
    });
    return mapModel(row);
  }

  async listModels(capabilityKey?: string): Promise<ModelRecord[]> {
    const rows = await this.db.model.findMany({
      where: capabilityKey ? { capabilityKeys: { has: capabilityKey } } : undefined,
      orderBy: { createdAt: 'asc' },
      include: { provider: { select: { key: true, active: true } } }
    });
    return rows.map(mapModel);
  }

  async setModelActive(modelId: string, active: boolean): Promise<ModelRecord> {
    const row = await this.db.model.update({
      where: { id: modelId },
      data: { active },
      include: { provider: { select: { key: true, active: true } } }
    });
    return mapModel(row);
  }

  async setModelQualified(modelId: string, qualified: boolean): Promise<ModelRecord> {
    const row = await this.db.model.update({
      where: { id: modelId },
      data: { qualified },
      include: { provider: { select: { key: true, active: true } } }
    });
    return mapModel(row);
  }
}