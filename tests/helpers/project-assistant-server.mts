import bcrypt from 'bcryptjs';

const database = new URL(process.env.DATABASE_URL_TEST || '');
const id = process.env.F02_BROWSER_ACCOUNT;
const password = process.env.F02_BROWSER_PASSWORD;
if (process.env.APP_ENV !== 'test' || process.env.V0_TEST_DB !== '1' || !id || !password ||
  !['localhost', '127.0.0.1'].includes(database.hostname) || !database.pathname.endsWith('_test')) throw Error('Disposable test database required');
Object.assign(process.env, { ASSISTANT_VERTEX_ENABLED: '1', ASSISTANT_VERTEX_PROJECT: 'fixture-project', ASSISTANT_VERTEX_LOCATION: 'global',
  ASSISTANT_VERTEX_MODEL: 'gemini-2.5-flash-lite', ASSISTANT_VERTEX_INPUT_MICROUSD: '1', ASSISTANT_VERTEX_OUTPUT_MICROUSD: '2' });
const { buildServer } = await import('../../apps/api/src/server');
const { prisma } = await import('@vululu/db');
const { execute } = await import('../../apps/api/src/infrastructure/execution/broker');
const { generateAssistantClaim } = await import('../../apps/api/src/infrastructure/assistant/service');
await prisma.user.create({ data: { id, name: 'Fixture Studio', email: `${id}@assistant-browser.example`, passwordHash: await bcrypt.hash(password, 4) } });
await prisma.executionAccount.create({ data: { userId: id, enabled: true, limitCents: 100, tools: ['assistant.draft@1'] } });
const app = await buildServer({ accountMail: null });
let inFlight = false;
const timer = setInterval(async () => {
  if (inFlight) return;
  inFlight = true;
  try {
    const queued = await prisma.executionOperation.findMany({ where: { state: 'QUEUED', tool: 'assistant.draft@1', accountId: id }, take: 5 });
    for (const row of queued) await execute(row.id, { invoke: (job, signal) => generateAssistantClaim(job, signal, {
      async generate(input) {
        return { status: 'complete', costCents: 1, output: input.kind === 'creative'
          ? { changes: [{ operation: 'cta', parameters: { text: 'Parlons de votre projet' } }] }
          : { campaign: 'Le geste et la matière', strategy: 'Ouvrir un échange autour des gestes de l’atelier.',
            posts: ['La première découverte', 'Au plus près du geste', 'Une invitation à poser vos questions'].map((headline) => ({ headline,
              caption: 'Qu’aimeriez-vous découvrir dans cet atelier ?', cta: 'Posez votre question', storyboard: Array.from({ length: 3 }, () => ({
                shot: 'Imaginer un plan serré sur un outil.', onScreen: 'Par où commencer ?' })) })) } };
      }
    }) });
  } catch { console.error('Fixture dispatcher failed'); }
  finally { inFlight = false; }
}, 250);
app.addHook('onClose', async () => { clearInterval(timer); await prisma.$disconnect(); });
await app.listen({ host: '127.0.0.1', port: 3101 });
