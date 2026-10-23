import { describe, expect, it } from 'vitest';
import {
  acknowledgeTransfer,
  approveExactVersion,
  beginTransfer,
  createArtifact,
  createArtifactVersion,
  failTransfer,
  invalidateApprovalsForNewMaster
} from '../../packages/domain/src/index';
import { captureDomainError, checksum, T0, T1, T2, T3 } from './fixtures';

const qaReport = {
  status: 'PASS' as const,
  checks: [{ name: 'master checksum', status: 'PASS' as const, detail: 'OK' }]
};

function buildMasters() {
  const artifact = createArtifact({ id: 'artifact-1', projectId: 'project-1', kind: 'master' });
  const first = createArtifactVersion({
    artifact,
    versions: [],
    storageKey: 'artifacts/project-1/master-v1.mp4',
    checksum: checksum('master:v1'),
    qaStatus: 'PASS',
    qaReport,
    id: 'artifact-version-1',
    createdAt: T0
  });
  const second = createArtifactVersion({
    artifact,
    versions: first.versions,
    storageKey: 'artifacts/project-1/master-v2.mp4',
    checksum: checksum('master:v2'),
    qaStatus: 'PASS',
    qaReport,
    id: 'artifact-version-2',
    createdAt: T1
  });
  return { artifact, v1: first.version, v2: second.version, versions: second.versions };
}

function approveV1() {
  const { v1, v2, versions } = buildMasters();
  const approval = approveExactVersion({
    artifactVersion: v1,
    artifactVersionId: v1.id,
    checksum: v1.checksum,
    approvedBy: 'user-1',
    existingApprovals: [],
    id: 'approval-1',
    createdAt: T1
  }).approval;
  return { v1, v2, versions, approval };
}

const transferBase = {
  id: 'transfer-1',
  provider: 'postiz-mock',
  externalId: 'postiz-mock-external-1',
  createdAt: T2
};

