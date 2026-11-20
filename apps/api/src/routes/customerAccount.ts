import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import { prisma } from '@vululu/db';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { HttpError } from '../errors';
import { rateLimitPreHandler, consumeRateLimit } from '../infrastructure/security/rateLimiter';
import { accountEmailOrigin, deliverAccountLink, type AccountMailTransport } from '../infrastructure/email/accountMail';
import { findAccountsForEmail, lockAccountEmail, normalizeAccountEmail } from '../security/accountIdentity';
import { randomToken, sha256Hex } from '../security/crypto';
import { clearAuthCookies, publicUser } from '../security/session';
import { recordAuditEvent } from '../security/audit';

const emailInput = z.object({ email: z.string().trim().max(254).email().transform(normalizeAccountEmail) });
const password = z.string().min(12).refine((value) => Buffer.byteLength(value) <= 72);
const name = z.string().trim().min(2).max(120);
const profileInput = z.object({ name });
const finishInput = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/), password });
const accepted = { ok: true };
const emailPolicy = { name: 'account_mail_address', limit: 4, windowSeconds: 3600, failClosed: true };
const ipPolicy = { name: 'account_lifecycle_ip', limit: 30, windowSeconds: 900, failClosed: true };
const passwordPolicy = { name: 'account_password_change', limit: 8, windowSeconds: 900, failClosed: true };
const publicOptions = (group: string) => ({
  bodyLimit: 4096,
  onRequest: [rateLimitPreHandler(ipPolicy, (r) => `account:${group}:ip:${r.ip}`)]
});

const invalidToken = () => new HttpError(400, 'account_link_invalid', 'Ce lien est invalide ou expiré. Demandez un nouveau lien.');
const unavailable = () => new HttpError(503, 'account_email_unavailable', 'Le service email est indisponible. Réessayez plus tard.');

