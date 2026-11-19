import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
vi.hoisted(() => {
  const u = new URL(process.env.DATABASE_URL_TEST || 'postgres://vululu@127.0.0.1:55432/vululu_v1_00_test');
  if (!['127.0.0.1', 'localhost'].includes(u.hostname) || !u.pathname.endsWith('_test'))
    throw Error('Disposable DB required');
  Object.assign(process.env, { APP_ENV: 'test', DATABASE_URL: u.href, SESSION_SECRET: crypto.randomUUID() });
});
import { prisma } from '@vululu/db';
import { readBatch, studioState } from '../../apps/api/src/routes/studio';
let user: string, project: string, session: string;
const access = () => ({ user, project, session });
beforeEach(async () => {
  user = randomUUID();
  await prisma.user.create({
    data: { id: user, email: user + '@example.test', name: 'Fixture', passwordHash: 'unused' },
  });
  session = (
    await prisma.session.create({
      data: {
        userId: user,
        tokenHash: randomUUID(),
        csrfHash: randomUUID(),
        expiresAt: new Date(Date.now() + 60000),
      },
    })
  ).id;
  const ctx = await prisma.brandContext.create({
    data: { userId: user, name: 'Atelier', description: 'Description' },
  });
  project = (
    await prisma.project.create({
      data: {
        userId: user,
        contextId: ctx.id,
        title: 'Objet',
        platform: 'Instagram',
        format: 'Video',
        objective: 'Découverte',
      },
    })
  ).id;
});
afterEach(async () => {
  await prisma.project.deleteMany({ where: { userId: user } });
  await prisma.user.delete({ where: { id: user } });
});
it('orders concurrent commits per project and rolls back its cursor with the transaction', async () => {
  const start = (await studioState(access())).cursor;
  await expect(
    prisma.$transaction(async (tx) => {
      await tx.project.update({ where: { id: project }, data: { title: 'never visible' } });
      throw Error('rollback');
    }),
  ).rejects.toThrow('rollback');
  await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      prisma.message.create({ data: { projectId: project, role: 'user', content: 'private-' + i } }),
    ),
  );
  const a = await readBatch(access(), start);
  expect(a.rows.map((x) => x.cursor)).toEqual([1, 2, 3, 4, 5, 6].map((n) => start + n));
  expect(JSON.stringify(a)).not.toContain('private-');
  expect((await readBatch(access(), start + 4)).rows).toEqual(a.rows.slice(4));
  expect(await readBatch(access(), a.cursor)).toMatchObject({ reset: false, rows: [] });
});
it('recovers gaps and future cursors from the authoritative snapshot', async () => {
  await prisma.message.create({ data: { projectId: project, role: 'user', content: 'Test' } });
  await prisma.studioEvent.deleteMany({ where: { projectId: project, cursor: 1 } });
  expect((await readBatch(access(), 0)).reset).toBe(true);
  const s = await studioState(access());
  expect((await readBatch(access(), s.cursor + 1)).reset).toBe(true);
  expect((await readBatch(access(), s.cursor)).reset).toBe(false);
});
it('revalidates session and ownership on every batch including empty heartbeats', async () => {
  await expect(readBatch({ ...access(), project: randomUUID() }, 0)).rejects.toMatchObject({
    statusCode: 404,
  });
  await expect(studioState({ ...access(), user: randomUUID() })).rejects.toMatchObject({ statusCode: 401 });
  await prisma.session.update({ where: { id: session }, data: { revokedAt: new Date() } });
  await expect(readBatch(access(), 1)).rejects.toMatchObject({ statusCode: 401 });
});
