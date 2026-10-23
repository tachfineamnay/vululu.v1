import { AppendResult, appendVersion, currentVersion, nextVersion } from './versions';
import { assertSha256Hex } from './checksum';
import { DomainError } from './errors';
import { assertEntityId, EntityId, requireNonEmpty } from './identifiers';
import { deepFreeze } from './immutability';
import { assertIsoTimestamp, IsoTimestamp } from './timestamp';

export type ArtifactKind = 'master';
export type QaCheckStatus = 'PASS' | 'FAIL';
export type QaStatus = 'PENDING' | 'PASS' | 'FAIL';

export interface QaCheck {
  readonly name: string;
  readonly status: QaCheckStatus;
  readonly detail: string;
}

export interface QaReport {
  readonly status: QaCheckStatus;
  readonly checks: readonly QaCheck[];
}

export interface Artifact {
  readonly id: EntityId;
  readonly projectId: EntityId;
  readonly kind: ArtifactKind;
}

/** Version immuable d'un artefact (master) : chemin de stockage + checksum SHA-256. */
export interface ArtifactVersion {
  readonly id: EntityId;
  readonly artifactId: EntityId;
  readonly version: number;
  /** Clé/URI de stockage non publique ; aucun accès fichier dans le domaine. */
  readonly storageKey: string;
  readonly checksum: string;
  readonly qaStatus: QaStatus;
  readonly qaReport: QaReport | null;
  readonly createdAt: IsoTimestamp;
}

export function createArtifact(input: {
  readonly id: EntityId;
  readonly projectId: EntityId;
  readonly kind: ArtifactKind;
}): Artifact {
  if (input.kind !== 'master') {
    throw new DomainError('invalid_input', 'Only master artifacts are modeled in V1.', {
      kind: input.kind
    });
  }
  return deepFreeze({
    id: assertEntityId(input.id),
    projectId: assertEntityId(input.projectId, 'projectId'),
    kind: input.kind
  });
}

export function assertQaStatus(value: string): QaStatus {
  if (value !== 'PENDING' && value !== 'PASS' && value !== 'FAIL') {
    throw new DomainError('invalid_input', 'Unknown QA status.', { qaStatus: value });
  }
  return value;
}

/**
 * Normalise et valide un rapport QA : cohérence obligatoire entre le statut
 * global et les contrôles. Un rapport PASS ne peut pas contenir un FAIL.
 */
export function normalizeQaReport(report: QaReport): QaReport {
  const checks = report.checks.map((check) => {
    if (check.status !== 'PASS' && check.status !== 'FAIL') {
      throw new DomainError('invalid_input', 'Unknown QA check status.', { check });
    }
    return deepFreeze({
      name: requireNonEmpty(check.name, 'qaCheck.name'),
      status: check.status,
      detail: check.detail
    });
  });
  const hasFailure = checks.some((check) => check.status === 'FAIL');
  const expectedStatus: QaCheckStatus = hasFailure ? 'FAIL' : 'PASS';
  if (report.status !== expectedStatus) {
    throw new DomainError('invalid_input', 'QA report status contradicts its checks.', {
      status: report.status,
      expectedStatus
    });
  }
  return deepFreeze({ status: report.status, checks });
}

/**
 * Crée la version suivante d'un artefact. Le checksum est fourni par
 * l'adaptateur de stockage (calculé sur les octets réels), jamais inventé.
 */
export function createArtifactVersion(input: {
  readonly artifact: Artifact;
  readonly versions: readonly ArtifactVersion[];
  readonly storageKey: string;
  readonly checksum: string;
  readonly qaStatus?: QaStatus;
  readonly qaReport?: QaReport | null;
  readonly id: EntityId;
  readonly createdAt: IsoTimestamp;
}): AppendResult<ArtifactVersion> {
  const qaReport = input.qaReport === undefined || input.qaReport === null
    ? null
    : normalizeQaReport(input.qaReport);
  let qaStatus: QaStatus = input.qaStatus === undefined ? (qaReport === null ? 'PENDING' : qaReport.status) : assertQaStatus(input.qaStatus);
  if (qaReport !== null && qaStatus === 'PENDING') {
    qaStatus = qaReport.status;
  }
  if (qaReport !== null && qaStatus !== qaReport.status) {
    throw new DomainError('invalid_input', 'QA status contradicts QA report.', {
      qaStatus,
      reportStatus: qaReport.status
    });
  }
  const candidate: ArtifactVersion = {
    id: assertEntityId(input.id),
    artifactId: input.artifact.id,
    version: nextVersion(input.versions),
    storageKey: requireNonEmpty(input.storageKey, 'storageKey'),
    checksum: assertSha256Hex(input.checksum),
    qaStatus,
    qaReport,
    createdAt: assertIsoTimestamp(input.createdAt, 'createdAt')
  };
  return appendVersion(input.versions, candidate);
}

/** Version courante = numéro le plus élevé, indépendamment de l'ordre du tableau. */
export function currentArtifactVersion(
  versions: readonly ArtifactVersion[]
): ArtifactVersion | null {
  return currentVersion(versions);
}

export function isCurrentArtifactVersion(
  versions: readonly ArtifactVersion[],
  artifactVersionId: EntityId
): boolean {
  const current = currentArtifactVersion(versions);
  return current !== null && current.id === artifactVersionId;
}

/** Met à jour le QA d'une version en produisant une copie (la version reste immuable). */
export function withQaResult(
  version: ArtifactVersion,
  report: QaReport | null,
  qaStatus: QaStatus | undefined
): ArtifactVersion {
  const normalized = report === null ? null : normalizeQaReport(report);
  const status = qaStatus === undefined ? (normalized === null ? 'PENDING' : normalized.status) : assertQaStatus(qaStatus);
  if (normalized !== null && status !== 'PENDING' && status !== normalized.status) {
    throw new DomainError('invalid_input', 'QA status contradicts QA report.', {
      qaStatus: status,
      reportStatus: normalized.status
    });
  }
  return deepFreeze({ ...version, qaStatus: status, qaReport: normalized });
}
