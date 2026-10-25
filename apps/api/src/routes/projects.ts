import type { FastifyInstance } from 'fastify';
import {
  briefInputSchema,
  messageInputSchema,
  projectInputSchema,
  sceneDurationInputSchema
} from '@vululu/contracts';
import { actorOf, briefs, bundles, messages, projects, scenes, storyboards } from '../application/container';
import { rateLimitPreHandler, RATE_LIMITS } from '../infrastructure/security/rateLimiter';

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/projects', { preHandler: [app.authenticate] }, async (request) => {
    const items = await projects.list(actorOf(request.currentUser));
    return { items };
  });

  app.post('/api/projects', { preHandler: [app.authenticate] }, async (request, reply) => {
    const input = projectInputSchema.parse(request.body);
    const project = await projects.create(actorOf(request.currentUser), input);
    return reply.code(201).send({ project });
  });

  app.get('/api/projects/:id', { preHandler: [app.authenticate] }, async (request) => {
    const params = request.params as { id: string };
    return bundles.get(actorOf(request.currentUser), params.id);
  });

  app.patch('/api/projects/:id/brief', { preHandler: [app.authenticate] }, async (request) => {
    const params = request.params as { id: string };
    const input = briefInputSchema.parse(request.body);
    const brief = await briefs.update(actorOf(request.currentUser), params.id, input);
    return { brief };
  });

  app.post('/api/projects/:id/messages', { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = request.params as { id: string };
    const input = messageInputSchema.parse(request.body);
    const pair = await messages.add(actorOf(request.currentUser), params.id, input.content);
    return reply.code(201).send(pair);
  });

  app.post('/api/projects/:id/storyboard', { preHandler: [app.authenticate, rateLimitPreHandler(RATE_LIMITS.storyboard, (request) => 'storyboard:' + (request.currentUser?.id ?? 'anon') + ':' + String((request.params as { id?: string }).id ?? ''))] }, async (request) => {
    const params = request.params as { id: string };
    return storyboards.generate(actorOf(request.currentUser), params.id);
  });

  app.patch('/api/projects/:id/scenes/:sceneKey', { preHandler: [app.authenticate] }, async (request) => {
    const params = request.params as { id: string; sceneKey: string };
    const input = sceneDurationInputSchema.parse(request.body);
    const scene = await scenes.updateDuration(
      actorOf(request.currentUser),
      params.id,
      params.sceneKey,
      input.durationSeconds
    );
    return { scene };
  });
}