import { randomUUID } from 'node:crypto';
import { it, expect, vi } from 'vitest';
import bcrypt from 'bcryptjs';
vi.hoisted(() => {
  const url = new URL(process.env.DATABASE_URL_TEST || 'postgresql://vululu@127.0.0.1:55432/vululu_v1_00_test');
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !url.pathname.endsWith('_test'))
    throw new Error('Disposable local test database required.');
  process.env.DATABASE_URL = url.href;
  process.env.DATABASE_URL_TEST = url.href;
  process.env.V0_TEST_DB = '1';
  process.env.APP_ENV = 'test';
  process.env.SESSION_SECRET = globalThis.crypto.randomUUID();
});
import { buildServer } from '../../apps/api/src/server';
import { prisma } from '@vululu/db';
import type { CalendarMutation, Content, Stage } from '@vululu/contracts';
import { calendarStore as store } from '../../apps/api/src/infrastructure/prisma/calendarStore';

// Run against a migrated, disposable local database only. Never touch existing records.
it('persists history, rejects cross-account links, retries safely and arbitrates concurrent slots', async () => {
  const app = await buildServer(),
    password = randomUUID(),
    passwordHash = await bcrypt.hash(password, 4);
  const a = randomUUID(),
    b = randomUUID();
  const when = '2099-11-15T10:00:00.000Z';
  try {
    for (const id of [a, b])
      await prisma.user.create({
        data: { id, email: `${id}@example.test`, name: 'Fixture', passwordHash }
      });
    const ctx = await prisma.brandContext.create({ data: { userId: a, name: 'Atelier', description: 'Dessin' } });
    const other = await prisma.brandContext.create({ data: { userId: b, name: 'Autre', description: 'Autre' } });
    const campaign = await prisma.campaign.create({ data: { userId: b, name: 'Autre campagne' } });
    const project = await prisma.project.create({
      data: {
        userId: b,
        contextId: other.id,
        title: 'Autre',
        objective: 'Vente',
        format: 'Affiche',
        platform: 'Instagram'
      }
    });
    const offer = await store.confirm(a, ctx.id, 'Cours');
    expect(await store.confirm(a, ctx.id, 'Cours')).toEqual(offer);
    expect(await store.offers(b)).toEqual([]);
    await expect(store.confirm(b, ctx.id, 'Interdit')).rejects.toMatchObject({ statusCode: 404 });
    const data: Content = {
      offerId: offer.id,
      title: 'Le cours',
      objective: 'Inscriptions',
      audience: 'Artistes',
      timeZone: 'UTC',
      plannedAt: when,
      status: 'IDEA',
      archived: false,
      projectId: null,
      campaignId: null,
      variants: [{ platform: 'Instagram', format: 'Affiche', caption: 'Le cours commence', cta: 'Réserver' }]
    };
    const cmd = (id: string, version: number, status: Stage, change: Partial<Content> = {}): CalendarMutation => ({
      id,
      requestId: randomUUID(),
      expectedVersion: version,
      data: { ...data, status, ...change }
    });
    const id = randomUUID(),
      first = cmd(id, 0, 'IDEA');
    const replay = await Promise.all([store.save(a, first), store.save(a, first)]);
    expect(replay[0]).toEqual(replay[1]);
    await expect(store.save(a, { ...first, data: { ...data, title: 'Autre' } })).rejects.toMatchObject({
      statusCode: 409
    });
    await expect(store.save(b, cmd(id, 1, 'DRAFT'))).rejects.toMatchObject({ statusCode: 404 });
    await expect(store.save(b, cmd(randomUUID(), 0, 'IDEA'))).rejects.toMatchObject({ statusCode: 404 });
    for (const change of [{ campaignId: campaign.id }, { projectId: project.id }])
      await expect(store.save(a, cmd(id, 1, 'DRAFT', change))).rejects.toMatchObject({ statusCode: 404 });
    expect(await store.history(b, id)).toEqual([]);
    expect(await store.list(b, new Date(when), new Date(Date.parse(when) + 60000), false)).toEqual([]);
    // Real session + CSRF middleware must derive ownership from B, never the payload.
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: b + '@example.test', password }
    });
    expect(login.statusCode).toBe(200);
    const headers = {
      cookie: login.cookies.map((c) => c.name + '=' + c.value).join('; '),
      'x-csrf-token': login.json().csrfToken
    };
    const foreign = await app.inject({
      method: 'POST',
      url: '/api/calendar',
      headers,
      payload: { ...cmd(id, 1, 'DRAFT'), userId: a }
    });
    expect(foreign.statusCode).toBe(404);
    const history = await app.inject({ method: 'GET', url: `/api/calendar/${id}/history`, headers });
    expect(history.statusCode).toBe(200);
    expect(history.json()).toEqual([]);
    expect((await app.inject({ method: 'GET', url: '/api/calendar/offers' })).statusCode).toBe(401);
    const second = randomUUID();
    await store.save(a, cmd(second, 0, 'IDEA'));
    for (const item of [id, second]) {
      await store.save(a, cmd(item, 1, 'DRAFT'));
      await store.save(a, cmd(item, 2, 'READY_FOR_REVIEW'));
      await store.save(a, cmd(item, 3, 'APPROVED'));
    }
    const results = await Promise.allSettled([id, second].map((item) => store.save(a, cmd(item, 4, 'SCHEDULED'))));
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((x) => x.status === 'rejected')).toMatchObject({ reason: { statusCode: 409 } });
    const winner = results[0].status === 'fulfilled' ? id : second;
    await expect(store.save(a, cmd(winner, 4, 'SCHEDULED'))).rejects.toMatchObject({ statusCode: 409 });
    const moved = '2099-11-16T13:00:00.000Z';
    await store.save(a, cmd(winner, 5, 'SCHEDULED', { plannedAt: moved }));
    expect(await store.list(a, new Date(moved), new Date(Date.parse(moved) + 60000), false)).toMatchObject([
      { id: winner, version: 6 }
    ]);
    expect(await store.history(a, winner)).toHaveLength(6);
  } finally {
    await app.close();
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: [a, b] } } });
    await prisma.contentItem.deleteMany({ where: { userId: { in: [a, b] } } });
    await prisma.project.deleteMany({ where: { userId: b } });
    await prisma.user.deleteMany({ where: { id: { in: [a, b] } } });
  }
});
