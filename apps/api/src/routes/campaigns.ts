import type { FastifyInstance } from 'fastify';
import { campaignInputSchema, campaignAssignmentSchema } from '@vululu/contracts';
import { actorOf, campaigns } from '../application/container';

export async function campaignRoutes(app: FastifyInstance) {
  const authenticated = { preHandler: [app.authenticate] };
  app.get('/api/campaigns', authenticated, async (request) => ({ items: await campaigns.list(actorOf(request.currentUser)) }));
  app.post('/api/campaigns', authenticated, async (request, reply) => {
    const campaign = await campaigns.create(actorOf(request.currentUser), campaignInputSchema.parse(request.body));
    return reply.code(201).send({ campaign });
  });
  app.get('/api/campaigns/:id', authenticated, async (request) => {
    return campaigns.get(actorOf(request.currentUser), (request.params as { id: string }).id);
  });
  app.put('/api/projects/:id/campaign', authenticated, async (request) => {
    const body = campaignAssignmentSchema.parse(request.body);
    return campaigns.assign(actorOf(request.currentUser), (request.params as { id: string }).id, body.campaignId);
  });
}
