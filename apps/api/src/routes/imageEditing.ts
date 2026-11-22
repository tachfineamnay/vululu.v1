import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@vululu/db';
import { rateLimitPreHandler } from '../infrastructure/security/rateLimiter';
import {
  applyImageEdit, imageEditHistory, imageEditTool, imageEditingCapabilities, prepareImageEdit
} from '../infrastructure/imageEditing/service';

export async function imageEditingRoutes(app: FastifyInstance) {
  const auth = {
    preHandler: [app.authenticate, rateLimitPreHandler(
      { name: 'image-editing', limit: 30, windowSeconds: 60, failClosed: true },
      (r) => 'image-editing:' + r.currentUser!.id)]
  };
  const project = z.object({ project: z.string().min(1).max(128) });
  const operation = project.extend({ id: z.uuid() });
  app.get('/api/image-editing/capabilities', auth, async (r) => {
    const policy = await prisma.executionAccount.findUnique({ where: { userId: r.currentUser!.id }, select: { enabled: true, tools: true } });
    return { ...imageEditingCapabilities(), accountAuthorized: Boolean(policy?.enabled && policy.tools.includes(imageEditTool)) };
  });
  app.post('/api/projects/:project/image-edits', auth, (r) =>
    prepareImageEdit(r.currentUser!.id, project.parse(r.params).project, r.body));
  app.get('/api/projects/:project/image-edits', auth, (r) =>
    imageEditHistory(r.currentUser!.id, project.parse(r.params).project));
  app.post('/api/projects/:project/image-edits/:id/apply', auth, (r) => {
    const params = operation.parse(r.params);
    return applyImageEdit(r.currentUser!.id, params.project, params.id, r.body);
  });
}
