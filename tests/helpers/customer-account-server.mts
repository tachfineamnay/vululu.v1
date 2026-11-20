import { appendFile } from 'node:fs/promises';

const mailbox = process.env.F01_TEST_MAILBOX;
const database = new URL(process.env.DATABASE_URL_TEST || '');
if (!mailbox || process.env.APP_ENV !== 'test' || process.env.V0_TEST_DB !== '1' || !['localhost', '127.0.0.1'].includes(database.hostname) || !database.pathname.endsWith('_test')) {
  throw new Error('F01 sink requires the disposable local test database.');
}
const { buildServer } = await import('../../apps/api/src/server');
const { startStudioRenderPump } = await import('../../apps/api/src/infrastructure/creative/renderJobs');
const app = await buildServer({ accountMail: { async send(mail) {
  await appendFile(mailbox, JSON.stringify(mail) + '\n', { mode: 0o600 });
} } });
app.addHook('onClose', startStudioRenderPump());
await app.listen({ host: '127.0.0.1', port: 3101 });