describe('Transfer : interdit sans approbation exacte et valide', () => {
  it('refuses a transfer when no approval exists', () => {
    const { v1 } = buildMasters();
    const error = captureDomainError(() =>
      beginTransfer({
        ...transferBase,
        approval: null,
        artifactVersion: v1,
        currentArtifactVersion: v1,
        existingTransfer: null
      })
    );
    expect(error.code).toBe('approval_required');
  });

  it('refuses a transfer when the approval was invalidated by a new master', () => {
    const { v1, v2 } = approveV1();
    const invalidated = invalidateApprovalsForNewMaster(
      [],
      { newArtifactVersionId: v2.id, at: T2 }
    );
    expect(invalidated).toHaveLength(0);

    const approval = approveExactVersion({
      artifactVersion: v1,
      artifactVersionId: v1.id,
      checksum: v1.checksum,
      approvedBy: 'user-1',
      existingApprovals: [],
      id: 'approval-1',
      createdAt: T1
    }).approval;
    const afterNewMaster = invalidateApprovalsForNewMaster([approval], {
      newArtifactVersionId: v2.id,
      at: T2
    });

    const error = captureDomainError(() =>
      beginTransfer({
        ...transferBase,
        approval: afterNewMaster[0],
        artifactVersion: v1,
        currentArtifactVersion: v2,
        existingTransfer: null
      })
    );
    expect(error.code).toBe('approval_invalidated');
  });

  it('refuses a transfer when the approval targets another checksum', () => {
    const { v1, approval } = approveV1();
    const tampered = { ...v1, checksum: checksum('tampered-master') };
    const error = captureDomainError(() =>
      beginTransfer({
        ...transferBase,
        approval,
        artifactVersion: tampered,
        currentArtifactVersion: tampered,
        existingTransfer: null
      })
    );
    expect(error.code).toBe('checksum_mismatch');
  });

  it('refuses a transfer of a version that is no longer the current master', () => {
    const { v1, v2, approval } = approveV1();
    const error = captureDomainError(() =>
      beginTransfer({
        ...transferBase,
        approval,
        artifactVersion: v1,
        currentArtifactVersion: v2,
        existingTransfer: null
      })
    );
    expect(error.code).toBe('artifact_version_stale');
  });

  it('refuses a transfer whose requested checksum differs from the approval', () => {
    const { v1, approval } = approveV1();
    const error = captureDomainError(() =>
      beginTransfer({
        ...transferBase,
        approval,
        artifactVersion: v1,
        currentArtifactVersion: v1,
        existingTransfer: null,
        requestedChecksum: checksum('another-checksum')
      })
    );
    expect(error.code).toBe('checksum_mismatch');
  });

  it('creates a submitted transfer for a valid exact approval', () => {
    const { v1, approval } = approveV1();
    const decision = beginTransfer({
      ...transferBase,
      approval,
      artifactVersion: v1,
      currentArtifactVersion: v1,
      existingTransfer: null
    });
    expect(decision.created).toBe(true);
    expect(decision.transfer.status).toBe('submitted');
    expect(decision.transfer.approvalId).toBe(approval.id);
    expect(decision.transfer.provider).toBe('postiz-mock');
    expect(decision.transfer.externalId).toBe('postiz-mock-external-1');
    expect(Object.isFrozen(decision.transfer)).toBe(true);
  });

  it('is idempotent for the same approval: no duplicate transfer', () => {
    const { v1, approval } = approveV1();
    const decision = beginTransfer({
      ...transferBase,
      approval,
      artifactVersion: v1,
      currentArtifactVersion: v1,
      existingTransfer: null
    });
    const retry = beginTransfer({
      ...transferBase,
      id: 'transfer-2',
      approval,
      artifactVersion: v1,
      currentArtifactVersion: v1,
      existingTransfer: decision.transfer
    });
    expect(retry.created).toBe(false);
    expect(retry.transfer).toBe(decision.transfer);
  });

  it('refuses an existing transfer attached to another approval', () => {
    const { v1, v2, approval } = approveV1();
    const firstDecision = beginTransfer({
      ...transferBase,
      approval,
      artifactVersion: v1,
      currentArtifactVersion: v1,
      existingTransfer: null
    });
    const approvalV2 = approveExactVersion({
      artifactVersion: v2,
      artifactVersionId: v2.id,
      checksum: v2.checksum,
      approvedBy: 'user-1',
      existingApprovals: [],
      id: 'approval-2',
      createdAt: T2
    }).approval;
    const error = captureDomainError(() =>
      beginTransfer({
        ...transferBase,
        id: 'transfer-2',
        approval: approvalV2,
        artifactVersion: v2,
        currentArtifactVersion: v2,
        existingTransfer: firstDecision.transfer
      })
    );
    expect(error.code).toBe('invalid_input');
  });

  it('acknowledges a submitted transfer idempotently (acknowledged is not published)', () => {
    const { v1, approval } = approveV1();
    const decision = beginTransfer({
      ...transferBase,
      approval,
      artifactVersion: v1,
      currentArtifactVersion: v1,
      existingTransfer: null
    });
    const acknowledged = acknowledgeTransfer(decision.transfer, {
      at: T3,
      externalId: 'provider-ack-1'
    });
    expect(acknowledged.status).toBe('acknowledged');
    expect(acknowledged.externalId).toBe('provider-ack-1');
    expect(acknowledged.updatedAt).toBe(T3);
    expect(acknowledgeTransfer(acknowledged, { at: T3 })).toBe(acknowledged);
    expect(decision.transfer.status).toBe('submitted');
  });

  it('fails a submitted transfer and blocks a late acknowledgement', () => {
    const { v1, approval } = approveV1();
    const decision = beginTransfer({
      ...transferBase,
      approval,
      artifactVersion: v1,
      currentArtifactVersion: v1,
      existingTransfer: null
    });
    const failed = failTransfer(decision.transfer, {
      at: T3,
      externalId: 'provider-error-1'
    });
    expect(failed.status).toBe('failed');
    expect(failed.externalId).toBe('provider-error-1');
    expect(failTransfer(failed, { at: T3 })).toBe(failed);
    expect(
      captureDomainError(() => acknowledgeTransfer(failed, { at: T3 })).code
    ).toBe('invalid_transition');
  });

  it('refuses to fail an acknowledged transfer', () => {
    const { v1, approval } = approveV1();
    const decision = beginTransfer({
      ...transferBase,
      approval,
      artifactVersion: v1,
      currentArtifactVersion: v1,
      existingTransfer: null
    });
    const acknowledged = acknowledgeTransfer(decision.transfer, { at: T3 });
    expect(captureDomainError(() => failTransfer(acknowledged, { at: T3 })).code).toBe(
      'invalid_transition'
    );
  });
});
