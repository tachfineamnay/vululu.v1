import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@vululu/db';
import { approve, cancel, propose, resolveIncident } from '../infrastructure/execution/broker';
import { tools, toolSchema } from '../infrastructure/execution/registry';
import { rateLimitPreHandler } from '../infrastructure/security/rateLimiter';
import { HttpError } from '../errors';
export async function executionRoutes(app: FastifyInstance) {
  const rate = rateLimitPreHandler(
    { name: 'execution', limit: 40, windowSeconds: 60, failClosed: true },
    (r) => 'execution:' + r.currentUser!.id
  );
  const auth = { preHandler: [app.authenticate, rate] },
    admin = { preHandler: [app.requireSuperAdmin, rate] };
  const id = (p: unknown) => z.object({ id: z.uuid() }).parse(p).id;
  app.get('/api/admin/execution/incidents', admin, () =>
    prisma.executionOperation.findMany({
      where: { state: 'UNKNOWN' },
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: {
        id: true,
        accountId: true,
        projectId: true,
        correlationId: true,
        tool: true,
        maxCents: true,
        createdAt: true
      }
    })
  );
  app.get('/api/execution/tools', auth, () => tools);
  app.put('/api/admin/execution/accounts/:account', admin, async (r) => {
    const { account } = z.object({ account: z.string().min(1).max(128) }).parse(r.params);
    const data = z
      .object({
        limitCents: z.int().min(0).max(1000000000),
        enabled: z.boolean(),
        tools: z.array(toolSchema).max(4)
      })
      .strict()
      .parse(r.body);
    return prisma.$transaction(async (tx) => {
      const a = await tx.executionAccount.upsert({
        where: { userId: account },
        create: { userId: account, ...data },
        update: data
      });
      await tx.auditEvent.create({
        data: {
          actorId: r.currentUser!.id,
          targetType: 'execution_account',
          targetId: account,
          action: 'execution.policy_updated',
          metadata: data
        }
      });
      return a;
    });
  });
  app.post('/api/projects/:projectId/execution', auth, (r) =>
    propose(r.currentUser!.id, z.object({ projectId: z.string().max(128) }).parse(r.params).projectId, r.body)
  );
  app.get('/api/execution/:id', auth, async (r) => {
    const o = await prisma.executionOperation.findFirst({
      where: { id: id(r.params), accountId: r.currentUser!.id, project: { userId: r.currentUser!.id } }
    });
    if (!o) throw new HttpError(404, 'execution_not_found', 'Opération introuvable');
    return o;
  });
  app.post('/api/execution/:id/approve', auth, (r) =>
    approve(
      r.currentUser!.id,
      id(r.params),
      z
        .object({ digest: z.string().regex(/^[a-f0-9]{64}$/) })
        .strict()
        .parse(r.body).digest
    )
  );
  app.post('/api/execution/:id/cancel', auth, (r) => cancel(r.currentUser!.id, id(r.params)));
  app.post('/api/admin/execution/:id/resolve', admin, (r) => {
    const b = z.object({ cents: z.int().nonnegative(), evidence: z.uuid() }).strict().parse(r.body);
    return resolveIncident(r.currentUser!.id, id(r.params), b.cents, b.evidence);
  });
}
