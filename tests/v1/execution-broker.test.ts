import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
vi.hoisted(() => {
  const url = new URL(
    process.env.DATABASE_URL_TEST || 'postgresql://vululu@127.0.0.1:55432/vululu_v1_00_test'
  );
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !url.pathname.endsWith('_test'))
    throw Error('disposable local DB required');
  process.env.DATABASE_URL = url.href;
  process.env.SESSION_SECRET = crypto.randomUUID();
  process.env.APP_ENV = 'test';
});
import { prisma } from '@vululu/db';
import {
  approve,
  cancel,
  execute,
  propose,
  recover,
  resolveIncident
} from '../../apps/api/src/infrastructure/execution/broker';
import { catalogForAccount, tools, type Tool } from '../../apps/api/src/infrastructure/execution/registry';
import { loadOperationResult } from '../../apps/api/src/infrastructure/execution/operationResults';
import { isResultPayloadReference } from '../../apps/api/src/infrastructure/execution/resultPayload';
let actor: string, admin: string, project: string;
const make = (key: string = randomUUID(), tool: Tool = 'sandbox.generate@1') =>
  propose(actor, project, { key, tool, revision: 1 });
const wallet = () => prisma.executionAccount.findUniqueOrThrow({ where: { userId: actor } });
beforeEach(async () => {
  actor = randomUUID();
  admin = randomUUID();
  project = randomUUID();
  await prisma.user.createMany({
    data: [actor, admin].map((id) => ({
      id,
      email: id + '@example.test',
      name: 'QA',
      passwordHash: 'unused',
      role: id === admin ? 'super_admin' : 'user'
    }))
  });
  const ctx = await prisma.brandContext.create({ data: { userId: actor, name: 'QA', description: 'test' } });
  await prisma.project.create({
    data: {
      id: project,
      userId: actor,
      contextId: ctx.id,
      title: 'QA',
      format: 'Video',
      platform: 'Instagram',
      objective: 'test'
    }
  });
  await prisma.creativeRevision.create({ data: { projectId: project, version: 1, spec: {} } });
  await prisma.executionAccount.create({
    data: { userId: actor, limitCents: 10, enabled: true, tools: Object.keys(tools) }
  });
});
afterEach(async () => {
  await prisma.executionOperation.deleteMany({ where: { accountId: actor } });
  await prisma.executionAccount.deleteMany({ where: { userId: actor } });
  await prisma.auditEvent.deleteMany({
    where: { OR: [{ actorId: { in: [actor, admin] } }, { targetId: project }] }
  });
  await prisma.user.deleteMany({ where: { id: { in: [actor, admin] } } });
});
it('serializes duplicate proposals, competing reservations and worker redelivery', async () => {
  const key = randomUUID();
  const duplicates = await Promise.all(Array.from({ length: 8 }, () => make(key)));
  expect(new Set(duplicates.map((o) => o.id)).size).toBe(1);
  await expect(make(key, 'studio.render@1')).rejects.toMatchObject({ code: 'key_payload_conflict' });
  const jobs = [duplicates[0], await make(), await make()];
  const results = await Promise.allSettled(jobs.map((o) => approve(actor, o.id, o.digest)));
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  for (const r of results) if (r.status === 'rejected') expect(r.reason.code).toBe('budget_exhausted');
  expect((await wallet()).reservedCents).toBe(10);
  const queued = await prisma.executionOperation.findFirstOrThrow({
    where: { accountId: actor, state: 'QUEUED' }
  });
  let charges = 0;
  await Promise.all(
    Array.from({ length: 6 }, () =>
      execute(queued.id, {
        async invoke() {
          charges++;
          return { costCents: 7, costBasis: 'configured_estimate' };
        }
      })
    )
  );
  expect(charges).toBe(1);
  expect(await wallet()).toMatchObject({ reservedCents: 0, spentCents: 7 });
});
it('requires exact scope, approved publication, enabled tool, explicit approval and cancellable reservation', async () => {
  const o = await make();
  await execute(o.id, {
    invoke: () => {
      throw Error('unapproved');
    }
  });
  expect((await wallet()).reservedCents).toBe(0);
  await expect(make(undefined, 'sandbox.publish@1')).rejects.toMatchObject({
    code: 'content_approval_required'
  });
  await expect(approve(admin, o.id, o.digest)).rejects.toMatchObject({ statusCode: 404 });
  await expect(approve(actor, o.id, 'wrong')).rejects.toMatchObject({ code: 'approval_mismatch' });
  await approve(actor, o.id, o.digest);
  await cancel(actor, o.id);
  expect((await wallet()).reservedCents).toBe(0);
  const second = await make();
  await approve(actor, second.id, second.digest);
  await prisma.executionAccount.update({ where: { userId: actor }, data: { enabled: false } });
  const invoke = vi.fn();
  await execute(second.id, { invoke });
  expect(invoke).not.toHaveBeenCalled();
  expect((await wallet()).reservedCents).toBe(0);
});
it('holds ambiguous charges; operator reconciles once without replay or leaking exception details', async () => {
  const o = await make();
  await approve(actor, o.id, o.digest);
  let charges = 0;
  const engine = {
    async invoke() {
      charges++;
      throw Error('sensitive-provider-response');
    }
  };
  await execute(o.id, engine);
  await execute(o.id, engine);
  expect(charges).toBe(1);
  expect(await wallet()).toMatchObject({ reservedCents: 10, spentCents: 0 });
  await expect(cancel(actor, o.id)).rejects.toMatchObject({ code: 'too_late_to_cancel' });
  await expect(resolveIncident(actor, o.id, 10, randomUUID())).rejects.toMatchObject({ statusCode: 403 });
  await resolveIncident(admin, o.id, 6, randomUUID());
  await expect(resolveIncident(admin, o.id, 6, randomUUID())).rejects.toMatchObject({ code: 'not_unknown' });
  expect(await wallet()).toMatchObject({ reservedCents: 0, spentCents: 6 });
  const events = await prisma.auditEvent.findMany({ where: { traceId: o.correlationId } });
  expect(events.map((e) => e.action)).toContain('execution.outcome_unknown');
  expect(JSON.stringify(events)).not.toContain('sensitive-provider-response');
});
it('SIGKILL after charge, restart recovery and redelivery do not charge again', async () => {
  const o = await make();
  await approve(actor, o.id, o.digest);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'c05-')),
    file = path.join(dir, 'charges');
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', 'tests/helpers/c05-interrupted-worker.ts', o.id, file],
    { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] }
  );
  try {
    await Promise.race([
      once(child, 'message'),
      once(child, 'exit').then(() => {
        throw Error('worker exited before charge');
      })
    ]);
    const exit = once(child, 'exit');
    child.kill('SIGKILL');
    await exit;
    await prisma.executionOperation.update({ where: { id: o.id }, data: { claimUntil: new Date(0) } });
    await recover();
    await execute(o.id, {
      async invoke() {
        await fs.appendFile(file, 'duplicate\n');
        return { costCents: 10, costBasis: 'configured_estimate' };
      }
    });
    expect(await fs.readFile(file, 'utf8')).toBe(o.id + '\n');
    expect(await prisma.executionOperation.findUnique({ where: { id: o.id } })).toMatchObject({
      state: 'UNKNOWN',
      costState: 'UNKNOWN'
    });
    expect((await wallet()).reservedCents).toBe(10);
  } finally {
    child.kill();
    await fs.rm(dir, { recursive: true, force: true });
  }
}, 30000);
it('times out an unresponsive provider and fences a delayed receipt', async () => {
  const o = await make();
  await approve(actor, o.id, o.digest);
  let invocations = 0;
  await execute(
    o.id,
    {
      async invoke() {
        invocations++;
        return new Promise((resolve) => setTimeout(() => resolve({ costCents: 2, costBasis: 'configured_estimate' }), 50));
      }
    },
    10
  );
  await new Promise((r) => setTimeout(r, 70));
  expect(invocations).toBe(1);
  expect((await wallet()).reservedCents).toBe(10);
  expect((await prisma.executionOperation.findUniqueOrThrow({ where: { id: o.id } })).state).toBe('UNKNOWN');
});
it('rejects client identity, price, URL and tool overrides at the HTTP boundary', async () => {
  const { buildServer } = await import('../../apps/api/src/server');
  const bcrypt = await import('bcryptjs');
  const app = await buildServer();
  try {
    const password = randomUUID();
    await prisma.user.update({
      where: { id: actor },
      data: { passwordHash: await bcrypt.hash(password, 4) }
    });
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: actor + '@example.test', password }
    });
    expect(login.statusCode).toBe(200);
    const headers = {
      cookie: login.cookies.map((c) => c.name + '=' + c.value).join('; '),
      'x-csrf-token': login.json().csrfToken
    };
    const url = '/api/projects/' + project + '/execution';
    for (const override of [
      { accountId: admin },
      { maxCents: 0 },
      { url: 'https://invalid.example' },
      { tool: 'live.publish@1' }
    ])
      expect(
        (
          await app.inject({
            method: 'POST',
            url,
            headers,
            payload: { key: randomUUID(), tool: 'sandbox.generate@1', revision: 1, ...override }
          })
        ).statusCode
      ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/admin/execution/accounts/' + actor,
          headers,
          payload: { limitCents: 100, tools: Object.keys(tools), enabled: true }
        })
      ).statusCode
    ).toBe(403);
    expect(
      (await app.inject({ method: 'POST', url, headers: { cookie: headers.cookie }, payload: {} })).statusCode
    ).toBe(403);
    const good = await app.inject({
      method: 'POST',
      url,
      headers,
      payload: { key: randomUUID(), tool: 'studio.inspect@1', revision: 1 }
    });
    expect(good.statusCode).toBe(200);
    expect(good.json().state).toBe('QUEUED');
    await prisma.rateLimitCounter.update({ where: { key: 'execution:' + actor }, data: { count: 40 } });
    expect((await app.inject({ url: '/api/execution/tools', headers })).statusCode).toBe(429);
  } finally {
    await app.close();
  }
});
// Qualification against an actual, separately started local Hatchet worker; not an SDK mock.
it.skipIf(process.env.C05_HATCHET_TEST !== '1')(
  'real Hatchet notification, worker, claim and settlement',
  async () => {
    const o = await make();
    await approve(actor, o.id, o.digest);
    await vi.waitFor(
      async () =>
        expect(await prisma.executionOperation.findUnique({ where: { id: o.id } })).toMatchObject({
          state: 'SUCCEEDED',
          reportedCents: 10
        }),
      { timeout: 90000, interval: 500 }
    );
    expect((await wallet()).spentCents).toBe(10);
  },
  95000
);

