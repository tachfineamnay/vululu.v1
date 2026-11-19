import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { randomUUID, randomBytes, createHmac, createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import bcrypt from 'bcryptjs';
vi.hoisted(() => {
  const u = new URL(process.env.DATABASE_URL_TEST || 'postgres://vululu@127.0.0.1:55432/vululu_v1_00_test');
  if (!['127.0.0.1', 'localhost'].includes(u.hostname) || !u.pathname.endsWith('_test'))
    throw Error('disposable DB required');
  Object.assign(process.env, {
    DATABASE_URL: u.href,
    APP_ENV: 'test',
    SESSION_SECRET: crypto.randomUUID(),
    ARTIFACT_DIR: '.v1/c06-' + crypto.randomUUID(),
    ARTIFACT_STORAGE_BACKEND: 'local',
    POSTIZ_PUBLISH_ENABLED: '0'
  });
});
import { prisma } from '@vululu/db';
import { buildServer } from '../../apps/api/src/server';
import { creativeStudio } from '../../apps/api/src/application/container';
import { approve, execute } from '../../apps/api/src/infrastructure/execution/broker';
import { prepare, command, dispatchPublication } from '../../apps/api/src/infrastructure/publishing/service';
import {
  ProviderFailure,
  type PublishingProvider
} from '../../apps/api/src/infrastructure/publishing/provider';
const unzip = createRequire(path.resolve('apps/api/package.json'))('fflate').unzipSync;
let owner: string,
  admin: string,
  item: string,
  proj: string,
  conn: string,
  token: string,
  relay: string,
  app: Awaited<ReturnType<typeof buildServer>>,
  h: Record<string, string>,
  ah: Record<string, string>;
beforeEach(async () => {
  owner = randomUUID();
  admin = randomUUID();
  item = randomUUID();
  proj = randomUUID();
  token = randomUUID();
  relay = randomUUID();
  process.env.PUBLISHING_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  app = await buildServer();
  const password = randomUUID(),
    hash = await bcrypt.hash(password, 4);
  await prisma.user.createMany({
    data: [owner, admin].map((id) => ({
      id,
      email: id + '@example.test',
      name: 'QA',
      role: id === admin ? 'super_admin' : 'user',
      passwordHash: hash
    }))
  });
  async function login(id: string) {
    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: id + '@example.test', password }
    });
    return {
      cookie: r.cookies.map((c) => c.name + '=' + c.value).join('; '),
      'x-csrf-token': r.json().csrfToken
    };
  }
  h = await login(owner);
  ah = await login(admin);
  const ctx = await prisma.brandContext.create({
    data: { name: 'QA', description: 'fixture', userId: owner }
  });
  await prisma.project.create({
    data: {
      id: proj,
      contextId: ctx.id,
      userId: owner,
      title: 'Demo',
      format: 'Affiche',
      platform: 'LinkedIn',
      objective: 'test'
    }
  });
  const offer = await prisma.confirmedOffer.create({ data: { contextId: ctx.id, name: 'Atelier' } });
  await prisma.contentItem.create({
    data: {
      id: item,
      userId: owner,
      projectId: proj,
      offerId: offer.id,
      title: 'Atelier',
      audience: 'Équipes',
      objective: 'test',
      status: 'APPROVED',
      plannedAt: new Date(Date.now() + 86400000),
      timeZone: 'UTC',
      archived: false,
      version: 1,
      variants: ['LinkedIn', 'Instagram'].map((platform) => ({
        platform,
        format: 'Affiche',
        caption: 'Sous les étoiles',
        cta: 'Réserver'
      }))
    }
  });
  await prisma.contentRevision.create({
    data: {
      itemId: item,
      version: 1,
      snapshot: {
        projectId: proj,
        title: 'Atelier',
        offerId: offer.id,
        audience: 'Équipes',
        objective: 'test',
        status: 'APPROVED',
        plannedAt: '2030-01-01T00:00:00Z',
        timeZone: 'UTC',
        archived: false,
        campaignId: null,
        variants: ['LinkedIn', 'Instagram'].map((platform) => ({
          platform,
          format: 'Affiche',
          caption: 'Sous les étoiles',
          cta: 'Réserver'
        }))
      },
      digest: 'test',
      requestId: randomUUID()
    }
  });
  for (const [i, platform] of ['LinkedIn', 'Instagram'].entries()) {
    const v = i + 1;
    await creativeStudio.save(owner, proj, i, {
      schemaVersion: 1,
      width: 1080,
      height: 1080,
      safeArea: 0.05,
      brand: { background: '#123456', accent: '#ffffff' },
      delivery: {
        kind: 'square',
        platform: platform as 'LinkedIn' | 'Instagram',
        calendar: { itemId: item, version: 1 }
      },
      scenes: [
        {
          key: 'SCENE-001',
          seconds: 1,
          layers: [
            {
              type: 'text',
              role: 'headline',
              size: 60,
              text: 'Atelier',
              color: '#ffffff',
              bold: true,
              x: 0.1,
              y: 0.3,
              w: 0.8,
              h: 0.3,
              opacity: 1
            }
          ]
        }
      ]
    });
    const m = await creativeStudio.render(owner, proj, v);
    await creativeStudio.approve(owner, proj, v, m.approvalSha256 ?? m.master.sha256);
  }
  await prisma.executionAccount.create({
    data: { userId: owner, enabled: true, limitCents: 0, tools: ['postiz.schedule@1', 'postiz.cancel@1'] }
  });
  const payload = {
    ownerId: owner,
    channel: 'test-channel',
    token,
    relayKey: relay,
    expiresAt: new Date(Date.now() + 3600000).toISOString()
  };
  expect(
    (await app.inject({ method: 'POST', url: '/api/admin/publishing/connections', headers: h, payload }))
      .statusCode
  ).toBe(403);
  const c = await app.inject({
    method: 'POST',
    url: '/api/admin/publishing/connections',
    headers: ah,
    payload
  });
  expect(c.statusCode, c.body).toBe(200);
  conn = c.json().id;
  expect(c.body).not.toContain(token);
});
afterEach(async () => {
  await app.close();
  await prisma.publicationEvent.deleteMany({ where: { request: { itemId: item } } });
  await prisma.publicationRequest.deleteMany({ where: { itemId: item } });
  await prisma.publishingConnection.deleteMany({ where: { ownerId: owner } });
  await prisma.executionOperation.deleteMany({ where: { accountId: owner } });
  await prisma.executionAccount.deleteMany({ where: { userId: owner } });
  await prisma.project.deleteMany({ where: { id: proj } });
  await prisma.user.deleteMany({ where: { id: { in: [owner, admin] } } });
  await fs.rm(process.env.ARTIFACT_DIR!, { recursive: true, force: true });
});
async function run(c: { operationId: string; digest: string }, provider: PublishingProvider) {
  await approve(owner, c.operationId, c.digest);
  await execute(c.operationId, {
    invoke: (job, signal) => dispatchPublication(job, creativeStudio, provider, signal)
  });
}
async function hook(state: string, eventId: string, secret = relay) {
  const payload = JSON.stringify({
      eventId,
      remoteId: 'remote-fixture',
      state,
      networkReceipt: 'urn:li:share:fixture'
    }),
    timestamp = Math.floor(Date.now() / 1000),
    signature = createHmac('sha256', secret).update(`${conn}.${timestamp}.${payload}`).digest('hex');
  return app.inject({
    method: 'POST',
    url: '/api/publishing/relay',
    headers: { 'x-vululu-signature': 'v1=' + signature },
    payload: { connectionId: conn, timestamp, payload }
  });
}
it('keeps submission distinct from publication, deduplicates commands and authenticated relay receipts', async () => {
  await expect(prepare(admin, item, 1, conn)).rejects.toMatchObject({ statusCode: 404 });
  const c = await prepare(owner, item, 1, conn);
  expect((await prepare(owner, item, 1, conn)).operationId).toBe(c.operationId);
  const schedule = vi.fn(async () => 'remote-fixture'),
    provider = { schedule, cancel: vi.fn() };
  await Promise.all([run(c, provider), run(c, provider)]);
  expect(schedule).toHaveBeenCalledTimes(1);
  const get = () => prisma.publicationRequest.findUniqueOrThrow({ where: { id: c.id } });
  expect((await get()).state).toBe('SUBMITTED');
  const event = randomUUID();
  expect((await hook('PUBLISHED', event, 'wrong')).statusCode).toBe(401);
  expect((await hook('PUBLISHED', event)).statusCode).toBe(200);
  expect((await hook('PUBLISHED', event)).statusCode).toBe(200);
  expect((await hook('FAILED', event)).statusCode).toBe(409);
  expect(await get()).toMatchObject({ state: 'PUBLISHED', networkReceipt: 'urn:li:share:fixture' });
  expect(await prisma.publicationEvent.count({ where: { requestId: c.id } })).toBe(1);
  expect((await prisma.contentItem.findUniqueOrThrow({ where: { id: item } })).status).toBe('APPROVED');
});
it('exports unsupported Instagram as ordered, checksummed files and caption without changing state', async () => {
  const url = `/api/calendar/${item}/publishing/2/package`;
  expect((await app.inject({ url, headers: ah })).statusCode).toBe(404);
  const r = await app.inject({ url, headers: h });
  expect(r.statusCode, r.body.slice(0, 50)).toBe(200);
  const files = unzip(r.rawPayload),
    manifest = JSON.parse(Buffer.from(files['manifest.json']).toString());
  expect(manifest.direct).toBe(false);
  expect(Buffer.from(files['caption.txt']).toString()).toBe('Sous les étoiles\n\nRéserver');
  expect(createHash('sha256').update(files[manifest.files[0].name]).digest('hex')).toBe(
    manifest.files[0].sha256
  );
  await expect(prepare(owner, item, 2, conn)).rejects.toMatchObject({ statusCode: 409 });
  expect(await prisma.publicationRequest.count({ where: { itemId: item } })).toBe(0);
});
it('rechecks token expiry after approval and never retries an ambiguous write', async () => {
  const c = await prepare(owner, item, 1, conn);
  await prisma.publishingConnection.update({ where: { id: conn }, data: { expiresAt: new Date(0) } });
  const schedule = vi.fn(async () => {
    throw new ProviderFailure('PROVIDER_UNAVAILABLE', true);
  });
  await run(c, { schedule, cancel: vi.fn() });
  expect(schedule).not.toHaveBeenCalled();
  expect(await prisma.publicationRequest.findUnique({ where: { id: c.id } })).toMatchObject({
    state: 'FAILED',
    reason: 'TOKEN_EXPIRED'
  });
});
it('leaves a lost submission receipt unknown even on worker redelivery', async () => {
  const c = await prepare(owner, item, 1, conn),
    schedule = vi.fn(async () => {
      throw Error('lost response');
    }),
    provider = { schedule, cancel: vi.fn() };
  await run(c, provider);
  await run(c, provider);
  expect(schedule).toHaveBeenCalledTimes(1);
  expect(await prisma.publicationRequest.findUnique({ where: { id: c.id } })).toMatchObject({
    state: 'UNKNOWN',
    remoteId: null,
    reason: 'RECEIPT_UNKNOWN'
  });
});
it('requires a separate approved operation to cancel a submitted schedule', async () => {
  const c = await prepare(owner, item, 1, conn),
    provider = { schedule: vi.fn(async () => 'remote-fixture'), cancel: vi.fn() };
  await run(c, provider);
  const stop = await command(owner, c.id, true);
  expect(stop.digest).not.toBe(c.digest);
  await run(stop, provider);
  expect(provider.cancel).toHaveBeenCalledTimes(1);
  expect((await prisma.publicationRequest.findUniqueOrThrow({ where: { id: c.id } })).state).toBe(
    'CANCELLED'
  );
});
it('allows a fresh explicit approval after a definitive credential rejection, never after UNKNOWN', async () => {
  const { retryPreparation } = await import('../../apps/api/src/infrastructure/publishing/service');
  const c = await prepare(owner, item, 1, conn);
  await run(c, {
    schedule: async () => {
      throw new ProviderFailure('TOKEN_EXPIRED', false);
    },
    cancel: vi.fn()
  });
  const retry = await retryPreparation(owner, c.id);
  expect(retry.operationId).not.toBe(c.operationId);
  expect(retry.digest).not.toBe(c.digest);
  expect(retry.state).toBe('PROPOSED');
  await run(retry, {
    schedule: async () => {
      throw Error('lost');
    },
    cancel: vi.fn()
  });
  await expect(retryPreparation(owner, c.id)).rejects.toMatchObject({ code: 'unsafe_retry' });
});

it('refuses a changed calendar revision between approval and dispatch', async () => {
  const c = await prepare(owner, item, 1, conn);
  await prisma.contentItem.update({ where: { id: item }, data: { version: { increment: 1 } } });
  const schedule = vi.fn();
  await run(c, { schedule, cancel: vi.fn() });
  expect(schedule).not.toHaveBeenCalled();
  expect(await prisma.publicationRequest.findUnique({ where: { id: c.id } })).toMatchObject({
    state: 'FAILED',
    reason: 'VALIDATION_FAILED'
  });
});
