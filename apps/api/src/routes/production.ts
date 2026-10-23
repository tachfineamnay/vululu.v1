import fs from 'node:fs';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { approvalInputSchema, correctionInputSchema } from '@vululu/contracts';
import { HttpError } from '../errors';
import { artifactPath } from '../paths';
import { getProjectBundle } from '../services/projects';
import {
  approveMaster,
  getQa,
  startCorrection,
  startProduction,
  transferToPostiz
} from '../services/production';

function sendVideo(request: FastifyRequest, reply: FastifyReply, file: string) {
  const stat = fs.statSync(file);
  const range = request.headers.range;
  if (range) {
    const value = range.replace('bytes=', '');
    const parts = value.split('-');
    const start = Number(parts[0] || '0');
    const end = parts[1] ? Number(parts[1]) : stat.size - 1;
    if (start >= 0 && end < stat.size && start <= end) {
      reply.code(206);
      reply.header('Content-Range', 'bytes ' + start + '-' + end + '/' + stat.size);
      reply.header('Accept-Ranges', 'bytes');
      reply.header('Content-Length', String(end - start + 1));
      reply.type('video/mp4');
      return reply.send(fs.createReadStream(file, { start, end }));
    }
  }
  reply.header('Content-Length', String(stat.size));
  reply.header('Accept-Ranges', 'bytes');
  reply.type('video/mp4');
  return reply.send(fs.createReadStream(file));
}

export async function productionRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/projects/:id/produce', { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = request.params as { id: string };
    const job = await startProduction(request.currentUser!.id, params.id);
    return reply.code(202).send({ job });
  });

  app.get('/api/projects/:id/status', { preHandler: [app.authenticate] }, async (request) => {
    const params = request.params as { id: string };
    return getProjectBundle(request.currentUser!.id, params.id);
  });

  app.post('/api/projects/:id/scenes/:sceneKey/correct', { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = request.params as { id: string; sceneKey: string };
    const input = correctionInputSchema.parse(request.body);
    const job = await startCorrection(request.currentUser!.id, params.id, params.sceneKey, input.instruction);
    return reply.code(202).send({ job });
  });

  app.get('/api/projects/:id/scenes/:sceneKey/image', { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = request.params as { id: string; sceneKey: string };
    const bundle = await getProjectBundle(request.currentUser!.id, params.id);
    const scene = bundle.scenes.find((item) => item.sceneKey === params.sceneKey);
    if (!scene || scene.versions.length === 0) {
      throw new HttpError(404, 'image_not_found', 'Image de scene introuvable.');
    }
    const file = artifactPath(scene.versions[0].imagePath);
    if (!fs.existsSync(file)) {
      throw new HttpError(404, 'image_not_found', 'Fichier image introuvable.');
    }
    reply.header('Cache-Control', 'no-store');
    reply.type('image/png');
    return reply.send(fs.createReadStream(file));
  });

  app.get('/api/projects/:id/master', { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = request.params as { id: string };
    const query = request.query as { version?: string };
    const bundle = await getProjectBundle(request.currentUser!.id, params.id);
    const requested = query.version ? Number(query.version) : 0;
    const master = requested > 0
      ? bundle.masterVersions.find((item) => item.version === requested)
      : bundle.master;
    if (!master) {
      throw new HttpError(404, 'master_not_found', 'Master introuvable.');
    }
    const file = artifactPath(master.masterPath);
    if (!fs.existsSync(file)) {
      throw new HttpError(404, 'master_not_found', 'Fichier master introuvable.');
    }
    return sendVideo(request, reply, file);
  });

  app.post('/api/projects/:id/approve', { preHandler: [app.authenticate] }, async (request) => {
    const params = request.params as { id: string };
    const input = approvalInputSchema.parse(request.body);
    const approval = await approveMaster(
      request.currentUser!.id,
      params.id,
      input.artifactVersionId,
      input.checksum
    );
    return { approval };
  });

  app.post('/api/projects/:id/transfer', { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = request.params as { id: string };
    const transfer = await transferToPostiz(request.currentUser!.id, params.id);
    return reply.code(202).send({ transfer });
  });

  app.get('/api/projects/:id/qa', { preHandler: [app.authenticate] }, async (request) => {
    const params = request.params as { id: string };
    return getQa(request.currentUser!.id, params.id);
  });
}
