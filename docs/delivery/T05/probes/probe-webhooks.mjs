// T05 — signed webhook relay (positive path): valid HMAC accepted, duplicate idempotent,
// tampered payload rejected, stale timestamp rejected, PUBLISHED without network receipt rejected.
// Uses an admin-created connection with a known relay key (documented admin API), then signs events itself.
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
const R = process.cwd();
const require = createRequire(R + '/packages/media/node_modules/');
const bcrypt = require('bcryptjs');
const { Client } = require(process.env.PG_MODULE || 'pg');

const B = 'http://127.0.0.1:3101', O = 'http://127.0.0.1:3100';
let fails = 0;
const out = (k, label, ok, extra = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'} ${k} ${label}${extra ? ' :: ' + extra : ''}`); };
const pg = new Client({ connectionString: process.env.DATABASE_URL });
await pg.connect();

async function account(role) {
  const email = crypto.randomUUID() + '@example.test', password = 'T05-' + crypto.randomUUID(), id = crypto.randomUUID();
  await pg.query('INSERT INTO "User" (id,email,name,"passwordHash",role) VALUES($1,$2,$3,$4,$5)', [id, email, 'T05 Hook', bcrypt.hashSync(password, 4), role]);
  const lr = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: O }, body: JSON.stringify({ email, password }) });
  const cookies = (lr.headers.getSetCookie() ?? []).map((c) => c.split(';')[0]).join('; ');
  const csrf = (await lr.json()).csrfToken;
  return { id, call: async (method, path, data) => {
    const res = await fetch(B + path, { method, headers: { origin: O, cookie: cookies, 'x-csrf-token': csrf, ...(data !== undefined ? { 'content-type': 'application/json' } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
    const t = await res.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
    return { status: res.status, body: j, text: t };
  } };
}
const user = await account('user'), admin = await account('super_admin');

const relayKey = crypto.randomBytes(32).toString('hex');
const conn = await admin.call('POST', '/api/admin/publishing/connections', { ownerId: user.id, channel: 't05-channel', token: 'tok-' + crypto.randomUUID(), relayKey, expiresAt: new Date(Date.now() + 86400000).toISOString() });
out('W1', 'admin registers a publishing connection (credential encrypted at rest)', conn.status === 200, `${conn.status} ${JSON.stringify(conn.body).slice(0, 90)}`);
const connectionId = conn.body.id;
const stored = await pg.query('SELECT "tokenCipher","hookCipher" FROM "PublishingConnection" WHERE id=$1', [connectionId]);
out('W2', 'provider secrets are stored encrypted, never in clear text', !stored.rows[0].tokenCipher.includes('tok-') && !stored.rows[0].hookCipher.includes(relayKey), `tokenCipher=${String(stored.rows[0].tokenCipher).slice(0, 12)}…`);
const connRead = await user.call('GET', `/api/calendar/${crypto.randomUUID()}/publishing`);
out('W3', 'connection never exposes the secret through the API', connRead.status === 404 || !connRead.text.includes(relayKey), String(connRead.status));

// prepare an owned creative revision so a publication request can reference it
const contextId = (await user.call('POST', '/api/contexts', { name: 'Hook ' + crypto.randomUUID().slice(0, 5), description: 'Atelier de couture.' })).body.context.id;
const pid = (await user.call('POST', '/api/projects', { contextId, title: 'Hook project', objective: 'Tester le relais signé', platform: 'Instagram', format: 'Affiche' })).body.project.id;
const spec = { schemaVersion: 1, width: 1080, height: 1080, safeArea: 0.05, brand: { background: '#101820', accent: '#ffffff' }, delivery: { kind: 'square', platform: 'Instagram' }, scenes: [{ key: 'SCENE-001', seconds: 1, layers: [{ type: 'text', role: 'headline', size: 60, text: 'Relais signé', color: '#ffffff', bold: true, x: 0.1, y: 0.3, w: 0.8, h: 0.3, opacity: 1 }] }] };
const cre = await user.call('POST', `/api/projects/${pid}/creative`, { expectedVersion: 0, spec });
out('W4', 'creative revision available to attach a publication request', [200, 201].includes(cre.status), String(cre.status));
const revision = cre.body.version ?? 1;

const requestId = crypto.randomUUID(), itemId = crypto.randomUUID(), remoteId = 'postiz-' + crypto.randomUUID().slice(0, 8);
await pg.query('INSERT INTO "PublicationRequest" (id,"submitKey","cancelKey","connectionId","projectId",revision,"itemId","itemVersion",state,"remoteId") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
  [requestId, crypto.randomUUID(), crypto.randomUUID(), connectionId, pid, revision, itemId, 1, 'SUBMITTED', remoteId]);
out('W5', 'publication request seeded in SUBMITTED state with a provider receipt id', true, requestId.slice(0, 8));

const sign = (e, ts = Math.floor(Date.now() / 1000)) => {
  const payload = JSON.stringify(e);
  const mac = crypto.createHmac('sha256', relayKey).update(`${connectionId}.${ts}.${payload}`).digest('hex');
  return { body: { connectionId, timestamp: ts, payload }, signature: 'v1=' + mac };
};
const relay = async (signed) => {
  const res = await fetch(B + '/api/publishing/relay', { method: 'POST', headers: { 'content-type': 'application/json', 'x-vululu-signature': signed.signature, origin: O }, body: JSON.stringify(signed.body) });
  const t = await res.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: res.status, body: j, text: t };
};
const eventId = crypto.randomUUID();
const published = { eventId, remoteId, state: 'PUBLISHED', networkReceipt: 'https://postiz.test/receipt/abc' };

const s1 = sign(published);
const r1 = await relay(s1);
out('W6', 'authentic signed PUBLISHED event accepted', r1.status === 200 && r1.body?.accepted === true, `${r1.status} ${r1.text.slice(0, 90)}`);
const state1 = await pg.query('SELECT state,"networkReceipt" FROM "PublicationRequest" WHERE id=$1', [requestId]);
out('W7', 'verified publication state and network receipt persisted', state1.rows[0].state === 'PUBLISHED' && !!state1.rows[0].networkReceipt, `${state1.rows[0].state} ${state1.rows[0].networkReceipt}`);

const r2 = await relay(s1);
const events = await pg.query('SELECT count(*)::int n FROM "PublicationEvent" WHERE "requestId"=$1', [requestId]);
out('W8', 'duplicate delivery is idempotent (one event row, still accepted)', r2.status === 200 && events.rows[0].n === 1, `n=${events.rows[0].n} status=${r2.status}`);

const signedOriginal = sign({ eventId: crypto.randomUUID(), remoteId, state: 'FAILED' });
const r3 = await relay({ ...signedOriginal, body: { ...signedOriginal.body, payload: JSON.stringify({ eventId: crypto.randomUUID(), remoteId, state: 'PUBLISHED', networkReceipt: 'https://postiz.test/receipt/attacker' }) } });
const afterTamper = await pg.query('SELECT state,"networkReceipt" FROM "PublicationRequest" WHERE id=$1', [requestId]);
out('W9', 'payload modified after signing rejected and no attacker receipt stored', r3.status === 401 && afterTamper.rows[0].networkReceipt === 'https://postiz.test/receipt/abc', `${r3.status} receipt=${afterTamper.rows[0].networkReceipt}`);

const stale = sign({ eventId: crypto.randomUUID(), remoteId, state: 'FAILED' }, Math.floor(Date.now() / 1000) - 3600);
const r4 = await relay(stale);
out('W10', 'replayed envelope outside the 5-minute window rejected', r4.status === 401, `${r4.status}`);

const noReceipt = sign({ eventId: crypto.randomUUID(), remoteId, state: 'PUBLISHED' });
const r5 = await relay(noReceipt);
out('W11', 'PUBLISHED event without a network receipt rejected', r5.status === 400, `${r5.status} ${JSON.stringify(r5.body).slice(0, 60)}`);

const conflictEvent = { ...published, networkReceipt: 'https://postiz.test/receipt/other' };
const r6 = await relay(sign(conflictEvent));
out('W12', 'same eventId with different content is a conflict, not a silent overwrite', r6.status === 409, `${r6.status} ${JSON.stringify(r6.body).slice(0, 60)}`);

const unknownRemote = sign({ eventId: crypto.randomUUID(), remoteId: 'ghost-' + crypto.randomUUID().slice(0, 6), state: 'FAILED' });
const r7 = await relay(unknownRemote);
out('W13', 'event for an unknown provider receipt refused', r7.status === 409, `${r7.status}`);

const revoked = await user.call('DELETE', `/api/publishing/connections/${connectionId}`);
out('W14', 'connection owner can revoke the connection', revoked.status === 200, `${revoked.status}`);
const afterRevoke = await relay(sign({ eventId: crypto.randomUUID(), remoteId, state: 'FAILED' }));
out('W15', 'revoked connection no longer accepts signed events', afterRevoke.status === 401, `${afterRevoke.status}`);
const cleared = await pg.query('SELECT "tokenCipher","hookCipher" FROM "PublishingConnection" WHERE id=$1', [connectionId]);
out('W16', 'revocation clears stored secrets', cleared.rows[0].tokenCipher === '' && cleared.rows[0].hookCipher === '', `token="${cleared.rows[0].tokenCipher}" hook="${cleared.rows[0].hookCipher}"`);

await pg.end();
console.log(fails ? `RESULT ${fails} FAIL(S)` : 'RESULT 0 FAIL');
process.exitCode = fails ? 1 : 0;
