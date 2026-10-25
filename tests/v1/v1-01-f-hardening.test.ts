import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  const testDbUrl = 'postgresql://vululu@127.0.0.1:55432/vululu_v1_00_test?schema=public';
  process.env.V0_TEST_DB = '1';
  process.env.DATABASE_URL_TEST = testDbUrl;
  process.env.DATABASE_URL = testDbUrl;
});

import { prisma } from '@vululu/db';
import { env } from '../../apps/api/src/env';
import { createSession, purgeSessions, revokeAllUserSessions } from '../../apps/api/src/security/session';
import { isAllowedOrigin } from '../../apps/api/src/security/origin';
import { consumeRateLimit } from '../../apps/api/src/infrastructure/security/rateLimiter';
import { OpsMetricsService } from '../../apps/api/src/infrastructure/operations/opsMetrics';
import { RuntimeReconciliationService } from '../../apps/api/src/infrastructure/operations/runtimeReconciliation';
import { PrismaProductionRunRepository } from '../../apps/api/src/infrastructure';

const TEST_DB_URL = 'postgresql://vululu@127.0.0.1:55432/vululu_v1_00_test?schema=public';
const RUN_ID = 'f-' + Date.now();
const sha = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

beforeAll(async () => {
  execSync('pnpm exec prisma migrate deploy --schema packages/db/prisma/schema.prisma', {
    cwd: env.repoRoot,
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: 'pipe'
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('V1-01-F hardening session/rate-limit/observability', () => {
  it('revoque globalement les sessions et purge uniquement les sessions anciennes en dry-run', async () => {
    const user = await prisma.user.create({
      data: { email: 'f-session-' + RUN_ID + '@vululu.local', passwordHash: 'x', name: 'F', role: 'user' }
    });
    const created = await createSession(user.id);
    expect(created.tokenHash).toBeUndefined();
    const active = await prisma.session.findUnique({ where: { id: created.session.id } });
    expect(active?.tokenHash).toHaveLength(64);
    const revoked = await revokeAllUserSessions(user.id, 'test_revoke');
    expect(revoked).toBe(1);
    const after = await prisma.session.findUnique({ where: { id: created.session.id } });
    expect(after?.revokedAt).not.toBeNull();
    expect(after?.revokedReason).toBe('test_revoke');

    const old = await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: sha('old-' + RUN_ID),
        csrfHash: sha('csrf'),
        expiresAt: new Date(Date.now() - 40 * 24 * 3600_000),
        revokedAt: new Date(Date.now() - 40 * 24 * 3600_000)
      }
    });
    const dry = await purgeSessions({ retentionDays: 30, dryRun: true });
    expect(dry.deleted).toBe(0);
    expect(await prisma.session.findUnique({ where: { id: old.id } })).not.toBeNull();
    const applied = await purgeSessions({ retentionDays: 30, dryRun: false });
    expect(applied.deleted).toBeGreaterThanOrEqual(1);
    expect(await prisma.session.findUnique({ where: { id: old.id } })).toBeNull();
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('limite persistant par cle et fenetre', async () => {
    const key = 'test-rate:' + RUN_ID;
    const policy = { name: 'test', limit: 2, windowSeconds: 60 };
    expect((await consumeRateLimit(key, policy)).allowed).toBe(true);
    expect((await consumeRateLimit(key, policy)).allowed).toBe(true);
    const third = await consumeRateLimit(key, policy);
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSeconds).toBeGreaterThan(0);
    expect(await prisma.rateLimitCounter.count({ where: { key } })).toBe(1);
    await prisma.rateLimitCounter.deleteMany({ where: { key } });
  });


  it('revoque toutes les sessions via la route API protegee', async () => {
    const { buildServer } = await import('../../apps/api/src/server');
    const app = await buildServer();
    const user = await prisma.user.create({
      data: { email: 'f-route-' + RUN_ID + '@vululu.local', passwordHash: 'x', name: 'F route', role: 'user' }
    });
    const session = await createSession(user.id);
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/logout-all',
      headers: {
        cookie: 'session=' + session.token + '; vululu_csrf=' + session.csrfToken,
        'x-csrf-token': session.csrfToken
      }
    });
    expect(response.statusCode).toBe(200);
    const stored = await prisma.session.findUnique({ where: { id: session.session.id } });
    expect(stored?.revokedAt).not.toBeNull();
    expect(stored?.revokedReason).toBe('logout_all');
    await app.close();
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('valide les origines mutantes et la configuration de cookies', async () => {
    process.env.APP_ORIGIN = 'https://app.vululu.local';
    expect(isAllowedOrigin({ headers: {} } as never)).toBe(true);
    expect(isAllowedOrigin({ headers: { origin: 'https://app.vululu.local' } } as never)).toBe(true);
    expect(isAllowedOrigin({ headers: { origin: 'https://evil.example' } } as never)).toBe(false);
  });

  it('propage traceId et requestId dans JobRun et l outbox', async () => {
    const user = await prisma.user.create({
      data: { email: 'f-trace-' + RUN_ID + '@vululu.local', passwordHash: 'x', name: 'F trace', role: 'user' }
    });
    const context = await prisma.brandContext.create({ data: { userId: user.id, name: 'ctx', description: 'ctx' } });
    const project = await prisma.project.create({
      data: {
        userId: user.id,
        contextId: context.id,
        title: 'F trace',
        platform: 'Instagram',
        format: 'Video',
        objective: 'trace',
        brief: {
          create: {
            objective: 'o', audience: 'a', tone: 't', cta: 'c', platform: 'Instagram', format: 'Video', version: 1,
            revisions: { create: [{ version: 1, objective: 'o', audience: 'a', tone: 't', cta: 'c', platform: 'Instagram', format: 'Video', checksum: sha('brief') }] }
          }
        },
        scenes: {
          create: [1, 2, 3, 4, 5].map((position) => ({ sceneKey: 'SCENE-00' + position, position, title: 'S', description: 'D' }))
        }
      }
    });
    const repo = new PrismaProductionRunRepository(prisma);
    const run = await repo.startRun({
      userId: user.id,
      projectId: project.id,
      type: 'produce',
      targetSceneKey: null,
      instruction: null,
      steps: ['validate-snapshot'],
      outbox: { kind: 'start_run', payload: { projectId: project.id, type: 'produce' } },
      traceId: 'trace-' + RUN_ID,
      requestId: 'request-' + RUN_ID
    });
    const row = await prisma.jobRun.findUnique({ where: { id: run.jobRun.id } });
    expect(row?.traceId).toBe('trace-' + RUN_ID);
    expect(row?.requestId).toBe('request-' + RUN_ID);
    const outbox = await prisma.orchestrationOutbox.findFirst({ where: { jobRunId: run.jobRun.id } });
    expect(outbox?.traceId).toBe('trace-' + RUN_ID);
    expect(outbox?.requestId).toBe('request-' + RUN_ID);
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('expose metriques et reconciliation read-only', async () => {
    const worker = await prisma.workerHeartbeat.upsert({
      where: { id: 'f-worker-' + RUN_ID },
      update: { status: 'running', lastSeenAt: new Date() },
      create: { id: 'f-worker-' + RUN_ID, name: 'f-worker', status: 'running', lastSeenAt: new Date() }
    });
    const metrics = await new OpsMetricsService(prisma).snapshot();
    expect(metrics.database).toBe('ok');
    expect(metrics.workers.some((item) => item.id === worker.id)).toBe(true);
    const prometheus = OpsMetricsService.prometheus(metrics);
    expect(prometheus).toContain('vululu_workers_active');
    const report = await new RuntimeReconciliationService(prisma).report({ dryRun: true });
    expect(report.dryRun).toBe(true);
    expect(report.actions).toEqual([]);
    expect(report.note).toContain('approbation');
    await prisma.workerHeartbeat.delete({ where: { id: worker.id } });
    await expect(
      new RuntimeReconciliationService(prisma).report({ dryRun: false })
    ).resolves.toMatchObject({ dryRun: false });
  });
});