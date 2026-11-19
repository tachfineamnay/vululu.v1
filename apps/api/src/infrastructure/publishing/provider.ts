import { z } from 'zod';
import type { OutputKind, Platform } from '@vululu/contracts';
export const capabilities: Record<Platform, { caption: number; scheduled: OutputKind[]; cancel: boolean }> = {
  LinkedIn: { caption: 3000, scheduled: ['square', 'portrait'], cancel: true },
  Instagram: { caption: 2200, scheduled: [], cancel: false },
  TikTok: { caption: 2200, scheduled: [], cancel: false }
};
export type Attachment = { name: string; mime: string; bytes: Buffer; sha256: string };
export type Post = { channel: string; caption: string; when: string; files: Attachment[] };
export interface PublishingProvider {
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
    if (r.status === 401 || r.status === 403) throw new ProviderFailure('TOKEN_EXPIRED', false);
    if (!r.ok)
      throw new ProviderFailure(
        r.status >= 500 ? 'PROVIDER_UNAVAILABLE' : 'REJECTED',
        r.status >= 500 || r.status === 408
      );
    return r;
  }
  async schedule(token: string, p: Post, signal: AbortSignal, beforeSubmit?: () => Promise<void>) {
    const channels = z
      .array(z.object({ id: opaque, identifier: z.string(), disabled: z.boolean().nullable().optional() }))
      .parse(await (await this.call(token, '/integrations', 'GET', signal)).json());
    if (!channels.some((c) => c.id === p.channel && c.identifier === 'linkedin' && !c.disabled))
      throw new ProviderFailure('CHANNEL_MISMATCH', false);
    const images = [];
    for (const f of p.files) {
      const data = new FormData();
      data.append('file', new Blob([new Uint8Array(f.bytes)], { type: f.mime }), f.name);
      images.push(
        z
          .object({ id: opaque, path: z.string().min(1) })
          .parse(await (await this.call(token, '/upload', 'POST', signal, data)).json())
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
            settings: { __type: 'linkedin' }
          }
        ]
      }),
      true
    );
    const receipt = z
      .array(z.object({ postId: opaque, integration: z.literal(p.channel) }))
      .length(1)
      .safeParse(await result.json());
    if (!receipt.success) throw new ProviderFailure('INVALID_RECEIPT', true);
    return receipt.data[0].postId;
  }
  async cancel(token: string, remoteId: string, signal: AbortSignal) {
    await this.call(token, '/posts/' + opaque.parse(remoteId), 'DELETE', signal);
  }
}
