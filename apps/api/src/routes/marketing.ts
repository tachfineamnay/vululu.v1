import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import {
  createDraft,
  approveDraft,
  history,
  readDraft,
  prepareRefinement
} from '../infrastructure/marketing/service';
import { rateLimitPreHandler } from '../infrastructure/security/rateLimiter';
export async function marketingRoutes(app: FastifyInstance) {
  const auth = {
    preHandler: [
      app.authenticate,
      rateLimitPreHandler(
        { name: 'marketing', limit: 40, windowSeconds: 60, failClosed: true },
        (r) => 'marketing:' + r.currentUser!.id
      )
    ]
  };
  const base = '/api/projects/:project/marketing',
    project = z.object({ project: z.string().min(1).max(128) }),
    rev = project.extend({ version: z.coerce.number().int().positive() });
  app.get(base, auth, (r) => history(r.currentUser!.id, project.parse(r.params).project));
  app.post(base, auth, (r) => createDraft(r.currentUser!.id, project.parse(r.params).project, r.body));
  app.get(base + '/:version', auth, (r) => {
    const p = rev.parse(r.params);
    return readDraft(r.currentUser!.id, p.project, p.version);
  });
  app.post(base + '/:version/refine', auth, (r) => {
    const p = rev.parse(r.params);
    return prepareRefinement(r.currentUser!.id, p.project, p.version);
  });
  app.post(base + '/:version/approve', auth, (r) => {
    const p = rev.parse(r.params),
      b = z
        .object({ digest: z.string().regex(/^[a-f0-9]{64}$/), professionalReview: z.boolean() })
        .strict()
        .parse(r.body);
    return approveDraft(r.currentUser!.id, p.project, p.version, b.digest, b.professionalReview);
  });
}
