import { z } from 'zod';
export const unavailable = 'NOT_AVAILABLE' as const;
export type Count = number | typeof unavailable;
export function missing() {
  return {
    impressions: unavailable as Count,
    engagement: unavailable as Count,
    clicks: unavailable as Count,
    leads: unavailable,
    sales: unavailable,
  };
}
// A single lifetime value only: never sum cumulative series, rates or unique impressions.
export function normalizePost(body: unknown) {
  const parsed = z
    .array(z.object({ label: z.string(), data: z.array(z.unknown()).max(366) }))
    .max(64)
    .safeParse(body);
  const out = missing();
  if (!parsed.success) return out;
  const count = (label: string) => {
    const rows = parsed.data.filter((x) => x.label === label);
    if (rows.length !== 1 || rows[0].data.length !== 1) return null;
    const v = z.object({ total: z.int().nonnegative(), date: z.iso.date() }).safeParse(rows[0].data[0]);
    return v.success ? v.data : null;
  };
  out.impressions = count('Impressions')?.total ?? unavailable;
  out.clicks = count('Clicks')?.total ?? unavailable;
  const l = count('Likes'),
    c = count('Comments'),
    s = count('Shares');
  if (
    l &&
    c &&
    s &&
    l.date === c.date &&
    c.date === s.date &&
    Number.isSafeInteger(l.total + c.total + s.total)
  )
    out.engagement = l.total + c.total + s.total;
  return out;
}
export async function readPost(remoteId: string, token: string, transport = fetch) {
  const source = 'Postiz · LinkedIn';
  const absent = { source, retrievedAt: null, metrics: missing() };
  if (!/^[\w-]{1,160}$/.test(remoteId)) return absent;
  try {
    const r = await transport('https://api.postiz.com/public/v1/analytics/post/' + remoteId + '?date=7', {
      headers: { Authorization: token },
      redirect: 'error',
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return absent;
    const reader = r.body?.getReader();
    if (!reader) return absent;
    const chunks: Uint8Array[] = [];
    let n = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if ((n += value.length) > 65536) {
        await reader.cancel();
        return absent;
      }
      chunks.push(value);
    }
    return {
      source,
      retrievedAt: new Date().toISOString(),
      metrics: normalizePost(JSON.parse(Buffer.concat(chunks).toString())),
    };
  } catch {
    return absent;
  }
}
