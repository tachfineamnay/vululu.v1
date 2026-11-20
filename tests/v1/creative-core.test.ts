import { randomUUID, createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
vi.hoisted(() => {
  const url = new URL(
    process.env.DATABASE_URL_TEST || 'postgresql://vululu@127.0.0.1:55432/vululu_v1_00_test'
  );
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !url.pathname.endsWith('_test'))
    throw new Error('Disposable local test DB required');
  Object.assign(process.env, {
    DATABASE_URL: url.href,
    DATABASE_URL_TEST: url.href,
    V0_TEST_DB: '1',
    APP_ENV: 'test',
    SESSION_SECRET: crypto.randomUUID(),
    ARTIFACT_DIR: '.v1/c03-' + crypto.randomUUID(),
    ARTIFACT_STORAGE_BACKEND: 'local'
  });
});
import { prisma } from '@vululu/db';
import { LocalFilesystemArtifactStorage } from '../../apps/api/src/infrastructure/storage/localArtifactStorage';
import { buildServer } from '../../apps/api/src/server';
import { runNextStudioRender } from '../../apps/api/src/infrastructure/creative/renderJobs';
import type { CreativeSpec, CreativeLayer } from '@vululu/contracts';
const sharp = createRequire(path.resolve('packages/media/package.json'))('sharp');
const sha = (v: Buffer) => createHash('sha256').update(v).digest('hex');
it('seals an approved master, changes only CTA 2, retrieves both masters and restores without overwriting', async () => {
  const app = await buildServer(),
    userId = randomUUID(),
    stranger = randomUUID(),
    password = randomUUID(),
    evidence = process.env.C03_EVIDENCE;
  const passwordHash = await bcrypt.hash(password, 4);
  try {
    async function login(id: string) {
      const email = id + '@example.test';
      await prisma.user.create({ data: { id, email, name: 'Test atelier', passwordHash } });
      const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } });
      expect(r.statusCode).toBe(200);
      return {
        cookie: r.cookies.map((c) => c.name + '=' + c.value).join('; '),
        'x-csrf-token': r.json().csrfToken
      };
    }
    const headers = await login(userId),
      other = await login(stranger);
    const ctx = await prisma.brandContext.create({
      data: { userId, name: 'Café Atelier', description: 'Micro-torréfaction' }
    });
    const project = await prisma.project.create({
      data: {
        userId,
        contextId: ctx.id,
        title: 'Collection café',
        format: 'Video',
        platform: 'Instagram',
        objective: 'Découverte'
      }
    });
    const base = `/api/projects/${project.id}/creative`;
    async function post(url: string, payload: object) {
      const r = await app.inject({ method: 'POST', url, headers, payload });
      expect(r.statusCode, r.body).toBeLessThan(300);
      return r.json();
    }
    async function get(url: string) {
      const r = await app.inject({ method: 'GET', url, headers });
      expect(r.statusCode).toBe(200);
      return r.rawPayload;
    }
    async function upload(name: string, kind: string, bytes: Buffer) {
      const r = await app.inject({
        method: 'POST',
        url: `/api/contexts/${ctx.id}/assets`,
        headers: {
          ...headers,
          'content-type': 'application/octet-stream',
          'x-asset-metadata': encodeURIComponent(
            JSON.stringify({
              name,
              kind,
              mimeType: 'image/png',
              license: 'commercial',
              provenance: 'Fichier local de recette'
            })
          )
        },
        payload: bytes
      });
      expect(r.statusCode, r.body).toBe(201);
      return r.json().version.id as string;
    }
    const photo = await upload(
      'Photo',
      'image',
      await fs.readFile(process.env.C03_PHOTO || 'docs/reports/studio-v1-captures/01-dashboard.png')
    );
    const logo = await upload('Logo', 'logo', await sharp('tests/fixtures/c03/mark.svg').png().toBuffer());
    const selected = await app.inject({
      method: 'PUT',
      url: `/api/projects/${project.id}/assets`,
      headers,
      payload: { usage: 'organic', versionIds: [photo, logo] }
    });
    expect(selected.statusCode).toBe(200);
    const spec: CreativeSpec = {
      schemaVersion: 1,
      width: 480,
      height: 640,
      safeArea: 0.05,
      brand: { background: '#31241f', accent: '#583c2c' },
      scenes: [1, 2, 3].map((n) => ({
        key: 'SCENE-00' + n,
        seconds: 1,
        layers: [
          {
            type: 'image',
            versionId: photo,
            x: 0,
            y: 0,
            w: 1,
            h: 0.68,
            fit: 'cover',
            gravity: 'centre',
            opacity: 1
          },
          {
            type: 'image',
            versionId: logo,
            x: 0.76,
            y: 0.05,
            w: 0.17,
            h: 0.15,
            fit: 'contain',
            gravity: 'centre',
            opacity: 0.95
          },
          {
            type: 'text',
            role: 'headline',
            text: ['Café Atelier', 'Torréfaction lente', 'À partager'][n - 1],
            x: 0.07,
            y: 0.72,
            w: 0.86,
            h: 0.12,
            size: 34,
            bold: true,
            opacity: 1,
            color: '#fff1ce'
          },
          {
            type: 'text',
            role: 'cta',
            text: 'Découvrir la collection',
            x: 0.07,
            y: 0.86,
            w: 0.86,
            h: 0.08,
            size: 19,
            bold: false,
            color: '#ffffff',
            opacity: 1
          }
        ] satisfies CreativeLayer[]
      }))
    };
    await post(base, { expectedVersion: 0, spec });
    expect((await app.inject({ method: 'POST', url: base + '/1/render', headers: other, payload: {} })).statusCode).toBe(404);
    expect((await app.inject({ url: base + '/1/render', headers: other })).statusCode).toBe(404);
    expect((await app.inject({ url: base + '/1/export', headers })).statusCode).toBe(409);
    const jobs = await Promise.all([post(base + '/1/render', {}), post(base + '/1/render', {})]);
    expect(jobs[0].state).toBe('queued');
    expect(jobs[0].id).toBe(jobs[1].id);
    expect((await app.inject({ method: 'POST', url: base + '/1/approve', headers, payload: { checksum: 'a'.repeat(64) } })).statusCode).toBe(409);
    expect((await Promise.all([runNextStudioRender(), runNextStudioRender()])).sort()).toEqual([false, true]);
    const m1 = JSON.parse((await get(base + '/1')).toString()).manifest;
    await post(base + '/1/approve', { checksum: m1.master.sha256 });
    const target = { projectId: project.id, sceneKey: 'SCENE-001' };
    const proposal = await post(base + '/actions/translate', {
      target,
      expectedRevision: 1,
      prompt: 'Scène 2 : CTA "Réserver une dégustation" ; couleur #224466'
    });
    expect(proposal.after.background).toBe('#224466');
    expect(proposal.after.layers[3].text).toBe('Réserver une dégustation');
    const payload = {
      action: proposal.action,
      surface: proposal.surface,
      digest: proposal.digest,
      approved: true
    };
    const apply = (body: object, who = headers) =>
      app.inject({ method: 'POST', url: base + '/actions/apply', headers: who, payload: body });
    expect((await apply(payload, other)).statusCode).toBe(404);
    expect((await apply({ ...payload, approved: false })).statusCode).toBe(400);
    expect(
      (await apply({ ...payload, surface: { ...proposal.surface, html: '<script>no</script>' } })).statusCode
    ).toBe(400);
    expect((await apply({ ...payload, digest: '0'.repeat(64) })).statusCode).toBe(409);
    const concurrent = await Promise.all([apply(payload), apply(payload)]);
    expect(concurrent.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const writes = vi.spyOn(LocalFilesystemArtifactStorage.prototype, 'putObject');
    const queued = await post(base + '/2/render', {});
    // Simulate an interrupted worker, then let a new worker reclaim the same attempt.
    await prisma.studioRender.update({ where: { id: queued.id }, data: {
      state: 'running', leaseToken: randomUUID(), leaseUntil: new Date(0), attempts: 1
    } });
    expect(await runNextStudioRender()).toBe(true);
    expect(await prisma.studioRender.findUnique({ where: { id: queued.id } })).toMatchObject({
      attempts: 2, state: 'succeeded', leaseToken: null
    });
    const m2 = JSON.parse((await get(base + '/2')).toString()).manifest;
    expect(
      writes.mock.calls.filter(([input]) => input.contentType === 'image/png').map(([input]) => input.sha256)
    ).toEqual([m2.frames[1].sha256]);
    writes.mockRestore();
    expect(m2.master.sha256).not.toBe(m1.master.sha256);
    expect(m2.frames[0]).toEqual(m1.frames[0]);
    expect(m2.frames[2]).toEqual(m1.frames[2]);
    expect(m2.frames[1].sha256).not.toBe(m1.frames[1].sha256);
    for (const [v, m] of [
      [1, m1],
      [2, m2]
    ] as const) {
      const bytes = await get(`${base}/${v}/master`);
      expect(sha(bytes)).toBe(m.master.sha256);
      if (evidence) {
        await fs.mkdir(evidence, { recursive: true });
        await fs.writeFile(path.join(evidence, `master-v${v}.mp4`), bytes);
      }
      for (const f of m.frames) {
        const png = await get(`${base}/${v}/scenes/${f.sceneKey}`);
        expect(sha(png)).toBe(f.sha256);
        if (evidence) await fs.writeFile(path.join(evidence, `${f.sceneKey}-v${v}.png`), png);
      }
    }
    if (evidence)
      await fs.writeFile(path.join(evidence, 'manifests.json'), JSON.stringify([m1, m2], null, 2));
    expect(
      (await app.inject({ method: 'POST', url: base, headers, payload: { spec, expectedVersion: 1 } }))
        .statusCode
    ).toBe(409);
    expect((await app.inject({ method: 'GET', url: base + '/1/master', headers: other })).statusCode).toBe(
      404
    );
    const original = JSON.parse((await get(base + '/1')).toString());
    expect(original.approvedAt).toBeTruthy();
    const restored = await post(base + '/1/restore', { expectedVersion: 2 });
    expect(restored.version).toBe(3);
    expect(restored.spec).toEqual(original.spec);
    const broken = vi.spyOn(LocalFilesystemArtifactStorage.prototype, 'putFile').mockRejectedValueOnce(new Error('fixture storage error'));
    const failed = await post(base + '/3/render', {});
    expect(await runNextStudioRender()).toBe(true);
    broken.mockRestore();
    expect(JSON.parse((await get(base + '/3/render')).toString())).toMatchObject({ state: 'failed' });
    expect(JSON.parse((await get(base + '/3')).toString()).manifest).toBeNull();
    const retry = await post(base + '/3/render', {});
    expect(retry.id).not.toBe(failed.id);
    const put = LocalFilesystemArtifactStorage.prototype.putFile;
    const expiredWhileRendering = vi.spyOn(LocalFilesystemArtifactStorage.prototype, 'putFile').mockImplementationOnce(async function (this: LocalFilesystemArtifactStorage, input) {
      const output = await put.call(this, input);
      await prisma.studioRender.update({ where: { id: retry.id }, data: { leaseUntil: new Date(0) } });
      return output;
    });
    expect(await runNextStudioRender()).toBe(true);
    expiredWhileRendering.mockRestore();
    expect(JSON.parse((await get(base + '/3')).toString()).manifest).toBeNull();
    expect(await runNextStudioRender()).toBe(true);
    expect(JSON.parse((await get(base + '/3/render')).toString())).toMatchObject({ state: 'succeeded' });
    expect(await post(base + '/1/render', {})).toMatchObject({ state: 'succeeded' });
    expect(sha(await get(base + '/1/export'))).toBe(m1.master.sha256);
    const raced = await Promise.all(
      [1, 2].map(() =>
        app.inject({ method: 'POST', url: base, headers, payload: { expectedVersion: 3, spec } })
      )
    );
    expect(raced.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: base + '/4/approve',
          headers,
          payload: { checksum: m1.master.sha256 }
        })
      ).statusCode
    ).toBe(409);
    const otherContext = await prisma.brandContext.create({
      data: { userId: stranger, name: 'Other', description: 'Other' }
    });
    const otherProject = await prisma.project.create({
      data: {
        userId: stranger,
        contextId: otherContext.id,
        title: 'Other',
        platform: 'Instagram',
        format: 'Video',
        objective: 'Other'
      }
    });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/projects/${otherProject.id}/creative`,
          headers: other,
          payload: { expectedVersion: 0, spec }
        })
      ).statusCode
    ).toBe(404);
    // Older Studio clients send ?v= as a cache buster; now both spellings pin a version.
    const scene = await prisma.scene.create({
      data: { projectId: project.id, sceneKey: 'SCENE-002', position: 2, title: 'Test', description: 'Test' }
    });
    for (const [i, m] of [m1, m2].entries()) {
      const f = m.frames[1];
      await prisma.sceneVersion.create({
        data: { sceneId: scene.id, version: i + 1, imagePath: f.key, prompt: 'fixture', checksum: f.sha256 }
      });
    }
    const url = `/api/projects/${project.id}/scenes/SCENE-002/image`;
    for (const [suffix, expected] of [
      ['?version=1', m1],
      ['?v=1', m1],
      ['', m2]
    ] as const)
      expect(sha(await get(url + suffix))).toBe(expected.frames[1].sha256);
    expect((await app.inject({ url: url + '?version=99', headers })).statusCode).toBe(404);
  } finally {
    await app.close();
    await prisma.project.deleteMany({ where: { userId: { in: [userId, stranger] } } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: [userId, stranger] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, stranger] } } });
    await fs.rm(process.env.ARTIFACT_DIR!, { recursive: true, force: true });
  }
}, 120000);
