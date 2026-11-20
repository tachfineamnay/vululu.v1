import { describe, expect, it, vi } from 'vitest';
import { PostizProvider, type PublishingPlatform } from '../apps/api/src/infrastructure/publishing/provider';
const signal = new AbortController().signal;
const when = '2030-01-01T00:00:00.000Z';
const fixtures: { platform: PublishingPlatform; identifier: string; settings: object; mime: string }[] = [
  { platform: 'LinkedIn', identifier: 'linkedin-page', settings: { __type: 'linkedin-page' }, mime: 'image/png' },
  { platform: 'Facebook', identifier: 'facebook', settings: { __type: 'facebook' }, mime: 'image/png' },
  { platform: 'Instagram', identifier: 'instagram-standalone', settings: { __type: 'instagram-standalone', post_type: 'post' }, mime: 'image/jpeg' },
  { platform: 'Google Business Profile', identifier: 'gmb', settings: { __type: 'gmb', topicType: 'STANDARD' }, mime: 'image/jpeg' }
];
describe('hosted Postiz contract fixtures', () => {
  for (const { platform, identifier, settings, mime } of fixtures) it(`schedules the documented ${identifier} post shape`, async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json([{ id: 'channel', identifier, disabled: false }]))
      .mockResolvedValueOnce(Response.json({ id: 'asset', path: 'https://cdn.example/photo' }))
      .mockResolvedValueOnce(Response.json([{ postId: 'scheduled', integration: 'channel' }]));
    const provider = new PostizProvider(request, () => true), before = vi.fn();
    expect(await provider.schedule('fixture-key', { platform, channel: 'channel', caption: 'Bonjour', when,
      files: [{ mime, name: 'photo', bytes: Buffer.from('fixture'), sha256: 'fixture' }] }, signal, before)).toBe('scheduled');
    expect(before).toHaveBeenCalledOnce();
    const [url, init] = request.mock.calls[2];
    expect(url).toBe('https://api.postiz.com/public/v1/posts');
    expect(init).toMatchObject({ method: 'POST', redirect: 'error', headers: { Authorization: 'fixture-key' } });
    expect(JSON.parse(String(init?.body))).toMatchObject({ type: 'schedule', date: when, posts: [{
      integration: { id: 'channel' }, settings, value: [{ content: 'Bonjour', image: [{ id: 'asset', path: 'https://cdn.example/photo' }] }]
    }] });
  });
  it('excludes disabled and unknown accounts and refuses a non-provider OAuth destination', async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json([{ id: 'yes', identifier: 'facebook' }, { id: 'no', identifier: 'facebook', disabled: true }, { id: 'unknown', identifier: 'other' }]))
      .mockResolvedValueOnce(Response.json({ url: 'https://www.facebook.com.bad.example/authorize' }));
    const provider = new PostizProvider(request, () => true);
    expect(await provider.integrations('fixture-key', signal)).toMatchObject([{ id: 'yes', platform: 'Facebook' }]);
    await expect(provider.authorizationUrl('fixture-key', 'facebook', signal)).rejects.toMatchObject({ reason: 'INVALID_RECEIPT' });
  });
  it('does not upload or publish direct TikTok content', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json([{ id: 'channel', identifier: 'tiktok' }]));
    await expect(new PostizProvider(request, () => true).schedule('fixture-key', { platform: 'TikTok', channel: 'channel', caption: 'Bonjour', when,
      files: [] }, signal)).rejects.toMatchObject({ reason: 'REJECTED', ambiguous: false });
    expect(request).toHaveBeenCalledOnce();
  });
  it('matches receipts by integration and post ID and requires a network receipt', async () => {
    const match = { id: 'post', integration: { id: 'channel', providerIdentifier: 'facebook' } };
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ posts: [{ ...match, state: 'PUBLISHED', releaseURL: null }] }))
      .mockResolvedValueOnce(Response.json({ posts: [{ ...match, state: 'PUBLISHED', releaseURL: 'https://www.facebook.com/post' }] }));
    const provider = new PostizProvider(request, () => true);
    expect(await provider.status('fixture-key', 'post', 'channel', 'Facebook', new Date(when), signal)).toBeUndefined();
    expect(await provider.status('fixture-key', 'post', 'channel', 'Facebook', new Date(when), signal)).toEqual({ status: 'PUBLISHED', receipt: 'https://www.facebook.com/post' });
    expect(new URL(String(request.mock.calls[0][0])).searchParams.get('startDate')).toBe('2029-12-31T00:00:00.000Z');
  });
});
