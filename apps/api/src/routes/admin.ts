import { findAccountsForEmail, lockAccountEmail } from '../security/accountIdentity';
import type { FastifyInstance } from 'fastify';
import type { Invitation } from '@prisma/client';
import { adminUserUpdateSchema } from '@vululu/contracts';
import { prisma } from '@vululu/db';
import { HttpError } from '../errors';
import { recordAuditEvent } from '../security/audit';
import { randomToken, sha256Hex } from '../security/crypto';
import { invitationInputSchema } from '../security/schemas';
import { INVITATION_TTL_MS, purgeSessions, revokeAllUserSessions } from '../security/session';

const invitationSelect = {
  id: true,
  email: true,
  role: true,
  createdBy: true,
  expiresAt: true,
  usedAt: true,
  revokedAt: true,
  createdAt: true
} as const;

type PublicInvitation = Pick<
  Invitation,
  'id' | 'email' | 'role' | 'createdBy' | 'expiresAt' | 'usedAt' | 'revokedAt' | 'createdAt'
>;

function publicInvitation(invitation: PublicInvitation) {
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    createdBy: invitation.createdBy,
    expiresAt: invitation.expiresAt,
    usedAt: invitation.usedAt,
    revokedAt: invitation.revokedAt,
    createdAt: invitation.createdAt
  };
}

/**
 * Super-admin only invitation administration.
 * Invitation tokens are generated randomly, stored as SHA-256 only and returned
 * exactly once (in the creation response). GET never exposes them.
 */
