import { assertSha256Hex } from './checksum';
import { DomainError } from './errors';
import { assertEntityId, EntityId } from './identifiers';
import { deepFreeze } from './immutability';
import { assertIsoTimestamp, IsoTimestamp } from './timestamp';
import { ArtifactVersion } from './artifact';

/**
 * Approbation d'une version exacte d'artefact.
 * L'approbation lie artifactVersionId + checksum : elle ne vaut jamais pour
 * « la dernière version » ni pour une autre empreinte.
 */
export interface Approval {
  readonly id: EntityId;
  readonly artifactVersionId: EntityId;
  readonly approvedBy: EntityId;
  readonly checksum: string;
  readonly createdAt: IsoTimestamp;
  readonly invalidatedAt: IsoTimestamp | null;
  readonly invalidatedByArtifactVersionId: EntityId | null;
}

export type ApprovalState = {
  readonly approvals: readonly Approval[];
  readonly approval: Approval;
};

function findApprovalForVersion(
  approvals: readonly Approval[],
  artifactVersionId: EntityId
): Approval | null {
  return approvals.find((approval) => approval.artifactVersionId === artifactVersionId) ?? null;
}

/**
 * Approuve une version exacte (artifactVersionId + checksum).
 * - Refuse un artifactVersionId qui ne correspond pas à la version fournie.
 * - Refuse un checksum qui ne correspond pas à l'empreinte enregistrée.
 * - Ré-approuver la même version active est idempotent.
 * - Ré-approuver une version invalidée la réactive (même ligne, id conservé).
 */
export function approveExactVersion(input: {
  readonly artifactVersion: ArtifactVersion;
  readonly artifactVersionId: EntityId;
  readonly checksum: string;
  readonly approvedBy: EntityId;
  readonly existingApprovals: readonly Approval[];
  readonly id: EntityId;
  readonly createdAt: IsoTimestamp;
}): ApprovalState {
  const artifactVersionId = assertEntityId(input.artifactVersionId, 'artifactVersionId');
  const checksum = assertSha256Hex(input.checksum);
  if (input.artifactVersion.id !== artifactVersionId) {
    throw new DomainError('artifact_version_mismatch', 'Approval must target the exact artifact version.', {
      expected: input.artifactVersion.id,
      received: artifactVersionId
    });
  }
  if (input.artifactVersion.checksum !== checksum) {
    throw new DomainError('checksum_mismatch', 'Checksum does not match the artifact version.', {
      expected: input.artifactVersion.checksum,
      received: checksum
    });
  }
  const approvedBy = assertEntityId(input.approvedBy, 'approvedBy');
  const existing = findApprovalForVersion(input.existingApprovals, artifactVersionId);
  if (existing !== null && existing.invalidatedAt === null && existing.checksum === checksum) {
    return deepFreeze({ approvals: input.existingApprovals, approval: existing });
  }
  if (existing !== null) {
    const reactivated: Approval = deepFreeze({
      ...existing,
      approvedBy,
      checksum,
      invalidatedAt: null,
      invalidatedByArtifactVersionId: null
    });
    const approvals = deepFreeze(
      input.existingApprovals.map((approval) =>
        approval === existing ? reactivated : approval
      )
    );
    return deepFreeze({ approvals, approval: reactivated });
  }
  const approval: Approval = deepFreeze({
    id: assertEntityId(input.id),
    artifactVersionId,
    approvedBy,
    checksum,
    createdAt: assertIsoTimestamp(input.createdAt, 'createdAt'),
    invalidatedAt: null,
    invalidatedByArtifactVersionId: null
  });
  const approvals = deepFreeze([...input.existingApprovals, approval]);
  return deepFreeze({ approvals, approval });
}

/** Invalide une approbation. Idempotent : le premier horodatage est conservé. */
export function invalidateApproval(
  approval: Approval,
  input: { readonly at: IsoTimestamp; readonly byArtifactVersionId: EntityId }
): Approval {
  if (approval.invalidatedAt !== null) {
    return approval;
  }
  return deepFreeze({
    ...approval,
    invalidatedAt: assertIsoTimestamp(input.at, 'at'),
    invalidatedByArtifactVersionId: assertEntityId(
      input.byArtifactVersionId,
      'byArtifactVersionId'
    )
  });
}

/**
 * Un nouveau master invalide toutes les approbations encore actives.
 * Le nouvel artefact n'a évidemment aucune approbation : il devra être approuvé
 * explicitement avant tout transfert.
 */
export function invalidateApprovalsForNewMaster(
  approvals: readonly Approval[],
  input: { readonly newArtifactVersionId: EntityId; readonly at: IsoTimestamp }
): readonly Approval[] {
  const newArtifactVersionId = assertEntityId(input.newArtifactVersionId, 'newArtifactVersionId');
  const at = assertIsoTimestamp(input.at, 'at');
  const invalidated = approvals.map((approval) =>
    approval.invalidatedAt === null
      ? invalidateApproval(approval, { at, byArtifactVersionId: newArtifactVersionId })
      : approval
  );
  return deepFreeze(invalidated);
}

export function isApprovalActive(approval: Approval): boolean {
  return approval.invalidatedAt === null;
}

/** Vrai si l'approbation active vise exactement cette version et cette empreinte. */
export function approvalMatchesArtifactVersion(
  approval: Approval,
  artifactVersion: ArtifactVersion
): boolean {
  return (
    isApprovalActive(approval) &&
    approval.artifactVersionId === artifactVersion.id &&
    approval.checksum === artifactVersion.checksum
  );
}

/**
 * Garantit qu'une approbation existe et lie exactement la version fournie.
 * Retourne l'approbation validée pour enchaîner sur le transfert.
 */
export function assertApprovalValid(
  approval: Approval | null,
  artifactVersion: ArtifactVersion
): Approval {
  if (approval === null) {
    throw new DomainError('approval_required', 'No approval exists for this artifact version.', {
      artifactVersionId: artifactVersion.id
    });
  }
  if (approval.invalidatedAt !== null) {
    throw new DomainError('approval_invalidated', 'Approval has been invalidated.', {
      approvalId: approval.id,
      invalidatedAt: approval.invalidatedAt
    });
  }
  if (approval.artifactVersionId !== artifactVersion.id) {
    throw new DomainError('approval_version_mismatch', 'Approval targets another artifact version.', {
      approvalArtifactVersionId: approval.artifactVersionId,
      artifactVersionId: artifactVersion.id
    });
  }
  if (approval.checksum !== artifactVersion.checksum) {
    throw new DomainError('checksum_mismatch', 'Approval checksum does not match the artifact version.', {
      expected: artifactVersion.checksum,
      received: approval.checksum
    });
  }
  return approval;
}
