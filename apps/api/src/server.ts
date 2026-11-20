import './env';
import { assistantRoutes } from './routes/assistant';
import Fastify from 'fastify';
import type Stripe from 'stripe';
import cookie from '@fastify/cookie';
import { z } from 'zod';
import { ApplicationError } from '@vululu/application';
import { DomainError } from '@vululu/domain';
import { HttpError } from './errors';
import { registerAuth } from './auth';
import { isAllowedOrigin } from './security/origin';
import { logEvent, newTraceId, sanitizeRequestId } from './observability/logger';
import { authRoutes } from './routes/auth';
import { customerAccountRoutes } from './routes/customerAccount';
import { configuredAccountMail, type AccountMailTransport } from './infrastructure/email/accountMail';
import { adminRoutes } from './routes/admin';
import { adminReadRoutes } from './routes/adminRead';
import { adminAgentRoutes } from './routes/adminAgents';
import { contextRoutes } from './routes/contexts';
import { calendarRoutes } from "./routes/calendar";
import { campaignRoutes } from './routes/campaigns';
import { assetRoutes } from './routes/assets';
import { projectRoutes } from './routes/projects';
import { creativeRoutes } from "./routes/creative";
import {publishingRoutes} from './routes/publishing';
import {billingMessage} from './infrastructure/billing/messages';
import {billingRoutes,billingWebhook} from './routes/billing';
import {resultsRoutes} from './routes/results';
import {studioRoutes} from "./routes/studio";
import {mediaGenerationRoutes} from "./routes/mediaGeneration";
import {marketingRoutes} from "./routes/marketing";
import { executionRoutes } from './routes/execution';
import { productionRoutes } from './routes/production';
import { opsRoutes } from './routes/ops';
import { betaRoutes } from './routes/beta';
import { betaStatus } from './betaMode';

export async function buildServer({ accountMail = configuredAccountMail(), billingStripe }: { accountMail?: AccountMailTransport | null; billingStripe?: Stripe } = {}) {
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
      route: request.routeOptions?.url ?? 'unmatched',
      statusCode: reply.statusCode,
      durationMs: request.startAt ? Date.now() - request.startAt : undefined
    });
  });

  await registerAuth(app);

  app.setErrorHandler((error, request, reply) => {
    const respond = (statusCode: number, body: { error: string; message: string; issues?: unknown }) => {
      logEvent('error', 'http.request.failed', { requestId: request.requestId, traceId: request.traceId, method: request.method, route: request.routeOptions?.url ?? 'unmatched', statusCode, errorCode: body.error });
      return reply.code(statusCode).send(body);
    };
    const dbError = error as { name?: string; message?: string };
    if (dbError.name?.startsWith('PrismaClient')) {
      const code = ['billing_quota_exhausted', 'billing_plan_required', 'billing_suspended',
        'billing_key_conflict', 'billing_render_already_reserved'].find(c => dbError.message?.includes(c));
      if (code) return respond(code === 'billing_suspended' ? 403 : 409, { error: code, message: billingMessage(code) });
    }
    if (error instanceof HttpError) {
      return respond(error.statusCode, { error: error.code, message: error.message });
    }
    if (error instanceof ApplicationError) {
      return respond(error.statusCode, { error: error.code, message: error.message });
    }
    if (error instanceof DomainError) {
      return respond(400, { error: 'domain_validation', message: error.message });
    }
    if (error instanceof z.ZodError) {
      return respond(400, {
        error: 'validation_error',
        message: 'Donnees invalides.',
        issues: error.issues
      });
    }
    const fastifyError = error as { statusCode?: number; code?: string };
    const statusCode = typeof fastifyError.statusCode === 'number' ? fastifyError.statusCode : 500;
    if (statusCode >= 400 && statusCode < 500) {
      return respond(statusCode, {
        error: fastifyError.code || 'request_error',
        message: statusCode === 400 ? 'Requete invalide.' : 'Requete refusee.'
      });
    }
    request.log.error(error);
    return respond(500, { error: 'internal_error', message: 'Erreur interne.' });
  });

  await app.register(betaRoutes);
  await app.register(billingRoutes, { stripe: billingStripe });
  await app.register(billingWebhook);
  await app.register(resultsRoutes);
  await app.register(authRoutes);
  await app.register(customerAccountRoutes, { mail: accountMail });
  await app.register(adminRoutes);
  await app.register(adminReadRoutes);
  await app.register(adminAgentRoutes);
  await app.register(contextRoutes);
  await app.register(campaignRoutes);
  await app.register(calendarRoutes);
  await app.register(assetRoutes);
  await app.register(projectRoutes);
  await app.register(productionRoutes);
  await app.register(creativeRoutes);
  await app.register(executionRoutes);
  await app.register(marketingRoutes);
  await app.register(assistantRoutes);
  await app.register(mediaGenerationRoutes);
  await app.register(studioRoutes);
  await app.register(publishingRoutes);
  await app.register(opsRoutes);

  app.get('/api/health', async () => {
    // Le mode est publié pour la supervision : il n'ouvre aucun droit.
    return { status: 'ok', service: 'vululu-api', version: 'v1', beta: betaStatus().beta };
  });

  return app;
}