export async function adminRoutes(app: FastifyInstance): Promise<void> {
  const superAdminOnly = { preHandler: [app.authenticate, app.requireSuperAdmin] };

  app.post('/api/admin/invitations', superAdminOnly, async (request, reply) => {
    const input = invitationInputSchema.parse(request.body);
    const token = randomToken();
    const tokenHash = sha256Hex(token);
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
    const invitation = await prisma.$transaction(async (tx) => {
      await lockAccountEmail(tx, input.email);
      if ((await findAccountsForEmail(tx, input.email)).length) {
        throw new HttpError(409, 'email_already_registered', 'Un compte existe deja pour cet email.');
      }
      return tx.invitation.create({
        data: { email: input.email, role: input.role, tokenHash, createdBy: request.currentUser!.id, expiresAt },
        select: invitationSelect
      });
    });

    await recordAuditEvent({
      actorId: request.currentUser!.id,
      action: 'invitation.created',
      targetType: 'invitation',
      targetId: invitation.id,
      metadata: {
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt.toISOString()
      }
    });

    return reply.code(201).send({ invitation: publicInvitation(invitation), token });
  });

  app.get('/api/admin/invitations', superAdminOnly, async () => {
    const invitations = await prisma.invitation.findMany({
      select: invitationSelect,
      orderBy: { createdAt: 'desc' }
    });
    return { items: invitations.map(publicInvitation) };
  });

  app.post('/api/admin/users/:id/sessions/revoke', superAdminOnly, async (request) => {
    const params = request.params as { id: string };
    const user = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!user) {
      throw new HttpError(404, 'user_not_found', 'Utilisateur introuvable.');
    }
    const count = await revokeAllUserSessions(user.id, 'admin_revoke_all');
    await recordAuditEvent({
      actorId: request.currentUser!.id,
      action: 'session.admin_revoked_all',
      targetType: 'user',
      targetId: user.id,
      metadata: { revokedSessions: count }
    });
    return { ok: true, revokedSessions: count };
  });

  /**
   * Mutation administrateur du role et/ou du statut d un compte.
   * Garde-fous : super_admin (preHandler), pas d auto-modification, dernier
   * super_admin actif preserve, audit systematique, revocation des sessions
   * sur changement de role et sur suspension.
   */
  app.patch('/api/admin/users/:id', superAdminOnly, async (request) => {
    const params = request.params as { id: string };
    const input = adminUserUpdateSchema.parse(request.body);
    const actor = request.currentUser!;
    if (params.id === actor.id) {
      throw new HttpError(409, 'self_change_forbidden', 'Vous ne pouvez pas modifier votre propre role ou statut.');
    }

    const result = await prisma.$transaction(async (tx) => {
      // Serialise les mutations de comptes : deux admins ne peuvent pas retirer
      // simultanement les deux derniers super_admin actifs.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('admin:user_administration', 61704))`;
      const target = await tx.user.findUnique({
        where: { id: params.id },
        select: { id: true, email: true, role: true, status: true, suspendedAt: true }
      });
      if (!target) {
        throw new HttpError(404, 'user_not_found', 'Utilisateur introuvable.');
      }
      const nextRole = input.role ?? target.role;
      const nextStatus = input.status ?? target.status;
      const roleChanged = nextRole !== target.role;
      const statusChanged = nextStatus !== target.status;
      if (!roleChanged && !statusChanged) {
        return { user: target, revokedSessions: 0, revokedTokens: 0, roleChanged: false, statusChanged: false };
      }
      const removesActiveSuperAdmin =
        target.role === 'super_admin' &&
        target.status === 'active' &&
        (nextRole !== 'super_admin' || nextStatus !== 'active');
      if (removesActiveSuperAdmin) {
        const otherActiveSuperAdmins = await tx.user.count({
          where: { role: 'super_admin', status: 'active', id: { not: target.id } }
        });
        if (otherActiveSuperAdmins === 0) {
          throw new HttpError(
            409,
            'last_super_admin',
            'Impossible de retirer le dernier super administrateur actif.'
          );
        }
      }
      const updated = await tx.user.update({
        where: { id: target.id },
        data: {
          ...(roleChanged ? { role: nextRole } : {}),
          ...(statusChanged
            ? { status: nextStatus, suspendedAt: nextStatus === 'suspended' ? new Date() : null }
            : {})
        },
        select: { id: true, email: true, role: true, status: true, suspendedAt: true }
      });
      let revokedSessions = 0;
      let revokedTokens = 0;
      const revokeReason =
        statusChanged && nextStatus === 'suspended'
          ? 'admin_suspend'
          : roleChanged
            ? 'admin_role_change'
            : null;
      if (revokeReason) {
        revokedSessions = await revokeAllUserSessions(target.id, revokeReason, tx);
      }
      if (statusChanged && nextStatus === 'suspended') {
        const deletedTokens = await tx.accountToken.deleteMany({
          where: { OR: [{ userId: target.id }, { email: target.email.toLowerCase() }] }
        });
        revokedTokens = deletedTokens.count;
      }
      if (roleChanged) {
        await recordAuditEvent(
          {
            actorId: actor.id,
            action: 'user.role_changed',
            targetType: 'user',
            targetId: target.id,
            metadata: {
              email: target.email,
              fromRole: target.role,
              toRole: nextRole,
              fromStatus: target.status,
              toStatus: nextStatus,
              revokedSessions
            }
          },
          tx
        );
      }
      if (statusChanged) {
        await recordAuditEvent(
          {
            actorId: actor.id,
            action: nextStatus === 'suspended' ? 'user.suspended' : 'user.reactivated',
            targetType: 'user',
            targetId: target.id,
            metadata: {
              email: target.email,
              fromStatus: target.status,
              toStatus: nextStatus,
              revokedSessions,
              ...(nextStatus === 'suspended' ? { revokedTokens } : {})
            }
          },
          tx
        );
      }
      return { user: updated, revokedSessions, revokedTokens, roleChanged, statusChanged };
    });

    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        role: result.user.role,
        status: result.user.status === 'suspended' ? 'suspended' : 'active',
        suspendedAt: result.user.suspendedAt ? result.user.suspendedAt.toISOString() : null
      },
      revokedSessions: result.revokedSessions,
      revokedTokens: result.revokedTokens,
      roleChanged: result.roleChanged,
      statusChanged: result.statusChanged
    };
  });

  app.post('/api/admin/sessions/purge', superAdminOnly, async (request) => {
    const body = (request.body ?? {}) as { retentionDays?: number; dryRun?: boolean };
    const retentionDays = Math.min(365, Math.max(1, Number(body.retentionDays ?? 30)));
    const dryRun = body.dryRun !== false;
    const result = await purgeSessions({ retentionDays, dryRun });
    await recordAuditEvent({
      actorId: request.currentUser!.id,
      action: 'session.purge',
      targetType: 'session',
      targetId: null,
      metadata: { retentionDays, dryRun, candidates: result.candidates, deleted: result.deleted }
    });
    return result;
  });

  app.delete('/api/admin/invitations/:id', superAdminOnly, async (request) => {
    const params = request.params as { id: string };
    const existing = await prisma.invitation.findUnique({ where: { id: params.id } });
    if (!existing) {
      throw new HttpError(404, 'invitation_not_found', 'Invitation introuvable.');
    }

    let invitation: PublicInvitation;
    if (existing.revokedAt) {
      invitation = existing;
    } else {
      invitation = await prisma.invitation.update({
        where: { id: existing.id },
        data: { revokedAt: new Date() },
        select: invitationSelect
      });
      await recordAuditEvent({
        actorId: request.currentUser!.id,
        action: 'invitation.revoked',
        targetType: 'invitation',
        targetId: existing.id,
        metadata: {
          email: existing.email,
          role: existing.role,
          wasUsed: existing.usedAt !== null
        }
      });
    }

    return { invitation: publicInvitation(invitation) };
  });
}
