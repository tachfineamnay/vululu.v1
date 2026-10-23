import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@vululu/db';
import { ApplicationError } from '@vululu/application';
import type {
  BriefContentRecord,
  BriefRevisionRecord,
  BriefStore,
  BriefWithRevisions
} from '@vululu/application';

function mapRevision(row: {
  id: string;
  briefId: string;
  version: number;
  objective: string;
  audience: string;
  tone: string;
  cta: string;
  platform: string;
  format: string;
  checksum: string;
  createdAt: Date;
}): BriefRevisionRecord {
  return {
    id: row.id,
    briefId: row.briefId,
    version: row.version,
    objective: row.objective,
    audience: row.audience,
    tone: row.tone,
    cta: row.cta,
    platform: row.platform as BriefContentRecord['platform'],
    format: row.format as BriefContentRecord['format'],
    checksum: row.checksum,
    createdAt: row.createdAt
  };
}

function mapBrief(row: {
  id: string;
  projectId: string;
  objective: string;
  audience: string;
  tone: string;
  cta: string;
  platform: string;
  format: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  revisions: Array<Parameters<typeof mapRevision>[0]>;
}): BriefWithRevisions {
  return {
    id: row.id,
    projectId: row.projectId,
    objective: row.objective,
    audience: row.audience,
    tone: row.tone,
    cta: row.cta,
    platform: row.platform,
    format: row.format,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    revisions: row.revisions.map(mapRevision)
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

/**
 * Persistance atomique du brief et de ses revisions.
 *
 * La transaction verrouille le projet par un update de statut, verifie la
 * version attendue, puis ecrit la revision et met a jour le pointeur courant.
 * Une revision ne peut donc jamais etre orpheline ou sauter une version.
 */
export class PrismaBriefStore implements BriefStore {
  constructor(private readonly db: PrismaClient = prisma) {}

  async findWithRevisions(projectId: string): Promise<BriefWithRevisions | null> {
    const row = await this.db.brief.findUnique({
      where: { projectId },
      include: { revisions: { orderBy: { version: 'asc' } } }
    });
    return row ? mapBrief(row) : null;
  }

  async saveRevision(input: {
    userId: string;
    projectId: string;
    briefId: string;
    revisionId: string;
    version: number;
    content: BriefContentRecord;
    checksum: string;
    createdAt: Date;
    projectStatus: string;
  }): Promise<BriefWithRevisions> {
    try {
      return await this.db.$transaction(async (tx) => {
        const project = await tx.project.findFirst({
          where: { id: input.projectId, userId: input.userId },
          select: { id: true }
        });
        if (!project) {
          throw new ApplicationError('project_not_found', 'Projet introuvable.', 404);
        }
        const locked = await tx.project.updateMany({
          where: { id: input.projectId, userId: input.userId, status: { not: 'producing' } },
          data: { status: input.projectStatus }
        });
        if (locked.count === 0) {
          throw new ApplicationError('project_busy', 'Le brief ne peut pas etre modifie pendant une production.', 409);
        }
        const existing = await tx.brief.findUnique({
          where: { projectId: input.projectId }
        });
        if (existing) {
          if (existing.id !== input.briefId) {
            throw new ApplicationError('brief_conflict', 'Le brief a change pendant la mise a jour.', 409);
          }
          if (existing.version !== input.version - 1) {
            throw new ApplicationError(
              'brief_version_conflict',
              'La version du brief a change pendant la mise a jour.',
              409
            );
          }
          await tx.brief.update({
            where: { projectId: input.projectId },
            data: { ...input.content, version: input.version }
          });
        } else {
          if (input.version !== 1) {
            throw new ApplicationError('brief_version_conflict', 'La premiere revision doit etre la version 1.', 409);
          }
          await tx.brief.create({
            data: {
              id: input.briefId,
              projectId: input.projectId,
              ...input.content,
              version: 1
            }
          });
        }
        await tx.briefRevision.create({
          data: {
            id: input.revisionId,
            briefId: input.briefId,
            version: input.version,
            ...input.content,
            checksum: input.checksum,
            createdAt: input.createdAt
          }
        });
        const row = await tx.brief.findUniqueOrThrow({
          where: { projectId: input.projectId },
          include: { revisions: { orderBy: { version: 'asc' } } }
        });
        return mapBrief(row);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApplicationError('brief_version_conflict', 'Revision de brief deja existante.', 409);
      }
      throw error;
    }
  }
}