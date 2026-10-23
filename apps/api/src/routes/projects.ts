import type { FastifyInstance } from 'fastify';
import {
  briefInputSchema,
  messageInputSchema,
  projectInputSchema
} from '@vululu/contracts';
import {
  addMessage,
  createProject,
  generateStoryboard,
  getProjectBundle,
  listProjects,
  updateBrief
} from '../services/projects';

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/projects', { preHandler: [app.authenticate] }, async (request) => {
    const items = await listProjects(request.currentUser!.id);
    return { items };
  });

  app.post('/api/projects', { preHandler: [app.authenticate] }, async (request, reply) => {
    const input = projectInputSchema.parse(request.body);
    const project = await createProject(request.currentUser!.id, input);
    return reply.code(201).send({ project });
  });

  app.get('/api/projects/:id', { preHandler: [app.authenticate] }, async (request) => {
    const params = request.params as { id: string };
    return getProjectBundle(request.currentUser!.id, params.id);
  });

  app.patch('/api/projects/:id/brief', { preHandler: [app.authenticate] }, async (request) => {
    const params = request.params as { id: string };
    const input = briefInputSchema.parse(request.body);
    const brief = await updateBrief(request.currentUser!.id, params.id, input);
    return { brief };
  });

  app.post('/api/projects/:id/messages', { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = request.params as { id: string };
    const input = messageInputSchema.parse(request.body);
    const messages = await addMessage(request.currentUser!.id, params.id, input.content);
    return reply.code(201).send(messages);
  });

  app.post('/api/projects/:id/storyboard', { preHandler: [app.authenticate] }, async (request) => {
    const params = request.params as { id: string };
    return generateStoryboard(request.currentUser!.id, params.id);
  });
}
