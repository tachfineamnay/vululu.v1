import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { assistantApproval, assistantCopy } from '@vululu/contracts';
import { assistantHistory, createTurn, editMarketingTurn, approveMarketingTurn } from '../infrastructure/assistant/service';
import { rateLimitPreHandler } from '../infrastructure/security/rateLimiter';

export async function assistantRoutes(app: FastifyInstance) {
  const base = '/api/projects/:project/assistant';
  const project = z.object({ project: z.string().min(1).max(128) });
  const turn = project.extend({ turn: z.uuid() });
  const auth = { preHandler: [app.authenticate] };
  const write = { bodyLimit: 20_000, preHandler: [...auth.preHandler,
    rateLimitPreHandler({ name: 'project_assistant', limit: 20, windowSeconds: 60, failClosed: true },
      (r) => `project-assistant:${r.currentUser!.id}`)] };
  app.addHook('onRequest', async (_r, reply) => { reply.header('Cache-Control', 'private, no-store'); });
  app.get(base, auth, (r) => assistantHistory(r.currentUser!.id, project.parse(r.params).project));
  app.post(base, write, (r) => createTurn(r.currentUser!.id, project.parse(r.params).project, r.body));
  app.post(base + '/:turn/edit', write, (r) => {
    const p = turn.parse(r.params), b = z.strictObject({ requestId: z.uuid(), copy: assistantCopy }).parse(r.body);
    return editMarketingTurn(r.currentUser!.id, p.project, p.turn, b.requestId, b.copy);
  });
  app.post(base + '/:turn/approve', write, (r) => {
    const p = turn.parse(r.params), b = assistantApproval.parse(r.body);
    return approveMarketingTurn(r.currentUser!.id, p.project, p.turn, b.digest, b.professionalReview);
  });
}
