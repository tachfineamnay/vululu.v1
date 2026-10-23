import { execSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const testDbUrl = 'postgresql://vululu@127.0.0.1:55432/vululu_v1_00_test?schema=public';
process.env.V0_TEST_DB = '1';
process.env.DATABASE_URL_TEST = testDbUrl;
process.env.DATABASE_URL = testDbUrl;

let app: any;
let prisma: any;
let bcrypt: any;
let email = '';
let password = 'vululu-test-password';
let cookie = '';
let csrfToken = '';
let secondCookie = '';
let secondCsrfToken = '';
let contextId = '';
let projectId = '';

async function login(emailValue: string, passwordValue: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: emailValue, password: passwordValue }
  });
  const raw = response.headers['set-cookie'];
  const headers = raw ? (Array.isArray(raw) ? raw : [raw]) : [];
  const sessionCookie = headers
    .map((value: string) => value.split(';')[0])
    .find((value: string) => value.startsWith('session=')) || '';
  const csrfCookie = headers
    .map((value: string) => value.split(';')[0])
    .find((value: string) => value.startsWith('vululu_csrf=')) || '';
  const body = response.statusCode === 200 ? response.json() : {};
  return {
    status: response.statusCode,
    cookie: sessionCookie + (csrfCookie ? '; ' + csrfCookie : ''),
    csrfToken: typeof body.csrfToken === 'string' ? body.csrfToken : ''
  };
}

function authHeaders(
  sessionCookie: string = cookie,
  token: string = csrfToken,
  extra: Record<string, string> = {}
): Record<string, string> {
  return { cookie: sessionCookie, 'x-csrf-token': token, ...extra };
}

