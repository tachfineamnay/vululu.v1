import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@vululu/db';
import { capability } from '../infrastructure/mediaGeneration/providers';
import {
  prepareMedia,
  mediaHistory,
  cancelMedia,
  placeMedia
} from '../infrastructure/mediaGeneration/service';
import { rateLimitPreHandler } from '../infrastructure/security/rateLimiter';
export async function mediaGenerationRoutes(app: FastifyInstance) {
  const auth = {
      preHandler: [
        app.authenticate,
        rateLimitPreHandler(
          { name: 'media-generation', limit: 60, windowSeconds: 60000, failClosed: true },
          (r) => 'media:' + r.currentUser!.id
        )
      ]
    },
    base = '/api/projects/:project/media-generation',
    p = z.object({ project: z.string().min(1).max(128) }),
    g = p.extend({ id: z.uuid() });
  app.get('/api/media/capabilities', auth, async (r) => {
    const policy = await prisma.executionAccount.findUnique({ where: { userId: r.currentUser!.id }, select: { enabled: true, tools: true } });
    return (['image', 'video'] as const).map((kind) => ({ ...capability(kind),
      accountAuthorized: Boolean(policy?.enabled && policy.tools.includes(`media.${kind}@1`)) }));
  });
  app.post(base, auth, (r) => prepareMedia(r.currentUser!.id, p.parse(r.params).project, r.body));
  app.get(base, auth, (r) => mediaHistory(r.currentUser!.id, p.parse(r.params).project));
  app.post(base + '/:id/cancel', auth, (r) => {
    const { project, id } = g.parse(r.params);
    return cancelMedia(r.currentUser!.id, project, id);
  });
  app.post(base + '/:id/place', auth, (r) => {
    const { project, id } = g.parse(r.params);
    return placeMedia(
      r.currentUser!.id,
      project,
      id,
      z.strictObject({ expectedRevision: z.int().positive(), approved: z.literal(true) }).parse(r.body)
        .expectedRevision
    );
  });
}
