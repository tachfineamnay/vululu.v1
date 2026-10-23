import { Approval, assertApprovalValid } from './approval';
import { ArtifactVersion } from './artifact';
import { assertSha256Hex } from './checksum';
import { DomainError } from './errors';
import { assertEntityId, EntityId, requireNonEmpty } from './identifiers';
import { deepFreeze } from './immutability';
import { assertIsoTimestamp, IsoTimestamp } from './timestamp';

export type TransferStatus = 'pending' | 'submitted' | 'acknowledged' | 'failed';

/**
 * Journal d'un transfert vers un service externe (Postiz ou mock).
 * « acknowledged » signifie confirmé par le service externe, jamais « publié ».
 */
export interface TransferRecord {
  readonly id: EntityId;
  readonly approvalId: EntityId;
  readonly status: TransferStatus;
  readonly provider: string;
  readonly externalId: string | null;
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
}

export interface TransferDecision {
  readonly transfer: TransferRecord;
  readonly created: boolean;
}

export interface TransferGuardInput {
  readonly approval: Approval | null;
  readonly artifactVersion: ArtifactVersion;
  readonly currentArtifactVersion: ArtifactVersion;
  readonly requestedChecksum?: string;
}

/**
 * Interdit tout transfert sans approbation exacte et valide de la version
 * courante du master. Ordre des refus : approbation absente, invalidée, liée à
 * une autre version, checksum différent, version qui n'est plus le master courant.
 */
export function assertTransferAllowed(input: TransferGuardInput): Approval {
  const approval = assertApprovalValid(input.approval, input.artifactVersion);
  if (input.artifactVersion.id !== input.currentArtifactVersion.id) {
    throw new DomainError('artifact_version_stale', 'Only the current master can be transferred.', {
      artifactVersionId: input.artifactVersion.id,
      currentArtifactVersionId: input.currentArtifactVersion.id
    });
  }
  if (input.requestedChecksum !== undefined) {
    const requested = assertSha256Hex(input.requestedChecksum, 'requestedChecksum');
    if (requested !== approval.checksum) {
      throw new DomainError('checksum_mismatch', 'Requested checksum does not match the approval.', {
        expected: approval.checksum,
        received: requested
      });
    }
  }
  return approval;
}

/**
 * Démarre un transfert idempotent : un transfert existant pour la même
 * approbation est renvoyé tel quel (created = false), sans doublon.
 */
export function beginTransfer(
  input: TransferGuardInput & {
    readonly existingTransfer: TransferRecord | null;
    readonly id: EntityId;
    readonly provider: string;
    readonly externalId: string | null;
    readonly createdAt: IsoTimestamp;
  }
): TransferDecision {
  const approval = assertTransferAllowed(input);
  if (input.existingTransfer !== null) {
    if (input.existingTransfer.approvalId !== approval.id) {
      throw new DomainError('invalid_input', 'Existing transfer belongs to another approval.', {
        existingApprovalId: input.existingTransfer.approvalId,
        approvalId: approval.id
      });
    }
    return deepFreeze({ transfer: input.existingTransfer, created: false });
  }
  const createdAt = assertIsoTimestamp(input.createdAt, 'createdAt');
  const transfer: TransferRecord = deepFreeze({
    id: assertEntityId(input.id),
    approvalId: approval.id,
    status: 'submitted',
    provider: requireNonEmpty(input.provider, 'provider'),
    externalId:
      input.externalId === null ? null : requireNonEmpty(input.externalId, 'externalId'),
    createdAt,
    updatedAt: createdAt
  });
  return deepFreeze({ transfer, created: true });
}

/**
 * Confirmation du service externe. Idempotent si déjà acknowledge.
 * Un transfert failed ne peut pas être acquitté sans nouvelle tentative.
 */
export function acknowledgeTransfer(
  transfer: TransferRecord,
  input: { readonly at: IsoTimestamp; readonly externalId?: string | null }
): TransferRecord {
  const at = assertIsoTimestamp(input.at, 'at');
  if (transfer.status === 'acknowledged') {
    return transfer;
  }
  if (transfer.status !== 'submitted' && transfer.status !== 'pending') {
    throw new DomainError('invalid_transition', 'Only a submitted transfer can be acknowledged.', {
      status: transfer.status
    });
  }
  const externalId =
    input.externalId === undefined || input.externalId === null
      ? transfer.externalId
      : requireNonEmpty(input.externalId, 'externalId');
  return deepFreeze({ ...transfer, status: 'acknowledged', externalId, updatedAt: at });
}

/** Échec de transfert. Idempotent si déjà failed ; refuse après acknowledge. */
export function failTransfer(
  transfer: TransferRecord,
  input: { readonly at: IsoTimestamp; readonly externalId?: string | null }
): TransferRecord {
  const at = assertIsoTimestamp(input.at, 'at');
  if (transfer.status === 'failed') {
    return transfer;
  }
  if (transfer.status === 'acknowledged') {
    throw new DomainError('invalid_transition', 'An acknowledged transfer cannot fail.', {
      status: transfer.status
    });
  }
  const externalId =
    input.externalId === undefined || input.externalId === null
      ? transfer.externalId
      : requireNonEmpty(input.externalId, 'externalId');
  return deepFreeze({
    ...transfer,
    status: 'failed',
    externalId,
    updatedAt: at
  });
}
