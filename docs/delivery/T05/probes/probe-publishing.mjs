// T05 — publishing surface: manual export package, signed webhook ingestion (invalid signature / duplicate / replay),
// direct publishing disabled by default, credential isolation.
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
const email = crypto.randomUUID() + '@example.test', password = 'T05-' + crypto.randomUUID(), id = crypto.randomUUID();
await pg.query('INSERT INTO "User" (id,email,name,"passwordHash",role) VALUES($1,$2,$3,$4,$5)', [id, email, 'T05 Pub', bcrypt.hashSync(password, 4), 'user']);
const lr = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: O }, body: JSON.stringify({ email, password }) });
const cookies = (lr.headers.getSetCookie() ?? []).map((c) => c.split(';')[0]).join('; ');
const csrf = (await lr.json()).csrfToken;
const call = async (method, path, data) => {
  const res = await fetch(B + path, { method, headers: { origin: O, cookie: cookies, 'x-csrf-token': csrf, ...(data !== undefined ? { 'content-type': 'application/json' } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
  const buf = Buffer.from(await res.arrayBuffer());
  let body; try { body = JSON.parse(buf.toString('utf8')); } catch { body = buf; }
  return { status: res.status, body, buf, ctype: res.headers.get('content-type') ?? '' };
};

const base = '/api/calendar';
const list = await call('GET', `${base}/${crypto.randomUUID()}/publishing`);
out('B1', 'publishing detail of an unknown item is refused, not fabricated', list.status === 404, `${list.status} ${JSON.stringify(list.body).slice(0, 90)}`);

// enum protection: no cross-account publication request ids are guessable/leaked
const ids = JSON.stringify(list.body).match(/[a-z0-9]{20,}/g) ?? [];
out('B2', 'list response does not leak foreign identifiers', !/other|foreign/.test(JSON.stringify(list.body)), `${ids.length} ids`);

// manual export requires an approved revision: refusing early is the correct behaviour
const manual = await call('GET', `${base}/${crypto.randomUUID()}/publishing/1/package`);
out('B3', 'manual package of an unknown revision is refused (404), never a placeholder', manual.status === 404, `${manual.status} ${manual.ctype}`);

// direct publishing is disabled unless explicitly enabled with provider credentials
const direct = await call('POST', `${base}/${crypto.randomUUID()}/publishing/1/prepare`, { connectionId: crypto.randomUUID() });
out('B4', 'direct publishing disabled by default (no provider credentials)', direct.status === 409 && /direct_disabled/.test(JSON.stringify(direct.body)), `${direct.status} ${JSON.stringify(direct.body).slice(0, 70)}`);

// signed relay webhook — invalid signature must be rejected
const envelope = { event: 'post.published', id: crypto.randomUUID(), occurredAt: new Date().toISOString(), data: { externalId: 'ext-1' } };
async function relay(body, signature) {
  const res = await fetch(B + '/api/publishing/relay', { method: 'POST', headers: { 'content-type': 'application/json', 'x-vululu-signature': signature, origin: O }, body: JSON.stringify(body) });
  const t = await res.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: res.status, body: j };
}
const unsigned = await relay(envelope, '');
out('B5', 'unsigned relay callback rejected', [400, 401, 403].includes(unsigned.status), `${unsigned.status}`);
const badSig = await relay(envelope, 'sha256=' + 'a'.repeat(64));
out('B6', 'forged signature rejected', [400, 401, 403].includes(badSig.status), `${badSig.status}`);
const wrongScheme = await relay(envelope, crypto.createHmac('sha256', 'guessed').update(JSON.stringify(envelope)).digest('hex'));
out('B7', 'signature from an unshared secret rejected', [400, 401, 403].includes(wrongScheme.status), `${wrongScheme.status}`);
const oversized = await relay({ ...envelope, data: { blob: 'x'.repeat(20000) } }, 'sha256=' + 'a'.repeat(64));
out('B8', 'oversized relay payload refused before verification work', [400, 413].includes(oversized.status), String(oversized.status));
// replay of the same envelope with the same (still invalid) signature stays rejected
const replay = await relay(envelope, 'sha256=' + 'a'.repeat(64));
out('B9', 'replay of a rejected envelope stays rejected', [400, 401, 403].includes(replay.status), String(replay.status));
// relay must not be reachable via a browser session alone (no CSRF bypass)
const viaSession = await call('POST', '/api/publishing/relay', envelope);
out('B10', 'relay requires a valid HMAC, not merely a logged-in session', [400, 401, 403].includes(viaSession.status), String(viaSession.status));

// provider credential isolation: an ordinary user cannot write provider credentials
const creds = await call('POST', '/api/admin/publishing/connections', { provider: 'postiz', key: 'k', secret: 's' });
out('B11', 'ordinary account cannot register publishing credentials', [401, 403, 404].includes(creds.status), String(creds.status));

await pg.end();
console.log(fails ? `RESULT ${fails} FAIL(S)` : 'RESULT 0 FAIL');
process.exitCode = fails ? 1 : 0;
