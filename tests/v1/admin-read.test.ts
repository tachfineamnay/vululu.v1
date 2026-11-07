import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const testDbUrl = 'postgresql://vululu@127.0.0.1:55432/vululu_v1_00_test?schema=public';
process.env.V0_TEST_DB = '1';
process.env.DATABASE_URL_TEST = testDbUrl;
process.env.DATABASE_URL = testDbUrl;

let app: any;
let prisma: any;

const stamp = crypto.randomUUID().slice(0, 8);
const adminEmail = 'admin-read-' + stamp + '@vululu.local';
const userEmail = 'user-read-' + stamp + '@vululu.local';
const password = 'admin-read-password';
let adminId = '';
let userId = '';
let contextId = '';
let projectId = '';
let jobRunId = '';
let invitationId = '';

type Auth = { cookie: string; csrfToken: string };

async function login(email: string): Promise<Auth> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password }
  });
  expect(response.statusCode).toBe(200);
  const raw = response.headers['set-cookie'];
  const headers = raw ? (Array.isArray(raw) ? raw : [raw]) : [];
  const sessionCookie = headers
    .map((value: string) => value.split(';')[0])
    .find((value: string) => value.startsWith('session=')) || '';
  const csrfCookie = headers
    .map((value: string) => value.split(';')[0])
    .find((value: string) => value.startsWith('vululu_csrf=')) || '';
  const body = response.json();
  return { cookie: sessionCookie + '; ' + csrfCookie, csrfToken: body.csrfToken };
}

function get(url: string, auth?: Auth) {
  return app.inject({
    method: 'GET',
    url,
    headers: auth ? { cookie: auth.cookie, 'x-csrf-token': auth.csrfToken } : {}
  });
}

const adminReadRoutes = [
  '/api/admin/overview',
  '/api/admin/users',
  '/api/admin/projects',
  '/api/admin/runs',
  '/api/admin/runs/' + 'missing-run',
  '/api/admin/audit',
  '/api/admin/costs',
  '/api/admin/routing-decisions',
  '/api/admin/runtime'
];

