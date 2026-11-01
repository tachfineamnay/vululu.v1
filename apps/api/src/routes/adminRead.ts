import type { FastifyInstance } from 'fastify';
import {
  adminAuditQuerySchema,
  adminCostQuerySchema,
  adminPaginationSchema,
  adminRoutingQuerySchema,
  adminRunQuerySchema
} from '@vululu/contracts';
import { actorOf, adminQueries } from '../application/container';

/**
 * Lectures d'administration reservees au super_admin.
 * Aucune ecriture metier ici : les mutations passent par les routes et use
 * cases existants (invitations, agents, providers, routage, sessions, ops).
 */
export async function adminReadRoutes(app: FastifyInstance): Promise<void> {
  const superAdminOnly = { preHandler: [app.authenticate, app.requireSuperAdmin] };

  app.get('/api/admin/overview', superAdminOnly, async (request) => {
    return adminQueries.overview(actorOf(request.currentUser));
  });

  app.get('/api/admin/users', superAdminOnly, async (request) => {
    const input = adminPaginationSchema.parse(request.query);
    return adminQueries.listUsers(actorOf(request.currentUser), input);
  });

  app.get('/api/admin/projects', superAdminOnly, async (request) => {
    const input = adminPaginationSchema.parse(request.query);
    return adminQueries.listProjects(actorOf(request.currentUser), input);
  });

  app.get('/api/admin/runs', superAdminOnly, async (request) => {
    const input = adminRunQuerySchema.parse(request.query);
    return adminQueries.listRuns(actorOf(request.currentUser), input);
  });

  app.get('/api/admin/runs/:id', superAdminOnly, async (request) => {
    const params = request.params as { id: string };
    return adminQueries.getRun(actorOf(request.currentUser), params.id);
  });

  app.get('/api/admin/audit', superAdminOnly, async (request) => {
    const input = adminAuditQuerySchema.parse(request.query);
    return adminQueries.listAudit(actorOf(request.currentUser), input);
  });

  app.get('/api/admin/costs', superAdminOnly, async (request) => {
    const input = adminCostQuerySchema.parse(request.query);
    return adminQueries.listCosts(actorOf(request.currentUser), input);
  });

  app.get('/api/admin/routing-decisions', superAdminOnly, async (request) => {
    const input = adminRoutingQuerySchema.parse(request.query);
    return adminQueries.listRoutingDecisions(actorOf(request.currentUser), input);
  });

  app.get('/api/admin/runtime', superAdminOnly, async (request) => {
    return adminQueries.runtime(actorOf(request.currentUser));
  });
}
