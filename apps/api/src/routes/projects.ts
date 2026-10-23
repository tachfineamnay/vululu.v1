import type { FastifyInstance } from 'fastify';
import {
  briefInputSchema,
  messageInputSchema,
  projectInputSchema,
  sceneDurationInputSchema
} from '@vululu/contracts';
import { actorOf, projectWorkflow, projects } from '../application/container';

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
    return projectWorkflow.getBundle(actorOf(request.currentUser), params.id);
  });

  app.patch('/api/projects/:id/brief', { preHandler: [app.authenticate] }, async (request) => {
    const params = request.params as { id: string };
    const input = briefInputSchema.parse(request.body);
    const brief = await projectWorkflow.updateBrief(actorOf(request.currentUser), params.id, input);
    return { brief };
  });

  app.post('/api/projects/:id/messages', { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = request.params as { id: string };
    const input = messageInputSchema.parse(request.body);
    const messages = await projectWorkflow.addMessage(actorOf(request.currentUser), params.id, input.content);
    return reply.code(201).send(messages);
  });

  app.post('/api/projects/:id/storyboard', { preHandler: [app.authenticate] }, async (request) => {
    const params = request.params as { id: string };
    return projectWorkflow.generateStoryboard(actorOf(request.currentUser), params.id);
  });

  app.patch('/api/projects/:id/scenes/:sceneKey', { preHandler: [app.authenticate] }, async (request) => {
    const params = request.params as { id: string; sceneKey: string };
    const input = sceneDurationInputSchema.parse(request.body);
    const scene = await projectWorkflow.updateSceneDuration(
      actorOf(request.currentUser),
      params.id,
      params.sceneKey,
      input.durationSeconds
    );
    return { scene };
  });
}
