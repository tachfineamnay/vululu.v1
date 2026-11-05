import crypto from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import bcrypt from 'bcryptjs';
import { afterAll, expect, it, vi } from 'vitest';
vi.hoisted(() => { process.env.DATABASE_URL = 'postgresql://vululu@127.0.0.1:55432/vululu_v1_00_test?schema=public'; process.env.APP_ENV = 'test'; });
import { prisma as db } from '@vululu/db';
const emails: string[] = [];
function email() { const value = 'bootstrap-admin-' + crypto.randomUUID() + '@example.test'; emails.push(value); return value; }
function seed(address: string, password: string) {
  const cli = createRequire(path.join(process.cwd(), 'package.json')).resolve('tsx/cli');
  return spawnSync(process.execPath, [cli, 'packages/db/prisma/seed.ts'], { env: { ...process.env, V1_BOOTSTRAP_EMAIL: address, V1_BOOTSTRAP_PASSWORD: password }, stdio: 'pipe', windowsHide: true }).status;
}
afterAll(async () => { await db.user.deleteMany({ where: { email: { in: emails } } }); await db.$disconnect(); });
it('cree un premier administrateur sans afficher son mot de passe', async () => {
  const address = email(); const password = crypto.randomUUID(); expect(seed(address, password)).toBe(0);
  const row = await db.user.findUniqueOrThrow({ where: { email: address } }); expect(row.role).toBe('super_admin'); expect(await bcrypt.compare(password, row.passwordHash)).toBe(true);
});
it('ne transforme pas un compte ordinaire en administrateur', async () => {
  const address = email(); const hash = await bcrypt.hash(crypto.randomUUID(), 4);
  const original = await db.user.create({ data: { email: address, name: 'Compte existant', role: 'user', passwordHash: hash } });
  expect(seed(address, crypto.randomUUID())).not.toBe(0);
  const row = await db.user.findUniqueOrThrow({ where: { id: original.id } }); expect(row.role).toBe('user'); expect(row.passwordHash === hash).toBe(true); expect(row.name).toBe('Compte existant');
});
it('ne reinitialise pas un administrateur existant', async () => {
  const address = email(); const hash = await bcrypt.hash(crypto.randomUUID(), 4);
  const original = await db.user.create({ data: { email: address, name: 'Admin existant', role: 'super_admin', passwordHash: hash } });
  expect(seed(address, crypto.randomUUID())).toBe(0);
  const row = await db.user.findUniqueOrThrow({ where: { id: original.id } }); expect(row.passwordHash === hash).toBe(true); expect(row.name).toBe('Admin existant');
});
