import type { FastifyInstance } from 'fastify';
import { contextInputSchema } from '@vululu/contracts';
import { createContext, listContexts } from '../services/contexts';

export async function contextRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/contexts', { preHandler: [app.authenticate] }, async (request) => {
    const items = await listContexts(request.currentUser!.id);
    return { items };
  });

  app.post('/api/contexts', { preHandler: [app.authenticate] }, async (request, reply) => {
    const input = contextInputSchema.parse(request.body);
    const context = await createContext(request.currentUser!.id, input);
    return reply.code(201).send({ context });
  });
}
