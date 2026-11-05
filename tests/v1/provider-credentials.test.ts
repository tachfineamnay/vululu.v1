import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { beforeAll, afterAll, expect, it, vi } from 'vitest';
vi.hoisted(() => {
  process.env.APP_ENV = 'test'; process.env.V0_TEST_DB = '1'; process.env.SESSION_SECRET = globalThis.crypto.randomUUID();
  process.env.DATABASE_URL_TEST = 'postgresql://vululu@127.0.0.1:55432/vululu_v1_00_test?schema=public'; process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
});
import { prisma as db } from '@vululu/db';
import { buildServer } from '../../apps/api/src/server';

let app: Awaited<ReturnType<typeof buildServer>>; let admin: Record<string, string>; let user: Record<string, string>;
const users: string[] = []; const providers: string[] = []; const stamp = crypto.randomUUID(); const key = 'credential-fixture-' + stamp;
const previousMaster = process.env.PROVIDER_CREDENTIALS_ENCRYPTION_KEY;
beforeAll(async () => {
  process.env.PROVIDER_CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
  app = await buildServer(); const password = crypto.randomUUID(); const passwordHash = await bcrypt.hash(password, 4);
  async function login(role: string) {
    const account = await db.user.create({ data: { email: `credentials-${role}-${stamp}@example.test`, name: 'Fixture', role, passwordHash } }); users.push(account.id);
    const response = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: account.email, password }, remoteAddress: role === 'super_admin' ? '127.91.1.1' : '127.91.1.2' });
    expect(response.statusCode).toBe(200);
    return { cookie: response.cookies.map((c) => c.name + '=' + c.value).join('; '), 'x-csrf-token': response.json().csrfToken };
  }
  admin = await login('super_admin'); user = await login('user');
});
afterAll(async () => {
  vi.restoreAllMocks(); await app?.close();
  await db.provider.deleteMany({ where: { id: { in: providers } } }); await db.user.deleteMany({ where: { id: { in: users } } }); await db.$disconnect();
  if (previousMaster === undefined) delete process.env.PROVIDER_CREDENTIALS_ENCRYPTION_KEY; else process.env.PROVIDER_CREDENTIALS_ENCRYPTION_KEY = previousMaster;
});
async function provider() {
  const item = await db.provider.create({ data: { key: 'credentials-' + crypto.randomUUID(), name: 'Fournisseur de fixture' } }); providers.push(item.id);
  return { ...item, url: '/api/admin/providers/' + item.key + '/credentials' };
}
async function stored(providerId: string) { return (await db.$queryRaw<Array<{ encryptedValue: string }>>`SELECT "encryptedValue" FROM "ProviderCredential" WHERE "providerId" = ${providerId}`)[0]; }
it('enregistre une cle chiffree et restitue uniquement son etat, sans appel fournisseur', async () => {
  const p = await provider(); const network = vi.spyOn(globalThis, 'fetch');
  const response = await app.inject({ method: 'PUT', url: p.url, headers: admin, payload: { apiKey: key } });
  expect(response.statusCode).toBe(200); expect(response.json().credentials).toMatchObject({ configured: true, writable: true });
  expect(response.body).not.toContain(key); expect((await stored(p.id)).encryptedValue).not.toContain(key);
  const list = await app.inject({ method: 'GET', url: '/api/admin/providers', headers: admin });
  expect(list.json().items.find((item: { key: string }) => item.key === p.key).credentials).toMatchObject({ configured: true });
  expect(list.body).not.toMatch(/encryptedValue|ciphertext|apiKey/); expect(network).not.toHaveBeenCalled(); network.mockRestore();
  expect(JSON.stringify(await db.auditEvent.findMany({ where: { targetId: p.id } }))).not.toContain(key);
});
it('remplace avec un nouveau nonce et supprime de facon idempotente', async () => {
  const p = await provider(); const payload = { apiKey: key };
  expect((await app.inject({ method: 'PUT', url: p.url, headers: admin, payload })).statusCode).toBe(200); const first = await stored(p.id);
  expect((await app.inject({ method: 'PUT', url: p.url, headers: admin, payload })).statusCode).toBe(200);
  expect((await stored(p.id)).encryptedValue).not.toBe(first.encryptedValue);
  for (let i = 0; i < 2; i++) expect((await app.inject({ method: 'DELETE', url: p.url, headers: admin })).json().credentials).toMatchObject({ configured: false });
  expect(await stored(p.id)).toBeUndefined();
});
it('refuse utilisateur ordinaire, session absente et CSRF manquant', async () => {
  const p = await provider(); const payload = { apiKey: key };
  expect((await app.inject({ method: 'PUT', url: p.url, headers: user, payload })).statusCode).toBe(403);
  expect((await app.inject({ method: 'DELETE', url: p.url, headers: user })).statusCode).toBe(403);
  expect((await app.inject({ method: 'PUT', url: p.url, payload })).statusCode).toBe(401);
  expect((await app.inject({ method: 'PUT', url: p.url, headers: { cookie: admin.cookie }, payload })).statusCode).toBe(403);
});
it('refuse une entree invalide sans en recopier la valeur dans une erreur', async () => {
  const p = await provider();
  for (const payload of [{ apiKey: '' }, { apiKey: '   ' }, { apiKey: 42 }, { apiKey: key + '\nsecond-line' }, { apiKey: key + 'x'.repeat(4096) }, { apiKey: 'é'.repeat(2049) }, { apiKey: key, extra: true }]) {
    const response = await app.inject({ method: 'PUT', url: p.url, headers: admin, payload }); expect(response.statusCode).toBe(400); expect(response.body).not.toContain(key);
  }
  expect(await stored(p.id)).toBeUndefined();
});
it('laisse la demo utilisable sans cle maitresse et interdit tout stockage en clair', async () => {
  const p = await provider(); const current = process.env.PROVIDER_CREDENTIALS_ENCRYPTION_KEY;
  try {
    delete process.env.PROVIDER_CREDENTIALS_ENCRYPTION_KEY;
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: user })).statusCode).toBe(200);
    const response = await app.inject({ method: 'PUT', url: p.url, headers: admin, payload: { apiKey: key } });
    expect(response.statusCode).toBe(503); expect(response.body).not.toContain(key); expect(await stored(p.id)).toBeUndefined();
  } finally { process.env.PROVIDER_CREDENTIALS_ENCRYPTION_KEY = current; }
});
it('isole une reference de fournisseur inexistante', async () => {
  expect((await app.inject({ method: 'PUT', url: '/api/admin/providers/absent-' + stamp + '/credentials', headers: admin, payload: { apiKey: key } })).statusCode).toBe(404);
});
