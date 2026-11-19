import type { FastifyInstance, FastifyRequest } from 'fastify';
import {prisma} from '@vululu/db';
import { HttpError } from './errors';
import { recordAuditEvent } from './security/audit';
import {
  CSRF_EXEMPT_PATHS,
  MUTATING_METHODS,
  resolveRequestSession,
  validateCsrfToken
} from './security/session';
import './security/types';

function requestPath(request: Pick<FastifyRequest, 'url'>): string {
  const queryIndex = request.url.indexOf('?');
  return queryIndex === -1 ? request.url : request.url.slice(0, queryIndex);
}

/**
 * Registers the persistent-session authentication middleware:
 * - app.authenticate: requires a valid server-side session (reloaded from PostgreSQL);
 * - app.requireRole / app.requireSuperAdmin: server-side RBAC;
 * - a global onRequest hook enforcing session + CSRF on mutating requests.
 */
export async function registerAuth(app: FastifyInstance): Promise<void> {
  app.decorate('authenticate', async (request, reply) => {
    const session = await resolveRequestSession(request);
    if (!session) {
      return reply.code(401).send({ error: 'unauthorized', message: 'Session requise.' });
    }
  });

  app.decorate('requireRole', (role: string) => async (request, _reply) => {
    const session = await resolveRequestSession(request);
    if (!session) {
      throw new HttpError(401, 'unauthorized', 'Session requise.');
    }
    if (request.currentUser?.role !== role) {
      await recordAuditEvent({
        actorId: request.currentUser?.id ?? null,
        action: 'rbac.denied',
        targetType: 'role',
        targetId: role,
        metadata: {
          method: request.method,
          path: requestPath(request),
          actualRole: request.currentUser?.role ?? null
        }
      });
      throw new HttpError(403, 'forbidden', 'Acces refuse.');
    }
  });

  app.decorate('requireSuperAdmin', async (request, _reply) => {
    const session = await resolveRequestSession(request);
    if (!session) {
      throw new HttpError(401, 'unauthorized', 'Session requise.');
    }
    if (request.currentUser?.role !== 'super_admin') {
      await recordAuditEvent({
        actorId: request.currentUser?.id ?? null,
        action: 'rbac.denied',
        targetType: 'role',
        targetId: 'super_admin',
        metadata: {
          method: request.method,
          path: requestPath(request),
          actualRole: request.currentUser?.role ?? null
        }
      });
      throw new HttpError(403, 'forbidden', 'Acces refuse.');
    }
  });

  app.addHook('onRequest', async (request) => {
    const session = await resolveRequestSession(request);
    if (!MUTATING_METHODS.has(request.method)) {
      return;
    }
    if (CSRF_EXEMPT_PATHS.has(requestPath(request))) {
      return;
    }
    if (!session) {
      throw new HttpError(401, 'unauthorized', 'Session requise.');
    }
    if (!validateCsrfToken(request, session)) {
      throw new HttpError(403, 'csrf_invalid', 'Jeton CSRF absent ou invalide.');
    }
    const path = requestPath(request);
    if (path.startsWith('/api/billing/') || path === '/api/auth/logout' ||
        /^\/api\/(execution\/[^/]+\/cancel|publishing\/[^/]+\/prepare-cancel)$/.test(path)) return;
    if ((await prisma.billingAccount.findUnique({ where: { userId: session.userId } }))?.suspended) {
      // A suspended customer may still stop a previously scheduled publication.
      const approval = /^\/api\/execution\/([^/]+)\/approve$/.exec(path);
      if (approval && await prisma.executionOperation.count({where:{id:approval[1],accountId:session.userId,tool:'postiz.cancel@1'}})) return;
      throw new HttpError(403, 'billing_suspended', 'Compte suspendu : accès en lecture, facturation et assistance disponibles.');
    }
  });
}
