// T05 — operational surface: readiness, health, metrics exposure, rate limiting, request hygiene.
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
const mk = async (role) => {
  const email = crypto.randomUUID() + '@example.test', password = 'T05-' + crypto.randomUUID(), id = crypto.randomUUID();
  await pg.query('INSERT INTO "User" (id,email,name,"passwordHash",role) VALUES($1,$2,$3,$4,$5)', [id, email, 'T05 Ops', bcrypt.hashSync(password, 4), role]);
  const lr = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: O }, body: JSON.stringify({ email, password }) });
  const cookies = (lr.headers.getSetCookie() ?? []).map((c) => c.split(';')[0]).join('; ');
  const csrf = (await lr.json()).csrfToken;
  return async (method, path, data) => {
    const res = await fetch(B + path, { method, headers: { origin: O, cookie: cookies, 'x-csrf-token': csrf, ...(data !== undefined ? { 'content-type': 'application/json' } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
    const t = await res.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
    return { status: res.status, body: j, text: t };
  };
};

const ready = await fetch(B + '/api/ready');
out('O1', 'readiness probe returns a bounded status', [200, 503].includes(ready.status), String(ready.status));
const health = await fetch(B + '/api/health');
const ht = await health.text();
out('O2', 'health probe reports dependency state without secrets', [200, 503].includes(health.status) && !/password|secret|DATABASE_URL/i.test(ht), `${health.status} ${ht.slice(0, 100)}`);

const user = await mk('user'), admin = await mk('super_admin');
const uHealth = await user('GET', '/api/ops/health');
out('O3', 'ops health is restricted to administrators', [401, 403, 404].includes(uHealth.status), String(uHealth.status));
const aHealth = await admin('GET', '/api/ops/health');
out('O4', 'ops health readable by the super admin', aHealth.status === 200, String(aHealth.status));
const metrics = await admin('GET', '/api/ops/metrics');
out('O5', 'ops metrics require admin and expose no credentials', metrics.status === 200 && !/sk_|bearer|password/i.test(metrics.text), `${metrics.status} ${metrics.text.slice(0, 120)}`);
const anonMetrics = await fetch(B + '/api/ops/metrics');
out('O6', 'anonymous metrics access refused', [401, 403, 404].includes(anonMetrics.status), String(anonMetrics.status));
const snapshot = await admin('GET', '/api/ops/snapshot');
out('O7', 'ops snapshot reconciles durable state', [200, 202].includes(snapshot.status), `${snapshot.status} ${snapshot.text.slice(0, 100)}`);

// rate limiting: keyed per (ip, email); measured behaviour recorded for the report
let first429 = null;
for (let i = 0; i < 130; i++) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: O }, body: JSON.stringify({ email: 'brute-same@example.test', password: 'wrong-' + i }) });
  if (r.status === 429) { first429 = i + 1; break; }
}
out('O8', 'repeated failed logins for one account are throttled', first429 !== null, `first 429 at attempt ${first429} (configured RATE_LIMIT_LOGIN default 100/60s)`);
let rotatingLimited = null;
for (let i = 0; i < 130; i++) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: O }, body: JSON.stringify({ email: 'rot-' + Date.now() + '-' + i + '@example.test', password: 'wrong' }) });
  if (r.status === 429) { rotatingLimited = i + 1; break; }
}
out('O8b', 'per-IP aggregate login throttling exists independently of the email key', rotatingLimited !== null, rotatingLimited ? `first 429 at ${rotatingLimited}` : 'no 429 across 130 distinct emails — limiter is keyed per (ip,email) only');

// request hygiene
const badJson = await fetch(B + '/api/contexts', { method: 'POST', headers: { origin: O, 'content-type': 'application/json', cookie: '', 'x-csrf-token': '' }, body: '{bad json' });
out('O9', 'malformed JSON is rejected cleanly (no 500)', badJson.status < 500, String(badJson.status));
const huge = await fetch(B + '/api/projects', { method: 'POST', headers: { origin: O, 'content-type': 'application/json' }, body: JSON.stringify({ title: 'x'.repeat(120000) }) });
out('O10', 'oversized JSON body rejected (413/400, never 500)', [400, 413, 401].includes(huge.status), String(huge.status));
const hdr = await fetch(B + '/api/health');
const h = hdr.headers;
out('O11', 'no stack traces or framework fingerprint leaked in normal responses', !/x-powered-by/i.test([...h.keys()].join(',')), [...h.keys()].join(',').slice(0, 160));

await pg.end();
console.log(fails ? `RESULT ${fails} FAIL(S)` : 'RESULT 0 FAIL');
process.exitCode = fails ? 1 : 0;
