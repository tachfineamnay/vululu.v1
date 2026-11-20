import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AccountMail } from '../apps/api/src/infrastructure/email/accountMail';
import { sha256Hex } from '../apps/api/src/security/crypto';

// Use the already migrated disposable PostgreSQL DB, never a configured production DB.
const url = process.env.DATABASE_URL_TEST || 'postgresql://vululu@127.0.0.1:55432/vululu_v1_00_test?schema=public';
const dbUrl = new URL(url);
if (!['127.0.0.1', 'localhost'].includes(dbUrl.hostname) || !dbUrl.pathname.endsWith('_test')) throw new Error('Local test DB required');
process.env.DATABASE_URL = url;
process.env.DATABASE_URL_TEST = url;
process.env.V0_TEST_DB = '1';
process.env.APP_ENV = 'test';
process.env.SESSION_SECRET ||= randomUUID();
process.env.ACCOUNT_EMAIL_ORIGIN = 'http://localhost:3100';

const email = () => `${randomUUID()}@account.example`;
const password = 'A test-only passphrase';
const changed = 'A different test-only passphrase';
const sink: AccountMail[] = [];
let app: Awaited<ReturnType<typeof import('../apps/api/src/server')['buildServer']>>;
let db: typeof import('@vululu/db')['prisma'];
const source = () => `2001:db8::${randomBytes(2).toString('hex')}:${randomBytes(2).toString('hex')}`;
const routeSource = source();
const post = (route: string, payload: object, headers?: Record<string, string>) => app.inject({ method: 'POST', url: `/api/auth/${route}`, payload, headers, remoteAddress: routeSource });
const me = (headers: Record<string, string>) => app.inject({ method: 'GET', url: '/api/auth/me', headers });
async function tokenFrom(recipient: string, page: string, index = 0) {
  const mail = await vi.waitFor(() => {
    const found = sink.filter((m) => m.to === recipient && m.text.includes(`/${page}#`))[index];
    expect(found).toBeDefined();
    return found;
  });
  const link = new URL(mail.text.split('\n')[2]);
  expect(link.origin).toBe('http://localhost:3100');
  expect(link.search).toBe('');
  return new URLSearchParams(link.hash.slice(1)).get('token')!;
}
async function login(address: string, value = password) {
  const response = await post('login', { email: address, password: value });
  expect(response.statusCode).toBe(200);
  return { response, headers: {
    cookie: response.cookies.map((c) => `${c.name}=${c.value}`).join('; '),
    'x-csrf-token': response.json().csrfToken as string
  } };
}

beforeAll(async () => {
  db = (await import('@vululu/db')).prisma;
  app = await (await import('../apps/api/src/server')).buildServer({ accountMail: { async send(mail) { sink.push(mail); } } });
});
afterAll(async () => {
  await app?.close();
  // This suite uses random addresses under its dedicated fixture domain.
  if (db) {
    await db.accountToken.deleteMany({ where: { email: { endsWith: '@account.example' } } });
    await db.user.deleteMany({ where: { email: { endsWith: '@account.example' } } });
    await db.$disconnect();
  }
});

