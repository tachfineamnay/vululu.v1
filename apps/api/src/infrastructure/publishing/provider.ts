import { z } from 'zod';
import type { OutputKind } from '@vululu/contracts';
export const publishingPlatform = z.enum(['LinkedIn', 'Instagram', 'TikTok', 'Facebook', 'Google Business Profile']);
export type PublishingPlatform = z.infer<typeof publishingPlatform>;
export const capabilities: Record<PublishingPlatform, { caption: number; scheduled: OutputKind[]; cancel: boolean }> = {
  LinkedIn: { caption: 3000, scheduled: ['square', 'portrait'], cancel: true },
  Instagram: { caption: 2200, scheduled: ['square', 'portrait'], cancel: true },
  Facebook: { caption: 5000, scheduled: ['square', 'portrait'], cancel: true },
  'Google Business Profile': { caption: 1500, scheduled: ['square'], cancel: true },
  TikTok: { caption: 2200, scheduled: [], cancel: false }
};
const identifiers: Record<PublishingPlatform, string[]> = {
  LinkedIn: ['linkedin', 'linkedin-page'], Instagram: ['instagram', 'instagram-standalone'],
  Facebook: ['facebook'], TikTok: ['tiktok'], 'Google Business Profile': ['gmb']
};
export function platformFor(identifier: string) {
  return publishingPlatform.options.find((platform) => identifiers[platform].includes(identifier));
}
export type Attachment = { name: string; mime: string; bytes: Buffer; sha256: string };
export type Post = { channel: string; platform?: PublishingPlatform; caption: string; when: string; files: Attachment[] };
export type PostState = { status: 'QUEUE' | 'PUBLISHED' | 'ERROR'; receipt?: string };
export interface PublishingProvider {
  status?(token: string, id: string, channel: string, platform: PublishingPlatform, when: Date, signal: AbortSignal): Promise<PostState | undefined>;
  schedule(token: string, p: Post, signal: AbortSignal, beforeSubmit?: () => Promise<void>): Promise<string>;
  cancel(token: string, remoteId: string, signal: AbortSignal): Promise<void>;
}
export class ProviderFailure extends Error {
  constructor(
    readonly reason:
      | 'TOKEN_EXPIRED'
      | 'DISABLED'
      | 'CHANNEL_MISMATCH'
      | 'PROVIDER_UNAVAILABLE'
      | 'INVALID_RECEIPT'
      | 'REJECTED',
    readonly ambiguous: boolean
  ) {
    super(reason);
  }
}
const opaque = z.string().regex(/^[\w-]{1,160}$/);
async function readJson(response: Response): Promise<unknown> {
  if (!response.body) throw Error('provider_empty_response');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2 * 1024 * 1024) throw Error('provider_response_limit');
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString());
  } finally { await reader.cancel(); }
}
// Only the hosted public API. No user-specified destinations, redirects, URL imports or automatic retries.
export class PostizProvider implements PublishingProvider {
  constructor(
    private readonly transport: typeof fetch = fetch,
    private readonly enabled = () => process.env.POSTIZ_PUBLISH_ENABLED === '1'
  ) {}
  private async call(
    token: string,
    path: string,
    method: string,
    signal: AbortSignal,
    body?: BodyInit,
    json = false
  ) {
    if (!this.enabled()) throw new ProviderFailure('DISABLED', false);
    let r: Response;
    try {
      r = await this.transport('https://api.postiz.com/public/v1' + path, {
        method,
        signal,
        redirect: 'error',
        headers: { Authorization: token, ...(json ? { 'Content-Type': 'application/json' } : {}) },
        body
      });
    } catch {
      throw new ProviderFailure('PROVIDER_UNAVAILABLE', method !== 'GET');
    }
    if (r.status === 401 || r.status === 403) { await r.body?.cancel(); throw new ProviderFailure('TOKEN_EXPIRED', false); }
    if (!r.ok) {
      await r.body?.cancel();
      throw new ProviderFailure(
        r.status >= 500 ? 'PROVIDER_UNAVAILABLE' : 'REJECTED',
        r.status >= 500 || r.status === 408
      );
    }
    return r;
  }
  async authorizationUrl(token: string, identifier: string, signal: AbortSignal) {
    const platform = platformFor(identifier);
    if (!platform) throw new ProviderFailure('CHANNEL_MISMATCH', false);
    const decoded = z.object({ url: z.url().max(4096) }).parse(await readJson(await this.call(token, '/social/' + identifier, 'GET', signal)));
    const url = new URL(decoded.url);
    const hosts: Record<PublishingPlatform, string[]> = {
      LinkedIn: ['www.linkedin.com'], Instagram: ['www.facebook.com', 'www.instagram.com', 'api.instagram.com'],
      Facebook: ['www.facebook.com'], TikTok: ['www.tiktok.com'], 'Google Business Profile': ['accounts.google.com']
    };
    if (url.protocol !== 'https:' || url.port || url.username || url.password || !hosts[platform].includes(url.hostname))
      throw new ProviderFailure('INVALID_RECEIPT', false);
    return url.href;
  }
  async integrations(token: string, signal: AbortSignal) {
    const channels = z.array(z.object({ id: opaque, identifier: z.string(), name: z.string().max(200).optional(),
      disabled: z.boolean().nullable().optional() })).max(1000)
      .parse(await readJson(await this.call(token, '/integrations', 'GET', signal)));
    return channels.flatMap(({ disabled, ...c }) => {
      const platform = platformFor(c.identifier);
      return disabled || !platform ? [] : [{ ...c, platform }];
    });
  }
  async status(token: string, id: string, channel: string, platform: PublishingPlatform, when: Date, signal: AbortSignal): Promise<PostState | undefined> {
    const day = 86400000;
    const query = new URLSearchParams({ startDate: new Date(when.getTime() - day).toISOString(), endDate: new Date(when.getTime() + day).toISOString() });
    const value = z.object({ posts: z.array(z.object({ id: opaque, state: z.string(), releaseURL: z.string().nullish(),
      integration: z.object({ id: opaque, providerIdentifier: z.string() }) })).max(2000) })
      .parse(await readJson(await this.call(token, '/posts?' + query, 'GET', signal)));
    const match = value.posts.find((r) => r.id === id && r.integration.id === channel && platformFor(r.integration.providerIdentifier) === platform);
    if (!match) return;
    if (match.state === 'QUEUE') return { status: 'QUEUE' };
    if (match.state === 'ERROR') return { status: 'ERROR' };
    if (match.state === 'PUBLISHED' && match.releaseURL && /^https:\/\/[^\s]{1,488}$/u.test(match.releaseURL))
      return { status: 'PUBLISHED', receipt: match.releaseURL };
  }
  async schedule(token: string, p: Post, signal: AbortSignal, beforeSubmit?: () => Promise<void>) {
    const platform = p.platform ?? 'LinkedIn';
    const channel = (await this.integrations(token, signal)).find((c) => c.id === p.channel && c.platform === platform);
    if (!channel) throw new ProviderFailure('CHANNEL_MISMATCH', false);
    if (!capabilities[platform].scheduled.length || p.files.length !== 1 ||
        !['image/png', 'image/jpeg'].includes(p.files[0].mime) ||
        (['Instagram', 'Google Business Profile'].includes(platform) && p.files[0].mime !== 'image/jpeg'))
      throw new ProviderFailure('REJECTED', false);
    const settings = { __type: channel.identifier,
      ...(platform === 'Instagram' ? { post_type: 'post' } : {}),
      ...(platform === 'Google Business Profile' ? { topicType: 'STANDARD' } : {}) };
    const images = [];
    for (const f of p.files) {
      const data = new FormData();
      data.append('file', new Blob([new Uint8Array(f.bytes)], { type: f.mime }), f.name);
      images.push(
        z
          .object({ id: opaque, path: z.string().min(1) })
          .parse(await readJson(await this.call(token, '/upload', 'POST', signal, data)))
      );
    }
    await beforeSubmit?.();
    const result = await this.call(
      token,
      '/posts',
      'POST',
      signal,
      JSON.stringify({
        type: 'schedule',
        date: p.when,
        shortLink: false,
        tags: [],
        posts: [
          {
            integration: { id: p.channel },
            value: [{ content: p.caption, image: images }],
            settings
          }
        ]
      }),
      true
    );
    const receipt = z
      .array(z.object({ postId: opaque, integration: z.literal(p.channel) }))
      .length(1)
      .safeParse(await readJson(result));
    if (!receipt.success) throw new ProviderFailure('INVALID_RECEIPT', true);
    return receipt.data[0].postId;
  }
  async cancel(token: string, remoteId: string, signal: AbortSignal) {
    const response = await this.call(token, '/posts/' + opaque.parse(remoteId), 'DELETE', signal);
    await response.body?.cancel();
  }
}
