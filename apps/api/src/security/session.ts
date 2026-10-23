import type { FastifyReply, FastifyRequest } from 'fastify';
import type { User } from '@prisma/client';
import type { SessionUser } from '@vululu/contracts';
import { prisma } from '@vululu/db';
import { randomToken, safeEqualHex, safeEqualString, sha256Hex } from './crypto';

/** Server-side session lifetime: 24 hours. */
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
/** Invitation lifetime: 72 hours. */
export const INVITATION_TTL_MS = 72 * 60 * 60 * 1000;

export const SESSION_COOKIE = 'session';
export const CSRF_COOKIE = 'vululu_csrf';
export const CSRF_HEADER = 'x-csrf-token';

export const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/** Login and activation are public: they cannot rely on a session-bound CSRF hash. */
export const CSRF_EXEMPT_PATHS = new Set(['/api/auth/login', '/api/auth/activate']);

const LAST_USED_REFRESH_MS = 5 * 60 * 1000;

export type AuthSession = {
  id: string;
  userId: string;
  csrfHash: string;
  expiresAt: Date;
};

export type CreatedSession = {
  session: { id: string; expiresAt: Date };
  token: string;
  csrfToken: string;
  expiresAt: Date;
};

export function publicUser(user: Pick<User, 'id' | 'email' | 'name' | 'role'>): SessionUser {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export function isProduction(): boolean {
  return process.env.APP_ENV === 'production';
}

/**
 * Creates a persistent session. The random token and the CSRF token are returned
 * to the caller (to be written in cookies); only their SHA-256 digests are stored.
 */
export async function createSession(userId: string): Promise<CreatedSession> {
  const token = randomToken();
  const csrfToken = randomToken();
  const tokenHash = sha256Hex(token);
  const csrfHash = sha256Hex(csrfToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const session = await prisma.session.create({
    data: { userId, tokenHash, csrfHash, expiresAt },
    select: { id: true, expiresAt: true }
  });
  return { session, token, csrfToken, expiresAt };
}

/** Revokes the session matching a plaintext token. Returns the number of rows revoked. */
export async function revokeSessionByToken(token: string | undefined | null): Promise<number> {
  if (!token) {
    return 0;
  }
  const result = await prisma.session.updateMany({
    where: { tokenHash: sha256Hex(token), revokedAt: null },
    data: { revokedAt: new Date() }
  });
  return result.count;
}

/** Loads and validates the session referenced by the request cookie. */
export async function resolveRequestSession(request: FastifyRequest): Promise<AuthSession | null> {
  if (request.authSession) {
    return request.authSession;
  }
  const token = request.cookies?.[SESSION_COOKIE];
  if (!token) {
    return null;
  }
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256Hex(token) },
    include: { user: true }
  });
  if (!session) {
    return null;
  }
  if (session.revokedAt !== null) {
    return null;
  }
  if (session.expiresAt.getTime() <= Date.now()) {
    return null;
  }
  if (Date.now() - session.lastUsedAt.getTime() > LAST_USED_REFRESH_MS) {
    try {
      await prisma.session.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } });
    } catch {
      // A stale lastUsedAt must not lock a valid session out.
    }
  }
  const authSession: AuthSession = {
    id: session.id,
    userId: session.userId,
    csrfHash: session.csrfHash,
    expiresAt: session.expiresAt
  };
  request.authSession = authSession;
  request.currentUser = publicUser(session.user);
  return authSession;
}

/** Writes the HttpOnly session cookie and the readable double-submit CSRF cookie. */
export function setAuthCookies(reply: FastifyReply, token: string, csrfToken: string): void {
  const secure = isProduction();
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: SESSION_TTL_MS / 1000
  });
  reply.setCookie(CSRF_COOKIE, csrfToken, {
    path: '/',
    httpOnly: false,
    sameSite: 'lax',
    secure,
    maxAge: SESSION_TTL_MS / 1000
  });
}

/** Expires both auth cookies. */
export function clearAuthCookies(reply: FastifyReply): void {
  const secure = isProduction();
  reply.clearCookie(SESSION_COOKIE, { path: '/', httpOnly: true, sameSite: 'lax', secure });
  reply.clearCookie(CSRF_COOKIE, { path: '/', httpOnly: false, sameSite: 'lax', secure });
}

/**
 * Double-submit CSRF validation:
 * - the x-csrf-token header must be present;
 * - it must equal the readable vululu_csrf cookie;
 * - SHA-256(header) must equal the session csrfHash stored server-side.
 */
export function validateCsrfToken(request: FastifyRequest, session: AuthSession): boolean {
  const headerValue = request.headers[CSRF_HEADER];
  const cookieValue = request.cookies?.[CSRF_COOKIE];
  if (typeof headerValue !== 'string' || headerValue.length === 0) {
    return false;
  }
  if (typeof cookieValue !== 'string' || cookieValue.length === 0) {
    return false;
  }
  if (!safeEqualString(headerValue, cookieValue)) {
    return false;
  }
  return safeEqualHex(sha256Hex(headerValue), session.csrfHash);
}
