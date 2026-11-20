import bcrypt from 'bcryptjs';

const database = new URL(process.env.DATABASE_URL_TEST || '');
const email = process.env.F06_BROWSER_EMAIL;
const password = process.env.F06_BROWSER_PASSWORD;
if (process.env.APP_ENV !== 'test' || process.env.V0_TEST_DB !== '1' || !email || !password ||
  !['localhost', '127.0.0.1'].includes(database.hostname) || !database.pathname.endsWith('_test')) {
  throw Error('Disposable local Studio browser database required');
}
const { buildServer } = await import('../../apps/api/src/server');
const { prisma } = await import('@vululu/db');
const { startStudioRenderPump } = await import('../../apps/api/src/infrastructure/creative/renderJobs');
await prisma.user.create({ data: { email, name: 'Studio Fixture', passwordHash: await bcrypt.hash(password, 4),
  contexts: { create: { name: 'Atelier de test', description: 'Contexte de marketing pour la recette Studio.' } } } });
const app = await buildServer({ accountMail: null });
app.addHook('onClose', startStudioRenderPump());
await app.listen({ host: '127.0.0.1', port: 3101 });
