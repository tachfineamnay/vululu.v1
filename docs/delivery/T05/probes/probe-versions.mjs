// T05 — targeted editing / historical versions / export integrity.
// After a correction, both master versions must remain independently downloadable with distinct checksums.
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import fs from 'node:fs';
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
await pg.query('INSERT INTO "User" (id,email,name,"passwordHash",role) VALUES($1,$2,$3,$4,$5)', [id, email, 'T05 Versions', bcrypt.hashSync(password, 4), 'user']);
const lr = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: O }, body: JSON.stringify({ email, password }) });
const cookies = (lr.headers.getSetCookie() ?? []).map((c) => c.split(';')[0]).join('; ');
const csrf = (await lr.json()).csrfToken;
const call = async (method, path, data) => {
  const res = await fetch(B + path, { method, headers: { origin: O, cookie: cookies, 'x-csrf-token': csrf, ...(data !== undefined ? { 'content-type': 'application/json' } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
  const buf = Buffer.from(await res.arrayBuffer());
  let body; try { body = JSON.parse(buf.toString('utf8')); } catch { body = buf; }
  return { status: res.status, body, buf, ctype: res.headers.get('content-type') ?? '' };
};
const wait = async (pid, want) => {
  for (let i = 0; i < 150; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const s = await call('GET', `/api/projects/${pid}`);
    const st = s.body?.project?.status;
    if (want.includes(st)) return s;
    if (['failed', 'cancelled'].includes(st)) return s;
  }
  return null;
};

const contextId = (await call('POST', '/api/contexts', { name: 'Versions ' + crypto.randomUUID().slice(0, 6), description: 'Suivi des versions.' })).body.context.id;
const pid = (await call('POST', '/api/projects', { contextId, title: 'Version sonde', objective: 'Vérifier les versions', platform: 'Instagram', format: 'Video', sceneDurationSeconds: 1 })).body.project.id;
await call('PATCH', `/api/projects/${pid}/brief`, { objective: 'Vérifier les versions', audience: 'Recette', tone: 'Neutre', cta: 'Voir', platform: 'Instagram', format: 'Video', settings: { ratio: '1:1', defaultSceneDurationSeconds: 1, visualStyle: 'minimal', direction: 'Fond uni', maxMockCents: 0 } });
const b1 = await call('GET', `/api/projects/${pid}`);
const rev = b1.body.brief.revisions.find((r) => r.version === b1.body.brief.version);
await call('POST', `/api/projects/${pid}/brief/confirm`, { version: rev.version, checksum: rev.checksum });
await call('POST', `/api/projects/${pid}/storyboard`, {});
const prod = await call('POST', `/api/projects/${pid}/produce`, {});
out('V1', 'first production started', prod.status === 202, String(prod.status));
const s1 = await wait(pid, ['review', 'failed', 'cancelled']);
out('V2', 'first master reaches review', s1?.body?.project?.status === 'review', String(s1?.body?.project?.status));
const v1 = await call('GET', `/api/projects/${pid}/master?version=1`);
out('V3', 'master v1 downloadable', v1.status === 200 && v1.buf.length > 1000, `${v1.status} ${v1.buf.length}B`);

// targeted correction on one scene only
const bundlePre = (await call('GET', `/api/projects/${pid}`)).body;
const scenesBefore = bundlePre.scenes;
console.log('SCENE_FIELDS', JSON.stringify(scenesBefore[0]).slice(0, 300));
console.log('MASTER_KEYS', JSON.stringify(Object.keys(bundlePre.masterVersions?.[0] ?? {})).slice(0,200));
const targetKey = scenesBefore[2].key ?? scenesBefore[2].sceneKey ?? scenesBefore[2].id;
const corr = await call('POST', `/api/projects/${pid}/scenes/${targetKey}/correct`, { instruction: 'Remplace le titre par « Série limitée »' });
out('V4', 'targeted correction accepted on a single scene key', corr.status === 202, `${corr.status} ${JSON.stringify(corr.body).slice(0, 90)}`);
const s2 = await wait(pid, ['review', 'failed', 'cancelled']);
const scenesAfter = s2?.body?.scenes ?? [];
const changed = scenesAfter.filter((x) => { const before = scenesBefore.find((b) => (b.sceneKey ?? b.key) === (x.sceneKey ?? x.key)); const lastV = (v) => (v?.versions ?? []).map((n) => n.version).sort((a, b) => b - a)[0] ?? 0; return before && lastV(x) !== lastV(before); });
console.log('SCENE_VERSIONS_BEFORE', JSON.stringify((bundlePre.scenes??[]).map((x)=>({k:x.sceneKey,v:(x.versions??[]).map((n)=>n.version)}))));
console.log('SCENE_VERSIONS_AFTER', JSON.stringify((scenesAfter??[]).map((x)=>({k:x.sceneKey,v:(x.versions??[]).map((n)=>n.version),iv:x.imageVersion}))));
out('V5', 'only the targeted scene gains a new version', changed.length === 1 && (changed[0].sceneKey ?? changed[0].key) === targetKey, `changed=${changed.map((c) => c.sceneKey ?? c.key).join(',') || 'none'}`);
const v2 = await call('GET', `/api/projects/${pid}/master?version=2`);
out('V6', 'a second master version exists after correction', v2.status === 200 && v2.buf.length > 1000, `${v2.status} ${v2.buf.length}B`);
const h1 = crypto.createHash('sha256').update(v1.buf).digest('hex'), h2 = crypto.createHash('sha256').update(v2.buf).digest('hex');
out('V7', 'historical v1 remains byte-identical after v2 exists (no silent overwrite)', (await call('GET', `/api/projects/${pid}/master?version=1`)).buf.equals(v1.buf) && h1 !== h2, `h1=${h1.slice(0, 12)} h2=${h2.slice(0, 12)}`);
const bundle = await call('GET', `/api/projects/${pid}`);
const vers = (bundle.body.masterVersions ?? []).map((v) => v.version);
out('V8', 'bundle exposes both versions with their checksums', vers.length >= 2 && (bundle.body.masterVersions ?? []).every((v) => /^[a-f0-9]{64}$/.test(v.checksum ?? '')), `versions=${vers.join(',')}`);
const bad = await call('GET', `/api/projects/${pid}/master?version=99`);
out('V9', 'unknown master version refused, never substituted', bad.status === 404, `${bad.status}`);
const sceneHist = await call('GET', `/api/projects/${pid}/scenes/${targetKey}/image?version=1`);
out('V10', 'historical scene image still retrievable by version', sceneHist.status === 200 && sceneHist.ctype.startsWith('image/'), `${sceneHist.status} ${sceneHist.ctype}`);
const foreign = await fetch(B + `/api/projects/${pid}/master?version=2`, { headers: { origin: O, cookie: 'session=forged' } });
out('V11', 'master is not downloadable with a forged session', [401, 403].includes(foreign.status), String(foreign.status));

await pg.end();
console.log(fails ? `RESULT ${fails} FAIL(S)` : 'RESULT 0 FAIL');
process.exitCode = fails ? 1 : 0;
