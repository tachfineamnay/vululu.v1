import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';

const database = new URL(process.env.DATABASE_URL_TEST || '');
const id = process.env.F04_BROWSER_ACCOUNT;
const password = process.env.F04_BROWSER_PASSWORD;
if (process.env.APP_ENV !== 'test' || process.env.V0_TEST_DB !== '1' || !id || !password ||
  !['localhost', '127.0.0.1'].includes(database.hostname) || !database.pathname.endsWith('_test')) throw Error('Disposable test database required');
Object.assign(process.env, { POSTIZ_PUBLISH_ENABLED: '1', PUBLISHING_ENCRYPTION_KEY: randomBytes(32).toString('base64') });
const { buildServer } = await import('../../apps/api/src/server');
const { prisma } = await import('@vululu/db');
const { creativeStudio } = await import('../../apps/api/src/application/container');
const { execute } = await import('../../apps/api/src/infrastructure/execution/broker');
const { dispatchPublication } = await import('../../apps/api/src/infrastructure/publishing/service');
const { PostizProvider } = await import('../../apps/api/src/infrastructure/publishing/provider');
const receipts: string[] = [];
const transport: typeof fetch = async (input, options) => {
  const url = new URL(String(input));
  if (url.origin !== 'https://api.postiz.com' || (options?.headers as Record<string, string>)?.Authorization !== id)
    throw Error('Unexpected fixture network request');
  if (url.pathname.endsWith('/integrations')) return Response.json([{ id: 'fixture-page', identifier: 'facebook', name: 'Atelier (MOCK)' }]);
  if (url.pathname.endsWith('/upload')) return Response.json({ id: 'fixture-asset', path: 'https://example.test/image.png' });
  if (url.pathname.endsWith('/posts') && options?.method === 'POST') {
    const postId = `fixture-schedule-${receipts.length + 1}`;
    receipts.push(postId);
    return Response.json([{ postId, integration: 'fixture-page' }]);
  }
  if (url.pathname.endsWith('/posts') && options?.method === 'GET') return Response.json({ posts: receipts.map((id) => ({ id,
    state: 'PUBLISHED', releaseURL: `https://www.facebook.com/${id}`, integration: { id: 'fixture-page', providerIdentifier: 'facebook' } })) });
  throw Error('Unexpected fixture provider endpoint');
};
globalThis.fetch = transport;
const provider = new PostizProvider(transport);
await prisma.user.create({ data: { id, name: 'Fixture Studio', email: `${id}@publishing-browser.example`, passwordHash: await bcrypt.hash(password, 4) } });
await prisma.executionAccount.create({ data: { userId: id, enabled: true, limitCents: 0, tools: ['postiz.schedule@1'] } });
const app = await buildServer({ accountMail: null });
let inFlight = false;
const timer = setInterval(async () => {
  if (inFlight) return;
  inFlight = true;
  try {
    const queued = await prisma.executionOperation.findMany({ where: { state: 'QUEUED', tool: 'postiz.schedule@1', accountId: id }, take: 5 });
    for (const row of queued) await execute(row.id, { invoke: (job, signal) => dispatchPublication(job, creativeStudio, provider, signal) });
  } catch { console.error('Fixture dispatcher failed'); }
  finally { inFlight = false; }
}, 250);
app.addHook('onClose', async () => { clearInterval(timer); await prisma.$disconnect(); });
await app.listen({ host: '127.0.0.1', port: 3101 });
