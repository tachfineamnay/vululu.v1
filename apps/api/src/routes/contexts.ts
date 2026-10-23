import type { FastifyInstance } from 'fastify';
import { contextInputSchema } from '@vululu/contracts';
import { actorOf, contexts } from '../application/container';

export async function contextRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/contexts', { preHandler: [app.authenticate] }, async (request) => {
    const items = await contexts.list(actorOf(request.currentUser));
    return { items };
  });

  app.post('/api/contexts', { preHandler: [app.authenticate] }, async (request, reply) => {
    const input = contextInputSchema.parse(request.body);
    const context = await contexts.create(actorOf(request.currentUser), input);
    return reply.code(201).send({ context });
  });
}