it('dispatches the pinned Studio renderer and seals a real local PNG', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'c05-studio-'));
  const { CreativeStudio } = await import('../../apps/api/src/application/creative');
  const { PrismaCreativeRepository } =
    await import('../../apps/api/src/infrastructure/prisma/creativeRepository');
  const { LocalFilesystemArtifactStorage } =
    await import('../../apps/api/src/infrastructure/storage/localArtifactStorage');
  const { studioEngine } = await import('../../apps/api/src/infrastructure/execution/runtime');
  const local = new LocalFilesystemArtifactStorage(dir);
  try {
    const spec = {
      schemaVersion: 1,
      width: 1080,
      height: 1080,
      safeArea: 0.05,
      brand: { background: '#163148', accent: '#ffffff' },
      delivery: { kind: 'square', platform: 'Instagram' },
      scenes: [
        {
          key: 'SCENE-001',
          seconds: 1,
          layers: [
            {
              type: 'text',
              role: 'headline',
              text: 'Recette locale',
              color: '#ffffff',
              bold: true,
              size: 55,
              x: 0.1,
              y: 0.3,
              w: 0.8,
              h: 0.3,
              opacity: 1
            }
          ]
        }
      ]
    };
    await prisma.creativeRevision.update({
      where: { projectId_version: { projectId: project, version: 1 } },
      data: { spec }
    });
    const op = await make(undefined, 'studio.render@1');
    await approve(actor, op.id, op.digest);
    await execute(op.id, studioEngine(new CreativeStudio(new PrismaCreativeRepository(), local, { local })));
    const revision = await prisma.creativeRevision.findUniqueOrThrow({
      where: { projectId_version: { projectId: project, version: 1 } }
    });
    const key = (revision.manifest as { master: { key: string } }).master.key;
    expect((await fs.readFile(path.join(dir, key))).subarray(1, 4).toString()).toBe('PNG');
    expect((await wallet()).spentCents).toBe(0);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

it('redelivers a lost notification without redelivering a claimed effect', async () => {
  const { notifyQueued } = await import('../../apps/api/src/infrastructure/execution/runtime');
  const o = await make();
  await approve(actor, o.id, o.digest);
  let charges = 0;
  const provider = {
    async invoke() {
      charges++;
      return { costCents: 10, costBasis: 'configured_estimate' };
    }
  };
  const deliveries: string[] = [];
  await expect(
    notifyQueued(async (id) => {
      deliveries.push(id);
      throw Error('lost acknowledgement');
    })
  ).rejects.toThrow();
  await prisma.executionOperation.update({ where: { id: o.id }, data: { notifyAfter: new Date(0) } });
  await notifyQueued(async (id) => {
    deliveries.push(id);
    return randomUUID();
  });
  expect(deliveries).toEqual([o.id, o.id]);
  await Promise.all(deliveries.map((id) => execute(id, provider)));
  expect(charges).toBe(1);
});
it('settles by provenance: configured estimate, provider amount and local work stay distinct', async () => {
  await prisma.executionAccount.update({ where: { userId: actor }, data: { limitCents: 100 } });
  const run = async (invoke: () => Promise<{ costCents: number; costBasis: 'none' | 'configured_estimate' | 'provider_reported' }>) => {
    const o = await make();
    await approve(actor, o.id, o.digest);
    await execute(o.id, { invoke });
    return prisma.executionOperation.findUniqueOrThrow({ where: { id: o.id } });
  };
  const estimated = await run(async () => ({ costCents: 3, costBasis: 'configured_estimate' }));
  expect(estimated).toMatchObject({ state: 'SUCCEEDED', costState: 'ESTIMATED', reportedCents: 3 });
  const reported = await run(async () => ({ costCents: 4, costBasis: 'provider_reported' }));
  expect(reported).toMatchObject({ state: 'SUCCEEDED', costState: 'REPORTED', reportedCents: 4 });
  const local = await run(async () => ({ costCents: 0, costBasis: 'none' }));
  expect(local).toMatchObject({ state: 'SUCCEEDED', costState: 'RELEASED', reportedCents: 0 });
  expect(await wallet()).toMatchObject({ reservedCents: 0, spentCents: 7 });
  const audit = await prisma.auditEvent.findMany({ where: { targetId: estimated.id, action: 'execution.reported' } });
  expect(audit).toHaveLength(1);
  expect(audit[0]?.metadata).toMatchObject({ cents: 3, basis: 'configured_estimate' });
});
it('never settles a provider amount above the ceiling as a success and keeps the paid output', async () => {
  const o = await make();
  await approve(actor, o.id, o.digest);
  await execute(o.id, {
    async invoke() {
      // Montant brut du fournisseur : l'adaptateur ne le rogne plus au plafond.
      return { costCents: 11, costBasis: 'provider_reported' as const, result: { assetVersionId: 'v-paid' } };
    }
  });
  expect(await prisma.executionOperation.findUniqueOrThrow({ where: { id: o.id } })).toMatchObject({
    state: 'UNKNOWN',
    costState: 'UNKNOWN',
    reportedCents: null,
    result: { assetVersionId: 'v-paid' }
  });
  expect(await wallet()).toMatchObject({ reservedCents: 10, spentCents: 0, enabled: false });
  const events = await prisma.auditEvent.findMany({ where: { targetId: o.id } });
  expect(events.map((event) => event.action)).toEqual(
    expect.arrayContaining(['execution.invalid_provider_cost', 'execution.outcome_unknown'])
  );
  await resolveIncident(admin, o.id, 10, 'facture fournisseur #42');
  expect(await prisma.executionOperation.findUniqueOrThrow({ where: { id: o.id } })).toMatchObject({
    state: 'RESOLVED',
    costState: 'RECONCILED',
    reportedCents: 10,
    result: { assetVersionId: 'v-paid' }
  });
  expect(await wallet()).toMatchObject({ reservedCents: 0, spentCents: 10 });
});
it('keeps the reservation when the provider reports no usage at all', async () => {
  const o = await make();
  await approve(actor, o.id, o.digest);
  await execute(o.id, {
    async invoke() {
      throw Error('media_cost_unknown');
    }
  });
  expect(await prisma.executionOperation.findUniqueOrThrow({ where: { id: o.id } })).toMatchObject({
    state: 'UNKNOWN',
    costState: 'UNKNOWN',
    reportedCents: null
  });
  expect(await wallet()).toMatchObject({ reservedCents: 10, spentCents: 0 });
});
it('recovers an expired claim into an incident without replay or automatic release', async () => {
  const o = await make();
  await approve(actor, o.id, o.digest);
  await prisma.executionOperation.update({
    where: { id: o.id },
    data: { state: 'CLAIMED', claimUntil: new Date(0) }
  });
  const engine = { invoke: vi.fn() };
  await recover();
  expect(engine.invoke).not.toHaveBeenCalled();
  expect(await prisma.executionOperation.findUniqueOrThrow({ where: { id: o.id } })).toMatchObject({
    state: 'UNKNOWN',
    costState: 'UNKNOWN'
  });
  expect(await wallet()).toMatchObject({ reservedCents: 10, spentCents: 0 });
});
it('records a paid but unusable provider output as an incident, never as a free failure', async () => {
  const o = await make();
  await approve(actor, o.id, o.digest);
  await execute(o.id, {
    async invoke() {
      // Le fournisseur a répondu (donc facturé) mais sa sortie est inexploitable.
      return { uncertain: { code: 'image_output_invalid', message: 'Sortie inexploitable.' } };
    }
  });
  expect(await prisma.executionOperation.findUniqueOrThrow({ where: { id: o.id } })).toMatchObject({
    state: 'UNKNOWN',
    costState: 'UNKNOWN',
    reportedCents: null
  });
  expect(await wallet()).toMatchObject({ reservedCents: 10, spentCents: 0 });
  const events = await prisma.auditEvent.findMany({ where: { targetId: o.id, action: 'execution.uncertain' } });
  expect(events).toHaveLength(1);
});
it('persists a result above the inline bound as an immutable payload and resolves it transparently', async () => {
  const o = await make();
  await approve(actor, o.id, o.digest);
  // Transcription volumineuse : au-delà de 32 Kio, jamais remplacée par un marqueur tronqué.
  const big = {
    tool: 'audio.transcribe@1',
    segments: Array.from({ length: 200 }, (_, index) => ({ start: index, end: index + 0.9, text: 'segment ' + index + ' ' + 'x'.repeat(150) }))
  };
  expect(JSON.stringify(big).length).toBeGreaterThan(32768);
  await execute(o.id, {
    async invoke() {
      return { costCents: 2, costBasis: 'configured_estimate' as const, result: big };
    }
  });
  const row = await prisma.executionOperation.findUniqueOrThrow({ where: { id: o.id } });
  expect(row.state).toBe('SUCCEEDED');
  expect(JSON.stringify(row.result).length).toBeLessThan(512);
  expect(isResultPayloadReference(row.result)).toBe(true);
  expect(JSON.stringify(row.result)).not.toContain('truncated');
  expect(await loadOperationResult({ accountId: row.accountId, result: row.result })).toEqual(big);
  expect(await wallet()).toMatchObject({ reservedCents: 0, spentCents: 2 });
});
it('keeps a paid large result resolvable when the provider amount exceeds the ceiling', async () => {
  const o = await make();
  await approve(actor, o.id, o.digest);
  const big = { segments: Array.from({ length: 200 }, (_, index) => ({ start: index, end: index + 1, text: 'ligne ' + index + ' ' + 'y'.repeat(150) })) };
  await execute(o.id, {
    async invoke() {
      return { costCents: 11, costBasis: 'provider_reported' as const, result: big };
    }
  });
  const row = await prisma.executionOperation.findUniqueOrThrow({ where: { id: o.id } });
  expect(row).toMatchObject({ state: 'UNKNOWN', costState: 'UNKNOWN', reportedCents: null });
  expect(isResultPayloadReference(row.result)).toBe(true);
  expect(await loadOperationResult({ accountId: row.accountId, result: row.result })).toEqual(big);
  expect(await wallet()).toMatchObject({ reservedCents: 10, spentCents: 0 });
});

// Le catalogue ne doit jamais proposer une opération que la politique refuse ensuite.
describe('catalogue d outils aligné sur la politique de périmètre', () => {
  it('n expose que les outils autorisés du compte actif', () => {
    const catalog = catalogForAccount({ enabled: true, tools: ['studio.inspect@1', 'marketing.plan@1'] }, { demoDisabled: false });
    expect(Object.keys(catalog).sort()).toEqual(['marketing.plan@1', 'studio.inspect@1']);
    expect(catalog['studio.inspect@1']).toEqual(tools['studio.inspect@1']);
  });
  it('n expose rien sans compte ou avec un compte désactivé', () => {
    expect(catalogForAccount(null, { demoDisabled: false })).toEqual({});
    expect(catalogForAccount({ enabled: false, tools: Object.keys(tools) }, { demoDisabled: false })).toEqual({});
  });
  it('masque les outils sandbox quand la démonstration est désactivée', () => {
    const catalog = catalogForAccount({ enabled: true, tools: Object.keys(tools) }, { demoDisabled: true });
    expect(Object.keys(catalog).some((key) => key.startsWith('sandbox.'))).toBe(false);
    expect(Object.keys(catalog)).toContain('studio.inspect@1');
  });
});
