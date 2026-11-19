import { it, expect, vi, afterEach, beforeEach } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import { buffer } from 'node:stream/consumers';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs/promises';
vi.hoisted(() => {
  const u = new URL(process.env.DATABASE_URL_TEST || 'postgres://vululu@127.0.0.1:55432/vululu_v1_00_test');
  if (!['127.0.0.1', 'localhost'].includes(u.hostname) || !u.pathname.endsWith('_test'))
    throw Error('Disposable local DB required');
  Object.assign(process.env, {
    DATABASE_URL: u.href,
    APP_ENV: 'test',
    SESSION_SECRET: crypto.randomUUID(),
    ARTIFACT_STORAGE_BACKEND: 'local',
    ARTIFACT_DIR: '.v1/c09-' + crypto.randomUUID()
  });
});
import { prisma } from '@vululu/db';
import { approve, execute, resolveIncident } from '../../apps/api/src/infrastructure/execution/broker';
import {
  prepareMedia,
  cancelMedia,
  dispatchMedia,
  placeMedia,
  mediaHistory
} from '../../apps/api/src/infrastructure/mediaGeneration/service';
import {
  ReplicateImage,
  RunwayVideo,
  mediaRouter,
  type MediaProvider
} from '../../apps/api/src/infrastructure/mediaGeneration/providers';
import { creativeStudio } from '../../apps/api/src/application/container';
import { creativeSpec } from '@vululu/contracts';
import type { EnginePort } from '../../apps/api/src/infrastructure/execution/registry';
const sharp = createRequire(path.resolve('packages/media/package.json'))('sharp');
let user: string, project: string, ctx: string;
const rev = creativeSpec.parse({
  schemaVersion: 1,
  width: 1080,
  height: 1920,
  delivery: { kind: 'short', platform: 'Instagram' },
  safeArea: 0.05,
  brand: { background: '#224466', accent: '#aaccee' },
  scenes: [1, 2].map((n) => ({
    key: `SCENE-00${n}`,
    seconds: 0.5,
    layers: [
      {
        type: 'text',
        role: 'cta',
        text: 'Visiter',
        x: 0.1,
        y: 0.8,
        w: 0.8,
        h: 0.1,
        size: 24,
        bold: true,
        color: '#ffffff',
        opacity: 1
      }
    ]
  }))
});
const input = (revision = 1) => ({
  schemaVersion: 1,
  requestId: randomUUID(),
  revision,
  kind: 'image',
  sceneKey: 'SCENE-002',
  prompt: 'Fixture locale, aucun réseau',
  size: '1024:1024',
  rightsConfirmed: true
});
const engine = (p: MediaProvider): EnginePort => ({ invoke: (job, s) => dispatchMedia(job, s, () => p) });
beforeEach(async () => {
  vi.stubEnv('MEDIA_GENERATION_ENABLED', '1');
  vi.stubEnv('REPLICATE_API_TOKEN', 'fixture-only');
  vi.stubEnv('RUNWAYML_API_SECRET', 'fixture-only');
  user = randomUUID();
  await prisma.user.create({
    data: {
      id: user,
      email: user + '@example.test',
      name: 'Test',
      role: 'super_admin',
      passwordHash: 'unused'
    }
  });
  ctx = (
    await prisma.brandContext.create({ data: { userId: user, name: 'Atelier', description: 'Fixture' } })
  ).id;
  project = (
    await prisma.project.create({
      data: {
        userId: user,
        contextId: ctx,
        title: 'Plan',
        objective: 'Informer',
        format: 'Video',
        platform: 'Instagram'
      }
    })
  ).id;
  await creativeStudio.save(user, project, 0, rev);
  await prisma.executionAccount.create({
    data: { userId: user, limitCents: 26, enabled: true, tools: ['media.image@1', 'media.video@1'] }
  });
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await prisma.mediaGeneration.deleteMany({ where: { projectId: project } });
  await prisma.executionOperation.deleteMany({ where: { accountId: user } });
  await prisma.executionAccount.deleteMany({ where: { userId: user } });
  await prisma.project.deleteMany({ where: { id: project } });
  await prisma.auditEvent.deleteMany({ where: { actorId: user } });
  await prisma.user.deleteMany({ where: { id: user } });
  await fs.rm(process.env.ARTIFACT_DIR!, { recursive: true, force: true });
});
it('controlled HTTP fixtures only: claim → durable poll → verified asset → explicit placement → real export', async () => {
  const initial = await creativeStudio.render(user, project, 1),
    img = input();
  const png = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#bbaa99' } })
    .png()
    .toBuffer();
  const http = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ id: 'fixture-image' }))
    .mockResolvedValueOnce(Response.json({ id: 'fixture-image', status: 'starting' }))
    .mockResolvedValueOnce(
      Response.json({
        id: 'fixture-image',
        status: 'succeeded',
        version: 'fixture-v1',
        output: ['https://replicate.delivery/fixture.png']
      })
    )
    .mockResolvedValueOnce(new Response(png));
  const adapter = new ReplicateImage('test-only', http);
  const op = await prepareMedia(user, project, img);
  expect((await prepareMedia(user, project, img)).id).toBe(op.id);
  await expect(prepareMedia(user, project, { ...img, prompt: 'other prompt' })).rejects.toMatchObject({
    statusCode: 409
  });
  await execute(op.id, engine(adapter));
  expect(http).not.toHaveBeenCalled();
  await approve(user, op.id, op.digest);
  await execute(op.id, engine(adapter));
  expect(await prisma.executionOperation.findUnique({ where: { id: op.id } })).toMatchObject({
    state: 'POLLING',
    costState: 'RESERVED'
  });
  await execute(op.id, engine(adapter));
  await execute(op.id, engine(adapter));
  expect(http.mock.calls.filter(([, i]) => i?.method === 'POST')).toHaveLength(1);
  let [g] = await mediaHistory(user, project);
  expect(g).toMatchObject({
    state: 'READY',
    remoteId: 'fixture-image',
    modelVersion: 'fixture-v1',
    reportedCents: null,
    operation: { state: 'UNKNOWN' }
  });
  expect(await mediaHistory(randomUUID(), project)).toEqual([]);
  await expect(placeMedia(randomUUID(), project, g.id, 1)).rejects.toMatchObject({ statusCode: 404 });
  await placeMedia(user, project, g.id, 1);
  await expect(placeMedia(user, project, g.id, 1)).rejects.toMatchObject({ statusCode: 409 });
  const still = await creativeStudio.render(user, project, 2);
  expect(still.frames[0].key).toBe(initial.frames[0].key);
  expect(still.frames[1].sha256).not.toBe(initial.frames[1].sha256);
  await resolveIncident(user, op.id, 1, randomUUID());
  const video = {
    ...input(2),
    kind: 'video',
    size: '1280:720',
    seconds: 5,
    referenceVersion: g.outputVersion
  };
  const clipPath = path.join(process.env.ARTIFACT_DIR!, 'fixture.mp4');
  execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-v',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=blue:s=1280x720:r=15',
    '-t',
    '5',
    '-threads',
    '2',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    clipPath
  ]);
  const clip = await fs.readFile(clipPath);
  const vhttp = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ id: 'fixture-video' }))
    .mockResolvedValueOnce(
      Response.json({
        id: 'fixture-video',
        status: 'SUCCEEDED',
        output: ['https://dnznrvs05pmza.cloudfront.net/fixture.mp4'],
        cost: { credits: 25 }
      })
    )
    .mockResolvedValueOnce(new Response(clip));
  const vengine = engine(new RunwayVideo('test-only', vhttp));
  const vo = await prepareMedia(user, project, video);
  await approve(user, vo.id, vo.digest);
  await execute(vo.id, vengine);
  await execute(vo.id, vengine);
  [g] = await mediaHistory(user, project);
  expect(g).toMatchObject({
    state: 'READY',
    reportedCents: 25,
    operation: { state: 'SUCCEEDED', reportedCents: 25 }
  });
  const latest = await placeMedia(user, project, g.id, 2);
  expect(latest.spec.scenes[1].clip?.versionId).toBe(g.outputVersion);
  const master = await creativeStudio.render(user, project, 3);
  expect(master.master.sha256).not.toBe(still.master.sha256);
  expect(master.frames[0].key).toBe(initial.frames[0].key);
  const f = await creativeStudio.file(user, project, 3);
  const exported = await buffer(await f.openRead());
  expect(exported.toString('ascii', 4, 8)).toBe('ftyp');
  expect(createHash('sha256').update(exported).digest('hex')).toBe(master.master.sha256);
  expect((await creativeStudio.get(user, project, 1)).manifest).toEqual(initial);
}, 120000);
it('missing credential, unavailable deployment, missing reference, budget denial and pre-submit cancellation', async () => {
  vi.stubEnv('REPLICATE_API_TOKEN', '');
  expect(mediaRouter('image')).toBe(null);
  await expect(prepareMedia(user, project, input())).rejects.toMatchObject({
    code: 'media_missing_credential'
  });
  vi.stubEnv('MEDIA_GENERATION_ENABLED', '0');
  await expect(prepareMedia(user, project, input())).rejects.toMatchObject({ code: 'media_disabled' });
  vi.stubEnv('MEDIA_GENERATION_ENABLED', '1');
  vi.stubEnv('REPLICATE_API_TOKEN', 'test-only');
  await expect(
    prepareMedia(user, project, {
      ...input(),
      kind: 'video',
      seconds: 5,
      size: '1280:720',
      referenceVersion: 'foreign'
    })
  ).rejects.toMatchObject({ statusCode: 404 });
  const o = await prepareMedia(user, project, input());
  await prisma.executionAccount.update({ where: { userId: user }, data: { limitCents: 0 } });
  await expect(approve(user, o.id, o.digest)).rejects.toMatchObject({ code: 'budget_exhausted' });
  await cancelMedia(user, project, o.key);
  expect(await prisma.executionOperation.findUnique({ where: { id: o.id } })).toMatchObject({
    state: 'CANCELLED'
  });
});
it('lost submit response is never retried and retains reservation', async () => {
  const o = await prepareMedia(user, project, input()),
    transport = vi.fn<typeof fetch>().mockRejectedValue(Error('ambiguous'));
  await approve(user, o.id, o.digest);
  await Promise.all([
    execute(o.id, engine(new ReplicateImage('fixture', transport))),
    execute(o.id, engine(new ReplicateImage('fixture', transport)))
  ]);
  expect(transport).toHaveBeenCalledTimes(1);
  expect((await mediaHistory(user, project))[0]).toMatchObject({
    state: 'SUBMISSION_UNKNOWN',
    outputVersion: null,
    operation: { state: 'UNKNOWN' }
  });
  expect(await prisma.executionAccount.findUnique({ where: { userId: user } })).toMatchObject({
    reservedCents: 1,
    spentCents: 0
  });
});
it('cancel after submit requests one remote cancellation and holds budget until a terminal receipt', async () => {
  const req = input(),
    op = await prepareMedia(user, project, req);
  const http = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ id: 'cancel-id' }))
    .mockResolvedValueOnce(Response.json({}))
    .mockResolvedValueOnce(Response.json({ id: 'cancel-id', status: 'canceled' }));
  const e = engine(new ReplicateImage('fixture', http));
  await approve(user, op.id, op.digest);
  await execute(op.id, e);
  await cancelMedia(user, project, req.requestId);
  await execute(op.id, e);
  expect((await mediaHistory(user, project))[0]).toMatchObject({
    state: 'PENDING',
    cancelSent: true,
    operation: { state: 'POLLING' }
  });
  await execute(op.id, e);
  expect((await mediaHistory(user, project))[0]).toMatchObject({
    state: 'CANCELLED',
    outputVersion: null,
    operation: { state: 'UNKNOWN' }
  });
});
it('refuses wrong image dimensions without creating a library asset', async () => {
  const op = await prepareMedia(user, project, input());
  const wrong = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#aaaaaa' } })
    .png()
    .toBuffer();
  const http = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ id: 'bad' }))
    .mockResolvedValueOnce(
      Response.json({ id: 'bad', status: 'succeeded', output: ['https://replicate.delivery/bad.png'] })
    )
    .mockResolvedValueOnce(new Response(wrong));
  await approve(user, op.id, op.digest);
  const e = engine(new ReplicateImage('fixture', http));
  await execute(op.id, e);
  await execute(op.id, e);
  expect((await mediaHistory(user, project))[0]).toMatchObject({
    outputVersion: null,
    operation: { state: 'UNKNOWN' }
  });
  expect(await prisma.brandAsset.count({ where: { userId: user } })).toBe(0);
});
it('a transient status read schedules another poll without another submit; disabled policy retains reservation', async () => {
  const op = await prepareMedia(user, project, input());
  const http = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ id: 'fixture' }))
    .mockResolvedValueOnce(new Response(null, { status: 503 }));
  const e = engine(new ReplicateImage('fixture', http));
  await approve(user, op.id, op.digest);
  await execute(op.id, e);
  await execute(op.id, e);
  expect((await mediaHistory(user, project))[0].operation?.state).toBe('POLLING');
  await prisma.executionAccount.update({ where: { userId: user }, data: { enabled: false } });
  await execute(op.id, e);
  expect((await mediaHistory(user, project))[0].operation?.state).toBe('UNKNOWN');
  expect(http).toHaveBeenCalledTimes(2);
  expect(await prisma.executionAccount.findUnique({ where: { userId: user } })).toMatchObject({
    reservedCents: 1
  });
});
it('does not execute an altered prompt under an earlier financial approval', async () => {
  const req = input(),
    o = await prepareMedia(user, project, req);
  await approve(user, o.id, o.digest);
  await prisma.mediaGeneration.update({
    where: { id: req.requestId },
    data: { parameters: { ...req, prompt: 'tampered' } }
  });
  const http = vi.fn<typeof fetch>();
  await execute(o.id, engine(new ReplicateImage('fixture', http)));
  expect(http).not.toHaveBeenCalled();
  expect((await mediaHistory(user, project))[0].operation?.state).toBe('UNKNOWN');
});
