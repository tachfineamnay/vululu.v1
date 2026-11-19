// Read-only Postiz reconciliation. Run ONLY on a trusted relay, after explicit qualification.
// Never accepts a browser callback as proof; re-reads the matching Postiz channel and release ID.
import { createHash, createHmac } from 'node:crypto';
import { pathToFileURL } from 'node:url';
export async function relayReceipt(config, transport = fetch) {
  const { origin, token, key, connectionId, channel, remoteId, when } = config;
  const target = new URL(origin);
  if (
    target.protocol !== 'https:' ||
    target.username ||
    target.password ||
    target.origin !== origin ||
    !token ||
    !key ||
    key.length < 32 ||
    ![connectionId, channel, remoteId].every((x) => typeof x === 'string' && /^[\w-]{1,160}$/.test(x))
  )
    throw Error('invalid_config');
  const t = Date.parse(when),
    query = new URLSearchParams({
      startDate: new Date(t - 86400000).toISOString(),
      endDate: new Date(t + 86400000).toISOString()
    });
  const list = await transport('https://api.postiz.com/public/v1/posts?' + query, {
    headers: { Authorization: token },
    redirect: 'error',
    signal: AbortSignal.timeout(15000)
  });
  if (!list.ok) throw Error('provider_read_failed');
  const row = (await list.json()).posts.find(
    (p) =>
      p.id === remoteId && p.integration?.id === channel && p.integration?.providerIdentifier === 'linkedin'
  );
  if (!row || !['PUBLISHED', 'ERROR'].includes(row.state)) return 'NO_TERMINAL_RECEIPT';
  if (
    row.state === 'PUBLISHED' &&
    (typeof row.releaseId !== 'string' || !row.releaseId || row.releaseId === 'missing')
  )
    return 'NO_NETWORK_RECEIPT';
  const state = row.state === 'ERROR' ? 'FAILED' : 'PUBLISHED',
    networkReceipt = state === 'PUBLISHED' ? row.releaseId : undefined;
  const h = createHash('sha256')
    .update(JSON.stringify([connectionId, remoteId, state, networkReceipt]))
    .digest('hex');
  const eventId = `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
  const timestamp = Math.floor(Date.now() / 1000),
    payload = JSON.stringify({ eventId, remoteId, state, networkReceipt });
  const sig = createHmac('sha256', key).update(`${connectionId}.${timestamp}.${payload}`).digest('hex');
  const ack = await transport(origin + '/api/publishing/relay', {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json', 'X-Vululu-Signature': 'v1=' + sig },
    body: JSON.stringify({ connectionId, timestamp, payload })
  });
  if (!ack.ok) throw Error('relay_not_accepted');
  return 'RECEIPT_ACCEPTED';
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const e = process.env;
  try {
    console.log(
      await relayReceipt({
        origin: e.VULULU_ORIGIN,
        token: e.POSTIZ_READ_TOKEN,
        key: e.VULULU_RELAY_KEY,
        connectionId: e.CONNECTION_ID,
        channel: e.CHANNEL_ID,
        remoteId: e.REMOTE_POST_ID,
        when: e.SCHEDULED_AT
      })
    );
  } catch {
    console.error('Receipt verification failed; no publication inferred.');
    process.exitCode = 1;
  }
}
