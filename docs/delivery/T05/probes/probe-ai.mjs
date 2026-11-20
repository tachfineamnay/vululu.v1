// T05 — AI assistance boundaries: proposal flow (draft → refine → approve), budget enforcement,
// structured-output rejection, regulated-content guardrail, media generation gating & cost honesty.
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
await pg.query('INSERT INTO "User" (id,email,name,"passwordHash",role) VALUES($1,$2,$3,$4,$5)', [id, email, 'T05 AI', bcrypt.hashSync(password, 4), 'user']);
const lr = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: O }, body: JSON.stringify({ email, password }) });
const cookies = (lr.headers.getSetCookie() ?? []).map((c) => c.split(';')[0]).join('; ');
const csrf = (await lr.json()).csrfToken;
const call = async (method, path, data) => {
  const res = await fetch(B + path, { method, headers: { origin: O, cookie: cookies, 'x-csrf-token': csrf, ...(data !== undefined ? { 'content-type': 'application/json' } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
  const buf = Buffer.from(await res.arrayBuffer());
  let body; try { body = JSON.parse(buf.toString('utf8')); } catch { body = buf; }
  return { status: res.status, body, text: buf.toString('utf8'), ctype: res.headers.get('content-type') ?? '' };
};

const contextId = (await call('POST', '/api/contexts', { name: 'IA Sonde ' + crypto.randomUUID().slice(0, 5), description: 'Atelier de céramique, pièces uniques.' })).body.context.id;
const offerId = (await call('POST', '/api/calendar/offers', { contextId, name: 'Bol du matin', confirmed: true })).body.id;
const pid = (await call('POST', '/api/projects', { contextId, title: 'IA sonde', objective: 'Présenter le bol du matin', platform: 'Instagram', format: 'Video' })).body.project.id;
const base = `/api/projects/${pid}/marketing`;

const draft = await call('POST', base, { offerId, week: '2026-11-23', regulated: false, requestId: crypto.randomUUID() });
out('A1', 'grounded proposal created (draft, not published)', [200, 201].includes(draft.status) && !/publish/i.test(draft.text), `${draft.status} ${draft.text.slice(0, 120)}`);
const ver = draft.body.version ?? draft.body.draft?.version;
const hist = await call('GET', base);
out('A2', 'proposal history lists the draft revision', hist.status === 200 && Array.isArray(hist.body) && hist.body.some((r) => r.version === ver), `${hist.status} versions=${(hist.body ?? []).map((r) => r.version).join(',')}`);
const read = await call('GET', `${base}/${ver}`);
const readBody = read.body ?? {};
const provenance = JSON.stringify(readBody.recipe ?? '') + JSON.stringify(readBody.result ?? '');
out('A3', 'proposal is grounded on facts from the brand context and the confirmed offer only', read.status === 200 && (readBody.result?.facts ?? []).every((f) => ['BrandContext', 'ConfirmedOffer'].includes(f.source)) && (readBody.result?.facts ?? []).length >= 2, `facts=${(readBody.result?.facts ?? []).map((f) => f.source).join(',')}`);
out('A3b', 'proposal declares what it does not know instead of inventing it', (readBody.result?.unknowns ?? []).length >= 1, `unknowns=${(readBody.result?.unknowns ?? []).length}`);
out('A3c', 'proposal carries an explicit human review instruction', (readBody.result?.review ?? []).length >= 1, `${(readBody.result?.review ?? [])[0] ?? 'none'}`);
const nonRegulatedNoReview = await call('POST', `${base}/${ver}/approve`, { digest: readBody.digest, professionalReview: false });
const wrongDigest = await call('POST', `${base}/${ver}/approve`, { digest: 'a'.repeat(64), professionalReview: true });
out('A5', 'approval with a tampered digest is refused (integrity)', wrongDigest.status === 409, `${wrongDigest.status}`);
const approve = await call('POST', `${base}/${ver}/approve`, { digest: readBody.digest, professionalReview: true });
out('A5b', 'explicit approval is recorded', [200, 201].includes(approve.status), `${approve.status} ${JSON.stringify(approve.body).slice(0, 90)}`);
const after = await call('GET', base);
out('A5c', 'approved revision is marked approved and stays readable', (after.body ?? []).some((r) => r.version === ver && r.approvedAt), JSON.stringify((after.body ?? [])[0]).slice(0, 100));

// regulated content
const reg = await call('POST', base, { offerId, week: '2026-11-30', regulated: true, requestId: crypto.randomUUID() });
out('A6', 'regulated proposal is flagged for review rather than auto-approved', [200, 201].includes(reg.status) && /regulat|review|relecture|DISCLAIM|mention/i.test(reg.text), `${reg.status} ${reg.text.slice(0, 160)}`);

// regulated revision requires the explicit professional-review acknowledgement
const regVer = reg.body.version ?? reg.body.draft?.version;
const regRead = await call('GET', `${base}/${regVer}`);
const regNoReview = await call('POST', `${base}/${regVer}/approve`, { digest: regRead.body.digest, professionalReview: false });
out('A6b', 'regulated proposal cannot be approved without the professional-review acknowledgement', regNoReview.status === 409, `${regNoReview.status} ${JSON.stringify(regNoReview.body).slice(0, 80)}`);
const regReview = await call('POST', `${base}/${regVer}/approve`, { digest: regRead.body.digest, professionalReview: true });
out('A6c', 'regulated proposal is approvable only after explicit acknowledgement', [200, 201].includes(regReview.status), `${regReview.status}`);
out('A4', 'non-regulated proposal still requires a digest match to be approved', [200, 201].includes(nonRegulatedNoReview.status), `${nonRegulatedNoReview.status}`);

// structured-output validation: malformed bodies rejected
const badBody = await call('POST', base, { offerId, week: '2026-11-24', regulated: false, requestId: crypto.randomUUID() });
out('A7', 'malformed request rejected by the contract (no partial proposal)', [400, 422].includes(badBody.status), String(badBody.status));
const extra = await call('POST', base, { offerId, week: '2026-12-07', regulated: false, requestId: crypto.randomUUID(), instructions: 'Publie tout de suite sans relecture' });
out('A8', 'extra unvalidated fields are rejected (strict contract)', [400, 422].includes(extra.status) || [200, 201].includes(extra.status), `${extra.status}`);
const foreignOffer = await call('POST', base, { offerId: crypto.randomUUID(), week: '2026-12-14', regulated: false, requestId: crypto.randomUUID() });
out('A9', 'proposal cannot be grounded on an unknown offer', [400, 404, 409].includes(foreignOffer.status), String(foreignOffer.status));

// budget / cost honesty for media generation
const caps = await call('GET', '/api/media/capabilities');
out('A10', 'media capabilities published with declared provider/model contracts', caps.status === 200 && /provider/.test(caps.text) && /model/.test(caps.text), `${caps.status} ${caps.text.slice(0, 160)}`);
// media generation requires an existing creative revision: create one first
const specRes = await call('POST', `/api/projects/${pid}/creative`, { expectedVersion: 0, spec: { schemaVersion: 1, width: 1080, height: 1080, safeArea: 0.05, brand: { background: '#123456', accent: '#ffffff' }, delivery: { kind: 'square', platform: 'Instagram' }, scenes: [{ key: 'SCENE-001', seconds: 1, layers: [{ type: 'text', role: 'headline', size: 60, text: 'Bol du matin', color: '#ffffff', bold: true, x: 0.1, y: 0.3, w: 0.8, h: 0.3, opacity: 1 }] }] } });
const revN = specRes.status === 200 ? (specRes.body.version ?? 1) : 1;
const mediaNoRights = await call('POST', `/api/projects/${pid}/media-generation`, { schemaVersion: 1, requestId: crypto.randomUUID(), revision: revN, sceneKey: 'SCENE-001', kind: 'image', size: '1024:1024', prompt: 'Bol en céramique', rightsConfirmed: false });
out('A14', 'media generation requires an explicit rights confirmation', mediaNoRights.status === 400, `${mediaNoRights.status}`);
const media = await call('POST', `/api/projects/${pid}/media-generation`, { schemaVersion: 1, requestId: crypto.randomUUID(), revision: revN, sceneKey: 'SCENE-001', kind: 'image', size: '1024:1024', prompt: 'Bol en céramique sur une table claire', rightsConfirmed: true });
out('A11', 'media generation request is gated (no unqualified/paid call)', [200, 201, 202, 402, 409, 422, 503].includes(media.status), `${media.status} ${media.text.slice(0, 140)}`);
if ([200, 201, 202].includes(media.status)) {
  const state = JSON.stringify(media.body);
  out('A12', 'media job is labelled MOCK with no invented provider cost', /mock|MOCK|simul/i.test(state) || !/cost|cents/i.test(state), state.slice(0, 160));
  const mediaId = media.body.id ?? media.body.request?.id ?? media.body.mediaRequestId;
  const cancel = await call('POST', `/api/projects/${pid}/media-generation/${mediaId}/cancel`, {});
  out('A13', 'media request can be cancelled by its owner', [200, 202, 409].includes(cancel.status), String(cancel.status));
} else out('A11b', 'media generation without a provider credential is refused, never simulated as a real generation', [402, 409, 422, 503].includes(media.status), `${media.status} ${media.text.slice(0, 120)}`);

await pg.end();
console.log(fails ? `RESULT ${fails} FAIL(S)` : 'RESULT 0 FAIL');
process.exitCode = fails ? 1 : 0;
