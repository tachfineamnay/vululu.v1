import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@vululu/db';
import type { RouteDecisionRecord, RoutingRepository } from '@vululu/application';

function mapDecision(row: {
  id: string;
  capabilityKey: string;
  candidateModelIds: string[];
  selectedModelId: string;
  fallbackModelId: string | null;
  criteria: unknown;
  reason: string;
  createdAt: Date;
}): RouteDecisionRecord {
  return {
    id: row.id,
    capabilityKey: row.capabilityKey,
    candidateModelIds: row.candidateModelIds,
    selectedModelId: row.selectedModelId,
    fallbackModelId: row.fallbackModelId,
    criteria: row.criteria as Record<string, unknown>,
    reason: row.reason,
    createdAt: row.createdAt
  };
}

export class PrismaRoutingRepository implements RoutingRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async saveDecision(input: Omit<RouteDecisionRecord, 'id' | 'createdAt'>): Promise<RouteDecisionRecord> {
    const row = await this.db.routingDecision.create({
      data: {
        capabilityKey: input.capabilityKey,
        candidateModelIds: input.candidateModelIds,
        selectedModelId: input.selectedModelId,
        fallbackModelId: input.fallbackModelId,
        criteria: input.criteria as unknown as Prisma.InputJsonValue,
        reason: input.reason
      }
    });
    return mapDecision(row);
  }

  async listDecisions(limit = 20): Promise<RouteDecisionRecord[]> {
    const rows = await this.db.routingDecision.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit
    });
    return rows.map(mapDecision);
  }
}
