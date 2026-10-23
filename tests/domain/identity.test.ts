import { describe, expect, it } from 'vitest';
import {
  acceptInvitation,
  assertInvitationUsable,
  createInvitation,
  createUserIdentity,
  isInvitationUsable,
  normalizeEmail,
  revokeInvitation
} from '../../packages/domain/src/index';
import { captureDomainError, T0, T1, T2 } from './fixtures';

const invitationInput = {
  id: 'invitation-1',
  email: '  Nouveau.User@Vululu.Local ',
  role: 'user' as const,
  tokenHash: 'a'.repeat(64),
  createdBy: 'admin-1',
  createdAt: T0,
  expiresAt: T1
};

describe('Identity : email et invitations à usage unique', () => {
  it('normalizes identity email and freezes the user', () => {
    const user = createUserIdentity({
      id: 'user-1',
      email: '  Demo@Vululu.Local ',
      name: 'Demo',
      role: 'user'
    });
    expect(user.email).toBe('demo@vululu.local');
    expect(Object.isFrozen(user)).toBe(true);
    expect(normalizeEmail(' SUPER_ADMIN@EXAMPLE.COM ')).toBe('super_admin@example.com');
    expect(captureDomainError(() => normalizeEmail('pas-un-email')).code).toBe(
      'invalid_input'
    );
  });

  it('creates an invitation with a normalized email and an expiry after creation', () => {
    const invitation = createInvitation(invitationInput);
    expect(invitation.email).toBe('nouveau.user@vululu.local');
    expect(invitation.usedAt).toBeNull();
    expect(invitation.revokedAt).toBeNull();
    expect(Object.isFrozen(invitation)).toBe(true);
    expect(
      captureDomainError(() =>
        createInvitation({ ...invitationInput, expiresAt: T0 })
      ).code
    ).toBe('invalid_input');
  });

  it('accepts an invitation exactly once and keeps the previous object intact', () => {
    const invitation = createInvitation(invitationInput);
    const accepted = acceptInvitation(invitation, T0);
    expect(accepted.usedAt).toBe(T0);
    expect(invitation.usedAt).toBeNull();
    expect(isInvitationUsable(invitation, T0)).toBe(true);
    expect(isInvitationUsable(accepted, T0)).toBe(false);
    expect(captureDomainError(() => acceptInvitation(accepted, T1)).code).toBe(
      'invitation_used'
    );
  });

  it('rejects an expired invitation, including exactly at expiry', () => {
    const invitation = createInvitation(invitationInput);
    expect(isInvitationUsable(invitation, T1)).toBe(false);
    const expired = captureDomainError(() => assertInvitationUsable(invitation, T1));
    expect(expired.code).toBe('invitation_expired');
    expect(captureDomainError(() => acceptInvitation(invitation, T2)).code).toBe(
      'invitation_expired'
    );
  });

  it('revokes an invitation idempotently and blocks its activation', () => {
    const invitation = createInvitation(invitationInput);
    const revoked = revokeInvitation(invitation, T0);
    expect(revoked.revokedAt).toBe(T0);
    expect(revokeInvitation(revoked, T1)).toBe(revoked);
    expect(captureDomainError(() => acceptInvitation(revoked, T0)).code).toBe(
      'invitation_revoked'
    );
  });

  it('refuses to revoke an already used invitation', () => {
    const invitation = createInvitation(invitationInput);
    const accepted = acceptInvitation(invitation, T0);
    expect(captureDomainError(() => revokeInvitation(accepted, T1)).code).toBe(
      'invitation_used'
    );
  });
});
