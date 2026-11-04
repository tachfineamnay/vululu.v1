import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { execSync } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.hoisted(() => {
  process.env.DATABASE_URL = 'postgresql://vululu@127.0.0.1:55432/vululu_v1_00_test?schema=public';
  process.env.DATABASE_URL_TEST = process.env.DATABASE_URL;
  process.env.V0_TEST_DB = '1';
  process.env.APP_ENV = 'test';
  process.env.SESSION_SECRET = globalThis.crypto.randomUUID();
});
import { prisma as db } from '@vululu/db';
import { bootstrapDemo } from '../../apps/api/src/infrastructure/demo/bootstrapDemo';

// Base de test uniquement : aucune lecture de .env ni de credentials deployes.
const env = {
  DEMO_MODE: '1',
  DEMO_EMAIL: 'fixture-demo@example.test',
  DEMO_PASSWORD: crypto.randomBytes(24).toString('base64url')
};

async function cleanFixtures() {
  const users = await db.user.findMany({ where: { OR: [{ id: 'v1-demo-user' }, { email: { in: [env.DEMO_EMAIL, 'foreign@example.test'] } }] }, select: { id: true } });
  const ids = users.map((user) => user.id);
  await db.project.deleteMany({ where: { userId: { in: ids } } });
  await db.brandContext.deleteMany({ where: { userId: { in: ids } } });
  await db.auditEvent.deleteMany({ where: { action: 'demo.bootstrap.created', targetId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
}
beforeAll(async () => {
  execSync('pnpm exec prisma migrate deploy --schema packages/db/prisma/schema.prisma', { env: { ...process.env }, stdio: 'pipe' });
  await db.$connect();
});
beforeEach(cleanFixtures);
afterAll(async () => { await cleanFixtures(); await db.$disconnect(); });

describe('Bootstrap demo isole et non destructif', () => {
  it('cree un utilisateur ordinaire, une revision checksummée et un projet de depart', async () => {
    const result = await bootstrapDemo(db, env);
    const user = await db.user.findUniqueOrThrow({ where: { id: result.userId } });
    expect(user.role).toBe('user');
    expect(user.email).toBe(env.DEMO_EMAIL);
    expect(user.passwordHash).not.toBe(env.DEMO_PASSWORD);
    expect(await bcrypt.compare(env.DEMO_PASSWORD, user.passwordHash)).toBe(true);
    const context = await db.brandContext.findUniqueOrThrow({ where: { id: result.contextId }, include: { revisions: true } });
    expect(context.userId).toBe(user.id);
    expect(context.revisions).toHaveLength(1);
    expect(context.revisions[0].checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(await db.project.findFirst({ where: { id: result.projectId, userId: user.id, contextId: context.id } })).not.toBeNull();
    expect(await db.auditEvent.count({ where: { action: 'demo.bootstrap.created', targetId: user.id } })).toBe(1);
  });

  it('preserve le mot de passe et les modifications utilisateur lors du replay', async () => {
    const first = await bootstrapDemo(db, env);
    const oldUser = await db.user.findUniqueOrThrow({ where: { id: first.userId } });
    await db.project.update({ where: { id: first.projectId }, data: { title: 'Travail conserve' } });
    const again = await bootstrapDemo(db, { ...env, DEMO_PASSWORD: crypto.randomBytes(24).toString('base64url') });
    expect(again).toEqual(first);
    expect(await db.user.count({ where: { id: first.userId } })).toBe(1);
    expect(await db.brandContext.count({ where: { userId: first.userId } })).toBe(1);
    expect(await db.contextRevision.count({ where: { contextId: first.contextId } })).toBe(1);
    expect(await db.project.count({ where: { userId: first.userId } })).toBe(1);
    expect((await db.user.findUniqueOrThrow({ where: { id: first.userId } })).passwordHash).toBe(oldUser.passwordHash);
    expect((await db.project.findUniqueOrThrow({ where: { id: first.projectId } })).title).toBe('Travail conserve');
  });

  it('permet le login normal, exige CSRF, refuse admin et logout invalide la session', async () => {
    await bootstrapDemo(db, env);
    const { buildServer } = await import('../../apps/api/src/server');
    const app = await buildServer();
    try {
      const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: env.DEMO_EMAIL, password: env.DEMO_PASSWORD } });
      expect(login.statusCode).toBe(200);
      expect(login.json().user.role).toBe('user');
      const cookies = login.cookies.map((cookie) => cookie.name + '=' + cookie.value).join('; ');
      const overview = await app.inject({ method: 'GET', url: '/api/admin/overview', headers: { cookie: cookies } });
      expect(overview.statusCode).toBe(403);
      const noCsrf = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie: cookies } });
      expect(noCsrf.statusCode).toBe(403);
      const logout = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie: cookies, 'x-csrf-token': login.json().csrfToken } });
      expect(logout.statusCode).toBe(200);
      const replay = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: cookies } });
      expect(replay.statusCode).toBe(401);
    } finally { await app.close(); }
  });

  it.each([undefined, '0', 'true'])('refuse DEMO_MODE=%s sans ecriture', async (mode) => {
    await expect(bootstrapDemo(db, { ...env, DEMO_MODE: mode })).rejects.toThrow('demo_mode_required');
    expect(await db.user.count({ where: { email: env.DEMO_EMAIL } })).toBe(0);
  });

  it.each(['', 'short', 'a'.repeat(73), 'é'.repeat(37)])('refuse un mot de passe absent, faible ou tronque par bcrypt', async (password) => {
    await expect(bootstrapDemo(db, { ...env, DEMO_PASSWORD: password })).rejects.toThrow('demo_credentials_invalid');
    expect(await db.user.count({ where: { email: env.DEMO_EMAIL } })).toBe(0);
  });

  it('refuse une adresse invalide sans exposer les valeurs', async () => {
    await expect(bootstrapDemo(db, { ...env, DEMO_EMAIL: 'invalid' })).rejects.toThrow(/^demo_credentials_invalid$/);
    expect(await db.user.count({ where: { email: env.DEMO_EMAIL } })).toBe(0);
  });

  it('ne prend pas possession d un compte existant avec la meme adresse', async () => {
    const original = await db.user.create({ data: { email: env.DEMO_EMAIL, name: 'Compte existant', role: 'super_admin', passwordHash: 'fixture-existing-hash' } });
    await expect(bootstrapDemo(db, env)).rejects.toThrow('demo_account_collision');
    expect(await db.user.findUnique({ where: { id: original.id } })).toEqual(original);
    expect(await db.brandContext.count({ where: { userId: original.id } })).toBe(0);
    expect(await db.auditEvent.count({ where: { action: 'demo.bootstrap.created', targetId: original.id } })).toBe(0);
  });

  it('refuse un compte demo promu admin au lieu de le retrograder silencieusement', async () => {
    const first = await bootstrapDemo(db, env);
    await db.user.update({ where: { id: first.userId }, data: { role: 'super_admin' } });
    await expect(bootstrapDemo(db, env)).rejects.toThrow('demo_account_collision');
    expect((await db.user.findUniqueOrThrow({ where: { id: first.userId } })).role).toBe('super_admin');
  });

  it('refuse de renommer le compte demo en changeant simplement la configuration', async () => {
    const first = await bootstrapDemo(db, env);
    await expect(bootstrapDemo(db, { ...env, DEMO_EMAIL: 'different@example.test' })).rejects.toThrow('demo_account_collision');
    expect((await db.user.findUniqueOrThrow({ where: { id: first.userId } })).email).toBe(env.DEMO_EMAIL);
  });

  it('annule toute creation si un identifiant exemple appartient deja a un autre utilisateur', async () => {
    const first = await bootstrapDemo(db, env);
    await db.auditEvent.deleteMany({ where: { action: 'demo.bootstrap.created', targetId: first.userId } });
    await db.project.deleteMany({ where: { userId: first.userId } });
    await db.user.delete({ where: { id: first.userId } });
    const foreign = await db.user.create({ data: { email: 'foreign@example.test', name: 'Tiers', passwordHash: 'fixture-foreign-hash' } });
    await db.brandContext.create({ data: { id: first.contextId, userId: foreign.id, name: 'Prive', description: 'Ne pas ecraser' } });
    await expect(bootstrapDemo(db, env)).rejects.toThrow('demo_resource_collision');
    expect(await db.user.count({ where: { email: env.DEMO_EMAIL } })).toBe(0);
    expect((await db.brandContext.findUniqueOrThrow({ where: { id: first.contextId } })).userId).toBe(foreign.id);
  });
});
