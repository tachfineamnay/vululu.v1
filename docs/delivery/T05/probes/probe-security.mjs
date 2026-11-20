// T05 independent HTTP probe — auth/CSRF/isolation/uploads/storage + entitlements + support RBAC.
// Creates its own accounts; asserts only observable behaviour. No product code is modified.
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { Client } = require(process.env.PG_MODULE || 'pg');

const B = 'http://127.0.0.1:3101';
const O = 'http://127.0.0.1:3100';
let fails = 0;
const out = (k, label, ok, extra = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'} ${k} ${label}${extra ? ' :: ' + extra : ''}`); };
const pg = new Client({ connectionString: process.env.DATABASE_URL });
await pg.connect();

async function user(role = 'user') {
  const email = crypto.randomUUID() + '@example.test', password = 'T05-' + crypto.randomUUID(), id = crypto.randomUUID();
  await pg.query('INSERT INTO "User" (id,email,name,"passwordHash",role) VALUES($1,$2,$3,$4,$5)', [id, email, 'T05', bcrypt.hashSync(password, 4), role]);
  return { id, email, password };
}
async function login(u) {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: O }, body: JSON.stringify({ email: u.email, password: u.password }) });
  const cookies = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  const body = await r.json();
  const call = async (method, path, data, opts = {}) => {
    const headers = { origin: O, cookie: call.cookies, ...(data !== undefined ? { 'content-type': 'application/json' } : {}), ...(opts.csrf === false ? {} : { 'x-csrf-token': call.csrf }), ...(opts.headers ?? {}) };
    const res = await fetch(B + path, { method, headers, body: data === undefined ? undefined : JSON.stringify(data) });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json, text, headers: res.headers };
  };
  call.cookies = cookies; call.csrf = body.csrfToken; call.status = r.status;
  return call;
}

// ---------------------------------------------------------------- 1. auth
const anon = await fetch(B + '/api/projects', { headers: { origin: O } });
out('A1', 'unauthenticated project list refused', [401, 403].includes(anon.status), String(anon.status));

const alice = await user(), bob = await user(), admin = await user('super_admin'), support = await user('support');
const a = await login(alice), b = await login(bob), ad = await login(admin);
out('A2', 'login issues session + csrf', a.status === 200 && !!a.csrf && a.cookies.includes('session='), `status=${a.status}`);

const badLogin = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: O }, body: JSON.stringify({ email: alice.email, password: 'wrong-password' }) });
out('A3', 'wrong password refused without account enumeration', badLogin.status === 401 && !(await badLogin.text()).toLowerCase().includes('existe'), String(badLogin.status));
const unknownLogin = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: O }, body: JSON.stringify({ email: 'ghost-' + crypto.randomUUID() + '@example.test', password: 'x' }) });
out('A4', 'unknown account returns the same generic error', unknownLogin.status === 401, String(unknownLogin.status));
const badOrigin = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: JSON.stringify({ email: alice.email, password: alice.password }) });
out('A5', 'cross-origin login refused (CSRF/origin policy)', [403, 401].includes(badOrigin.status), String(badOrigin.status));

const noCsrf = await a('POST', '/api/contexts', { name: 'Sans CSRF', description: 'Test.' }, { csrf: false });
out('A6', 'mutating request without CSRF token refused', noCsrf.status === 403, `${noCsrf.status} ${noCsrf.text.slice(0, 40)}`);
const me = await a('GET', '/api/auth/me');
out('A7', 'session returns only the current account', me.status === 200 && !me.text.includes(bob.email) && !me.text.includes('passwordHash'), me.status + ' ' + me.text.slice(0, 80));

// ---------------------------------------------------------------- 2. onboarding / profile / offers
const ctxA = await a('POST', '/api/contexts', { name: 'Atelier Sonde', description: 'Céramique artisanale.' });
out('B1', 'brand profile created', ctxA.status === 201, String(ctxA.status));
const ctxA2 = await a('GET', '/api/contexts');
out('B2', 'profile listed with owner scope', ctxA2.status === 200 && ctxA2.body.items.length === 1, `${ctxA2.status} items=${ctxA2.body.items?.length}`);
const ctxB = await b('GET', '/api/contexts');
out('B3', 'second account does not see first account profile', ctxB.status === 200 && ctxB.body.items.length === 0, `items=${ctxB.body.items?.length}`);
const ctxBread = await b('GET', '/api/contexts/' + ctxA.body.context.id);
out('B4', 'IDOR: direct read of foreign profile refused', [403, 404].includes(ctxBread.status), String(ctxBread.status));
const offer = await a('POST', '/api/calendar/offers', { contextId: ctxA.body.context.id, name: 'Bol tourné', confirmed: true });
out('B5', 'confirmed offer persisted', offer.status === 200 && !!offer.body.id, String(offer.status));
const offerB = await b('POST', '/api/calendar/offers', { contextId: ctxA.body.context.id, name: 'Offre pirate', confirmed: true });
out('B6', 'cannot attach an offer to a foreign profile', [403, 404].includes(offerB.status), String(offerB.status));

