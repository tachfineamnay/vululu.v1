import { execSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const testDbUrl = 'postgresql://vululu@127.0.0.1:55432/vululu_v0_test?schema=public';
process.env.V0_TEST_DB = '1';
process.env.DATABASE_URL_TEST = testDbUrl;
process.env.DATABASE_URL = testDbUrl;

let app: any;
let prisma: any;
let bcrypt: any;
let email = '';
let password = 'vululu-test-password';
let cookie = '';
let secondCookie = '';
let contextId = '';
let projectId = '';

async function login(emailValue: string, passwordValue: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: emailValue, password: passwordValue }
  });
  const raw = response.headers['set-cookie'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const cookiePair = value ? value.split(';')[0] : '';
  return { status: response.statusCode, cookie: cookiePair };
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

    const contextResponse = await app.inject({
      method: 'POST',
      url: '/api/contexts',
      headers: { cookie },
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
      headers: { cookie },
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
      headers: { cookie },
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

    const storyboardResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/' + projectId + '/storyboard',
      headers: { cookie },
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
  });

  it('rejects approval and transfer without a master', async () => {
    const approvalResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/' + projectId + '/approve',
      headers: { cookie },
      payload: { artifactVersionId: 'missing', checksum: '0123456789abcdef' }
    });
    expect(approvalResponse.statusCode).toBe(400);

    const transferResponse = await app.inject({
      method: 'POST',
      url: '/api/projects/' + projectId + '/transfer',
      headers: { cookie },
      payload: {}
    });
    expect(transferResponse.statusCode).toBe(400);
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

    const forbiddenResponse = await app.inject({
      method: 'GET',
      url: '/api/projects/' + projectId,
      headers: { cookie: secondCookie }
    });
    expect(forbiddenResponse.statusCode).toBe(404);
  });
});
