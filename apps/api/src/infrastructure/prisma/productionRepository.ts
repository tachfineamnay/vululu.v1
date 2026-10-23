import type { PrismaClient } from '@prisma/client';
import { prisma } from '@vululu/db';
import type {
  ApprovalRecord,
  ArtifactVersionRecord,
  JobRunRecord,
  MasterRepository,
  SceneRecord,
  SceneVersionRecord,
  TransferRecord
} from '@vululu/application';
import {
  toApprovalRecord,
  toArtifactVersionRecord,
  toJobRunRecord,
  toJsonInput,
  toNullableJsonInput,
  toSceneRecord,
  toSceneVersionRecord,
  toTransferRecord
} from './mappers';

/**
 * Adaptateur PostgreSQL du port ProductionRepository : versions de scene,
 * master versionne, approbations exactes, transferts et runs.
 *
 * Invariants portes par cet adaptateur :
 * - les versions sont immuables (creation uniquement, jamais d'ecrasement) ;
 * - un nouveau master invalide les approbations anterieures du projet ;
 * - une approbation est liee a artifact_version_id + checksum ;
 * - qaStatus/qaReport sont mis a jour sur la version exacte.
 *
 * Note de contrat : les parametres nommes `artifactId` de updateQa et
 * findApproval designent en realite l'identifiant d'ArtifactVersion
 * (le modele Prisma nomme la colonne artifactVersionId). C'est la seule
 * lecture compatible avec le schema existant et avec l'invariant
 * "approbation d'une version exacte".
 */
export class PrismaProductionRepository implements MasterRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async latestSceneVersions(
    projectId: string
  ): Promise<Array<{ scene: SceneRecord; version: SceneVersionRecord | null }>> {
    const rows = await this.db.scene.findMany({
      where: { projectId },
      orderBy: { position: 'asc' },
      include: {
        versions: { orderBy: { version: 'desc' }, take: 1 }
      }
    });
    return rows.map((row) => ({
      scene: toSceneRecord(row),
      version: row.versions.length > 0 ? toSceneVersionRecord(row.versions[0]) : null
    }));
  }

  async createSceneVersion(input: Omit<SceneVersionRecord, 'id'>): Promise<SceneVersionRecord> {
    const row = await this.db.sceneVersion.create({
      data: {
        sceneId: input.sceneId,
        version: input.version,
        imagePath: input.imagePath,
        prompt: input.prompt,
        checksum: input.checksum
      }
    });
    return toSceneVersionRecord(row);
  }

  async latestMaster(projectId: string): Promise<ArtifactVersionRecord | null> {
    const artifact = await this.db.artifact.findUnique({
      where: { projectId_kind: { projectId, kind: 'master' } },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } }
    });
    const version = artifact && artifact.versions.length > 0 ? artifact.versions[0] : null;
    return version ? toArtifactVersionRecord(version) : null;
  }

  async nextMasterVersion(projectId: string): Promise<number> {
    const artifact = await this.db.artifact.findUnique({
      where: { projectId_kind: { projectId, kind: 'master' } },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } }
    });
    const version = artifact && artifact.versions.length > 0 ? artifact.versions[0] : null;
    return version ? version.version + 1 : 1;
  }

  async createMasterVersion(input: Omit<ArtifactVersionRecord, 'id'>): Promise<ArtifactVersionRecord> {
    const row = await this.db.artifactVersion.create({
      data: {
        artifactId: input.artifactId,
        version: input.version,
        masterPath: input.masterPath,
        checksum: input.checksum,
        qaStatus: input.qaStatus,
        qaReport: input.qaReport === null || input.qaReport === undefined
          ? undefined
          : toJsonInput(input.qaReport)
      }
    });
    return toArtifactVersionRecord(row);
  }

  async updateQa(artifactId: string, status: string, report: unknown): Promise<void> {
    await this.db.artifactVersion.update({
      where: { id: artifactId },
      data: { qaStatus: status, qaReport: toNullableJsonInput(report) }
    });
  }

  async findApproval(artifactId: string): Promise<ApprovalRecord | null> {
    const row = await this.db.approval.findUnique({
      where: { artifactVersionId: artifactId }
    });
    return row ? toApprovalRecord(row) : null;
  }

  async createOrUpdateApproval(input: {
    artifactVersionId: string;
    approvedBy: string;
    checksum: string;
  }): Promise<ApprovalRecord> {
    const row = await this.db.approval.upsert({
      where: { artifactVersionId: input.artifactVersionId },
      update: {
        approvedBy: input.approvedBy,
        checksum: input.checksum,
        invalidatedAt: null
      },
      create: {
        artifactVersionId: input.artifactVersionId,
        approvedBy: input.approvedBy,
        checksum: input.checksum
      }
    });
    return toApprovalRecord(row);
  }

  async invalidateApprovals(projectId: string): Promise<void> {
    const versions = await this.db.artifactVersion.findMany({
      where: { artifact: { is: { projectId } } },
      select: { id: true }
    });
    if (versions.length === 0) {
      return;
    }
    await this.db.approval.updateMany({
      where: {
        artifactVersionId: { in: versions.map((version) => version.id) },
        invalidatedAt: null
      },
      data: { invalidatedAt: new Date() }
    });
  }

  async findTransfer(approvalId: string): Promise<TransferRecord | null> {
    const row = await this.db.transfer.findUnique({ where: { approvalId } });
    return row ? toTransferRecord(row) : null;
  }

  async createTransfer(input: {
    approvalId: string;
    status: string;
    provider: string;
    externalId: string | null;
  }): Promise<TransferRecord> {
    const row = await this.db.transfer.create({
      data: {
        approvalId: input.approvalId,
        status: input.status,
        provider: input.provider,
        externalId: input.externalId
      }
    });
    return toTransferRecord(row);
  }

  async updateTransferStatus(transferId: string, status: string): Promise<void> {
    await this.db.transfer.update({ where: { id: transferId }, data: { status } });
  }

  async findJobRun(jobRunId: string): Promise<JobRunRecord | null> {
    const row = await this.db.jobRun.findUnique({ where: { id: jobRunId } });
    return row ? toJobRunRecord(row) : null;
  }

  async createJobRun(input: Omit<JobRunRecord, 'id'>): Promise<JobRunRecord> {
    const row = await this.db.jobRun.create({
      data: {
        projectId: input.projectId,
        type: input.type,
        status: input.status,
        snapshot: input.snapshot === null ? undefined : toJsonInput(input.snapshot)
      }
    });
    return toJobRunRecord(row);
  }

  async updateJobRunStatus(jobRunId: string, status: string): Promise<void> {
    await this.db.jobRun.update({ where: { id: jobRunId }, data: { status } });
  }
}