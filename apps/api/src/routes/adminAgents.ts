import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { actorOf, agentConfigs, providerCatalog, routing } from '../application/container';
import { rateLimitPreHandler, RATE_LIMITS } from '../infrastructure/security/rateLimiter';

const capabilityRequirementSchema = z.object({
  capabilityKey: z.string().min(1),
  maxCostCents: z.number().int().nonnegative().optional(),
  minQuality: z.number().int().min(0).max(100).optional(),
  maxLatencyMs: z.number().int().nonnegative().optional(),
  allowedLicenses: z.array(z.enum(['internal', 'commercial', 'unknown'])).optional()
});

const agentSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  role: z.enum(['director', 'specialist', 'validator']),
  capabilityRequirements: z.array(capabilityRequirementSchema).min(1)
});

const configSchema = z.object({
  soul: z.string().min(1),
  instructions: z.string().min(1),
  guardrails: z.array(z.string().min(1))
});

const configSelectionSchema = z.object({ configVersionId: z.string().min(1) });

const providerSchema = z.object({ key: z.string().min(1), name: z.string().min(1) });

const modelSchema = z.object({
  providerKey: z.string().min(1),
  modelKey: z.string().min(1),
  capabilityKeys: z.array(z.string().min(1)).min(1),
  quality: z.number().int().min(0).max(100),
  latencyMs: z.number().int().nonnegative(),
  costCentsPerUnit: z.number().int().nonnegative(),
  license: z.enum(['internal', 'commercial', 'unknown']),
  qualified: z.boolean().default(false)
});

const activeSchema = z.object({ active: z.boolean() });
const qualificationSchema = z.object({ qualified: z.boolean() });

const routingPreviewSchema = z.object({
  requirement: capabilityRequirementSchema,
  budgetCents: z.number().int().nonnegative().optional()
});

const routingExecuteSchema = routingPreviewSchema.extend({
  input: z.record(z.string(), z.unknown()).default({}),
  projectId: z.string().optional(),
  jobRunId: z.string().optional()
});

/**
 * API super-admin du registre agentique.
 * Aucun appel provider reel : routage et fallback sont deterministes et traces.
 */
export async function adminAgentRoutes(app: FastifyInstance): Promise<void> {
  const superAdminOnly = { preHandler: [app.authenticate, app.requireSuperAdmin] };

  app.get('/api/admin/agents', superAdminOnly, async (request) => {
    const items = await agentConfigs.list(actorOf(request.currentUser));
    return { items };
  });

  app.post('/api/admin/agents', superAdminOnly, async (request, reply) => {
    const input = agentSchema.parse(request.body);
    const agent = await agentConfigs.create(actorOf(request.currentUser), input);
    return reply.code(201).send({ agent });
  });

  app.get('/api/admin/agents/:id/configs', superAdminOnly, async (request) => {
    const params = request.params as { id: string };
    const items = await agentConfigs.listConfigs(actorOf(request.currentUser), params.id);
    return { items };
  });

  app.post('/api/admin/agents/:id/configs', superAdminOnly, async (request, reply) => {
    const params = request.params as { id: string };
    const input = configSchema.parse(request.body);
    const config = await agentConfigs.addConfig(actorOf(request.currentUser), params.id, input);
    return reply.code(201).send({ config });
  });

  app.post('/api/admin/agents/:id/promote', superAdminOnly, async (request) => {
    const params = request.params as { id: string };
    const input = configSelectionSchema.parse(request.body);
    const agent = await agentConfigs.promote(
      actorOf(request.currentUser),
      params.id,
      input.configVersionId
    );
    return { agent };
  });

  app.post('/api/admin/agents/:id/rollback', superAdminOnly, async (request) => {
    const params = request.params as { id: string };
    const input = configSelectionSchema.parse(request.body);
    const agent = await agentConfigs.rollback(
      actorOf(request.currentUser),
      params.id,
      input.configVersionId
    );
    return { agent };
  });

  app.get('/api/admin/providers', superAdminOnly, async (request) => {
    const items = await providerCatalog.listProviders(actorOf(request.currentUser));
    return { items };
  });

  app.post('/api/admin/providers', superAdminOnly, async (request, reply) => {
    const input = providerSchema.parse(request.body);
    const provider = await providerCatalog.registerProvider(actorOf(request.currentUser), input);
    return reply.code(201).send({ provider });
  });

  app.post('/api/admin/providers/:key/active', superAdminOnly, async (request) => {
    const params = request.params as { key: string };
    const input = activeSchema.parse(request.body);
    const provider = await providerCatalog.setProviderActive(
      actorOf(request.currentUser),
      params.key,
      input.active
    );
    return { provider };
  });

  app.get('/api/admin/models', superAdminOnly, async (request) => {
    const query = request.query as { capability?: string };
    const items = await providerCatalog.listModels(query.capability);
    return { items };
  });

  app.post('/api/admin/models', superAdminOnly, async (request, reply) => {
    const input = modelSchema.parse(request.body);
    const model = await providerCatalog.registerModel(actorOf(request.currentUser), input);
    return reply.code(201).send({ model });
  });

  app.post('/api/admin/models/:id/active', superAdminOnly, async (request) => {
    const params = request.params as { id: string };
    const input = activeSchema.parse(request.body);
    return { model: await providerCatalog.setModelActive(actorOf(request.currentUser), params.id, input.active) };
  });

  app.post('/api/admin/models/:id/qualification', superAdminOnly, async (request) => {
    const params = request.params as { id: string };
    const input = qualificationSchema.parse(request.body);
    return { model: await providerCatalog.qualifyModel(actorOf(request.currentUser), params.id, input.qualified) };
  });

  app.post('/api/admin/routing/execute', { preHandler: [app.authenticate, app.requireSuperAdmin, rateLimitPreHandler(RATE_LIMITS.routing, (request) => 'routing-execute:' + (request.currentUser?.id ?? 'anon'))] }, async (request) => {
    const input = routingExecuteSchema.parse(request.body);
    return routing.execute(
      actorOf(request.currentUser),
      input.requirement,
      input.input,
      { budgetCents: input.budgetCents, projectId: input.projectId, jobRunId: input.jobRunId }
    );
  });

  app.post('/api/admin/routing/preview', { preHandler: [app.authenticate, app.requireSuperAdmin, rateLimitPreHandler(RATE_LIMITS.routing, (request) => 'routing-preview:' + (request.currentUser?.id ?? 'anon'))] }, async (request) => {
    const input = routingPreviewSchema.parse(request.body);
    const decision = await routing.preview(
      actorOf(request.currentUser),
      input.requirement,
      input.budgetCents
    );
    return { decision };
  });
}