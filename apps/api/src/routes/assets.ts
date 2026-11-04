import type { FastifyInstance, FastifyRequest } from 'fastify';
import { MAX_ASSET_BYTES } from '@vululu/domain';
import { assetUploadSchema, assetSelectionSchema } from '@vululu/contracts';
import { actorOf, assets } from '../application/container';
import { HttpError } from '../errors';
import { parseByteRange } from '../infrastructure/http/byteRange';
import { rateLimitPreHandler } from '../infrastructure/security/rateLimiter';

export async function assetRoutes(app: FastifyInstance) {
  const authenticated = { preHandler: [app.authenticate] };
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: MAX_ASSET_BYTES }, (_request, body, done) => done(null, body));
  // Limite de mémoire par processus ; le débit par utilisateur reste persistant en DB.
  const active = new WeakSet<FastifyRequest>(); let imports = 0;
  const release = async (request: FastifyRequest) => { if (active.delete(request)) imports--; };
  app.addHook('onResponse', release);
  app.addHook('onRequestAbort', release);
  app.addHook('onTimeout', release);
  app.post('/api/contexts/:id/assets', {
    bodyLimit: MAX_ASSET_BYTES,
    onRequest: [app.authenticate, rateLimitPreHandler({ name: 'asset-upload', limit: 30, windowSeconds: 60, failClosed: true }, (r) => 'asset-upload:' + r.currentUser!.id), async (request) => {
      if (imports >= 2) throw new HttpError(429, 'asset_upload_busy', 'Deux imports sont déjà en cours. Réessayez.');
      const header = request.headers['x-asset-metadata'];
      if (typeof header !== 'string' || header.length > 8192) throw new HttpError(400, 'asset_metadata_invalid', 'Métadonnées manquantes ou trop longues.');
      try { assetUploadSchema.parse(JSON.parse(decodeURIComponent(header))); }
      catch { throw new HttpError(400, 'asset_metadata_invalid', 'Métadonnées invalides.'); }
      imports++; active.add(request);
    }]
  }, async (request, reply) => {
    if (!Buffer.isBuffer(request.body) || request.headers['content-type']?.split(';')[0] !== 'application/octet-stream') throw new HttpError(415, 'asset_binary_required', 'Un fichier binaire est requis.');
    const input = assetUploadSchema.parse(JSON.parse(decodeURIComponent(request.headers['x-asset-metadata'] as string)));
    const version = await assets.upload(actorOf(request.currentUser), (request.params as { id: string }).id, input, request.body);
    return reply.code(201).send({ version });
  });
  app.get('/api/contexts/:id/assets', authenticated, async (request) => ({ items: await assets.list(actorOf(request.currentUser), (request.params as { id: string }).id) }));
  app.get('/api/assets/:id', authenticated, async (request) => ({ asset: await assets.get(actorOf(request.currentUser), (request.params as { id: string }).id) }));
  app.get('/api/assets/:id/versions/:versionId/content', authenticated, async (request, reply) => {
    const { id, versionId } = request.params as { id: string; versionId: string };
    const file = await assets.content(actorOf(request.currentUser), id, versionId);
    const range = parseByteRange(request.headers.range, file.version.sizeBytes);
    reply.header('Cache-Control', 'private, no-store').header('X-Content-Type-Options', 'nosniff').header('Content-Security-Policy', "default-src 'none'; sandbox");
    if (range === null) return reply.code(416).header('Content-Range', 'bytes */' + file.version.sizeBytes).send();
    reply.type(file.version.mimeType).header('Accept-Ranges', 'bytes');
    if (file.version.kind === 'document' || file.version.kind === 'font') reply.header('Content-Disposition', 'attachment; filename="asset-' + file.version.version + '"');
    if (range) reply.code(206).header('Content-Range', `bytes ${range.start}-${range.end}/${file.version.sizeBytes}`).header('Content-Length', String(range.end - range.start + 1));
    else reply.header('Content-Length', String(file.version.sizeBytes));
    return reply.send(await file.openRead(range));
  });
  app.get('/api/projects/:id/assets', authenticated, async (request) => assets.selection(actorOf(request.currentUser), (request.params as { id: string }).id));
  app.put('/api/projects/:id/assets', authenticated, async (request) => {
    const input = assetSelectionSchema.parse(request.body);
    return assets.select(actorOf(request.currentUser), (request.params as { id: string }).id, input.usage, input.versionIds);
  });
}
