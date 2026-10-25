import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Isolated test database: never the demo database. Must be set before apps/api env is imported.
const testDbUrl = 'postgresql://vululu@127.0.0.1:55432/vululu_v1_00_test?schema=public';
process.env.V0_TEST_DB = '1';
process.env.DATABASE_URL_TEST = testDbUrl;
process.env.DATABASE_URL = testDbUrl;
process.env.APP_ENV = 'local';

const password = 'Vululu-Test-Password-123';
const activationPassword = 'Activated-Password-123';
const sessionTtlMs = 24 * 60 * 60 * 1000;
const invitationTtlMs = 72 * 60 * 60 * 1000;

let app: any;
let prisma: any;
let bcrypt: any;

let admin: any;
let userA: any;
let userB: any;
let adminAuth: any;
let userAAuth: any;
let userBAuth: any;

let contextA: any;
let projectA: any;
let masterVersionA: any;

type SessionAuth = {
  sessionCookie: string;
  csrfCookie: string;
  csrfToken: string;
};

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function randomToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function setCookieHeaders(response: any): string[] {
  const raw = response.headers['set-cookie'];
  if (!raw) {
    return [];
  }
  return Array.isArray(raw) ? raw : [raw];
}

function cookiePair(headers: string[], name: string): string {
  const prefix = name + '=';
  const header = headers.find((item) => item.startsWith(prefix));
  return header ? header.split(';')[0] : '';
}

function findSetCookie(headers: string[], name: string): string {
  const prefix = name + '=';
  return headers.find((item) => item.startsWith(prefix)) ?? '';
}

function isMutating(method: string): boolean {
  return ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method.toUpperCase());
}

async function login(email: string, passwordValue: string, existing?: Partial<SessionAuth> | null) {
  const requestHeaders: Record<string, string> = {};
  if (existing?.sessionCookie) {
    requestHeaders.cookie = existing.sessionCookie;
  }
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: requestHeaders,
    payload: { email, password: passwordValue }
  });
  const body = response.statusCode === 200 ? response.json() : {};
  const headers = setCookieHeaders(response);
  return {
    status: response.statusCode,
    body,
    headers,
    sessionCookie: cookiePair(headers, 'session'),
    csrfCookie: cookiePair(headers, 'vululu_csrf'),
    csrfToken: typeof body.csrfToken === 'string' ? body.csrfToken : '',
    sessionSetCookie: findSetCookie(headers, 'session'),
    csrfSetCookie: findSetCookie(headers, 'vululu_csrf')
  };
}

function toAuth(result: Awaited<ReturnType<typeof login>>): SessionAuth {
  return {
    sessionCookie: result.sessionCookie,
    csrfCookie: result.csrfCookie,
    csrfToken: result.csrfToken
  };
}

async function request(
  method: string,
  url: string,
  auth?: Partial<SessionAuth> | null,
  payload?: unknown,
  extraHeaders: Record<string, string> = {}
) {
  const headers: Record<string, string> = { ...extraHeaders };
  if (auth?.sessionCookie && headers.cookie === undefined) {
    headers.cookie = auth.csrfCookie
      ? auth.sessionCookie + '; ' + auth.csrfCookie
      : auth.sessionCookie;
  }
  if (isMutating(method) && headers['x-csrf-token'] === undefined && auth?.csrfToken) {
    headers['x-csrf-token'] = auth.csrfToken;
  }
  if (payload === undefined) {
    return app.inject({ method, url, headers });
  }
  return app.inject({ method, url, headers, payload });
}

async function createTestUser(email: string, name: string, role: string) {
  const passwordHash = await bcrypt.hash(password, 4);
  return prisma.user.create({ data: { email, passwordHash, name, role } });
}