// ---------------------------------------------------------------- 3. upload safety + storage access
const project = await a('POST', '/api/projects', { contextId: ctxA.body.context.id, title: 'Sonde T05', objective: 'Informer', platform: 'Instagram', format: 'Affiche' });
out('C1', 'project created for own profile', project.status === 201, String(project.status));
const uploadPath = `/api/contexts/${ctxA.body.context.id}/assets`;
async function upload(bytes, mime, name, extra = {}) {
  const kind = mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : 'document';
  const meta = encodeURIComponent(JSON.stringify({ name, kind, mimeType: mime, license: 'internal', provenance: 'T05 probe fixture', ...extra }));
  const res = await fetch(B + uploadPath, { method: 'POST', headers: { origin: O, cookie: a.cookies, 'x-csrf-token': a.csrf, 'x-asset-metadata': meta, 'content-type': 'application/octet-stream' }, body: bytes });
  return { status: res.status, text: await res.text() };
}
const goodPng = require('sharp');
const png = await goodPng({ create: { width: 64, height: 64, channels: 3, background: '#336699' } }).png().toBuffer();
const ok1 = await upload(png, 'image/png', 'brand.png');
out('C2', 'valid PNG accepted and versioned', ok1.status === 200 || ok1.status === 201, `${ok1.status} ${ok1.text.slice(0, 80)}`);
const badPng = await upload(Buffer.from('not an image'), 'image/png', 'fake.png');
out('C3', 'content/type mismatch rejected', badPng.status >= 400 && badPng.status < 500, String(badPng.status));
const emptyUpload = await upload(Buffer.alloc(0), 'image/png', 'empty.png');
out('C4', 'empty upload rejected', emptyUpload.status >= 400, String(emptyUpload.status));
const oversized = await upload(Buffer.alloc(32 * 1024 * 1024 + 1024, 0x89), 'image/png', 'big.png');
out('C5', 'oversized upload rejected (413 or body-limit 400) before any storage', [413, 400].includes(oversized.status), String(oversized.status));
const svgUpload = await upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'image/svg+xml', 'x.svg');
out('C6', 'active SVG content refused', svgUpload.status >= 400, String(svgUpload.status));
const assetId = (() => { try { return JSON.parse(ok1.text).version.assetId; } catch { return null; } })();
if (assetId) {
  const versionId = (() => { try { return JSON.parse(ok1.text).version.id; } catch { return null; } })();
  const foreign = await b('GET', `/api/assets/${assetId}/versions/${versionId}/content`);
  out('C7', 'foreign account cannot read asset bytes', [403, 404].includes(foreign.status), String(foreign.status));
  const anonAsset = await fetch(B + `/api/assets/${assetId}/versions/${versionId}/content`);
  out('C8', 'anonymous asset read refused', [401, 403].includes(anonAsset.status), String(anonAsset.status));
  const own = await a('GET', `/api/assets/${assetId}/versions/${versionId}/content`);
  const ctype = own.headers.get('content-type') ?? '';
  out('C9', 'owner receives image bytes with private caching', own.status === 200 && ctype.startsWith('image/') && /private/.test(own.headers.get('cache-control') ?? ''), `${own.status} ${ctype} cc=${own.headers.get('cache-control')}`);
} else out('C7-C9', 'asset upload did not return an id — skipped', false, ok1.text.slice(0, 120));
const traversal = await fetch(B + `/api/assets/..%2F..%2Fetc%2Fpasswd/versions/x/content`, { headers: { origin: O, cookie: a.cookies } });
out('C10', 'path traversal attempt does not leak files', [400, 404, 403].includes(traversal.status), String(traversal.status));

