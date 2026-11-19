import type { FastifyInstance } from 'fastify';
import { prisma } from '@vululu/db';
import { Prisma } from '@prisma/client';
import { zipSync, strToU8 } from 'fflate';
import { buffer } from 'node:stream/consumers';
import { createHash } from 'node:crypto';
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
  app.get(base + '/destinations', auth, async (r) =>
    prisma.contentItem.findMany({
      where: { projectId: id.parse(r.params).id, userId: r.currentUser!.id, archived: false },
      select: { id: true, version: true, title: true, variants: true, offer: { select: { name: true } } },
      orderBy: { plannedAt: 'asc' }
    })
  );
  app.get('/api/campaigns/:id/creative-package', renderAuth, async (r, reply) => {
    const campaignId = id.parse(r.params).id,
      userId = r.currentUser!.id;
    const data = await withSlot(async () => {
      const rows = await prisma.creativeRevision.findMany({
        where: { project: { userId, campaignId, campaign: { userId } }, manifest: { not: Prisma.DbNull } },
        select: { projectId: true, version: true, spec: true },
        orderBy: { version: 'desc' }
      });
      const files: Record<string, Uint8Array> = {},
        seen = new Set<string>(),
        index: unknown[] = [];
      let total = 0;
      for (const row of rows) {
        const spec = creativeSpec.parse(row.spec),
          d = spec.delivery;
        if (!d) continue;
        const folder = [row.projectId, d.calendar?.itemId ?? 'project', d.platform, d.kind].join('/');
        if (seen.has(folder)) continue;
        seen.add(folder);
        const names = d.kind === 'carousel' ? spec.scenes.map((s) => s.key) : [undefined];
        for (const scene of names) {
          const f = await service.file(userId, row.projectId, row.version, scene);
          total += f.size;
          if (total > 100 * 1024 * 1024) throw new HttpError(413, 'package_limit', 'Le lot dépasse 100 Mio.');
          const bytes = await buffer(await f.openRead());
          if (createHash('sha256').update(bytes).digest('hex') !== f.sha256)
            throw new Error('creative_package_integrity');
          const name = `${folder}/v${row.version}-${scene ?? 'master'}.${f.contentType === 'image/png' ? 'png' : 'mp4'}`;
          files[name] = bytes;
          index.push({
            name,
            version: row.version,
            delivery: d,
            width: spec.width,
            height: spec.height,
            sha256: f.sha256
          });
        }
      }
      if (!index.length) throw new HttpError(404, 'empty_package', 'Aucune création rendue.');
      files['manifest.json'] = strToU8(JSON.stringify(index, null, 2));
      return Buffer.from(zipSync(files, { level: 0 }));
    });
    return reply
      .type('application/zip')
      .header('Content-Disposition', 'attachment; filename="campagne.zip"')
      .send(data);
  });
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
