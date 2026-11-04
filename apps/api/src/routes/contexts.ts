import type { FastifyInstance } from 'fastify';
import { contextInputSchema, contextReviewInputSchema } from '@vululu/contracts';
import { actorOf, contexts, contextReview } from '../application/container';
import { rateLimitPreHandler } from '../infrastructure/security/rateLimiter';

export async function contextRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/contexts/:id/review', { preHandler: [app.authenticate] }, async (request) => contextReview.get(actorOf(request.currentUser), (request.params as { id: string }).id));
  app.post('/api/contexts/:id/analyze', { preHandler: [app.authenticate, rateLimitPreHandler({ name: 'context-analysis', limit: 20, windowSeconds: 60 }, (request) => 'context-analysis:' + request.currentUser!.id)] }, async (request) => contextReview.propose(actorOf(request.currentUser), (request.params as { id: string }).id));
  app.put('/api/contexts/:id/review', { preHandler: [app.authenticate] }, async (request) => contextReview.save(actorOf(request.currentUser), (request.params as { id: string }).id, contextReviewInputSchema.parse(request.body)));
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
