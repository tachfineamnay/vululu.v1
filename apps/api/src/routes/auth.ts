import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { prisma } from '@vululu/db';
import { loginSchema } from '@vululu/contracts';
import { HttpError } from '../errors';
import { recordAuditEvent } from '../security/audit';
import { randomToken, sha256Hex } from '../security/crypto';
import { findAccountsForEmail, lockAccountEmail, normalizeAccountEmail } from '../security/accountIdentity';
import { activationInputSchema } from '../security/schemas';
import { rateLimitPreHandler, RATE_LIMITS } from '../infrastructure/security/rateLimiter';
import {
  SESSION_COOKIE,
  clearAuthCookies,
  createSession,
  publicUser,
  revokeAllUserSessions,
  revokeSessionByToken,
  setAuthCookies
} from '../security/session';

const publicUserSelect = { id: true, email: true, name: true, role: true } as const;

async function rejectActivation(input: {
  reason: string;
  message: string;
  invitationId?: string | null;
  email?: string | null;
  statusCode?: number;
}): Promise<never> {
  await recordAuditEvent({
    actorId: null,
    action: 'auth.activation_rejected',
    targetType: 'invitation',
    targetId: input.invitationId ?? null,
    metadata: { reason: input.reason, email: input.email ?? null }
  });
  throw new HttpError(input.statusCode ?? 400, input.reason, input.message);
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  let dummyHash: Promise<string> | undefined;
  const invalidCredentials = { error: 'invalid_credentials', message: 'Email ou mot de passe incorrect.' };
  app.post('/api/auth/login', {
    bodyLimit: 8192,
    onRequest: [rateLimitPreHandler({ ...RATE_LIMITS.login, name: 'login_ip' }, (request) => 'login:ip:' + request.ip)],
    preHandler: [rateLimitPreHandler(RATE_LIMITS.login, (request) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      return 'login:' + request.ip + ':' + normalizeAccountEmail(String(body.email ?? 'unknown'));
    })]
  }, async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const normalized = normalizeAccountEmail(body.email);
    const user = await prisma.user.findUnique({ where: { email: body.email } }) ??
      (normalized !== body.email ? await prisma.user.findUnique({ where: { email: normalized } }) : null);
    const hash = user?.passwordHash ?? await (dummyHash ??= bcrypt.hash(randomToken(), 12));
    const valid = await bcrypt.compare(body.password, hash);
    if (!user || !valid) {
      await recordAuditEvent({
        actorId: user?.id,
        action: 'auth.login_failed',
        targetType: 'user',
        targetId: user?.id,
        metadata: { email: body.email }
      });
      return reply.code(401).send(invalidCredentials);
    }

    // Recheck the password AND the account status under the same lock used by
    // reset/change/suspension: a concurrent suspension must block session creation.
    // The 403 "account_suspended" is only returned when the password was correct.
    const login = await prisma.$transaction(async (tx) => {
      await lockAccountEmail(tx, user.email);
      const current = await tx.user.findUnique({
        where: { id: user.id },
        select: { passwordHash: true, status: true }
      });
      if (!current || current.passwordHash !== hash) return null;
      if (current.status === 'suspended') return { suspended: true } as const;
      const presented = request.cookies?.[SESSION_COOKIE];
      if (presented) {
        await tx.session.updateMany({ where: { tokenHash: sha256Hex(presented), revokedAt: null },
          data: { revokedAt: new Date(), revokedReason: 'login_rotation' } });
      }
      const created = await createSession(user.id, tx);
      const needsBusinessProfile = user.selfRegisteredAt !== null && !await tx.brandContext.count({ where: { userId: user.id } });
      await recordAuditEvent({
        actorId: user.id, action: 'auth.login', targetType: 'session', targetId: created.session.id,
        metadata: { email: user.email, role: user.role }
      }, tx);
      return { created, needsBusinessProfile };
    });
    if (!login) return reply.code(401).send(invalidCredentials);
    if ('suspended' in login) {
      // Journalise le refus sans mot de passe ni jeton. Aucun cookie de session n est ecrit.
      await recordAuditEvent({
        actorId: user.id,
        action: 'auth.login_suspended',
        targetType: 'user',
        targetId: user.id,
        metadata: { email: user.email }
      });
      return reply.code(403).send({
        error: 'account_suspended',
        message: 'Compte suspendu. Contactez un administrateur.'
      });
    }
    const { created, needsBusinessProfile } = login;
    setAuthCookies(reply, created.token, created.csrfToken);
    return reply.code(200).send({ user: publicUser(user), csrfToken: created.csrfToken, needsBusinessProfile });
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const authSession = request.authSession;
    const revokeCount = await revokeSessionByToken(request.cookies?.[SESSION_COOKIE], 'logout');
    if (request.currentUser) {
      await recordAuditEvent({
        actorId: request.currentUser.id,
        action: 'auth.logout',
        targetType: 'session',
        targetId: authSession?.id ?? null,
        metadata: { revoked: revokeCount > 0 }
      });
    }
    clearAuthCookies(reply);
    return reply.code(200).send({ ok: true });
  });

  app.get('/api/auth/me', { preHandler: [app.authenticate] }, async (request) => {
    return { user: request.currentUser };
  });

  app.post('/api/auth/logout-all', { preHandler: [app.authenticate] }, async (request, reply) => {
    const count = await revokeAllUserSessions(request.currentUser!.id, 'logout_all');
    await recordAuditEvent({
      actorId: request.currentUser!.id,
      action: 'auth.logout_all',
      targetType: 'user',
      targetId: request.currentUser!.id,
      metadata: { revokedSessions: count }
    });
    clearAuthCookies(reply);
    return reply.code(200).send({ ok: true, revokedSessions: count });
  });

  app.post('/api/auth/activate', { preHandler: [rateLimitPreHandler(RATE_LIMITS.activation, (request) => 'activation:' + request.ip)] }, async (request, reply) => {
    const body = activationInputSchema.parse(request.body);
    const tokenHash = sha256Hex(body.token);
    const invitation = await prisma.invitation.findUnique({ where: { tokenHash } });
    if (!invitation) {
      return rejectActivation({
        reason: 'invitation_invalid',
        message: 'Invitation invalide.'
      });
    }
    if (invitation.usedAt) {
      return rejectActivation({
        reason: 'invitation_used',
        message: 'Cette invitation a deja ete utilisee.',
        invitationId: invitation.id,
        email: invitation.email
      });
    }
    if (invitation.revokedAt) {
      return rejectActivation({
        reason: 'invitation_revoked',
        message: 'Cette invitation a ete revoquee.',
        invitationId: invitation.id,
        email: invitation.email
      });
    }
    if (invitation.expiresAt.getTime() <= Date.now()) {
      return rejectActivation({
        reason: 'invitation_expired',
        message: 'Cette invitation a expire.',
        invitationId: invitation.id,
        email: invitation.email
      });
    }

    const existingUser = await prisma.user.findUnique({ where: { email: invitation.email } });
    if (existingUser) {
      return rejectActivation({
        reason: 'email_taken',
        message: 'Un compte existe deja pour cet email.',
        invitationId: invitation.id,
        email: invitation.email,
        statusCode: 409
      });
    }

    const passwordHash = await bcrypt.hash(body.password, 10);
    const claimedInvitationId = invitation.id;
    const user = await prisma.$transaction(async (tx) => {
      await lockAccountEmail(tx, invitation.email);
      if ((await findAccountsForEmail(tx, invitation.email)).length) {
        throw new HttpError(409, 'email_taken', 'Un compte existe deja pour cet email.');
      }
      // Atomic one-shot claim: concurrent activations see count === 0 and roll back.
      const claimed = await tx.invitation.updateMany({
        where: {
          id: claimedInvitationId,
          usedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() }
        },
        data: { usedAt: new Date() }
      });
      if (claimed.count !== 1) {
        throw new HttpError(400, 'invitation_used', "Cette invitation n'est plus valide.");
      }
      return tx.user.create({
        data: {
          email: invitation.email,
          passwordHash,
          name: body.name,
          role: invitation.role
        },
        select: publicUserSelect
      });
    });

    await recordAuditEvent({
      actorId: user.id,
      action: 'auth.activate',
      targetType: 'invitation',
      targetId: claimedInvitationId,
      metadata: { email: user.email, role: user.role }
    });
    return reply.code(201).send({ user });
  });
}