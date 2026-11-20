// T05 — media/rights boundary probe: real ffmpeg-generated media uploaded through the public API.
// Verifies inspector limits (duration, codec, pixel count), licence/provenance requirements and asset-use gating.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const R = process.cwd();
const require = createRequire(R + '/packages/media/node_modules/');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { Client } = require(process.env.PG_MODULE || 'pg');
const sharp = require(R + '/packages/media/node_modules/sharp');

const B = 'http://127.0.0.1:3101', O = 'http://127.0.0.1:3100';
const FF = process.env.HOME + '/.local/bin/ffmpeg';
let fails = 0;
const out = (k, label, ok, extra = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'} ${k} ${label}${extra ? ' :: ' + extra : ''}`); };
const pg = new Client({ connectionString: process.env.DATABASE_URL });
await pg.connect();

const email = crypto.randomUUID() + '@example.test', password = 'T05-' + crypto.randomUUID(), id = crypto.randomUUID();
await pg.query('INSERT INTO "User" (id,email,name,"passwordHash",role) VALUES($1,$2,$3,$4,$5)', [id, email, 'T05 Media', bcrypt.hashSync(password, 4), 'user']);
const lr = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: O }, body: JSON.stringify({ email, password }) });
const cookies = (lr.headers.getSetCookie() ?? []).map((c) => c.split(';')[0]).join('; ');
const csrf = (await lr.json()).csrfToken;
const call = async (method, path, data) => {
  const res = await fetch(B + path, { method, headers: { origin: O, cookie: cookies, 'x-csrf-token': csrf, ...(data !== undefined ? { 'content-type': 'application/json' } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
  const t = await res.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: res.status, body: j, text: t };
};
const ctx = await call('POST', '/api/contexts', { name: 'Sonde Media', description: 'Tests médias.' });
const contextId = ctx.body.context.id;
const tmp = '/tmp/t05qa/media'; fs.mkdirSync(tmp, { recursive: true });
const ff = (name, args) => { const p = tmp + '/' + name; execFileSync(FF, ['-y', '-loglevel', 'error', ...args, p], { timeout: 120000 }); return fs.readFileSync(p); };

async function upload(bytes, meta) {
  const res = await fetch(B + `/api/contexts/${contextId}/assets`, {
    method: 'POST',
    headers: { origin: O, cookie: cookies, 'x-csrf-token': csrf, 'x-asset-metadata': encodeURIComponent(JSON.stringify(meta)), 'content-type': 'application/octet-stream' },
    body: bytes,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const base = (name, mime, extra = {}) => ({ name, kind: mime.startsWith('video') ? 'video' : 'image', mimeType: mime, license: 'internal', provenance: 'T05 fixture générée par ffmpeg', ...extra });

// valid short h264 mp4
const okMp4 = ff('ok.mp4', ['-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=25:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p']);
const r1 = await upload(okMp4, base('plan-serrage.mp4', 'video/mp4'));
out('M1', 'valid H.264 short clip accepted', r1.status === 201, `${r1.status} ${JSON.stringify(r1.body).slice(0, 90)}`);

// over-duration (>600 s declared limit) — metadata-only liar file is cheap: 11 min of black at 1 fps
const longMp4 = ff('long.mp4', ['-f', 'lavfi', '-i', 'color=black:size=64x64:rate=1:duration=601', '-c:v', 'libx264', '-pix_fmt', 'yuv420p']);
const r2 = await upload(longMp4, base('tres-long.mp4', 'video/mp4'));
out('M2', 'video longer than the 600 s ceiling rejected', r2.status >= 400 && r2.status < 500, `${r2.status} ${r2.body.error ?? ''}`);

// non-h264 codec
const vp9 = ff('mpeg4.mp4', ['-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=10:duration=1', '-c:v', 'mpeg4']);
const r3 = await upload(vp9, base('mpeg4.mp4', 'video/mp4'));
out('M3', 'non-H.264 container rejected', r3.status >= 400 && r3.status < 500, `${r3.status} ${r3.body.error ?? ''}`);

// huge pixel count image (decompression bomb) — 5000x5000 = 25 MP above the 16 MP limit
const bomb = await sharp({ create: { width: 5000, height: 5000, channels: 3, background: '#123456' } }).png({ compressionLevel: 9 }).toBuffer();
const r4 = await upload(bomb, base('bombe.png', 'image/png'));
out('M4', '16 MP image decompression bomb rejected', r4.status >= 400 && r4.status < 500, `${r4.status} ${r4.body.error ?? ''}`);

// audio: mp3 accepted, wav mismatch refused
const mp3 = ff('voix.mp3', ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:a', 'libmp3lame']);
const r5 = await upload(mp3, { name: 'voix.mp3', kind: 'audio', mimeType: 'audio/mpeg', license: 'unknown', provenance: 'Fixture sourdine générée' });
out('M5', 'audio accepted with an explicitly unknown licence', r5.status === 201, `${r5.status} ${JSON.stringify(r5.body).slice(0, 80)}`);
const r6 = await upload(mp3, { name: 'voix-menteur.mp3', kind: 'document', mimeType: 'text/plain', license: 'internal', provenance: 'Type mensonger' });
out('M6', 'declared text/plain over mp3 bytes refused', r6.status >= 400, String(r6.status));

// licence/provenance governance
const r7 = await upload(okMp4, { name: 'sans-droits.mp4', kind: 'video', mimeType: 'video/mp4', provenance: 'Origine inconnue' });
out('M7', 'upload without a licence declaration refused', r7.status === 400, `${r7.status}`);
const r8 = await upload(okMp4, { name: 'provenance-courte.mp4', kind: 'video', mimeType: 'video/mp4', license: 'internal', provenance: 'ab' });
out('M8', 'too-short provenance rejected', r8.status === 400, String(r8.status));

// asset selection into a project respects licence
const proj = await call('POST', '/api/projects', { contextId, title: 'Sonde droits', objective: 'Vérifier les droits', platform: 'Instagram', format: 'Video' });
if (r1.status === 201 && proj.status === 201) {
  const versionId = r1.body.version.id;
  const sel = await call('PUT', `/api/projects/${proj.body.project.id}/assets`, { usage: 'sponsored', versionIds: [versionId] });
  out('M9', 'internal licence asset cannot be used in a sponsored publication', sel.status >= 400, `${sel.status} ${JSON.stringify(sel.body).slice(0, 90)}`);
  const selOrganic = await call('PUT', `/api/projects/${proj.body.project.id}/assets`, { usage: 'organic', versionIds: [versionId] });
  out('M10', 'internal licence asset allowed for organic use', selOrganic.status === 200, `${selOrganic.status} ${JSON.stringify(selOrganic.body).slice(0, 90)}`);
  const versions = await call('GET', `/api/assets/${r1.body.version.assetId}`);
  out('M11', 'asset exposes licence/provenance for audit', versions.status === 200 && /provenance|license/i.test(versions.text), String(versions.status));
} else out('M9-M11', 'asset/project setup failed', false, `${r1.status}/${proj.status}`);

await pg.end();
console.log(fails ? `RESULT ${fails} FAIL(S)` : 'RESULT 0 FAIL');
process.exitCode = fails ? 1 : 0;
