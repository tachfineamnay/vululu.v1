import { randomUUID, createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
vi.hoisted(() => {
  const url = new URL(process.env.DATABASE_URL_TEST || 'postgresql://vululu@127.0.0.1:55432/vululu_v1_00_test');
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !url.pathname.endsWith('_test'))
    throw new Error('Disposable local test DB required');
  Object.assign(process.env, {
    DATABASE_URL: url.href,
    DATABASE_URL_TEST: url.href,
    V0_TEST_DB: '1',
    APP_ENV: 'test',
    SESSION_SECRET: crypto.randomUUID(),
    ARTIFACT_DIR: '.v1/c04-' + crypto.randomUUID(),
    ARTIFACT_STORAGE_BACKEND: 'local'
  });
});
import { prisma } from '@vululu/db';

import { buildServer } from '../../apps/api/src/server';
import { composeGuide, outputKind, outputSize } from '@vululu/contracts';
const sharp = createRequire(path.resolve('packages/media/package.json'))('sharp');
const sha = (v: Buffer) => createHash('sha256').update(v).digest('hex');
it('exports every guided format and a checksummed calendar-linked campaign', async () => {
  const app = await buildServer(),
    userId = randomUUID(),
    stranger = randomUUID(),
    password = randomUUID(),
    evidence = process.env.C04_EVIDENCE;
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
    const campaign = await prisma.campaign.create({ data: { userId, name: 'Orbites' } });
    const project = await prisma.project.create({
      data: {
        userId,
        contextId: ctx.id,
        campaignId: campaign.id,
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
    async function upload(name: string, kind: string, bytes: Buffer, mimeType = 'image/png') {
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
              mimeType,
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
    const fixture = 'tests/fixtures/c04/';
    const photos: string[] = [];
    for (const n of ['rocket.jpg', 'moon.png', 'astronaut.png'])
      photos.push(
        await upload(n, 'image', await fs.readFile(fixture + n), n.endsWith('jpg') ? 'image/jpeg' : 'image/png')
      );
    const logo = await upload(
      'Orbit logo',
      'logo',
      await sharp(fixture + 'orbit.svg')
        .png()
        .toBuffer()
    );
    const clip = await upload('Launch', 'video', await fs.readFile(fixture + 'launch.mp4'), 'video/mp4'),
      audio = await upload('Note', 'audio', await fs.readFile(fixture + 'note.wav'), 'audio/wav');
    const offer = await post('/api/calendar/offers', {
        contextId: ctx.id,
        name: 'Nuit au télescope',
        confirmed: true
      }),
      itemId = randomUUID();
    await post('/api/calendar', {
      id: itemId,
      requestId: randomUUID(),
      expectedVersion: 0,
      data: {
        title: 'Sous les étoiles',
        offerId: offer.id,
        audience: 'Familles',
        objective: 'Découverte',
        projectId: project.id,
        campaignId: campaign.id,
        status: 'IDEA',
        archived: false,
        plannedAt: '2027-01-01T20:00:00.000Z',
        timeZone: 'UTC',
        variants: [
          { platform: 'Instagram', format: 'Reel', caption: 'Sous les étoiles', cta: 'Réserver une place' },
          {
            platform: 'LinkedIn',
            format: 'Affiche',
            caption: 'Atelier pour les équipes',
            cta: 'Inscrire mon équipe'
          }
        ]
      }
    });
    let version = 0;
    if (evidence) await fs.mkdir(evidence, { recursive: true });
    for (const kind of outputKind.options) {
      const spec = composeGuide({
        delivery: {
          kind,
          platform: kind === 'portrait' ? 'LinkedIn' : 'Instagram',
          calendar: { itemId, version: 1 },
          ...(kind === 'short' ? { audio: { versionId: audio, gain: 0.8 }, transition: 'dip' as const } : {})
        },
        brand: { background: '#142440', accent: '#ffdc70' },
        name: 'ATELIER ORBITE',
        title: 'Sous les étoiles',
        offer: 'Nuit au télescope',
        cta: kind === 'portrait' ? 'Inscrire mon équipe' : 'Réserver une place',
        photos,
        logo,
        clip
      });
      await post(base, { expectedVersion: version, spec });
      version++;
      const m = await post(base + '/' + version + '/render', {});
      const b = await get(base + '/' + version + '/master');
      expect(sha(b)).toBe(m.master.sha256);
      if (kind === 'short') {
        expect(m.seconds).toBeCloseTo(8, 1);
        if (evidence) await fs.writeFile(path.join(evidence, 'short.mp4'), b);
      } else
        for (const [i, scene] of spec.scenes.entries()) {
          const f = await get(`${base}/${version}/scenes/${scene.key}`);
          expect(sha(f)).toBe(m.frames[i].sha256);
          const meta = await sharp(f).metadata();
          expect([meta.width, meta.height]).toEqual(outputSize[kind]);
          if (evidence)
            await fs.writeFile(
              path.join(evidence, kind + (kind === 'carousel' ? '-' + (i + 1) : '') + '.png'),
              f
            );
        }
    }
    const pack = '/api/campaigns/' + campaign.id + '/creative-package';
    const zip = await get(pack);
    expect(zip.toString('ascii', 0, 2)).toBe('PK');
    if (evidence) await fs.writeFile(path.join(evidence, 'campaign.zip'), zip);
    expect((await app.inject({ url: pack, headers: other })).statusCode).toBe(404);
  } finally {
    await app.close();
    await prisma.project.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, stranger] } } });
    await fs.rm(process.env.ARTIFACT_DIR!, { recursive: true, force: true });
  }
}, 120000);