describe('F01 customer account over HTTP and PostgreSQL', () => {
  it('verifies only by email, preserves CSRF/RBAC, and reaches a first project', async () => {
    const address = email();
    expect((await post('register', { email: address }, { origin: 'https://not-vululu.example' })).statusCode).toBe(403);
    const registration = await post('register', { email: address.toUpperCase() });
    expect(registration.statusCode).toBe(202);
    expect(registration.headers['cache-control']).toBe('no-store');
    expect(await db.user.findUnique({ where: { email: address } })).toBeNull();
    expect((await post('login', { email: address, password })).statusCode).toBe(401);
    const first = await tokenFrom(address, 'verify-email');
    expect(await db.accountToken.findUnique({ where: { tokenHash: first } })).toBeNull();
    expect(await db.accountToken.findUnique({ where: { tokenHash: sha256Hex(first) } })).toMatchObject({ purpose: 'verify', userId: null });
    expect((await post('reset-password', { token: first, password })).json().error).toBe('account_link_invalid');
    expect((await post('resend-verification', { email: address })).body).toBe(registration.body);
    const second = await tokenFrom(address, 'verify-email', 1);
    const results = await Promise.all([first, second].map((token) => post('verify-email', { token, password, name: 'New Customer', role: 'super_admin' })));
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 400]);
    expect((await post('verify-email', { token: first, password, name: 'New Customer' })).statusCode).toBe(400);
    expect((await post('register', { email: address })).body).toBe(registration.body);
    const { response, headers } = await login(address.toUpperCase());
    expect(response.json()).toMatchObject({ needsBusinessProfile: true, user: { email: address, role: 'user' } });
    expect((await app.inject({ url: '/api/admin/invitations', headers })).statusCode).toBe(403);
    const context = await app.inject({ method: 'POST', url: '/api/contexts', headers, payload: { name: 'Studio test', description: 'Independent design studio' } });
    expect(context.statusCode).toBe(201);
    const contextId = context.json().context.id;
    expect((await app.inject({ method: 'POST', url: '/api/calendar/offers', headers,
      payload: { contextId, name: 'Brand design', confirmed: true } })).statusCode).toBe(200);
    const project = await app.inject({ method: 'POST', url: '/api/projects', headers,
      payload: { contextId, title: 'First campaign', objective: 'Announce a design service', platform: 'Instagram', format: 'Video' } });
    expect(project.statusCode).toBe(201);
    expect((await login(address)).response.json().needsBusinessProfile).toBe(false);
  });

  it('protects profile/password mutations, revokes other devices, and recovers with a one-use link', async () => {
    const address = email();
    await post('register', { email: address });
    expect((await post('verify-email', { token: await tokenFrom(address, 'verify-email'), password, name: 'Customer' })).statusCode).toBe(200);
    const primary = await login(address);
    const secondary = await login(address);
    expect((await app.inject({ method: 'PATCH', url: '/api/auth/profile', payload: { name: 'New Name' }, headers: { cookie: primary.headers.cookie } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'PATCH', url: '/api/auth/profile', payload: { name: 'New Name', role: 'super_admin', id: 'other-id' }, headers: primary.headers })).json().user).toMatchObject({ name: 'New Name', role: 'user', email: address });
    expect((await post('logout-others', {}, primary.headers)).json().revokedSessions).toBe(1);
    expect((await me(secondary.headers)).statusCode).toBe(401);
    expect((await me(primary.headers)).statusCode).toBe(200);
    const other = await login(address);
    const known = await post('forgot-password', { email: address });
    const unknown = await post('forgot-password', { email: email() });
    expect([known.statusCode, known.body]).toEqual([unknown.statusCode, unknown.body]);
    const beforeChange = await tokenFrom(address, 'reset-password');
    expect((await post('change-password', { currentPassword: 'wrong', password: changed }, primary.headers)).statusCode).toBe(400);
    expect((await post('change-password', { currentPassword: password, password: changed }, primary.headers)).statusCode).toBe(200);
    expect((await post('reset-password', { token: beforeChange, password })).statusCode).toBe(400);
    expect((await me(other.headers)).statusCode).toBe(401);
    expect((await me(primary.headers)).statusCode).toBe(200);
    expect((await post('login', { email: address, password })).statusCode).toBe(401);
    await post('forgot-password', { email: address });
    const token = await tokenFrom(address, 'reset-password', 1);
    await post('forgot-password', { email: address });
    const sibling = await tokenFrom(address, 'reset-password', 2);
    expect((await post('reset-password', { token, password })).statusCode).toBe(200);
    expect((await post('reset-password', { token, password: changed })).statusCode).toBe(400);
    expect((await post('reset-password', { token: sibling, password: changed })).statusCode).toBe(400);
    expect((await me(primary.headers)).statusCode).toBe(401);
    const recovered = await login(address);
    expect((await post('logout-all', {}, recovered.headers)).statusCode).toBe(200);
    expect((await me(recovered.headers)).statusCode).toBe(401);
  });

  it('rejects expired links, caps deliveries, and preserves invited admin access', async () => {
    const address = email();
    for (let i = 0; i < 5; i++) expect((await post('register', { email: address })).statusCode).toBe(202);
    await tokenFrom(address, 'verify-email', 3);
    expect(sink.filter((m) => m.to === address)).toHaveLength(4);
    const token = await tokenFrom(address, 'verify-email');
    await db.accountToken.update({ where: { tokenHash: sha256Hex(token) }, data: { expiresAt: new Date(0) } });
    expect((await post('verify-email', { token, name: 'Expired Customer', password })).statusCode).toBe(400);

    const adminAddress = email();
    const issuerEmail = email();
    const addressWithUnderscore = '_' + issuerEmail.slice(1);
    const issuer = await db.user.create({ data: { email: issuerEmail, role: 'super_admin', name: 'Admin fixture',
      passwordHash: await (await import('bcryptjs')).default.hash(password, 4) } });
    const admin = await login(issuerEmail);
    const invitation = await app.inject({ method: 'POST', url: '/api/admin/invitations', headers: admin.headers,
      payload: { email: adminAddress, role: 'super_admin' } });
    expect(invitation.statusCode).toBe(201);
    expect((await post('register', { email: adminAddress })).statusCode).toBe(202);
    expect(await db.accountToken.count({ where: { email: adminAddress } })).toBe(0);
    expect((await post('activate', { token: invitation.json().token, password, name: 'Invited Admin' })).statusCode).toBe(201);
    const invited = await login(adminAddress);
    expect(invited.response.json()).toMatchObject({ needsBusinessProfile: false, user: { role: 'super_admin' } });
    expect((await app.inject({ url: '/api/admin/invitations', headers: invited.headers })).statusCode).toBe(200);
    const cleanup = await app.inject({ method: 'POST', url: '/api/ops/reconcile', headers: invited.headers, payload: { dryRun: false } });
    expect(cleanup.statusCode).toBe(200);
    expect(await db.accountToken.findUnique({ where: { tokenHash: sha256Hex(token) } })).toBeNull();
    expect(await db.accountToken.count({ where: { email: address } })).toBe(3);
    expect((await post('forgot-password', { email: issuer.email })).statusCode).toBe(202);
    expect(await db.accountToken.count({ where: { email: issuer.email } })).toBe(0);
    expect((await post('register', { email: addressWithUnderscore })).statusCode).toBe(202);
    await tokenFrom(addressWithUnderscore, 'verify-email');
  });

  it('rate-limits oversized volumes from a single source before looking up an address', async () => {
    const remoteAddress = source();
    const send = () => app.inject({ method: 'POST', url: '/api/auth/resend-verification', remoteAddress, payload: { email: 'invalid' } });
    for (let i = 0; i < 30; i++) expect((await send()).statusCode).toBe(400);
    const limited = await send();
    expect(limited.statusCode).toBe(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });
});
