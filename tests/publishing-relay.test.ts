import { expect, it, vi } from 'vitest';
import { relayReceipt } from '../scripts/publishing/postiz-receipt.mjs';
const cfg = {
  origin: 'https://vululu.invalid',
  key: crypto.randomUUID(),
  token: crypto.randomUUID(),
  connectionId: crypto.randomUUID(),
  channel: 'known',
  remoteId: 'post-1',
  when: '2030-01-01T00:00:00Z'
};
it('only relays terminal receipts for the exact remote post and channel with a real release id', async () => {
  for (const [id, state, releaseId] of [
    ['other', 'PUBLISHED', '42'],
    ['known', 'QUEUE', '42'],
    ['known', 'PUBLISHED', 'missing'],
    ['known', 'PUBLISHED', '42']
  ]) {
    const tx = vi.fn(async (url: string, init: RequestInit) => {
      if (url.startsWith('https://api.postiz.com/'))
        return Response.json({
          posts: [{ id: 'post-1', state, releaseId, integration: { id, providerIdentifier: 'linkedin' } }]
        });
      expect(url).toBe('https://vululu.invalid/api/publishing/relay');
      expect(JSON.stringify(init.headers)).not.toContain(cfg.token);
      expect(JSON.parse(JSON.parse(String(init.body)).payload).networkReceipt).toBe('42');
      return Response.json({ accepted: true });
    });
    const result = await relayReceipt(cfg, tx);
    expect(tx).toHaveBeenCalledTimes(result === 'RECEIPT_ACCEPTED' ? 2 : 1);
    expect(result === 'RECEIPT_ACCEPTED').toBe(id === 'known' && state === 'PUBLISHED' && releaseId === '42');
  }
});
