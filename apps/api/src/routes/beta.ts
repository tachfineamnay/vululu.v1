import type { FastifyInstance } from 'fastify';
import { betaStatus } from '../betaMode';

/**
 * BETA01 — état public du mode.
 *
 * Exposé sans authentification, sans identifiant et sans secret : le frontend
 * affiche le même message que celui appliqué par le serveur. Le serveur reste
 * seul juge : ce point de lecture ne donne aucun droit et n'active rien.
 */
export async function betaRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/beta/status', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return betaStatus();
  });
}
