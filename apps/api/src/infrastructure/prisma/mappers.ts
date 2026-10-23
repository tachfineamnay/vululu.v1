import type {
  Approval as PrismaApproval,
  ArtifactVersion as PrismaArtifactVersion,
  BrandContext as PrismaBrandContext,
  Brief as PrismaBrief,
  JobRun as PrismaJobRun,
  Project as PrismaProject,
  Scene as PrismaScene,
  SceneVersion as PrismaSceneVersion,
  Transfer as PrismaTransfer
} from '@prisma/client';
import { Prisma } from '@prisma/client';
import type {
  ApprovalRecord,
  ArtifactVersionRecord,
  BriefRecord,
  ContextRecord,
  JobRunRecord,
  ProjectRecord,
  SceneRecord,
  SceneVersionRecord,
  TransferRecord
} from '@vululu/application';

/**
 * Conversions Prisma -> records du port applicatif.
 *
 * Les records sont volontairement des objets simples (pas de types Prisma exposes)
 * afin que le Domain et l'Application ne dependent jamais de Prisma.
 */

export function toContextRecord(row: PrismaBrandContext): ContextRecord {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    website: row.website,
    description: row.description,
    audience: row.audience,
    tone: row.tone,
    colorPrimary: row.colorPrimary,
    colorSecondary: row.colorSecondary,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export function toProjectRecord(row: PrismaProject): ProjectRecord {
  return {
    id: row.id,
    userId: row.userId,
    contextId: row.contextId,
    title: row.title,
    platform: row.platform,
    format: row.format,
    objective: row.objective,
    sceneDurationSeconds: row.sceneDurationSeconds,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export function toBriefRecord(row: PrismaBrief): BriefRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    objective: row.objective,
    audience: row.audience,
    tone: row.tone,
    cta: row.cta,
    platform: row.platform,
    format: row.format,
    version: row.version
  };
}

export function toSceneRecord(row: PrismaScene): SceneRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    sceneKey: row.sceneKey,
    position: row.position,
    title: row.title,
    description: row.description,
    durationSeconds: row.durationSeconds,
    characterKey: row.characterKey,
    createdAt: row.createdAt
  };
}

export function toSceneVersionRecord(row: PrismaSceneVersion): SceneVersionRecord {
  return {
    id: row.id,
    sceneId: row.sceneId,
    version: row.version,
    imagePath: row.imagePath,
    prompt: row.prompt,
    checksum: row.checksum
  };
}

export function toArtifactVersionRecord(row: PrismaArtifactVersion): ArtifactVersionRecord {
  return {
    id: row.id,
    artifactId: row.artifactId,
    version: row.version,
    masterPath: row.masterPath,
    checksum: row.checksum,
    qaStatus: row.qaStatus,
    qaReport: row.qaReport as unknown
  };
}

export function toApprovalRecord(row: PrismaApproval): ApprovalRecord {
  return {
    id: row.id,
    artifactVersionId: row.artifactVersionId,
    approvedBy: row.approvedBy,
    checksum: row.checksum,
    invalidatedAt: row.invalidatedAt
  };
}

export function toTransferRecord(row: PrismaTransfer): TransferRecord {
  return {
    id: row.id,
    approvalId: row.approvalId,
    status: row.status,
    provider: row.provider,
    externalId: row.externalId
  };
}

export function toJobRunRecord(row: PrismaJobRun): JobRunRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    type: row.type,
    status: row.status,
    snapshot: row.snapshot === null ? null : (row.snapshot as unknown as Record<string, unknown>),
    snapshotVersion: row.snapshotVersion,
    snapshotChecksum: row.snapshotChecksum,
    outputs: row.outputs === null ? null : (row.outputs as unknown as Record<string, unknown>),
    outputsChecksum: row.outputsChecksum
  };
}

/** Convertit un payload applicatif opaque en valeur JSON acceptee par Prisma. */
export function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/** Convertit une colonne Json nullable Prisma en objet applicatif opaque. */
export function toJsonOutput(value: Prisma.JsonValue | null): unknown {
  return value as unknown;
}

/** Valeur a ecrire dans une colonne Json nullable lorsque la valeur est absente. */
export function toNullableJsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (value === null || value === undefined) {
    return Prisma.DbNull;
  }
  return value as Prisma.InputJsonValue;
}