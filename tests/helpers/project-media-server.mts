import bcrypt from 'bcryptjs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const database = new URL(process.env.DATABASE_URL_TEST || '');
const id = process.env.F03_BROWSER_ACCOUNT;
const password = process.env.F03_BROWSER_PASSWORD;
if (process.env.APP_ENV !== 'test' || process.env.V0_TEST_DB !== '1' || !id || !password ||
  !['localhost', '127.0.0.1'].includes(database.hostname) || !database.pathname.endsWith('_test')) throw Error('Disposable test database required');
// Deliberately no credential or default provider router in this fixture.
Object.assign(process.env, { MEDIA_GENERATION_ENABLED: '1', MEDIA_IMAGE_CONFIGURED: '1', MEDIA_VIDEO_CONFIGURED: '1', REPLICATE_API_TOKEN: '', RUNWAYML_API_SECRET: '' });
const { buildServer } = await import('../../apps/api/src/server');
const { prisma } = await import('@vululu/db');
const { execute } = await import('../../apps/api/src/infrastructure/execution/broker');
const { dispatchMedia } = await import('../../apps/api/src/infrastructure/mediaGeneration/service');
const { ReplicateImage, RunwayVideo } = await import('../../apps/api/src/infrastructure/mediaGeneration/providers');
const sharp = createRequire(path.resolve('packages/media/package.json'))('sharp');
const png = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#aa6633' } }).png().toBuffer();
const clip = execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', [
  '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=720x1280:r=15', '-t', '5',
  '-threads', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', 'frag_keyframe+empty_moov', '-f', 'mp4', 'pipe:1'
], { timeout: 20000 });
const transport: typeof fetch = async (url, init) => {
  if (init?.method === 'POST' && String(url).startsWith('https://api.replicate.com/v1/models/')) return Response.json({ id: 'f03-browser-image' });
  if (String(url) === 'https://api.replicate.com/v1/predictions/f03-browser-image') return Response.json({ id: 'f03-browser-image', status: 'succeeded', output: ['https://replicate.delivery/fixture.png'] });
  if (String(url) === 'https://replicate.delivery/fixture.png') return new Response(png);
  if (init?.method === 'POST' && String(url) === 'https://api.dev.runwayml.com/v1/image_to_video') {
    const input = JSON.parse(String(init.body));
    if (input.model === 'gen4_turbo' && input.duration === 5 && input.ratio === '720:1280' && input.promptImage.startsWith('data:image/png;base64,'))
      return Response.json({ id: 'f03-browser-video' });
  }
  if (String(url) === 'https://api.dev.runwayml.com/v1/tasks/f03-browser-video') return Response.json({ id: 'f03-browser-video', status: 'SUCCEEDED', cost: { credits: 25 }, output: ['https://dnznrvs05pmza.cloudfront.net/fixture.mp4'] });
  if (String(url) === 'https://dnznrvs05pmza.cloudfront.net/fixture.mp4') return new Response(clip);
  throw Error('Unexpected fixture request');
};
const image = new ReplicateImage('mock', transport), video = new RunwayVideo('mock', transport);
await prisma.user.create({ data: { id, name: 'Fixture Studio', email: `${id}@media-browser.example`, passwordHash: await bcrypt.hash(password, 4) } });
await prisma.executionAccount.create({ data: { userId: id, enabled: true, limitCents: 100, tools: ['media.image@1', 'media.video@1'] } });
const app = await buildServer({ accountMail: null });
let inFlight = false;
const timer = setInterval(async () => {
  if (inFlight) return;
  inFlight = true;
  try {
    const queued = await prisma.executionOperation.findMany({ where: { state: { in: ['QUEUED', 'POLLING'] }, tool: { in: ['media.image@1', 'media.video@1'] }, accountId: id }, take: 5 });
    for (const row of queued) await execute(row.id, { invoke: (job, signal) => dispatchMedia(job, signal, (kind) => kind === 'image' ? image : video) });
  } catch { console.error('Fixture dispatcher failed'); }
  finally { inFlight = false; }
}, 250);
app.addHook('onClose', async () => { clearInterval(timer); await prisma.$disconnect(); });
await app.listen({ host: '127.0.0.1', port: 3101 });
