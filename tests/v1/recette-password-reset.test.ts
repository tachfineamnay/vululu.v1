import crypto from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { resetRecettePasswords } from '../../apps/api/src/infrastructure/demo/resetRecettePasswords';

const schema = 'recette_reset_' + crypto.randomBytes(8).toString('hex');
const { PrismaClient } = createRequire(path.join(process.cwd(), 'packages/db/package.json'))('@prisma/client');
const url = new URL('postgresql://vululu@127.0.0.1:55432/vululu_v1_00_test');
url.searchParams.set('schema', schema);
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
const config = { DEMO_MODE: '1', RECETTE_RESET_PASSWORDS: '1', RECETTE_ALLOW_SHORT_PASSWORDS: '1', V1_BOOTSTRAP_EMAIL: 'admin@example.test', V1_BOOTSTRAP_PASSWORD: 'fixture-admin', DEMO_EMAIL: 'demo@example.test', DEMO_PASSWORD: 'fixture' };
beforeAll(async () => {
  const cli = path.join(path.dirname(createRequire(path.join(process.cwd(), 'package.json')).resolve('prisma/package.json')), 'build/index.js');
  const result = spawnSync(process.execPath, [cli, 'migrate', 'deploy', '--schema', 'packages/db/prisma/schema.prisma'], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: 'pipe', windowsHide: true });
  expect(result.status, 'Migrations du schema de test isole').toBe(0);
});
beforeEach(async () => {
  await db.auditEvent.deleteMany(); await db.user.deleteMany();
  const hash = await bcrypt.hash('fixture-original-password', 4);
  await db.user.createMany({ data: [
    { id: 'admin', email: config.V1_BOOTSTRAP_EMAIL, name: 'Admin fixture', passwordHash: hash, role: 'super_admin' },
    { id: 'v1-demo-user', email: config.DEMO_EMAIL, name: 'Demo fixture', passwordHash: hash, role: 'user' },
    { id: 'other', email: 'other@example.test', name: 'Other fixture', passwordHash: hash, role: 'user' }
  ] });
  await db.auditEvent.create({ data: { actorId: 'v1-demo-user', targetId: 'v1-demo-user', targetType: 'user', action: 'demo.bootstrap.created' } });
  await db.session.createMany({ data: ['admin', 'v1-demo-user', 'other'].map((userId) => ({ userId, tokenHash: crypto.randomUUID(), csrfHash: crypto.randomUUID(), expiresAt: new Date(Date.now() + 60000) })) });
});
afterAll(async () => {
  if (!/^recette_reset_[a-f0-9]{16}$/.test(schema)) throw new Error('Schema de test inattendu');
  await db.$executeRawUnsafe('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE'); await db.$disconnect();
});
it('reste sans effet sans activation explicite', async () => {
  expect(await resetRecettePasswords(db, { ...config, RECETTE_RESET_PASSWORDS: '0' })).toBe(0);
  expect(await db.session.count({ where: { revokedAt: null } })).toBe(3);
});
it('refuse hors demo et sans politique explicite pour les mots de passe courts', async () => {
  await expect(resetRecettePasswords(db, { ...config, DEMO_MODE: '0' })).rejects.toThrow();
  await expect(resetRecettePasswords(db, { ...config, RECETTE_ALLOW_SHORT_PASSWORDS: '0' })).rejects.toThrow();
});
it('refuse une mauvaise identite sans modifier aucun compte', async () => {
  await db.user.update({ where: { id: 'admin' }, data: { role: 'user' } });
  await expect(resetRecettePasswords(db, config)).rejects.toThrow();
  expect(await db.session.count({ where: { revokedAt: null } })).toBe(3);
  expect(await bcrypt.compare('fixture-original-password', (await db.user.findUniqueOrThrow({ where: { id: 'v1-demo-user' } })).passwordHash)).toBe(true);
});
it('refuse les valeurs vides ou tronquables par bcrypt', async () => {
  await expect(resetRecettePasswords(db, { ...config, DEMO_PASSWORD: '' })).rejects.toThrow();
  await expect(resetRecettePasswords(db, { ...config, V1_BOOTSTRAP_PASSWORD: 'x'.repeat(73) })).rejects.toThrow();
  expect(await db.session.count({ where: { revokedAt: null } })).toBe(3);
});
it('refuse un faux compte demo sans marqueur', async () => {
  await db.auditEvent.deleteMany();
  await expect(resetRecettePasswords(db, config)).rejects.toThrow();
  expect(await db.session.count({ where: { revokedAt: null } })).toBe(3);
});
it('synchronise uniquement les deux comptes et revoque leurs sessions sans secret dans les audits', async () => {
  const other = await db.user.findUniqueOrThrow({ where: { id: 'other' } });
  expect(await resetRecettePasswords(db, config)).toBe(2);
  expect(await bcrypt.compare(config.V1_BOOTSTRAP_PASSWORD, (await db.user.findUniqueOrThrow({ where: { id: 'admin' } })).passwordHash)).toBe(true);
  expect(await bcrypt.compare(config.DEMO_PASSWORD, (await db.user.findUniqueOrThrow({ where: { id: 'v1-demo-user' } })).passwordHash)).toBe(true);
  expect((await db.user.findUniqueOrThrow({ where: { id: 'other' } })).passwordHash).toBe(other.passwordHash);
  expect(await db.session.count({ where: { revokedAt: null } })).toBe(1);
  const audits = JSON.stringify(await db.auditEvent.findMany());
  expect(audits).not.toContain(config.DEMO_PASSWORD); expect(audits).not.toContain(config.V1_BOOTSTRAP_PASSWORD);
});