// ---------------------------------------------------------------- 4. entitlements / quotas / credits
const acct = await a('GET', '/api/billing/account');
const acctB = await b('GET', '/api/billing/account');
out('D1', 'each account reads its own entitlements with no cross-account orders', acct.status === 200 && acctB.status === 200 && Array.isArray(acct.body.orders) && acct.body.orders.length === 0 && acct.body.testMode === true && !acct.text.includes(bob.email), `owner=${acct.status} other=${acctB.status} commercial=${acct.body.commercial}`);
const execTools = await a('GET', '/api/execution/tools');
out('D2', 'execution tool catalogue readable with a session only', execTools.status === 200 && (await fetch(B + '/api/execution/tools')).status === 401, String(execTools.status));
const adminCommerce = await ad('GET', '/api/admin/commerce');
out('D3', 'commercial overview reachable to super admin', adminCommerce.status === 200, String(adminCommerce.status));
const userCommerce = await a('GET', '/api/admin/commerce');
out('D4', 'non-admin cannot read commercial overview', [401, 403, 404].includes(userCommerce.status), String(userCommerce.status));
const checkout = await a('POST', '/api/billing/checkout', { productId: crypto.randomUUID(), requestKey: crypto.randomUUID() });
out('D5', 'checkout refuses an unapproved/absent product without charging', [400, 404, 409, 503].includes(checkout.status), `${checkout.status} ${String(checkout.text).slice(0, 80)}`);

// ---------------------------------------------------------------- 5. support RBAC
const supportUser = await login(support);
const ticket = await a('POST', '/api/billing/tickets', { subject: 'Bug de recette', message: 'Le Studio ne répond pas.' });
out('E1', 'customer can open a support ticket', [200, 201].includes(ticket.status), `${ticket.status} ${String(ticket.text).slice(0, 60)}`);
if ([200, 201].includes(ticket.status)) {
  const ticketId = ticket.body.id ?? ticket.body.ticket?.id;
  const supportRead = await supportUser('GET', '/api/support/cases');
  out('E2', 'support operator sees the customer ticket', supportRead.status === 200 && supportRead.text.includes(ticketId), String(supportRead.status));
  const foreignRead = await b('GET', '/api/billing/tickets');
  out('E3', 'unrelated customer cannot see the ticket', foreignRead.status === 200 && !foreignRead.text.includes(ticketId), String(foreignRead.status));
  const reply = await supportUser('POST', `/api/support/cases/${ticketId}`, { status: 'IN_PROGRESS', expected: 'OPEN', message: 'Nous vérifions.' });
  out('E4', 'support reply recorded with a status transition', reply.status === 200, `${reply.status} ${JSON.stringify(reply.body).slice(0, 80)}`);
  const customerAnswer = await a('POST', `/api/billing/tickets/${ticketId}`, { status: 'IN_PROGRESS', expected: 'IN_PROGRESS', message: 'Merci.' });
  out('E5', 'customer can answer on the same ticket', customerAnswer.status === 200, `${customerAnswer.status} ${JSON.stringify(customerAnswer.body).slice(0, 80)}`);
  const closeByCustomer = await a('POST', `/api/billing/tickets/${ticketId}`, { status: 'CLOSED', expected: 'IN_PROGRESS', message: 'Résolu.' });
  const reopen = await a('POST', `/api/billing/tickets/${ticketId}`, { status: 'OPEN', expected: 'CLOSED', message: 'Réouverture.' });
  out('E6', 'a customer may close but cannot reopen a closed ticket', closeByCustomer.status === 200 && [403, 409].includes(reopen.status), `close=${closeByCustomer.status} reopen=${reopen.status}`);
  const foreignReply = await b('POST', `/api/billing/tickets/${ticketId}`, { status: 'IN_PROGRESS', expected: 'IN_PROGRESS', message: 'Injection' });
  out('E7', 'unrelated account cannot post into the ticket', [403, 404].includes(foreignReply.status), String(foreignReply.status));
  const supportCommercial = await supportUser('GET', '/api/admin/commerce');
  out('E8', 'support role has no commercial administration', [401, 403, 404].includes(supportCommercial.status), String(supportCommercial.status));
  const customerQueue = await a('GET', '/api/support/cases');
  out('E9', 'customer cannot read the support queue', [401, 403, 404].includes(customerQueue.status), String(customerQueue.status));
}

// ---------------------------------------------------------------- 6. session revocation
const logout = await a('POST', '/api/auth/logout', {});
out('F1', 'logout succeeds', logout.status === 200, String(logout.status));
const afterLogout = await a('GET', '/api/projects');
out('F2', 'session no longer valid after logout', [401, 403].includes(afterLogout.status), String(afterLogout.status));

await pg.end();
console.log(fails ? `RESULT ${fails} FAIL(S)` : 'RESULT 0 FAIL');
process.exitCode = fails ? 1 : 0;
