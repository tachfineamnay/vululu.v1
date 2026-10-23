import type { PrismaClient } from '@prisma/client';
import { prisma } from '@vululu/db';
import type { ProjectRecord, ProjectRepository } from '@vululu/application';
import { toProjectRecord } from './mappers';

/** Adaptateur PostgreSQL du port ProjectRepository (lectures filtrees par proprietaire). */
export class PrismaProjectRepository implements ProjectRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async create(input: Omit<ProjectRecord, 'id'>): Promise<ProjectRecord> {
    const row = await this.db.project.create({
      data: {
        userId: input.userId,
        contextId: input.contextId,
        title: input.title,
        platform: input.platform,
        format: input.format,
        objective: input.objective,
        sceneDurationSeconds: input.sceneDurationSeconds,
        status: input.status
      }
    });
    return toProjectRecord(row);
  }

  async findOwned(projectId: string, userId: string): Promise<ProjectRecord | null> {
    const row = await this.db.project.findFirst({ where: { id: projectId, userId } });
    return row ? toProjectRecord(row) : null;
  }

  async listOwned(userId: string): Promise<ProjectRecord[]> {
    const rows = await this.db.project.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' }
    });
    return rows.map(toProjectRecord);
  }

  async updateStatus(projectId: string, status: string): Promise<void> {
    await this.db.project.update({ where: { id: projectId }, data: { status } });
  }
}
