import { describe, it, expect, vi } from 'vitest';
import { PostizProvider } from '../apps/api/src/infrastructure/publishing/provider';
const token = crypto.randomUUID(),
  signal = new AbortController().signal,
  post = {
    channel: 'channel',
    when: '2030-01-01T12:00:00Z',
    caption: 'Une offre',
    files: [{ name: '01.png', mime: 'image/png', bytes: Buffer.from('fixture'), sha256: 'fixture' }]
  };
const json = (v: unknown) => new Response(JSON.stringify(v));
describe('Postiz public HTTP contract — controlled transport only', () => {
  it('uploads bytes before scheduling; returns a submission id, not a network publication', async () => {
    const calls: string[] = [];
    const provider = new PostizProvider(
      async (url, init) => {
        expect(init?.redirect).toBe('error');
        expect((init?.headers as Record<string, string>).Authorization).toBe(token);
        calls.push(String(url));
        if (calls.length === 1) return json([{ id: 'channel', identifier: 'linkedin', disabled: false }]);
        if (calls.length === 2) {
          expect(init?.body).toBeInstanceOf(FormData);
          return json({ id: 'img', path: '/uploads/file.png' });
        }
        if (calls.length === 3) {
          const b = JSON.parse(String(init?.body));
          expect(b.type).toBe('schedule');
          expect(b.posts[0].value[0]).toEqual({
            content: post.caption,
            image: [{ id: 'img', path: '/uploads/file.png' }]
          });
          return json([{ postId: 'remote-test', integration: 'channel' }]);
        }
        expect(init?.method).toBe('DELETE');
        return new Response(null, { status: 204 });
      },
      () => true
    );
    expect(await provider.schedule(token, post, signal)).toBe('remote-test');
    await provider.cancel(token, 'remote-test', signal);
    expect(calls.map((c) => new URL(c).pathname)).toEqual([
      '/public/v1/integrations',
      '/public/v1/upload',
      '/public/v1/posts',
      '/public/v1/posts/remote-test'
    ]);
  });
  it('fails closed on disabled transport, expired token, and wrong integration', async () => {
    const tx = vi.fn();
    await expect(new PostizProvider(tx, () => false).schedule(token, post, signal)).rejects.toMatchObject({
      reason: 'DISABLED'
    });
    expect(tx).not.toHaveBeenCalled();
    await expect(
      new PostizProvider(
        async () => new Response(null, { status: 401 }),
        () => true
      ).schedule(token, post, signal)
    ).rejects.toMatchObject({ reason: 'TOKEN_EXPIRED' });
    await expect(
      new PostizProvider(
        async () => json([{ id: 'channel', identifier: 'tiktok' }]),
        () => true
      ).schedule(token, post, signal)
    ).rejects.toMatchObject({ reason: 'CHANNEL_MISMATCH' });
  });
  it('does not retry an ambiguous submit on outage', async () => {
    let writes = 0;
    const provider = new PostizProvider(
      async (url) => {
        if (String(url).endsWith('integrations')) return json([{ id: 'channel', identifier: 'linkedin' }]);
        if (String(url).endsWith('upload')) return json({ id: 'image', path: 'img' });
        writes++;
        return new Response(null, { status: 503 });
      },
      () => true
    );
    await expect(provider.schedule(token, post, signal)).rejects.toMatchObject({
      reason: 'PROVIDER_UNAVAILABLE',
      ambiguous: true
    });
    expect(writes).toBe(1);
  });
});
