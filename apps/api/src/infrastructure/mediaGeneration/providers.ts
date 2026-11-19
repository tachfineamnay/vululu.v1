import { z } from 'zod';
import { mediaRequest, type MediaCapability, type MediaRequest } from '@vululu/contracts';
export const caps = {
  image: {
    provider: 'replicate@1',
    model: 'black-forest-labs/flux-schnell',
    sizes: ['1024:1024'],
    seconds: [],
    requiresReference: false,
    maxCents: 1
  },
  video: {
    provider: 'runway@1',
    model: 'gen4_turbo',
    sizes: ['1280:720', '720:1280'],
    seconds: [5],
    requiresReference: true,
    maxCents: 25
  }
} as const;
const key = (kind: MediaRequest['kind']) =>
  kind === 'image' ? 'REPLICATE_API_TOKEN' : 'RUNWAYML_API_SECRET';
export function capability(kind: MediaRequest['kind']): MediaCapability {
  return {
    schemaVersion: 1,
    kind,
    ...caps[kind],
    availability:
      process.env.MEDIA_GENERATION_ENABLED !== '1'
        ? 'disabled'
        : !(
              process.env[key(kind)]?.trim() ||
              process.env[kind === 'image' ? 'MEDIA_IMAGE_CONFIGURED' : 'MEDIA_VIDEO_CONFIGURED'] === '1'
            )
          ? 'missing_credential'
          : 'configured'
  };
}
export type Progress =
  | { state: 'pending' | 'failed' | 'cancelled'; costCents?: number }
  | { state: 'ready'; url: string; modelVersion?: string; costCents?: number };
export type Reference = { mime: string; bytes: Buffer };
export interface MediaProvider {
  readonly version: 1;
  start(input: MediaRequest, reference: Reference | undefined, signal: AbortSignal): Promise<string>;
  poll(id: string, signal: AbortSignal): Promise<Progress>;
  cancel(id: string, signal: AbortSignal): Promise<void>;
  download(url: string, signal: AbortSignal): Promise<Buffer>;
}
export class ProviderHttpError extends Error {
  constructor(readonly status: number) {
    super('media_provider_unavailable');
  }
}
const remote = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
async function bounded(response: Response, max: number) {
  if (!response.ok || !response.body || Number(response.headers.get('content-length')) > max) {
    await response.body?.cancel();
    throw Error('media_provider_unavailable');
  }
  const reader = response.body.getReader(),
    chunks: Buffer[] = [];
  let n = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if ((n += value.length) > max) throw Error('media_response_limit');
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  } finally {
    await reader.cancel();
  }
}
abstract class HttpProvider {
  readonly version = 1 as const;
  constructor(
    protected token: string,
    protected http: typeof fetch = fetch
  ) {}
  abstract origin: string;
  abstract host: (s: string) => boolean;
  protected headers(): Record<string, string> {
    return { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' };
  }
  protected async call(path: string, signal: AbortSignal, method = 'GET', body?: object) {
    const r = await this.http(this.origin + path, {
      method,
      headers: this.headers(),
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'error',
      signal
    });
    if (!r.ok) {
      await r.body?.cancel();
      throw new ProviderHttpError(r.status);
    }
    if (r.status === 204) return {};
    const b = await bounded(r, 1024 * 1024);
    return b.length ? JSON.parse(b.toString()) : {};
  }
  async download(raw: string, signal: AbortSignal) {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.port || u.username || u.password || !this.host(u.hostname))
      throw Error('media_output_origin');
    return bounded(await this.http(u, { redirect: 'error', signal }), 32 * 1024 * 1024);
  }
}
export class ReplicateImage extends HttpProvider implements MediaProvider {
  origin = 'https://api.replicate.com';
  host = (h: string) => h === 'replicate.delivery' || h.endsWith('.replicate.delivery');
  async start(raw: MediaRequest, ref: Reference | undefined, s: AbortSignal) {
    const r = mediaRequest.parse(raw);
    if (r.kind !== 'image' || ref) throw Error('image_parameters');
    const b = await this.call('/v1/models/' + caps.image.model + '/predictions', s, 'POST', {
      input: {
        prompt: r.prompt,
        aspect_ratio: '1:1',
        num_outputs: 1,
        num_inference_steps: 4,
        megapixels: '1',
        output_format: 'png',
        disable_safety_checker: false
      }
    });
    return remote.parse(b.id);
  }
  async poll(id: string, s: AbortSignal): Promise<Progress> {
    const b = await this.call('/v1/predictions/' + remote.parse(id), s);
    if (b.id !== id) throw Error('media_job_mismatch');
    switch (b.status) {
      case 'starting':
      case 'processing':
        return { state: 'pending' };
      case 'failed':
        return { state: 'failed' };
      case 'canceled':
      case 'aborted':
        return { state: 'cancelled' };
      case 'succeeded':
        return {
          state: 'ready',
          url: z.tuple([z.url()]).parse(b.output)[0],
          modelVersion: z.string().max(160).optional().parse(b.version)
        };
      default:
        throw Error('media_unknown_status');
    }
  }
  async cancel(id: string, s: AbortSignal) {
    await this.call('/v1/predictions/' + remote.parse(id) + '/cancel', s, 'POST');
  }
}
export class RunwayVideo extends HttpProvider implements MediaProvider {
  origin = 'https://api.dev.runwayml.com';
  host = (h: string) => h === 'dnznrvs05pmza.cloudfront.net';
  protected headers() {
    return { ...super.headers(), 'X-Runway-Version': '2024-11-06' };
  }
  async start(raw: MediaRequest, ref: Reference | undefined, s: AbortSignal) {
    const r = mediaRequest.parse(raw);
    if (
      r.kind !== 'video' ||
      !ref ||
      !['image/png', 'image/jpeg'].includes(ref.mime) ||
      ref.bytes.length > 3 * 1024 * 1024
    )
      throw Error('video_reference');
    return remote.parse(
      (
        await this.call('/v1/image_to_video', s, 'POST', {
          model: caps.video.model,
          promptText: r.prompt,
          promptImage: `data:${ref.mime};base64,${ref.bytes.toString('base64')}`,
          ratio: r.size,
          duration: r.seconds
        })
      ).id
    );
  }
  async poll(id: string, s: AbortSignal): Promise<Progress> {
    const b = await this.call('/v1/tasks/' + remote.parse(id), s);
    if (b.id !== id) throw Error('media_job_mismatch');
    const costCents = b.cost === undefined ? undefined : z.int().nonnegative().parse(b.cost.credits);
    switch (b.status) {
      case 'PENDING':
      case 'RUNNING':
      case 'THROTTLED':
        return { state: 'pending' };
      case 'FAILED':
        return { state: 'failed', costCents };
      case 'CANCELLED':
        return { state: 'cancelled', costCents };
      case 'SUCCEEDED':
        return { state: 'ready', costCents, url: z.tuple([z.url()]).parse(b.output)[0] };
      default:
        throw Error('media_unknown_status');
    }
  }
  async cancel(id: string, s: AbortSignal) {
    await this.call('/v1/tasks/' + remote.parse(id), s, 'DELETE');
  }
}
export function mediaRouter(kind: MediaRequest['kind']) {
  if (capability(kind).availability !== 'configured' || !process.env[key(kind)]?.trim()) return null;
  const token = process.env[key(kind)]!;
  return kind === 'image' ? new ReplicateImage(token) : new RunwayVideo(token);
}
