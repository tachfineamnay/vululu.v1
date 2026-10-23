import { DomainError } from './errors';
import { assertEntityId, EntityId, requireNonEmpty } from './identifiers';
import { deepFreeze } from './immutability';
import { assertIsoTimestamp, IsoTimestamp, timestampMillis } from './timestamp';

export type Role = 'super_admin' | 'user';

export interface UserIdentity {
  readonly id: EntityId;
  readonly email: string;
  readonly name: string;
  readonly role: Role;
}

/**
 * Invitation à usage unique : jeton hashé côté serveur, expiration et statut.
 * Le domaine ne connaît ni cookie ni session ; il valide seulement l'usage.
 */
export interface Invitation {
  readonly id: EntityId;
  readonly email: string;
  readonly role: Role;
  readonly tokenHash: string;
  readonly createdBy: EntityId;
  readonly createdAt: IsoTimestamp;
  readonly expiresAt: IsoTimestamp;
  readonly usedAt: IsoTimestamp | null;
  readonly revokedAt: IsoTimestamp | null;
}

export function assertRole(value: string): Role {
  if (value !== 'super_admin' && value !== 'user') {
    throw new DomainError('invalid_input', 'Role must be super_admin or user.', { role: value });
  }
  return value;
}

export function normalizeEmail(email: string): string {
  const normalized = requireNonEmpty(email, 'email').trim().toLowerCase();
  if (!normalized.includes('@') || normalized.length < 3) {
    throw new DomainError('invalid_input', 'Email must contain "@".', { email });
  }
  return normalized;
}

export function createUserIdentity(input: {
  readonly id: EntityId;
  readonly email: string;
  readonly name: string;
  readonly role: Role;
}): UserIdentity {
  return deepFreeze({
    id: assertEntityId(input.id),
    email: normalizeEmail(input.email),
    name: requireNonEmpty(input.name, 'name'),
    role: assertRole(input.role)
  });
}

export function createInvitation(input: {
  readonly id: EntityId;
  readonly email: string;
  readonly role: Role;
  readonly tokenHash: string;
  readonly createdBy: EntityId;
  readonly createdAt: IsoTimestamp;
  readonly expiresAt: IsoTimestamp;
}): Invitation {
  const createdAt = assertIsoTimestamp(input.createdAt, 'createdAt');
  const expiresAt = assertIsoTimestamp(input.expiresAt, 'expiresAt');
  if (timestampMillis(expiresAt) <= timestampMillis(createdAt)) {
    throw new DomainError('invalid_input', 'Invitation expiry must be after creation.', {
      createdAt,
      expiresAt
    });
  }
  return deepFreeze({
    id: assertEntityId(input.id),
    email: normalizeEmail(input.email),
    role: assertRole(input.role),
    tokenHash: requireNonEmpty(input.tokenHash, 'tokenHash'),
    createdBy: assertEntityId(input.createdBy, 'createdBy'),
    createdAt,
    expiresAt,
    usedAt: null,
    revokedAt: null
  });
}

/** Une invitation est utilisable si elle n'est ni révoquée, ni déjà consommée, ni expirée. */
export function isInvitationUsable(invitation: Invitation, at: IsoTimestamp): boolean {
  if (invitation.revokedAt !== null || invitation.usedAt !== null) {
    return false;
  }
  return timestampMillis(at) < timestampMillis(invitation.expiresAt);
}

export function assertInvitationUsable(invitation: Invitation, at: IsoTimestamp): void {
  if (invitation.revokedAt !== null) {
    throw new DomainError('invitation_revoked', 'Invitation has been revoked.', {
      invitationId: invitation.id
    });
  }
  if (invitation.usedAt !== null) {
    throw new DomainError('invitation_used', 'Invitation has already been used.', {
      invitationId: invitation.id,
      usedAt: invitation.usedAt
    });
  }
  if (timestampMillis(at) >= timestampMillis(invitation.expiresAt)) {
    throw new DomainError('invitation_expired', 'Invitation has expired.', {
      invitationId: invitation.id,
      expiresAt: invitation.expiresAt
    });
  }
}

/** Consomme l'invitation : l'appelant persiste le retour, l'ancien objet reste intact. */
export function acceptInvitation(invitation: Invitation, at: IsoTimestamp): Invitation {
  assertInvitationUsable(invitation, at);
  return deepFreeze({ ...invitation, usedAt: assertIsoTimestamp(at, 'at') });
}

/** Révoque une invitation. Idempotent si elle est déjà révoquée. */
export function revokeInvitation(invitation: Invitation, at: IsoTimestamp): Invitation {
  if (invitation.revokedAt !== null) {
    return invitation;
  }
  if (invitation.usedAt !== null) {
    throw new DomainError('invitation_used', 'A used invitation cannot be revoked.', {
      invitationId: invitation.id
    });
  }
  return deepFreeze({ ...invitation, revokedAt: assertIsoTimestamp(at, 'at') });
}
