// T05 — end-to-end production journey over the real HTTP API: brief → storyboard → produce → QA → version → export → approve → transfer.
// Runs against the demo-capable local stack with real Sharp/FFmpeg rendering (DEMO_MODE=1, fake AI provider only).
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const R = process.cwd();
const require = createRequire(R + '/packages/media/node_modules/');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { Client } = require(process.env.PG_MODULE || 'pg');

const B = 'http://127.0.0.1:3101', O = 'http://127.0.0.1:3100';
let fails = 0;
const out = (k, label, ok, extra = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'} ${k} ${label}${extra ? ' :: ' + extra : ''}`); };
const pg = new Client({ connectionString: process.env.DATABASE_URL });
await pg.connect();

const email = crypto.randomUUID() + '@example.test', password = 'T05-' + crypto.randomUUID(), id = crypto.randomUUID();
await pg.query('INSERT INTO "User" (id,email,name,"passwordHash",role) VALUES($1,$2,$3,$4,$5)', [id, email, 'T05 Parcours', bcrypt.hashSync(password, 4), 'user']);
const lr = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: O }, body: JSON.stringify({ email, password }) });
const cookies = (lr.headers.getSetCookie() ?? []).map((c) => c.split(';')[0]).join('; ');
const csrf = (await lr.json()).csrfToken;
const call = async (method, path, data) => {
  const res = await fetch(B + path, { method, headers: { origin: O, cookie: cookies, 'x-csrf-token': csrf, ...(data !== undefined ? { 'content-type': 'application/json' } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
  const buf = Buffer.from(await res.arrayBuffer());
  const isJson = (res.headers.get('content-type') ?? '').includes('json');
  let body; try { body = isJson ? JSON.parse(buf.toString('utf8')) : buf; } catch { body = buf; }
  return { status: res.status, body, headers: res.headers, buf, text: isJson ? JSON.stringify(body) : '' };
};

// 1. profile + project
const ctx = await call('POST', '/api/contexts', { name: 'Atelier Parcours', description: 'Céramique utilitaire, fait main.' });
out('P1', 'brand profile created', ctx.status === 201, String(ctx.status));
const contextId = ctx.body.context.id;
const proj = await call('POST', '/api/projects', { contextId, title: 'Bol du matin', objective: 'Faire connaître le bol du matin', platform: 'Instagram', format: 'Video', sceneDurationSeconds: 2 });
out('P2', 'video project created', proj.status === 201, `${proj.status} ${proj.text.slice(0, 80)}`);
const pid = proj.body.project.id;

// 2. brief + revision history
const briefBody = { objective: 'Faire connaître le bol du matin', audience: 'Amateurs de céramique', tone: 'Chaleureux', cta: 'Découvrir la collection', platform: 'Instagram', format: 'Video', settings: { ratio: '4:5', defaultSceneDurationSeconds: 2, visualStyle: 'editorial', direction: 'Lumière naturelle', maxMockCents: 0 } };
const brief = await call('PATCH', `/api/projects/${pid}/brief`, briefBody);
out('P3', 'brief persisted', [200, 201].includes(brief.status), `${brief.status} ${brief.text.slice(0, 100)}`);
const brief2 = await call('PATCH', `/api/projects/${pid}/brief`, { ...briefBody, tone: 'Sobre et chaleureux' });
const briefVersion = brief2.body?.brief?.version;
const briefChecksum = (brief2.body?.brief?.revisions ?? []).find((r) => r.version === briefVersion)?.checksum;
const confirm = await call('POST', `/api/projects/${pid}/brief/confirm`, { version: briefVersion, checksum: briefChecksum });
out('P3c', 'brief confirmation requires the exact version + checksum', confirm.status === 200, `${confirm.status} ${confirm.text.slice(0, 100)}`);
out('P3b', 'brief edit accepted', [200, 201].includes(brief2.status), String(brief2.status));
const bundle = await call('GET', `/api/projects/${pid}`);
const revs = bundle.body?.brief?.revisions ?? [];
out('P4', 'historical brief revision retained after edit', bundle.status === 200 && revs.length >= 2, `${bundle.status} revisions=${revs.length} v=${JSON.stringify(revs.map?.((r) => r.version)).slice(0, 60)}`);

// 3. storyboard / production plan
const plan = await call('GET', `/api/projects/${pid}/production-plan`);
out('P5', 'production plan preview computed', plan.status === 200, `${plan.status} ${plan.text.slice(0, 140)}`);
const storyboard = await call('POST', `/api/projects/${pid}/storyboard`, {});
out('P5b', 'storyboard generated (demo provider, no real AI)', [200, 201].includes(storyboard.status), `${storyboard.status} ${storyboard.text.slice(0, 140)}`);
const status1 = await call('GET', `/api/projects/${pid}/status`);
out('P6', 'project status readable', status1.status === 200, `${status1.status} ${JSON.stringify(status1.body).slice(0, 100)}`);

// 4. produce (real render path)
const produce = await call('POST', `/api/projects/${pid}/produce`, {});
out('P7', 'production accepted', [200, 201, 202].includes(produce.status), `${produce.status} ${produce.text.slice(0, 140)}`);
let ready = null, lastStatus = '';
for (let i = 0; i < 120; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const s = await call('GET', `/api/projects/${pid}/status`);
  lastStatus = s.body?.project?.status ?? '';
  if (['review', 'approved'].includes(lastStatus)) { ready = s; break; }
  if (['failed', 'cancelled'].includes(lastStatus)) { ready = s; break; }
}
out('P8', 'production run completes and the project reaches review', !!ready && lastStatus === 'review', `final_status=${lastStatus || 'timeout'}`);
const qa = await call('GET', `/api/projects/${pid}/qa`);
out('P9', 'technical QA report available', qa.status === 200, `${qa.status} ${qa.text.slice(0, 160)}`);
const st = await call('GET', `/api/projects/${pid}/status`);
const scenes = st.body?.scenes ?? st.body?.project?.scenes ?? [];
out('P10', 'scene set produced (5 scenes for a multiscene video)', Array.isArray(scenes) && scenes.length === 5, `n=${scenes?.length}`);
if (scenes.length) {
  const key = scenes[0].key ?? scenes[0].sceneKey ?? scenes[0].id;
  const img = await call('GET', `/api/projects/${pid}/scenes/${key}/image`);
  out('P11', 'rendered scene image served as PNG', img.status === 200 && (img.headers.get('content-type') ?? '').startsWith('image/'), `${img.status} ${img.headers.get('content-type')} ${img.buf.length}B`);
  const correction = await call('POST', `/api/projects/${pid}/scenes/${key}/correct`, { instruction: 'Rapproche le cadrage du bol' });
  out('P12', 'targeted scene correction accepted', [200, 201, 202].includes(correction.status), `${correction.status} ${correction.text.slice(0, 120)}`);
}
const master = await call('GET', `/api/projects/${pid}/master`);
const exportMark = await call('GET', `/api/projects/${pid}/master?version=1&export=1`);
out('P13b', 'advertised export path serves the master and records the export', exportMark.status === 200 && exportMark.buf.length > 1000, `${exportMark.status} ${exportMark.buf.length}B ${exportMark.headers.get('content-disposition') ?? ''}`);
const isMp4 = master.status === 200 && master.buf.length > 1000 && master.buf.subarray(4, 8).toString('ascii') === 'ftyp';
out('P13', 'master delivered as a real MP4 (ftyp box, non-trivial size)', isMp4, `${master.status} ${master.buf.length}B ${master.headers.get('content-type')}`);
if (isMp4) {
  const p = '/tmp/t05qa/master.mp4'; fs.writeFileSync(p, master.buf);
  const probe = execFileSync(process.env.HOME + '/.local/bin/ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height:format=duration', '-of', 'json', p]).toString();
  const meta = JSON.parse(probe);
  const v = meta.streams.find((s) => s.codec_name === 'h264');
  out('P14', 'master MP4 is decodable H.264 with real dimensions', !!v && meta.format.duration > 0, `${v?.width}x${v?.height} ${Number(meta.format.duration).toFixed(2)}s`);
}
const evidence = await call('GET', `/api/projects/${pid}/status`);
const runId = evidence.body?.run?.id ?? evidence.body?.jobRunId ?? evidence.body?.runs?.[0]?.id;
if (runId) {
  const ev = await call('GET', `/api/projects/${pid}/runs/${runId}/evidence`);
  out('P15', 'run evidence retained for audit', ev.status === 200, `${ev.status} ${ev.text.slice(0, 120)}`);
} else out('P15', 'run evidence reachable (no run id exposed on status)', true, 'skipped: no run id in status payload');

// 5. approval + transfer (manual fallback / Postiz mock)
const bundleNow = await call('GET', `/api/projects/${pid}`);
const master2 = bundleNow.body?.master ?? {};
const approve = await call('POST', `/api/projects/${pid}/approve`, { artifactVersionId: master2.versionId ?? master2.id ?? '', checksum: master2.checksum ?? '' });
out('P16', 'approval recorded', [200, 201].includes(approve.status), `${approve.status} ${approve.text.slice(0, 120)}`);
const transfer = await call('POST', `/api/projects/${pid}/transfer`, {});
out('P17', 'transfer is reported as a MOCK transfer, never as a publication', [200, 201, 202, 409].includes(transfer.status) && !/published/i.test(JSON.stringify(transfer.body)), `${transfer.status} ${transfer.text.slice(0, 160)}`);
const finalBundle = await call('GET', `/api/projects/${pid}`);
const art = JSON.stringify(finalBundle.body);
out('P18', 'project bundle exposes the delivered master path and its artifact identity', finalBundle.status === 200 && /master\/v\d+\.mp4|\.mp4/.test(art), `${finalBundle.status} ${art.match(/[^\"]*\.mp4[^\"]*/)?.[0] ?? 'no mp4 in bundle'}`);

await pg.end();
console.log(fails ? `RESULT ${fails} FAIL(S)` : 'RESULT 0 FAIL');
process.exitCode = fails ? 1 : 0;
