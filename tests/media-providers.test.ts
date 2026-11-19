import { it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ReplicateImage, RunwayVideo } from '../apps/api/src/infrastructure/mediaGeneration/providers';
import { mediaRequest } from '@vululu/contracts';
const signal = new AbortController().signal,
  base = {
    schemaVersion: 1,
    requestId: randomUUID(),
    sceneKey: 'SCENE-002',
    revision: 1,
    prompt: 'Soft light on a ceramic bowl',
    rightsConfirmed: true
  },
  img = mediaRequest.parse({ ...base, kind: 'image', size: '1024:1024' }),
  vid = mediaRequest.parse({
    ...base,
    kind: 'video',
    size: '1280:720',
    seconds: 5,
    referenceVersion: 'owned-id'
  });
it('Replicate v1: one safe PNG, polls only the known id, CDN receives no credential', async () => {
  const http = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ id: 'prediction1' }))
    .mockResolvedValueOnce(Response.json({ id: 'prediction1', status: 'processing' }))
    .mockResolvedValueOnce(
      Response.json({
        id: 'prediction1',
        status: 'succeeded',
        version: 'model123',
        output: ['https://replicate.delivery/asset.png']
      })
    )
    .mockResolvedValueOnce(new Response('bytes'))
    .mockResolvedValueOnce(Response.json({}));
  const p = new ReplicateImage('test-only', http);
  const id = await p.start(img, undefined, signal);
  const [url, init] = http.mock.calls[0];
  expect(url).toBe('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions');
  expect(JSON.parse(String(init?.body)).input).toMatchObject({
    num_outputs: 1,
    output_format: 'png',
    disable_safety_checker: false
  });
  expect(await p.poll(id, signal)).toEqual({ state: 'pending' });
  const ready = await p.poll(id, signal);
  expect(ready).toMatchObject({ state: 'ready', modelVersion: 'model123' });
  if (ready.state === 'ready') await p.download(ready.url, signal);
  expect(http.mock.calls[3][1]).toEqual({ signal, redirect: 'error' });
  await p.cancel(id, signal);
  expect(http.mock.calls[4][0]).toMatch(/prediction1\/cancel$/);
});
it('Runway version, reference data URI, reported terminal credits, cancellation without charging again', async () => {
  const http = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ id: 'task1' }))
    .mockResolvedValueOnce(
      Response.json({ id: 'task1', status: 'THROTTLED', estimatedCost: { credits: 25 } })
    )
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(Response.json({ id: 'task1', status: 'CANCELLED', cost: { credits: 4 } }));
  const p = new RunwayVideo('test-only', http);
  await p.start(vid, { mime: 'image/png', bytes: Buffer.from('fixture') }, signal);
  expect(http.mock.calls[0][1]?.headers).toMatchObject({ 'X-Runway-Version': '2024-11-06' });
  expect(JSON.parse(String(http.mock.calls[0][1]?.body))).toMatchObject({
    model: 'gen4_turbo',
    duration: 5,
    ratio: '1280:720',
    promptImage: 'data:image/png;base64,Zml4dHVyZQ=='
  });
  expect(await p.poll('task1', signal)).toEqual({ state: 'pending' });
  await p.cancel('task1', signal);
  expect(http.mock.calls[2][1]?.method).toBe('DELETE');
  expect(await p.poll('task1', signal)).toEqual({ state: 'cancelled', costCents: 4 });
});
it('rejects unsupported parameters before I/O and signed URLs outside allowlist', async () => {
  const http = vi.fn<typeof fetch>(),
    p = new RunwayVideo('test-only', http);
  for (const invalid of [
    { ...vid, seconds: 20 },
    { ...vid, size: '640:480' },
    { ...vid, referenceUrl: 'https://example.com' },
    { ...vid, rightsConfirmed: false }
  ])
    await expect(p.start(invalid as typeof vid, undefined, signal)).rejects.toThrow();
  for (const u of [
    'http://dnznrvs05pmza.cloudfront.net/a',
    'https://dnznrvs05pmza.cloudfront.net.example.com/x',
    'https://127.0.0.1',
    'https://name@dnznrvs05pmza.cloudfront.net/a'
  ])
    await expect(p.download(u, signal)).rejects.toThrow();
  expect(http).not.toHaveBeenCalled();
});
it('invalid poll receipts, wrong task, output overflow, provider unavailable fail closed', async () => {
  const http = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ id: 'other', status: 'SUCCEEDED' }))
    .mockResolvedValueOnce(Response.json({ id: 'id', status: 'ALIEN' }))
    .mockResolvedValueOnce(new Response('x', { headers: { 'content-length': String(33 * 1024 * 1024) } }))
    .mockResolvedValueOnce(new Response('sensitive error', { status: 503 }));
  const p = new RunwayVideo('test-only', http);
  await expect(p.poll('id', signal)).rejects.toThrow('mismatch');
  await expect(p.poll('id', signal)).rejects.toThrow('unknown_status');
  await expect(p.download('https://dnznrvs05pmza.cloudfront.net/x', signal)).rejects.toThrow();
  await expect(p.poll('id', signal)).rejects.toThrow('unavailable');
});
it('a presence hint displays configuration but cannot construct a worker transport without a secret', async () => {
  const { capability, mediaRouter } =
    await import('../apps/api/src/infrastructure/mediaGeneration/providers');
  try {
    vi.stubEnv('MEDIA_GENERATION_ENABLED', '1');
    vi.stubEnv('MEDIA_IMAGE_CONFIGURED', '1');
    vi.stubEnv('REPLICATE_API_TOKEN', '');
    expect(capability('image').availability).toBe('configured');
    expect(mediaRouter('image')).toBeNull();
  } finally {
    vi.unstubAllEnvs();
  }
});
