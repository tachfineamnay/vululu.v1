import './env';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { z } from 'zod';
import { ApplicationError } from '@vululu/application';
import { DomainError } from '@vululu/domain';
import { HttpError } from './errors';
import { registerAuth } from './auth';
import { isAllowedOrigin } from './security/origin';
import { logEvent, newTraceId, sanitizeRequestId } from './observability/logger';
import { authRoutes } from './routes/auth';
import { adminRoutes } from './routes/admin';
import { adminAgentRoutes } from './routes/adminAgents';
import { contextRoutes } from './routes/contexts';
import { projectRoutes } from './routes/projects';
import { productionRoutes } from './routes/production';
import { opsRoutes } from './routes/ops';

export async function buildServer() {
  const app = Fastify({
    logger: false,
    bodyLimit: 8 * 1024 * 1024,
    trustProxy: process.env.TRUST_PROXY === 'true'
  });

  await app.register(cookie);

  app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    const text = body.toString();
    if (text.length === 0) {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(text));
    } catch {
      const parseError = new Error('Corps JSON invalide.') as Error & { statusCode: number; code: string };
      parseError.statusCode = 400;
      parseError.code = 'invalid_json';
      done(parseError, undefined);
    }
  });

  app.addHook('onRequest', async (request, reply) => {
    const incomingTrace = request.headers['x-trace-id'];
    const incomingRequest = request.headers['x-request-id'];
    request.traceId = typeof incomingTrace === 'string' && incomingTrace.length > 0
      ? sanitizeRequestId(incomingTrace)
      : newTraceId();
    request.requestId = typeof incomingRequest === 'string' && incomingRequest.length > 0
      ? sanitizeRequestId(incomingRequest)
      : newTraceId();
    request.startAt = Date.now();
    reply.header('x-trace-id', request.traceId);
    reply.header('x-request-id', request.requestId);
    if (!isAllowedOrigin(request) && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method)) {
      return reply.code(403).send({ error: 'origin_invalid', message: 'Origine non autorisee.' });
    }
  });

  app.addHook('onResponse', async (request, reply) => {
    logEvent('info', 'http.request.completed', {
      requestId: request.requestId,
      traceId: request.traceId,
      method: request.method,
      route: request.routeOptions?.url ?? request.url,
      statusCode: reply.statusCode,
      durationMs: request.startAt ? Date.now() - request.startAt : undefined
    });
  });

  await registerAuth(app);

  app.setErrorHandler((error, request, reply) => {
    logEvent('error', 'http.request.failed', {
      requestId: request.requestId,
      traceId: request.traceId,
      method: request.method,
      route: request.routeOptions?.url ?? request.url,
      statusCode: (error as { statusCode?: number }).statusCode ?? 500,
      errorCode: (error as { code?: string }).code ?? 'internal_error'
    });
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({ error: error.code, message: error.message });
    }
    if (error instanceof ApplicationError) {
      return reply.code(error.statusCode).send({ error: error.code, message: error.message });
    }
    if (error instanceof DomainError) {
      return reply.code(400).send({ error: 'domain_validation', message: error.message });
    }
    if (error instanceof z.ZodError) {
      return reply.code(400).send({
        error: 'validation_error',
        message: 'Donnees invalides.',
        issues: error.issues
      });
    }
    const fastifyError = error as { statusCode?: number; code?: string };
    const statusCode = typeof fastifyError.statusCode === 'number' ? fastifyError.statusCode : 500;
    if (statusCode >= 400 && statusCode < 500) {
      return reply.code(statusCode).send({
        error: fastifyError.code || 'request_error',
        message: statusCode === 400 ? 'Requete invalide.' : 'Requete refusee.'
      });
    }
    request.log.error(error);
    return reply.code(500).send({ error: 'internal_error', message: 'Erreur interne.' });
  });

  await app.register(authRoutes);
  await app.register(adminRoutes);
  await app.register(adminAgentRoutes);
  await app.register(contextRoutes);
  await app.register(projectRoutes);
  await app.register(productionRoutes);
  await app.register(opsRoutes);

  app.get('/api/health', async () => {
    return { status: 'ok', service: 'vululu-api', version: 'v1' };
  });

  return app;
}