describe('V1-00 auth security: sessions serveur persistantes, CSRF, invitations, RBAC et IDOR', () => {
  beforeAll(async () => {
    execSync('pnpm exec prisma migrate deploy --schema packages/db/prisma/schema.prisma', {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: testDbUrl },
      stdio: 'pipe'
    });

    const serverModule = await import('../../apps/api/src/server');
    const dbModule = await import('@vululu/db');
    const bcryptModule = await import('bcryptjs');
    app = await serverModule.buildServer();
    prisma = dbModule.prisma;
    bcrypt = bcryptModule.default;

    const stamp = Date.now();
    admin = await createTestUser('security-admin-' + stamp + '@vululu.local', 'Admin Security', 'super_admin');
    userA = await createTestUser('security-user-a-' + stamp + '@vululu.local', 'User A', 'user');
    userB = await createTestUser('security-user-b-' + stamp + '@vululu.local', 'User B', 'user');

    contextA = await prisma.brandContext.create({
      data: {
        userId: userA.id,
        name: 'Contexte A',
        website: 'https://example.com',
        description: 'Contexte prive de user A',
        audience: 'Createurs',
        tone: 'Direct'
      }
    });
    projectA = await prisma.project.create({
      data: {
        userId: userA.id,
        contextId: contextA.id,
        title: 'Projet prive A',
        platform: 'Instagram',
        format: 'Video',
        objective: 'Objectif prive A'
      }
    });
    for (let index = 1; index <= 5; index += 1) {
      await prisma.scene.create({
        data: {
          projectId: projectA.id,
          sceneKey: 'SCENE-00' + index,
          position: index,
          title: 'Scene ' + index,
          description: 'Description scene ' + index,
          durationSeconds: 2
        }
      });
    }
    const artifactA = await prisma.artifact.create({
      data: { projectId: projectA.id, kind: 'master' }
    });
    masterVersionA = await prisma.artifactVersion.create({
      data: {
        artifactId: artifactA.id,
        version: 1,
        masterPath: 'missing/master.mp4',
        checksum: 'a'.repeat(64),
        qaStatus: 'PASS'
      }
    });
    await prisma.approval.create({
      data: {
        artifactVersionId: masterVersionA.id,
        approvedBy: userA.id,
        checksum: 'a'.repeat(64)
      }
    });

    adminAuth = toAuth(await login(admin.email, password));
    userAAuth = toAuth(await login(userA.email, password));
    userBAuth = toAuth(await login(userB.email, password));

    expect(adminAuth.sessionCookie).not.toBe('');
    expect(userAAuth.sessionCookie).not.toBe('');
    expect(userBAuth.sessionCookie).not.toBe('');
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  describe('session serveur persistante', () => {
    it('cree une session hashee de 24h avec cookie HttpOnly et jeton CSRF double-submit', async () => {
      const result = await login(userA.email, password);
      expect(result.status).toBe(200);
      expect(result.body.user.id).toBe(userA.id);
      expect(result.body.user.role).toBe('user');
      expect(result.body.user.passwordHash).toBeUndefined();
      expect(typeof result.body.csrfToken).toBe('string');
      expect(result.body.csrfToken).toHaveLength(43);
      expect(Buffer.from(result.body.csrfToken, 'base64url')).toHaveLength(32);

      const sessionToken = result.sessionCookie.replace('session=', '');
      expect(sessionToken).toHaveLength(43);
      expect(Buffer.from(sessionToken, 'base64url')).toHaveLength(32);
      expect(result.sessionSetCookie.toLowerCase()).toContain('httponly');
      expect(result.sessionSetCookie.toLowerCase()).toContain('samesite=lax');
      expect(result.sessionSetCookie.toLowerCase()).toContain('path=/');
      expect(result.sessionSetCookie.toLowerCase()).toContain('max-age=86400');
      expect(result.sessionSetCookie.toLowerCase()).not.toContain('secure');

      expect(result.csrfCookie.startsWith('vululu_csrf=')).toBe(true);
      expect(result.csrfSetCookie.toLowerCase()).not.toContain('httponly');
      expect(result.csrfSetCookie.toLowerCase()).toContain('samesite=lax');

      const stored = await prisma.session.findUnique({
        where: { tokenHash: sha256(sessionToken) }
      });
      expect(stored).not.toBeNull();
      expect(stored.userId).toBe(userA.id);
      expect(stored.tokenHash).toBe(sha256(sessionToken));
      expect(stored.tokenHash).not.toBe(sessionToken);
      expect(stored.csrfHash).toBe(sha256(result.body.csrfToken));
      expect(stored.revokedAt).toBeNull();
      const ttl = stored.expiresAt.getTime() - Date.now();
      expect(ttl).toBeGreaterThan(sessionTtlMs - 60 * 1000);
      expect(ttl).toBeLessThanOrEqual(sessionTtlMs + 5 * 1000);
    });

    it('marque les cookies Secure uniquement si APP_ENV=production', async () => {
      const previous = process.env.APP_ENV;
      process.env.APP_ENV = 'production';
      try {
        const productionLogin = await login(userB.email, password);
        expect(productionLogin.status).toBe(200);
        expect(productionLogin.sessionSetCookie.toLowerCase()).toContain('secure');
        expect(productionLogin.csrfSetCookie.toLowerCase()).toContain('secure');
      } finally {
        process.env.APP_ENV = previous;
      }

      const localLogin = await login(userB.email, password);
      expect(localLogin.status).toBe(200);
      expect(localLogin.sessionSetCookie.toLowerCase()).not.toContain('secure');
      expect(localLogin.csrfSetCookie.toLowerCase()).not.toContain('secure');
    });

    it('accepte une session valide et recharge l utilisateur depuis la base', async () => {
      const result = await login(userA.email, password);
      const auth = toAuth(result);
      const me = await request('GET', '/api/auth/me', auth);
      expect(me.statusCode).toBe(200);
      expect(me.json().user.id).toBe(userA.id);

      await prisma.user.update({ where: { id: userA.id }, data: { name: 'User A renamed' } });
      const reloaded = await request('GET', '/api/auth/me', auth);
      expect(reloaded.statusCode).toBe(200);
      expect(reloaded.json().user.name).toBe('User A renamed');
      await prisma.user.update({ where: { id: userA.id }, data: { name: 'User A' } });
    });

    it('rejette un cookie de session falsifie', async () => {
      const forged = 'session=' + randomToken() + '; vululu_csrf=' + randomToken();
      const me = await request('GET', '/api/auth/me', { sessionCookie: 'session=' + randomToken() });
      expect(me.statusCode).toBe(401);
      const me2 = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: forged } });
      expect(me2.statusCode).toBe(401);
    });

    it('rejette un cookie de session expire', async () => {
      const token = randomToken();
      await prisma.session.create({
        data: {
          userId: userA.id,
          tokenHash: sha256(token),
          csrfHash: sha256(randomToken()),
          expiresAt: new Date(Date.now() - 1000)
        }
      });
      const me = await request('GET', '/api/auth/me', { sessionCookie: 'session=' + token });
      expect(me.statusCode).toBe(401);
    });

    it('refuse l acces sans session', async () => {
      const projects = await request('GET', '/api/projects', null);
      expect(projects.statusCode).toBe(401);
      const me = await request('GET', '/api/auth/me', null);
      expect(me.statusCode).toBe(401);
      const mutation = await request('POST', '/api/contexts', null, {
        name: 'Sans session',
        description: 'Ne doit pas passer'
      });
      expect(mutation.statusCode).toBe(401);
      const adminWithoutSession = await request('POST', '/api/admin/invitations', null, {
        email: 'x@vululu.local'
      });
      expect(adminWithoutSession.statusCode).toBe(401);
    });

    it('logout revoque immediatement la session et vide les cookies', async () => {
      const result = await login(userA.email, password);
      const auth = toAuth(result);
      const sessionToken = result.sessionCookie.replace('session=', '');
      const logout = await request('POST', '/api/auth/logout', auth);
      expect(logout.statusCode).toBe(200);
      expect(logout.json().ok).toBe(true);

      const headers = setCookieHeaders(logout);
      const sessionClear = findSetCookie(headers, 'session');
      const csrfClear = findSetCookie(headers, 'vululu_csrf');
      expect(sessionClear.split(';')[0]).toBe('session=');
      expect(sessionClear.toLowerCase()).toContain('httponly');
      expect(csrfClear.split(';')[0]).toBe('vululu_csrf=');
      expect(csrfClear.toLowerCase()).not.toContain('httponly');

      const stored = await prisma.session.findUnique({ where: { tokenHash: sha256(sessionToken) } });
      expect(stored.revokedAt).not.toBeNull();

      const me = await request('GET', '/api/auth/me', auth);
      expect(me.statusCode).toBe(401);
    });

    it('rejette un ancien cookie rejoue apres logout', async () => {
      const result = await login(userA.email, password);
      const auth = toAuth(result);
      const logout = await request('POST', '/api/auth/logout', auth);
      expect(logout.statusCode).toBe(200);

      const replay = await request('GET', '/api/auth/me', auth);
      expect(replay.statusCode).toBe(401);
      const replayAfterRotation = await request('GET', '/api/projects', auth);
      expect(replayAfterRotation.statusCode).toBe(401);
    });

    it('preserve les autres sessions du meme utilisateur lors d un logout', async () => {
      const first = await login(userA.email, password);
      const second = await login(userA.email, password);
      const firstAuth = toAuth(first);
      const secondAuth = toAuth(second);
      expect(firstAuth.sessionCookie).not.toBe(secondAuth.sessionCookie);

      const logout = await request('POST', '/api/auth/logout', firstAuth);
      expect(logout.statusCode).toBe(200);

      const firstMe = await request('GET', '/api/auth/me', firstAuth);
      expect(firstMe.statusCode).toBe(401);
      const secondMe = await request('GET', '/api/auth/me', secondAuth);
      expect(secondMe.statusCode).toBe(200);
      expect(secondMe.json().user.id).toBe(userA.id);
    });

    it('effectue une rotation de session au login si un cookie existant est presente', async () => {
      const first = await login(userA.email, password);
      const firstAuth = toAuth(first);
      const firstToken = first.sessionCookie.replace('session=', '');

      const second = await login(userA.email, password, firstAuth);
      const secondAuth = toAuth(second);

      const oldMe = await request('GET', '/api/auth/me', firstAuth);
      expect(oldMe.statusCode).toBe(401);
      const oldRow = await prisma.session.findUnique({ where: { tokenHash: sha256(firstToken) } });
      expect(oldRow.revokedAt).not.toBeNull();
      const newMe = await request('GET', '/api/auth/me', secondAuth);
      expect(newMe.statusCode).toBe(200);
    });
  });

  describe('CSRF double-submit', () => {
    it('exige le header x-csrf-token sur les methodes mutantes', async () => {
      const result = await login(userA.email, password);
      const auth = toAuth(result);

      const noHeader = await request('POST', '/api/contexts', { sessionCookie: auth.sessionCookie }, {
        name: 'CSRF absent',
        description: 'Requete sans header CSRF'
      });
      expect(noHeader.statusCode).toBe(403);
      expect(noHeader.json().error).toBe('csrf_invalid');

      const noCookie = await request(
        'POST',
        '/api/contexts',
        { csrfToken: auth.csrfToken },
        { name: 'CSRF cookie absent', description: 'Requete sans cookie CSRF' },
        { cookie: auth.sessionCookie }
      );
      expect(noCookie.statusCode).toBe(403);

      const mismatch = await request(
        'POST',
        '/api/contexts',
        auth,
        { name: 'CSRF mismatch', description: 'Header different du cookie' },
        { 'x-csrf-token': 'A'.repeat(43) }
      );
      expect(mismatch.statusCode).toBe(403);

      const wrongSessionHash = await request(
        'POST',
        '/api/contexts',
        auth,
        { name: 'CSRF autre session', description: 'Hash ne correspond pas a la session' },
        {
          cookie: auth.sessionCookie + '; vululu_csrf=' + userBAuth.csrfToken,
          'x-csrf-token': userBAuth.csrfToken
        }
      );
      expect(wrongSessionHash.statusCode).toBe(403);

      const valid = await request('POST', '/api/contexts', auth, {
        name: 'CSRF valide',
        description: 'Requete avec un jeton CSRF valide'
      });
      expect(valid.statusCode).toBe(201);
    });

    it('exempte le login et l activation du CSRF mais pas le logout', async () => {
      const freshLogin = await login(userB.email, password);
      expect(freshLogin.status).toBe(200);
      expect(freshLogin.body.csrfToken).toBeTruthy();

      const auth = toAuth(freshLogin);
      const logoutWithoutCsrf = await request(
        'POST',
        '/api/auth/logout',
        { sessionCookie: auth.sessionCookie },
        {},
        { cookie: auth.sessionCookie }
      );
      expect(logoutWithoutCsrf.statusCode).toBe(403);

      const stillValid = await request('GET', '/api/auth/me', auth);
      expect(stillValid.statusCode).toBe(200);

      const logout = await request('POST', '/api/auth/logout', auth);
      expect(logout.statusCode).toBe(200);
    });
  });

  describe('invitations super_admin et activation one-shot', () => {
    const invitationEmail = 'invitee-' + Date.now() + '@vululu.local';
    let invitationToken = '';
    let invitationId = '';

    it('refuse les invitations a un utilisateur non super_admin', async () => {
      const create = await request('POST', '/api/admin/invitations', userAAuth, {
        email: 'forbidden-' + Date.now() + '@vululu.local'
      });
      expect(create.statusCode).toBe(403);
      const list = await request('GET', '/api/admin/invitations', userAAuth);
      expect(list.statusCode).toBe(403);
      const remove = await request('DELETE', '/api/admin/invitations/unknown-id', userAAuth);
      expect(remove.statusCode).toBe(403);
      const audit = await prisma.auditEvent.findFirst({
        where: { action: 'rbac.denied', actorId: userA.id }
      });
      expect(audit).not.toBeNull();
    });

    it('cree une invitation hashee de 72h dont le jeton n est affiche qu une fois', async () => {
      const response = await request('POST', '/api/admin/invitations', adminAuth, {
        email: invitationEmail
      });
      expect(response.statusCode).toBe(201);
      const body = response.json();
      invitationToken = body.token;
      invitationId = body.invitation.id;
      expect(invitationToken).toHaveLength(43);
      expect(Buffer.from(invitationToken, 'base64url')).toHaveLength(32);
      expect(body.invitation.email).toBe(invitationEmail);
      expect(body.invitation.role).toBe('user');
      expect(body.invitation.createdBy).toBe(admin.id);
      expect(body.invitation.usedAt).toBeNull();
      expect(body.invitation.revokedAt).toBeNull();
      expect(body.invitation.tokenHash).toBeUndefined();

      const ttl = new Date(body.invitation.expiresAt).getTime() - Date.now();
      expect(ttl).toBeGreaterThan(invitationTtlMs - 60 * 1000);
      expect(ttl).toBeLessThanOrEqual(invitationTtlMs + 5 * 1000);

      const stored = await prisma.invitation.findUnique({ where: { id: invitationId } });
      expect(stored.tokenHash).toBe(sha256(invitationToken));
      expect(stored.tokenHash).not.toBe(invitationToken);

      const list = await request('GET', '/api/admin/invitations', adminAuth);
      expect(list.statusCode).toBe(200);
      const items = list.json().items as any[];
      expect(items.some((item) => item.id === invitationId)).toBe(true);
      expect(JSON.stringify(list.json())).not.toContain(invitationToken);
      expect(JSON.stringify(list.json())).not.toContain(stored.tokenHash);
      expect(items.every((item) => item.tokenHash === undefined)).toBe(true);
    });

    it('active une invitation une seule fois et cree un role user', async () => {
      const activation = await request('POST', '/api/auth/activate', null, {
        token: invitationToken,
        password: activationPassword,
        name: 'Invite Active'
      });
      expect(activation.statusCode).toBe(201);
      const activated = activation.json().user;
      expect(activated.email).toBe(invitationEmail);
      expect(activated.role).toBe('user');
      expect(activated.passwordHash).toBeUndefined();

      const stored = await prisma.invitation.findUnique({ where: { id: invitationId } });
      expect(stored.usedAt).not.toBeNull();

      const replay = await request('POST', '/api/auth/activate', null, {
        token: invitationToken,
        password: 'Another-Password-123',
        name: 'Replay'
      });
      expect(replay.statusCode).toBe(400);
      expect(replay.json().error).toBe('invitation_used');

      const userCount = await prisma.user.count({ where: { email: invitationEmail } });
      expect(userCount).toBe(1);

      const invitedLogin = await login(invitationEmail, activationPassword);
      expect(invitedLogin.status).toBe(200);
      expect(invitedLogin.body.user.role).toBe('user');
    });

    it('refuse une invitation expiree, revoquee ou inexistante', async () => {
      const expiredToken = randomToken();
      await prisma.invitation.create({
        data: {
          email: 'expired-' + Date.now() + '@vululu.local',
          role: 'user',
          tokenHash: sha256(expiredToken),
          createdBy: admin.id,
          expiresAt: new Date(Date.now() - 60 * 1000)
        }
      });
      const expired = await request('POST', '/api/auth/activate', null, {
        token: expiredToken,
        password: activationPassword,
        name: 'Expire'
      });
      expect(expired.statusCode).toBe(400);
      expect(expired.json().error).toBe('invitation_expired');

      const revokedEmail = 'revoked-' + Date.now() + '@vululu.local';
      const revokedCreate = await request('POST', '/api/admin/invitations', adminAuth, {
        email: revokedEmail
      });
      expect(revokedCreate.statusCode).toBe(201);
      const revokedToken = revokedCreate.json().token;
      const revokedId = revokedCreate.json().invitation.id;

      const remove = await request('DELETE', '/api/admin/invitations/' + revokedId, adminAuth);
      expect(remove.statusCode).toBe(200);
      expect(remove.json().invitation.revokedAt).not.toBeNull();

      const revoked = await request('POST', '/api/auth/activate', null, {
        token: revokedToken,
        password: activationPassword,
        name: 'Revoque'
      });
      expect(revoked.statusCode).toBe(400);
      expect(revoked.json().error).toBe('invitation_revoked');
      expect(await prisma.user.count({ where: { email: revokedEmail } })).toBe(0);

      const unknown = await request('POST', '/api/auth/activate', null, {
        token: randomToken(),
        password: activationPassword,
        name: 'Inconnu'
      });
      expect(unknown.statusCode).toBe(400);
      expect(unknown.json().error).toBe('invitation_invalid');
    });

    it('valide les entrees d activation et n expose pas d inscription publique', async () => {
      const weak = await request('POST', '/api/auth/activate', null, {
        token: randomToken(),
        password: 'court',
        name: 'Faible'
      });
      expect(weak.statusCode).toBe(400);
      expect(weak.json().error).toBe('validation_error');

      const nameMissing = await request('POST', '/api/auth/activate', null, {
        token: randomToken(),
        password: activationPassword
      });
      expect(nameMissing.statusCode).toBe(400);

      const register = await request('POST', '/api/auth/register', null, {
        email: 'public-' + Date.now() + '@vululu.local',
        password: password,
        name: 'Public'
      });
      expect([401, 404]).toContain(register.statusCode);
    });

    it('journalise les actions sensibles sans secret', async () => {
      const events = await prisma.auditEvent.findMany({ orderBy: { createdAt: 'asc' } });
      const actions = events.map((event: any) => event.action);
      expect(actions).toContain('auth.login');
      expect(actions).toContain('auth.logout');
      expect(actions).toContain('invitation.created');
      expect(actions).toContain('invitation.revoked');
      expect(actions).toContain('auth.activate');
      expect(actions).toContain('rbac.denied');

      const serialized = JSON.stringify(events);
      expect(serialized).not.toContain(invitationToken);
      expect(serialized).not.toContain(activationPassword);
      expect(serialized).not.toContain(password);
      const stored = await prisma.invitation.findUnique({ where: { id: invitationId } });
      expect(serialized).not.toContain(stored.tokenHash);
    });
  });

  describe('isolation inter-utilisateurs (IDOR) et RBAC', () => {
    it('isole les contextes et empeche d utiliser le contexte d un autre', async () => {
      const ownList = await request('GET', '/api/contexts', userAAuth);
      expect(ownList.statusCode).toBe(200);
      expect(ownList.json().items.some((item: any) => item.id === contextA.id)).toBe(true);

      const otherList = await request('GET', '/api/contexts', userBAuth);
      expect(otherList.statusCode).toBe(200);
      expect(otherList.json().items.some((item: any) => item.id === contextA.id)).toBe(false);

      const foreignCreate = await request('POST', '/api/projects', userBAuth, {
        contextId: contextA.id,
        title: 'Projet interdit',
        platform: 'Instagram',
        format: 'Video',
        objective: 'Utiliser le contexte de A'
      });
      expect(foreignCreate.statusCode).toBe(404);
    });

    it('renvoie 404 sur les lectures inter-utilisateurs', async () => {
      const ownProject = await request('GET', '/api/projects/' + projectA.id, userAAuth);
      expect(ownProject.statusCode).toBe(200);
      expect(ownProject.json().project.id).toBe(projectA.id);

      const foreignProject = await request('GET', '/api/projects/' + projectA.id, userBAuth);
      expect(foreignProject.statusCode).toBe(404);

      const foreignImage = await request(
        'GET',
        '/api/projects/' + projectA.id + '/scenes/SCENE-003/image',
        userBAuth
      );
      expect(foreignImage.statusCode).toBe(404);

      const foreignMaster = await request('GET', '/api/projects/' + projectA.id + '/master', userBAuth);
      expect(foreignMaster.statusCode).toBe(404);

      const foreignQa = await request('GET', '/api/projects/' + projectA.id + '/qa', userBAuth);
      expect(foreignQa.statusCode).toBe(404);

      const foreignStatus = await request('GET', '/api/projects/' + projectA.id + '/status', userBAuth);
      expect(foreignStatus.statusCode).toBe(404);
    });

    it('renvoie 404 sur les ecritures inter-utilisateurs (brief, scene, messages, storyboard)', async () => {
      const foreignBrief = await request('PATCH', '/api/projects/' + projectA.id + '/brief', userBAuth, {
        objective: 'Objectif pirate',
        audience: 'Pirate',
        tone: 'Pirate',
        cta: 'Pirate',
        platform: 'Instagram',
        format: 'Video'
      });
      expect(foreignBrief.statusCode).toBe(404);

      const foreignScene = await request(
        'PATCH',
        '/api/projects/' + projectA.id + '/scenes/SCENE-003',
        userBAuth,
        { durationSeconds: 9 }
      );
      expect(foreignScene.statusCode).toBe(404);

      const foreignMessage = await request('POST', '/api/projects/' + projectA.id + '/messages', userBAuth, {
        content: 'Message pirate'
      });
      expect(foreignMessage.statusCode).toBe(404);

      const foreignStoryboard = await request('POST', '/api/projects/' + projectA.id + '/storyboard', userBAuth, {});
      expect(foreignStoryboard.statusCode).toBe(404);

      const foreignProduce = await request('POST', '/api/projects/' + projectA.id + '/produce', userBAuth, {});
      expect(foreignProduce.statusCode).toBe(404);

      const scene = await prisma.scene.findFirst({
        where: { projectId: projectA.id, sceneKey: 'SCENE-003' }
      });
      expect(scene.durationSeconds).toBe(2);
      const brief = await prisma.brief.findUnique({ where: { projectId: projectA.id } });
      expect(brief).toBeNull();
      const messages = await prisma.message.count({ where: { projectId: projectA.id } });
      expect(messages).toBe(0);
    });

    it('renvoie 404 sur approbation et transfert inter-utilisateurs', async () => {
      const foreignApprove = await request('POST', '/api/projects/' + projectA.id + '/approve', userBAuth, {
        artifactVersionId: masterVersionA.id,
        checksum: masterVersionA.checksum
      });
      expect(foreignApprove.statusCode).toBe(404);

      const foreignTransfer = await request('POST', '/api/projects/' + projectA.id + '/transfer', userBAuth, {});
      expect(foreignTransfer.statusCode).toBe(404);

      const approvalCount = await prisma.approval.count({
        where: { artifactVersionId: masterVersionA.id, approvedBy: userB.id }
      });
      expect(approvalCount).toBe(0);
      // Comptage scope a l'artefact de projectA : une base de test locale peut
      // contenir des transferts issus d'autres campagnes (E2E, runs precedents).
      // L'intention de securite reste verifiee : aucun transfert n'est cree pour
      // l'artefact cible de la tentative inter-utilisateurs.
      const transferCount = await prisma.transfer.count({
        where: { approval: { artifactVersionId: masterVersionA.id } }
      });
      expect(transferCount).toBe(0);
    });

    it('ne permet pas a un user d acceder a l administration', async () => {
      const listUsersLike = await request('GET', '/api/admin/invitations', userBAuth);
      expect(listUsersLike.statusCode).toBe(403);
      const remove = await request('DELETE', '/api/admin/invitations/unknown-id', userBAuth);
      expect(remove.statusCode).toBe(403);
      expect(userB.role).toBe('user');
    });
  });
});
