import { describe, expect, it } from 'vitest';
import {
  approvalMatchesArtifactVersion,
  approveExactVersion,
  assertApprovalValid,
  createArtifact,
  createArtifactVersion,
  currentArtifactVersion,
  invalidateApproval,
  invalidateApprovalsForNewMaster,
  isApprovalActive,
  isCurrentArtifactVersion
} from '../../packages/domain/src/index';
import { captureDomainError, checksum, T0, T1, T2, T3 } from './fixtures';

const passReport = {
  status: 'PASS' as const,
  checks: [{ name: 'master checksum', status: 'PASS' as const, detail: 'OK' }]
};

function masterVersions() {
  const artifact = createArtifact({ id: 'artifact-1', projectId: 'project-1', kind: 'master' });
  const first = createArtifactVersion({
    artifact,
    versions: [],
    storageKey: 'artifacts/project-1/master-v1.mp4',
    checksum: checksum('master:v1'),
    qaStatus: 'PASS',
    qaReport: passReport,
    id: 'artifact-version-1',
    createdAt: T0
  });
  const second = createArtifactVersion({
    artifact,
    versions: first.versions,
    storageKey: 'artifacts/project-1/master-v2.mp4',
    checksum: checksum('master:v2'),
    id: 'artifact-version-2',
    createdAt: T1
  });
  return { artifact, first, second };
}

function approvalForV1() {
  const { first } = masterVersions();
  const approved = approveExactVersion({
    artifactVersion: first.version,
    artifactVersionId: first.version.id,
    checksum: first.version.checksum,
    approvedBy: 'user-1',
    existingApprovals: [],
    id: 'approval-1',
    createdAt: T1
  });
  return { version: first.version, approvals: approved.approvals, approval: approved.approval };
}

