import { expect, it, vi } from 'vitest';
import { missing, normalizePost, readPost } from '../apps/api/src/infrastructure/results/provider';
import { campaignLink } from '../apps/web/lib/utm';
// Controlled transport fixtures, NOT observations about any real post or business.
export const fixture = (label: string, total: number) => ({ label, data: [{ date: '2026-10-01', total }] });
it('keeps an observed zero distinct from absent metrics; never maps engagement rates or guesses conversions', () => {
  expect(
    normalizePost([
      fixture('Impressions', 51),
      fixture('Clicks', 0),
      fixture('Engagement', 0.5),
      fixture('Sales', 1),
    ]),
  ).toEqual({ ...missing(), impressions: 51, clicks: 0 });
  expect(normalizePost([fixture('Likes', 1), fixture('Comments', 2), fixture('Shares', 3)]).engagement).toBe(
    6,
  );
  expect(normalizePost([fixture('Clicks', 3), fixture('Clicks', 4)]).clicks).toBe('NOT_AVAILABLE');
  expect(normalizePost({ missing: true })).toEqual(missing());
});
it('only reads the fixed provider endpoint; rejects errors and ambiguous series', async () => {
  const f = vi.fn(async () => Response.json([fixture('Clicks', 0)]));
  const r = await readPost('post-a', 'fixture-token', f);
  expect(f).toHaveBeenCalledWith(
    'https://api.postiz.com/public/v1/analytics/post/post-a?date=7',
    expect.objectContaining({ redirect: 'error' }),
  );
  expect(r.source).toContain('Postiz');
  expect(Date.parse(r.retrievedAt!)).toBeGreaterThan(0);
  expect((await readPost('bad/id', 'secret', f)).retrievedAt).toBeNull();
  expect(
    (await readPost('post-a', 'token', async () => new Response(null, { status: 429 }))).metrics,
  ).toEqual(missing());
  expect(
    normalizePost([{ label: 'Clicks', data: [...fixture('Clicks', 1).data, ...fixture('Clicks', 2).data] }]),
  ).toEqual(missing());
});
it('composes UTM locally without disturbing other parameters or counting clicks', () => {
  expect(campaignLink('https://atelier.example/p?a=b#offers', 'linkedin', 'winter')).toBe(
    'https://atelier.example/p?a=b&utm_source=linkedin&utm_medium=social&utm_campaign=winter#offers',
  );
  expect(() => campaignLink('javascript:alert(1)', 'a', 'b')).toThrow();
  expect(() => campaignLink('https://user:pass@example.org', 'a', 'b')).toThrow();
});
