import type { FastifyInstance } from 'fastify';
import type { Invitation } from '@prisma/client';
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
    const existingUser = await prisma.user.findUnique({ where: { email: input.email } });
    if (existingUser) {
      throw new HttpError(409, 'email_already_registered', 'Un compte existe deja pour cet email.');
    }

    const token = randomToken();
    const tokenHash = sha256Hex(token);
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
    const invitation = await prisma.invitation.create({
      data: {
        email: input.email,
        role: input.role,
        tokenHash,
        createdBy: request.currentUser!.id,
        expiresAt
      },
      select: invitationSelect
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