describe('Artifact : versions immuables et checksums', () => {
  it('appends master versions with real checksums and QA coherence', () => {
    const { first, second } = masterVersions();
    expect(first.version.version).toBe(1);
    expect(first.version.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(first.version.qaStatus).toBe('PASS');
    expect(first.version.qaReport?.checks).toHaveLength(1);
    expect(second.version.version).toBe(2);
    expect(second.version.qaStatus).toBe('PENDING');
    expect(currentArtifactVersion(second.versions)?.version).toBe(2);
    expect(isCurrentArtifactVersion(second.versions, 'artifact-version-2')).toBe(true);
    expect(isCurrentArtifactVersion(second.versions, 'artifact-version-1')).toBe(false);
    expect(first.versions).toHaveLength(1);
    expect(Object.isFrozen(first.version)).toBe(true);
  });

  it('rejects a checksum that is not a canonical SHA-256', () => {
    const artifact = createArtifact({ id: 'artifact-1', projectId: 'project-1', kind: 'master' });
    expect(
      captureDomainError(() =>
        createArtifactVersion({
          artifact,
          versions: [],
          storageKey: 'artifacts/master.mp4',
          checksum: 'deadbeef',
          id: 'artifact-version-1',
          createdAt: T0
        })
      ).code
    ).toBe('invalid_checksum');
  });

  it('rejects an inconsistent QA report or QA status', () => {
    const artifact = createArtifact({ id: 'artifact-1', projectId: 'project-1', kind: 'master' });
    expect(
      captureDomainError(() =>
        createArtifactVersion({
          artifact,
          versions: [],
          storageKey: 'artifacts/master.mp4',
          checksum: checksum('master:v1'),
          qaReport: {
            status: 'PASS',
            checks: [{ name: 'dimensions', status: 'FAIL', detail: 'bad size' }]
          },
          id: 'artifact-version-1',
          createdAt: T0
        })
      ).code
    ).toBe('invalid_input');

    expect(
      captureDomainError(() =>
        createArtifactVersion({
          artifact,
          versions: [],
          storageKey: 'artifacts/master.mp4',
          checksum: checksum('master:v1'),
          qaStatus: 'FAIL',
          qaReport: passReport,
          id: 'artifact-version-1',
          createdAt: T0
        })
      ).code
    ).toBe('invalid_input');
  });
});

describe('Approval : version exacte + checksum, invalidation par nouveau master', () => {
  it('approves the exact artifact version and checksum', () => {
    const { version, approval } = approvalForV1();
    expect(approval.artifactVersionId).toBe(version.id);
    expect(approval.checksum).toBe(version.checksum);
    expect(approval.invalidatedAt).toBeNull();
    expect(isApprovalActive(approval)).toBe(true);
    expect(approvalMatchesArtifactVersion(approval, version)).toBe(true);
    expect(Object.isFrozen(approval)).toBe(true);
  });

  it('refuses an approval for another version or another checksum', () => {
    const { first, second } = masterVersions();
    const base = {
      approvedBy: 'user-1',
      existingApprovals: [] as const,
      id: 'approval-1',
      createdAt: T1
    };
    expect(
      captureDomainError(() =>
        approveExactVersion({
          ...base,
          artifactVersion: first.version,
          artifactVersionId: second.version.id,
          checksum: second.version.checksum
        })
      ).code
    ).toBe('artifact_version_mismatch');
    expect(
      captureDomainError(() =>
        approveExactVersion({
          ...base,
          artifactVersion: first.version,
          artifactVersionId: first.version.id,
          checksum: second.version.checksum
        })
      ).code
    ).toBe('checksum_mismatch');
  });

  it('is idempotent for an active identical approval', () => {
    const { version, approvals, approval } = approvalForV1();
    const repeated = approveExactVersion({
      artifactVersion: version,
      artifactVersionId: version.id,
      checksum: version.checksum,
      approvedBy: 'user-1',
      existingApprovals: approvals,
      id: 'approval-ignored',
      createdAt: T2
    });
    expect(repeated.approvals).toHaveLength(1);
    expect(repeated.approval).toBe(approval);
  });

  it('invalidates a prior approval when a new master is produced', () => {
    const { version, approvals, approval } = approvalForV1();
    const { second } = masterVersions();
    const after = invalidateApprovalsForNewMaster(approvals, {
      newArtifactVersionId: second.version.id,
      at: T2
    });
    expect(after).toHaveLength(1);
    expect(after[0].invalidatedAt).toBe(T2);
    expect(after[0].invalidatedByArtifactVersionId).toBe(second.version.id);
    expect(isApprovalActive(after[0])).toBe(false);
    expect(approval.invalidatedAt).toBeNull();
    expect(after[0].checksum).toBe(version.checksum);
    expect(after.find((entry) => entry.artifactVersionId === second.version.id)).toBeUndefined();
  });

  it('invalidates idempotently by keeping the first invalidation timestamp', () => {
    const { approval } = approvalForV1();
    const once = invalidateApproval(approval, { at: T2, byArtifactVersionId: 'artifact-version-2' });
    const twice = invalidateApproval(once, { at: T3, byArtifactVersionId: 'artifact-version-3' });
    expect(once.invalidatedAt).toBe(T2);
    expect(twice).toBe(once);
  });

  it('re-approving a version reactivates its approval without changing its id', () => {
    const { version, approvals, approval } = approvalForV1();
    const invalidated = invalidateApprovalsForNewMaster(approvals, {
      newArtifactVersionId: 'artifact-version-2',
      at: T2
    });
    const reactivated = approveExactVersion({
      artifactVersion: version,
      artifactVersionId: version.id,
      checksum: version.checksum,
      approvedBy: 'user-2',
      existingApprovals: invalidated,
      id: 'approval-new',
      createdAt: T3
    });
    expect(reactivated.approvals).toHaveLength(1);
    expect(reactivated.approval.id).toBe(approval.id);
    expect(reactivated.approval.approvedBy).toBe('user-2');
    expect(reactivated.approval.invalidatedAt).toBeNull();
  });

  it('refuses a missing, invalidated or mismatched approval', () => {
    const { version } = approvalForV1();
    expect(captureDomainError(() => assertApprovalValid(null, version)).code).toBe(
      'approval_required'
    );
    const { approval } = approvalForV1();
    const invalidated = invalidateApproval(approval, {
      at: T2,
      byArtifactVersionId: 'artifact-version-2'
    });
    expect(captureDomainError(() => assertApprovalValid(invalidated, version)).code).toBe(
      'approval_invalidated'
    );
    const { second } = masterVersions();
    expect(captureDomainError(() => assertApprovalValid(approval, second.version)).code).toBe(
      'approval_version_mismatch'
    );
  });
});