describe('Admin V1 — lectures reservees, RBAC et DTO', () => {
  beforeAll(async () => {
    execSync('pnpm exec prisma migrate deploy --schema packages/db/prisma/schema.prisma', {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: testDbUrl },
      stdio: 'pipe'
    });
    const serverModule = await import('../../apps/api/src/server');
    const dbModule = await import('@vululu/db');
    prisma = dbModule.prisma;
    app = await serverModule.buildServer();

    const passwordHash = await bcrypt.hash(password, 4);
    const admin = await prisma.user.create({
      data: { email: adminEmail, passwordHash, name: 'Admin Read', role: 'super_admin' }
    });
    const user = await prisma.user.create({
      data: { email: userEmail, passwordHash, name: 'User Read', role: 'user' }
    });
    adminId = admin.id;
    userId = user.id;

    const context = await prisma.brandContext.create({
      data: { userId, name: 'Contexte admin ' + stamp, description: 'Contexte de test admin.' }
    });
    contextId = context.id;
    const project = await prisma.project.create({
      data: {
        userId,
        contextId,
        title: 'Projet admin ' + stamp,
        platform: 'Instagram',
        format: 'Video',
        objective: 'Tester les lectures admin.'
      }
    });
    projectId = project.id;
    const jobRun = await prisma.jobRun.create({
      data: {
        projectId,
        type: 'produce',
        status: 'failed',
        traceId: 'trace-admin-' + stamp,
        steps: {
          create: [
            { name: 'render-scenes', status: 'failed', attempts: 2, error: 'render_failed' },
            { name: 'qa', status: 'pending' }
          ]
        }
      }
    });
    jobRunId = jobRun.id;
    await prisma.orchestrationOutbox.create({
      data: {
        idempotencyKey: 'start:' + jobRunId,
        jobRunId,
        kind: 'start_run',
        payload: { projectId },
        status: 'failed',
        attempts: 3,
        lastError: 'hatchet_unreachable'
      }
    });
    await prisma.auditEvent.create({
      data: { actorId: adminId, action: 'test.admin_read_' + stamp, targetType: 'project', targetId: projectId, metadata: { stamp } }
    });
    await prisma.costEvent.create({
      data: { projectId, jobRunId, provider: 'mock-a', model: 'mock-a-primary', units: 1, amountCents: 5 }
    });
    await prisma.routingDecision.create({
      data: {
        capabilityKey: 'scene.generate',
        candidateModelIds: ['mock-a-primary'],
        selectedModelId: 'mock-a-primary',
        fallbackModelId: null,
        criteria: { quality: 90 },
        reason: 'test-' + stamp
      }
    });
    const invitation = await prisma.invitation.create({
      data: {
        email: 'invite-' + stamp + '@vululu.local',
        role: 'user',
        tokenHash: 'hash-' + stamp,
        createdBy: adminId,
        expiresAt: new Date(Date.now() + 3600_000)
      }
    });
    invitationId = invitation.id;
  });

  afterAll(async () => {
    try {
      await prisma.routingDecision.deleteMany({ where: { reason: 'test-' + stamp } });
      await prisma.costEvent.deleteMany({ where: { jobRunId } });
      await prisma.auditEvent.deleteMany({ where: { action: 'test.admin_read_' + stamp } });
      await prisma.orchestrationOutbox.deleteMany({ where: { jobRunId } });
      await prisma.jobRun.deleteMany({ where: { id: jobRunId } });
      await prisma.project.deleteMany({ where: { id: projectId } });
      await prisma.brandContext.deleteMany({ where: { id: contextId } });
      await prisma.invitation.deleteMany({ where: { id: invitationId } });
      await prisma.session.deleteMany({ where: { userId: { in: [adminId, userId] } } });
      await prisma.user.deleteMany({ where: { id: { in: [adminId, userId] } } });
    } catch {
      // Cleanup best-effort : la base de test est isolee.
    }
    await app.close();
    await prisma.$disconnect();
  });

  it('refuse toutes les lectures admin sans session (401)', async () => {
    for (const route of adminReadRoutes) {
      const response = await get(route);
      expect(response.statusCode, route).toBe(401);
    }
  });

  it('refuse toutes les lectures admin a un utilisateur non super_admin (403)', async () => {
    const auth = await login(userEmail);
    for (const route of adminReadRoutes) {
      const response = await get(route, auth);
      expect(response.statusCode, route).toBe(403);
    }
    const opsHealth = await get('/api/ops/health', auth);
    expect(opsHealth.statusCode).toBe(403);
  });

  it('sert overview au super_admin avec modes explicites et sans secret', async () => {
    const auth = await login(adminEmail);
    const response = await get('/api/admin/overview', auth);
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.database).toBe('ok');
    expect(body.counts.users).toBeGreaterThanOrEqual(2);
    expect(body.counts.projects).toBeGreaterThanOrEqual(1);
    expect(body.runsByStatus.failed).toBeGreaterThanOrEqual(1);
    expect(body.orchestrator.mode).toBe('local');
    expect(body.providers.mode).toBe('MOCK');
    expect(body.postiz.mode).toBe('MOCK');
    const flagKeys = body.flags.map((flag: { key: string }) => flag.key);
    expect(flagKeys).toContain('mcp');
    expect(flagKeys).toContain('admin.ui');
    expect(body.recentErrors.length).toBeGreaterThanOrEqual(1);
    const text = JSON.stringify(body);
    expect(text).not.toContain('passwordHash');
    expect(text).not.toContain('tokenHash');
    expect(text).not.toContain('csrfHash');
    expect(text).not.toContain('SESSION_SECRET');
  });

  it('liste et pagine les utilisateurs sans hash', async () => {
    const auth = await login(adminEmail);
    const first = await get('/api/admin/users?page=1&pageSize=1', auth);
    expect(first.statusCode).toBe(200);
    const body = first.json();
    expect(body.items.length).toBe(1);
    expect(body.page).toBe(1);
    expect(body.total).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(body)).not.toContain('passwordHash');
    const search = await get('/api/admin/users?q=' + encodeURIComponent(stamp), auth);
    expect(search.statusCode).toBe(200);
    expect(search.json().items.length).toBeGreaterThanOrEqual(1);
  });

  it('liste projets et runs, detail de run, outbox et etapes', async () => {
    const auth = await login(adminEmail);
    const projects = await get('/api/admin/projects?q=' + encodeURIComponent(stamp), auth);
    expect(projects.statusCode).toBe(200);
    expect(projects.json().items[0].ownerEmail).toBe(userEmail);
    expect(projects.json().items[0].runsCount).toBeGreaterThanOrEqual(1);

    const runs = await get('/api/admin/runs?status=failed', auth);
    expect(runs.statusCode).toBe(200);
    const run = runs.json().items.find((item: { id: string }) => item.id === jobRunId);
    expect(run).toBeTruthy();
    expect(run.traceId).toBe('trace-admin-' + stamp);
    expect(run.stepsFailed).toBe(1);

    const detail = await get('/api/admin/runs/' + jobRunId, auth);
    expect(detail.statusCode).toBe(200);
    const body = detail.json();
    expect(body.steps.length).toBe(2);
    expect(body.outbox.length).toBe(1);
    expect(body.outbox[0].status).toBe('failed');
    expect(JSON.stringify(body)).not.toContain('passwordHash');
  });

  it('renvoie 404 explicite pour un run inconnu', async () => {
    const auth = await login(adminEmail);
    const response = await get('/api/admin/runs/does-not-exist', auth);
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe('job_run_not_found');
  });

  it('liste audit, couts mock et decisions de routage', async () => {
    const auth = await login(adminEmail);
    const audit = await get('/api/admin/audit?action=test.admin_read_' + stamp, auth);
    expect(audit.statusCode).toBe(200);
    expect(audit.json().items.length).toBeGreaterThanOrEqual(1);

    const costs = await get('/api/admin/costs', auth);
    expect(costs.statusCode).toBe(200);
    const costBody = costs.json();
    expect(costBody.mode).toBe('MOCK');
    expect(costBody.totalCents).toBeGreaterThanOrEqual(5);
    expect(costBody.byProvider.length).toBeGreaterThanOrEqual(1);

    const routing = await get('/api/admin/routing-decisions', auth);
    expect(routing.statusCode).toBe(200);
    expect(routing.json().items.length).toBeGreaterThanOrEqual(1);
  });

  it('expose runtime sans secret et avec budgets configurables', async () => {
    const auth = await login(adminEmail);
    const response = await get('/api/admin/runtime', auth);
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(['local', 'hatchet']).toContain(body.orchestratorMode);
    expect(['local', 's3']).toContain(body.storageBackend);
    expect(body.flags.some((flag: { key: string }) => flag.key === 'postiz.real')).toBe(true);
    const text = JSON.stringify(body);
    expect(text).not.toContain('SESSION_SECRET');
    expect(text).not.toContain('S3_SECRET');
  });

  it('valide les parametres de pagination et de filtre', async () => {
    const auth = await login(adminEmail);
    const invalidPage = await get('/api/admin/users?page=0&pageSize=500', auth);
    expect(invalidPage.statusCode).toBe(400);
    const invalidDate = await get('/api/admin/audit?from=not-a-date', auth);
    expect(invalidDate.statusCode).toBe(200);
  });
});
