import fs from 'node:fs';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { approvalInputSchema, correctionInputSchema } from '@vululu/contracts';
import type { ArtifactFile } from '@vululu/application';
import { rateLimitPreHandler, RATE_LIMITS } from '../infrastructure/security/rateLimiter';
import { actorOf, artifacts, bundles, durableStore, production } from '../application/container';

function sendVideo(request: FastifyRequest, reply: FastifyReply, file: string, size: number) {
  const range = request.headers.range;
  if (range) {
    const value = range.replace('bytes=', '');
    const parts = value.split('-');
    const start = Number(parts[0] || '0');
    const end = parts[1] ? Number(parts[1]) : size - 1;
    if (start >= 0 && end < size && start <= end) {
      reply.code(206);
      reply.header('Content-Range', 'bytes ' + start + '-' + end + '/' + size);
      reply.header('Accept-Ranges', 'bytes');
      reply.header('Content-Length', String(end - start + 1));
      reply.type('video/mp4');
      return reply.send(fs.createReadStream(file, { start, end }));
    }
  }
  reply.header('Content-Length', String(size));
  reply.header('Accept-Ranges', 'bytes');
  reply.type('video/mp4');
  return reply.send(fs.createReadStream(file));
}

async function sendArtifact(
  request: FastifyRequest,
  reply: FastifyReply,
  file: ArtifactFile
) {
  if (file.absolutePath) {
    return sendVideo(request, reply, file.absolutePath, file.size);
  }
  if (!file.openRead) {
    return reply.code(404).send({ error: 'artifact_not_found' });
  }
  const rangeHeader = request.headers.range;
  let range: { start: number; end: number } | undefined;
  if (rangeHeader) {
    const value = rangeHeader.replace('bytes=', '');
    const parts = value.split('-');
    const start = Number(parts[0] || '0');
    const end = parts[1] ? Number(parts[1]) : file.size - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end >= file.size || start > end) {
      return reply.code(416).header('Content-Range', 'bytes */' + file.size).send();
    }
    range = { start, end };
    reply.code(206);
    reply.header('Content-Range', 'bytes ' + start + '-' + end + '/' + file.size);
    reply.header('Content-Length', String(end - start + 1));
  } else {
    reply.header('Content-Length', String(file.size));
  }
  reply.header('Accept-Ranges', 'bytes');
  reply.type(file.contentType);
  try {
    return reply.send(await file.openRead(range));
  } catch {
    return reply.code(416).header('Content-Range', 'bytes */' + file.size).send();
  }
}

export async function productionRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/projects/:id/produce', { preHandler: [app.authenticate, rateLimitPreHandler(RATE_LIMITS.productionStart, (request) => 'produce:' + (request.currentUser?.id ?? 'anon') + ':' + String((request.params as { id?: string }).id ?? ''))] }, async (request, reply) => {
    const params = request.params as { id: string };
    const result = await production.startProduction(actorOf(request.currentUser), params.id, { traceId: request.traceId, requestId: request.requestId });
    return reply.code(202).send({ job: result.job, jobRun: result.jobRun });
  });

  app.get('/api/projects/:id/status', { preHandler: [app.authenticate] }, async (request) => {
    const params = request.params as { id: string };
    return bundles.get(actorOf(request.currentUser), params.id);
  });

  app.post('/api/projects/:id/scenes/:sceneKey/correct', { preHandler: [app.authenticate, rateLimitPreHandler(RATE_LIMITS.productionStart, (request) => 'correct:' + (request.currentUser?.id ?? 'anon') + ':' + String((request.params as { id?: string }).id ?? ''))] }, async (request, reply) => {
    const params = request.params as { id: string; sceneKey: string };
    const input = correctionInputSchema.parse(request.body);
    const result = await production.startCorrection(
      actorOf(request.currentUser),
      params.id,
      params.sceneKey,
      input.instruction,
      { traceId: request.traceId, requestId: request.requestId }
    );
    return reply.code(202).send({ job: result.job, jobRun: result.jobRun });
  });

  app.get('/api/projects/:id/scenes/:sceneKey/image', { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = request.params as { id: string; sceneKey: string };
    const file = await artifacts.getSceneImage(actorOf(request.currentUser), params.id, params.sceneKey);
    reply.header('Cache-Control', 'no-store');
    if (file.openRead) {
      reply.type(file.contentType);
      return reply.send(await file.openRead());
    }
    if (!file.absolutePath) return reply.code(404).send({ error: 'artifact_not_found' });
    reply.type(file.contentType);
    return reply.send(fs.createReadStream(file.absolutePath));
  });

  app.get('/api/projects/:id/master', { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = request.params as { id: string };
    const query = request.query as { version?: string };
    const requested = query.version ? Number(query.version) : undefined;
    const file = await artifacts.getMaster(actorOf(request.currentUser), params.id, requested);
    return sendArtifact(request, reply, file);
  });

  app.post('/api/projects/:id/approve', { preHandler: [app.authenticate, rateLimitPreHandler(RATE_LIMITS.productionApprove, (request) => 'approve:' + (request.currentUser?.id ?? 'anon') + ':' + String((request.params as { id?: string }).id ?? ''))] }, async (request) => {
    const params = request.params as { id: string };
    const input = approvalInputSchema.parse(request.body);
    return production.approve(
      actorOf(request.currentUser),
      params.id,
      input.artifactVersionId,
      input.checksum
    );
  });

  app.post('/api/projects/:id/transfer', { preHandler: [app.authenticate, rateLimitPreHandler(RATE_LIMITS.productionApprove, (request) => 'transfer:' + (request.currentUser?.id ?? 'anon') + ':' + String((request.params as { id?: string }).id ?? ''))] }, async (request, reply) => {
    const params = request.params as { id: string };
    const result = await production.transfer(actorOf(request.currentUser), params.id);
    return reply.code(202).send(result);
  });

  app.get('/api/projects/:id/runs/:jobRunId/evidence', { preHandler: [app.authenticate] }, async (request) => {
    const params = request.params as { id: string; jobRunId: string };
    const bundle = await bundles.get(actorOf(request.currentUser), params.id);
    const evidence = await durableStore.getRunEvidence(params.jobRunId);
    if (evidence.projectId !== bundle.project.id) {
      throw new Error('job_run_not_found');
    }
    return evidence;
  });

  app.get('/api/projects/:id/qa', { preHandler: [app.authenticate] }, async (request) => {
    const params = request.params as { id: string };
    return production.getQa(actorOf(request.currentUser), params.id);
  });
}