describe('API V0', () => {
  beforeAll(async () => {
    execSync('pnpm exec prisma migrate deploy --schema packages/db/prisma/schema.prisma', {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: testDbUrl },
      stdio: 'pipe'
    });
    const serverModule = await import('../apps/api/src/server');
    const dbModule = await import('@vululu/db');
    const bcryptModule = await import('bcryptjs');
    app = await serverModule.buildServer();
    prisma = dbModule.prisma;
    bcrypt = bcryptModule.default;
    email = 'api-test-' + Date.now() + '@vululu.local';
    const passwordHash = await bcrypt.hash(password, 4);
    await prisma.user.create({
      data: { email, passwordHash, name: 'API Test', role: 'user' }
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  it('health responds', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('ok');
  });

  it('rejects invalid credentials', async () => {
    const result = await login(email, 'wrong-password');
    expect(result.status).toBe(401);
  });

  it('authenticates and creates a context', async () => {
    const result = await login(email, password);
    expect(result.status).toBe(200);
    expect(result.cookie).toContain('session=');
    cookie = result.cookie;
    csrfToken = result.csrfToken;

    const contextResponse = await app.inject({
      method: 'POST',
      url: '/api/contexts',
      headers: authHeaders(),
      payload: {
        name: 'Contexte API',
        website: 'https://example.com',
        description: 'Contexte de test API',
        audience: 'Createurs',
        tone: 'Direct',
        colorPrimary: '#6C5CE7',
        colorSecondary: '#00D2FF'
      }
    });
    expect(contextResponse.statusCode).toBe(201);
    contextId = contextResponse.json().context.id;
    expect(contextId).toBeTruthy();
  });

  it('creates a project, brief and five scenes', async () => {
    const projectResponse = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: authHeaders(),
      payload: {
        contextId,
        title: 'Projet API',
        platform: 'Instagram',
        format: 'Video',
        objective: 'Tester la verticale API'
      }
    });
    expect(projectResponse.statusCode).toBe(201);
    projectId = projectResponse.json().project.id;

    const briefResponse = await app.inject({
      method: 'PATCH',
      url: '/api/projects/' + projectId + '/brief',
      headers: authHeaders(),
      payload: {
        objective: 'Tester la verticale API',
        audience: 'Createurs',
        tone: 'Direct',
        cta: 'Decouvrir',
        platform: 'Instagram',
        format: 'Video'
      }
    });
    expect(briefResponse.statusCode).toBe(200);
    expect(briefResponse.json().brief.version).toBe(1);

    const briefV2Response = await app.inject({
      method: 'PATCH',
      url: '/api/projects/' + projectId + '/brief',
      headers: authHeaders(),
      payload: {
        objective: 'Tester la verticale API v2',
        audience: 'Createurs avances',
        tone: 'Direct',
        cta: 'Decouvrir v2',
        platform: 'Instagram',
        format: 'Video'
      }
    });
    expect(briefV2Response.statusCode).toBe(200);
    expect(briefV2Response.json().brief.version).toBe(2);

    const storyboardResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/' + projectId + '/storyboard',
      headers: authHeaders(),
      payload: {}
    });
    expect(storyboardResponse.statusCode).toBe(200);
    expect(storyboardResponse.json().scenes.length).toBe(5);

    const bundleResponse = await app.inject({
      method: 'GET',
      url: '/api/projects/' + projectId,
      headers: { cookie }
    });
    expect(bundleResponse.statusCode).toBe(200);
    const bundle = bundleResponse.json();
    expect(bundle.scenes.length).toBe(5);
    expect(bundle.master).toBeNull();
    expect(bundle.project.sceneDurationSeconds).toBe(2);
    expect(bundle.scenes.every((scene: any) => scene.durationSeconds === 2)).toBe(true);
    expect(bundle.brief.revisions.length).toBe(2);
    expect(bundle.brief.revisions[0].objective).toBe('Tester la verticale API');
    expect(bundle.brief.revisions[1].objective).toBe('Tester la verticale API v2');
    expect(bundle.brief.revisions[0].checksum).not.toBe(bundle.brief.revisions[1].checksum);
  });

  it('supports configurable scene durations', async () => {
    const projectResponse = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: authHeaders(),
      payload: {
        contextId,
        title: 'Projet durees',
        platform: 'Instagram',
        format: 'Video',
        objective: 'Tester les durees',
        sceneDurationSeconds: 10
      }
    });
    expect(projectResponse.statusCode).toBe(201);
    const durationProjectId = projectResponse.json().project.id;

    const briefResponse = await app.inject({
      method: 'PATCH',
      url: '/api/projects/' + durationProjectId + '/brief',
      headers: authHeaders(),
      payload: {
        objective: 'Tester les durees',
        audience: 'Createurs',
        tone: 'Direct',
        cta: 'Decouvrir',
        platform: 'Instagram',
        format: 'Video'
      }
    });
    expect(briefResponse.statusCode).toBe(200);

    const storyboardResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/' + durationProjectId + '/storyboard',
      headers: authHeaders(),
      payload: {}
    });
    expect(storyboardResponse.statusCode).toBe(200);
    const storyboard = storyboardResponse.json();
    expect(storyboard.project.sceneDurationSeconds).toBe(10);
    expect(storyboard.scenes.every((scene: any) => scene.durationSeconds === 10)).toBe(true);

    const updateResponse = await app.inject({
      method: 'PATCH',
      url: '/api/projects/' + durationProjectId + '/scenes/SCENE-003',
      headers: authHeaders(),
      payload: { durationSeconds: 2 }
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json().scene.durationSeconds).toBe(2);

    const bundleResponse = await app.inject({
      method: 'GET',
      url: '/api/projects/' + durationProjectId,
      headers: { cookie }
    });
    const bundle = bundleResponse.json();
    const scene3 = bundle.scenes.find((scene: any) => scene.sceneKey === 'SCENE-003');
    expect(scene3.durationSeconds).toBe(2);
    expect(bundle.scenes.filter((scene: any) => scene.sceneKey !== 'SCENE-003').every((scene: any) => scene.durationSeconds === 10)).toBe(true);
  });

  it('rejects approval and transfer without a master', async () => {
    const approvalResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/' + projectId + '/approve',
      headers: authHeaders(),
      payload: { artifactVersionId: 'missing', checksum: '0123456789abcdef' }
    });
    expect(approvalResponse.statusCode).toBe(400);

    const transferResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/' + projectId + '/transfer',
      headers: authHeaders(),
      payload: {}
    });
    expect(transferResponse.statusCode).toBe(400);
  });

  it('clears the session on logout', async () => {
    const result = await login(email, password);
    expect(result.status).toBe(200);
    const logoutResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: authHeaders(result.cookie, result.csrfToken)
    });
    expect(logoutResponse.statusCode).toBe(200);
    const rawCleared = logoutResponse.headers['set-cookie'];
    const clearedValue = Array.isArray(rawCleared) ? rawCleared[0] : rawCleared;
    const clearedCookie = clearedValue ? clearedValue.split(';')[0] : '';
    expect(clearedCookie).toBe('session=');
    const meResponse = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: clearedCookie }
    });
    expect(meResponse.statusCode).toBe(401);
  });

  it('accepts an empty JSON body for logout', async () => {
    const result = await login(email, password);
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: authHeaders(result.cookie, result.csrfToken, { 'content-type': 'application/json' })
    });
    expect(response.statusCode).toBe(200);
  });

  it('returns 400 for malformed JSON', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: authHeaders(cookie, csrfToken, { 'content-type': 'application/json' }),
      payload: '{not-json'
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBeTruthy();
  });

  it('isolates resources between users', async () => {
    const secondEmail = 'api-test-second-' + Date.now() + '@vululu.local';
    const passwordHash = await bcrypt.hash(password, 4);
    await prisma.user.create({
      data: { email: secondEmail, passwordHash, name: 'Second User', role: 'user' }
    });
    const secondLogin = await login(secondEmail, password);
    expect(secondLogin.status).toBe(200);
    secondCookie = secondLogin.cookie;
    secondCsrfToken = secondLogin.csrfToken;

    const forbiddenResponse = await app.inject({
      method: 'GET',
      url: '/api/projects/' + projectId,
      headers: { cookie: secondCookie }
    });
    expect(forbiddenResponse.statusCode).toBe(404);
  });
});