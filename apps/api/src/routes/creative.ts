import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { creativeSpec, creativeWrite } from '@vululu/contracts';
import { creativeStudio as service } from '../application/container';
import { sendArtifact } from './production';
import { rateLimitPreHandler, RATE_LIMITS } from '../infrastructure/security/rateLimiter';
import { HttpError } from '../errors';

export async function creativeRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] };
  const base = '/api/projects/:id/creative',
    id = z.object({ id: z.string() }),
    revision = id.extend({ version: z.coerce.number().int().positive() });
  app.get(base, auth, (r) => service.history(r.currentUser!.id, id.parse(r.params).id));
  app.post(base, auth, (r) => {
    const b = creativeWrite.parse(r.body);
    return service.save(r.currentUser!.id, id.parse(r.params).id, b.expectedVersion, b.spec);
  });
  app.get(base + '/:version', auth, (r) => {
    const p = revision.parse(r.params);
    return service.get(r.currentUser!.id, p.id, p.version);
  });
  app.post(base + '/:version/restore', auth, (r) => {
    const p = revision.parse(r.params);
    return service.restore(
      r.currentUser!.id,
      p.id,
      p.version,
      z.object({ expectedVersion: z.int().nonnegative() }).parse(r.body).expectedVersion
    );
  });
  app.post(base + '/:version/approve', auth, (r) => {
    const p = revision.parse(r.params);
    return service.approve(
      r.currentUser!.id,
      p.id,
      p.version,
      z.object({ checksum: z.string().regex(/^[0-9a-f]{64}$/) }).parse(r.body).checksum
    );
  });
  // Bound native render work across preview and export, not just per account.
  let active = 0;
  const renderAuth = {
    preHandler: [
      app.authenticate,
      rateLimitPreHandler(RATE_LIMITS.productionStart, (r) => 'creative:' + r.currentUser!.id)
    ]
  };
  async function withSlot<T>(fn: () => Promise<T>) {
    if (active >= 2) throw new HttpError(429, 'creative_busy', 'Rendu en cours, réessayez.');
    active++;
    try {
      return await fn();
    } catch (e) {
      if (e instanceof Error && 'code' in e && e.code === 'media_text_overflow')
        throw new HttpError(422, 'creative_text_overflow', e.message);
      throw e;
    } finally {
      active--;
    }
  }
  app.post(base + '/preview', renderAuth, async (r, reply) => {
    const spec = creativeSpec.refine((s) => s.scenes.length === 1).parse(r.body);
    return reply
      .header('Cache-Control', 'private, no-store')
      .type('image/png')
      .send(await withSlot(() => service.preview(r.currentUser!.id, id.parse(r.params).id, spec)));
  });
  app.post(base + '/:version/render', renderAuth, (r) => {
    const p = revision.parse(r.params);
    return withSlot(() => service.render(r.currentUser!.id, p.id, p.version));
  });
  app.get(base + '/:version/master', auth, async (r, reply) => {
    const p = revision.parse(r.params);
    return sendArtifact(r, reply, await service.file(r.currentUser!.id, p.id, p.version));
  });
  app.get(base + '/:version/scenes/:key', auth, async (r, reply) => {
    const p = revision.extend({ key: z.string() }).parse(r.params);
    const f = await service.file(r.currentUser!.id, p.id, p.version, p.key);
    return reply.type('image/png').send(await f.openRead());
  });
}