async function canRegister(tx: Prisma.TransactionClient, email: string) {
  const accounts = await findAccountsForEmail(tx, email);
  const invitations = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Invitation"
    WHERE lower("email") = ${email} AND "usedAt" IS NULL AND "revokedAt" IS NULL AND "expiresAt" > ${new Date()}
    LIMIT 1
  `;
  return accounts.length === 0 && invitations.length === 0;
}

async function revokeSessions(tx: Prisma.TransactionClient, userId: string, reason: string, keepId?: string) {
  return tx.session.updateMany({
    where: { userId, revokedAt: null, ...(keepId ? { id: { not: keepId } } : {}) },
    data: { revokedAt: new Date(), revokedReason: reason }
  });
}

export async function customerAccountRoutes(app: FastifyInstance, { mail }: { mail: AccountMailTransport | null }) {
  const origin = mail ? accountEmailOrigin() : '';
  app.addHook('onRequest', async (_request, reply) => { reply.header('Cache-Control', 'no-store'); });

  for (const [path, purpose] of [
    ['register', 'verify'], ['resend-verification', 'verify'], ['forgot-password', 'reset']
  ] as const) {
    app.post(`/api/auth/${path}`, publicOptions('send'), async (request, reply) => {
      const { email } = emailInput.parse(request.body);
      if (!mail) throw unavailable();
      const quota = await consumeRateLimit(`account:mail:${purpose}:${sha256Hex(email)}`, emailPolicy);
      if (quota.allowed) {
        const token = randomToken();
        const recipient = await prisma.$transaction(async (tx) => {
          await lockAccountEmail(tx, email);
          const now = new Date();
          let user: { id: string; email: string; role: string } | undefined;
          if (purpose === 'verify') {
            if (!await canRegister(tx, email)) return null;
          } else {
            const matches = await findAccountsForEmail(tx, email);
            if (matches.length !== 1 || matches[0].role !== 'user') return null;
            user = matches[0];
          }
          await tx.accountToken.create({ data: {
            tokenHash: sha256Hex(token), purpose, email, userId: user?.id,
            expiresAt: new Date(now.getTime() + (purpose === 'verify' ? 24 * 60 : 30) * 60_000)
          } });
          return user?.email ?? email;
        });
        if (recipient) deliverAccountLink(mail, origin, recipient, purpose, token);
      }
      return reply.code(202).send(accepted);
    });
  }

  for (const [path, purpose] of [['verify-email', 'verify'], ['reset-password', 'reset']] as const) {
    app.post(`/api/auth/${path}`, publicOptions('claim'), async (request, reply) => {
      const input = finishInput.parse(request.body);
      const displayName = purpose === 'verify' ? profileInput.parse(request.body).name : null;
      const tokenHash = sha256Hex(input.token);
      const pending = await prisma.accountToken.findUnique({ where: { tokenHash } });
      if (!pending || pending.purpose !== purpose || pending.expiresAt <= new Date()) throw invalidToken();
      const passwordHash = await bcrypt.hash(input.password, 12);
      const userId = await prisma.$transaction(async (tx) => {
        await lockAccountEmail(tx, pending.email);
        const now = new Date();
        const claimed = await tx.accountToken.deleteMany({ where: { tokenHash, purpose, expiresAt: { gt: now } } });
        if (claimed.count !== 1) throw invalidToken();
        let id: string;
        if (displayName !== null) {
          if (!await canRegister(tx, pending.email)) throw invalidToken();
          const user = await tx.user.create({ data: {
            email: pending.email, name: displayName, passwordHash, role: 'user', selfRegisteredAt: now
          } });
          id = user.id;
        } else {
          if (!pending.userId) throw invalidToken();
          const accounts = await findAccountsForEmail(tx, pending.email);
          if (accounts.length !== 1 || accounts[0].id !== pending.userId) throw invalidToken();
          const updated = await tx.user.updateMany({ where: { id: pending.userId, role: 'user' }, data: { passwordHash } });
          if (updated.count !== 1) throw invalidToken();
          id = pending.userId;
          await revokeSessions(tx, id, 'password_reset');
        }
        await tx.accountToken.deleteMany({ where: { email: pending.email, purpose } });
        await recordAuditEvent({ actorId: id, action: `auth.account_${purpose}`, targetType: 'user', targetId: id }, tx);
        return id;
      });
      if (purpose === 'reset' && request.currentUser?.id === userId) clearAuthCookies(reply);
      return accepted;
    });
  }

  const authorized = { preHandler: [app.authenticate], bodyLimit: 4096 };
  const session = (request: FastifyRequest) => request.authSession!;
  app.patch('/api/auth/profile', authorized, async (request) => {
    const input = profileInput.parse(request.body);
    return { user: publicUser(await prisma.user.update({ where: { id: session(request).userId }, data: input })) };
  });

  app.post('/api/auth/change-password', {
    ...authorized,
    preHandler: [...authorized.preHandler, rateLimitPreHandler(passwordPolicy, (r) => `account:password:${session(r).userId}`)]
  }, async (request) => {
    const input = z.object({ currentPassword: z.string().min(1).max(1024), password }).parse(request.body);
    const { userId, id } = session(request);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const wrongPassword = () => new HttpError(400, 'invalid_credentials', 'Le mot de passe actuel est incorrect.');
    if (!await bcrypt.compare(input.currentPassword, user.passwordHash)) throw wrongPassword();
    const passwordHash = await bcrypt.hash(input.password, 12);
    await prisma.$transaction(async (tx) => {
      await lockAccountEmail(tx, user.email);
      if (!await tx.session.count({ where: { id, revokedAt: null, expiresAt: { gt: new Date() } } })) {
        throw new HttpError(401, 'unauthorized', 'Session requise.');
      }
      const updated = await tx.user.updateMany({ where: { id: userId, passwordHash: user.passwordHash }, data: { passwordHash } });
      if (updated.count !== 1) throw wrongPassword();
      await tx.accountToken.deleteMany({ where: { userId, purpose: 'reset' } });
      await revokeSessions(tx, userId, 'password_changed', id);
      await recordAuditEvent({ actorId: userId, action: 'auth.password_changed', targetType: 'user', targetId: userId }, tx);
    });
    return accepted;
  });

  app.post('/api/auth/logout-others', authorized, async (request) => {
    const { userId, id } = session(request);
    return prisma.$transaction(async (tx) => {
      const { count } = await revokeSessions(tx, userId, 'logout_others', id);
      await recordAuditEvent({ actorId: userId, action: 'auth.logout_others', targetType: 'user', targetId: userId,
        metadata: { revokedSessions: count } }, tx);
      return { ok: true, revokedSessions: count };
    });
  });
}
