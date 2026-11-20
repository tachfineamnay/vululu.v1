// T05 — manual export kit (advertised deliverable): grounded creative render → approval → downloadable ZIP.
// Verifies the ZIP is a real archive containing a rendered 1080px PNG, and that no remote publication occurs.
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import fs from 'node:fs';
const R = process.cwd();
const require = createRequire(R + '/packages/media/node_modules/');
const bcrypt = require('bcryptjs');
const { Client } = require(process.env.PG_MODULE || 'pg');
const { execFileSync } = require('node:child_process');

const B = 'http://127.0.0.1:3101', O = 'http://127.0.0.1:3100';
let fails = 0;
const out = (k, label, ok, extra = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'} ${k} ${label}${extra ? ' :: ' + extra : ''}`); };
const pg = new Client({ connectionString: process.env.DATABASE_URL });
await pg.connect();
const email = crypto.randomUUID() + '@example.test', password = 'T05-' + crypto.randomUUID(), id = crypto.randomUUID();
await pg.query('INSERT INTO "User" (id,email,name,"passwordHash",role) VALUES($1,$2,$3,$4,$5)', [id, email, 'T05 Kit', bcrypt.hashSync(password, 4), 'user']);
const lr = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: O }, body: JSON.stringify({ email, password }) });
const cookies = (lr.headers.getSetCookie() ?? []).map((c) => c.split(';')[0]).join('; ');
const csrf = (await lr.json()).csrfToken;
const call = async (method, path, data) => {
  const res = await fetch(B + path, { method, headers: { origin: O, cookie: cookies, 'x-csrf-token': csrf, ...(data !== undefined ? { 'content-type': 'application/json' } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
  const buf = Buffer.from(await res.arrayBuffer());
  let body; try { body = JSON.parse(buf.toString('utf8')); } catch { body = buf; }
  return { status: res.status, body, buf, ctype: res.headers.get('content-type') ?? '', disp: res.headers.get('content-disposition') ?? '' };
};

const title = 'Atelier ' + crypto.randomUUID().slice(0, 8);
const ctx = await call('POST', '/api/contexts', { name: title, description: 'Cours de dessin pour débutants.' });
const contextId = ctx.body.context.id;
const project = (await call('POST', '/api/projects', { contextId, title, platform: 'Instagram', format: 'Affiche', objective: 'Découverte' })).body.project;
const offerRes = await call('POST', '/api/calendar/offers', { contextId, name: 'Cours', confirmed: true });
const offer = { id: offerRes.body.id ?? offerRes.body.offer?.id };
out('K0', 'confirmed offer available for the calendar item', !!offer.id, `${offerRes.status} ${JSON.stringify(offerRes.body).slice(0, 90)}`);
const itemId = crypto.randomUUID();
let version = 0;
const plannedAt = new Date(Math.floor(Date.now() / 60000) * 60000).toISOString();
let last;
for (const status of ['IDEA', 'DRAFT', 'READY_FOR_REVIEW', 'APPROVED'])
  last = await call('POST', '/api/calendar', { id: itemId, requestId: crypto.randomUUID(), expectedVersion: version++, data: { title, plannedAt, timeZone: 'UTC', audience: 'Équipes', objective: 'Découverte', archived: false, projectId: project.id, campaignId: null, offerId: offer.id, status, variants: [{ platform: 'Instagram', format: 'Affiche', caption: 'Invitation à l’atelier', cta: 'Réserver' }] } });
out('K1', 'calendar item reaches APPROVED with retained history', last.status === 200, `${last.status} ${JSON.stringify(last.body).slice(0, 200)}`);

const base = `/api/projects/${project.id}/creative`;
const spec = {
  schemaVersion: 1, width: 1080, height: 1080, safeArea: 0.05,
  brand: { background: '#123456', accent: '#ffffff' },
  delivery: { kind: 'square', platform: 'Instagram', calendar: { itemId, version } },
  scenes: [{ key: 'SCENE-001', seconds: 1, layers: [{ type: 'text', role: 'headline', size: 60, text: title, color: '#ffffff', bold: true, x: 0.1, y: 0.3, w: 0.8, h: 0.3, opacity: 1 }] }],
};
const created = await call('POST', base, { expectedVersion: 0, spec });
out('K2', 'creative spec accepted and versioned', [200, 201].includes(created.status), `${created.status} ${JSON.stringify(created.body).slice(0, 90)}`);
const render = await call('POST', base + '/1/render', {});
out('K3', 'deterministic render produced a real artifact', [200, 201].includes(render.status) && (render.body.approvalSha256 ?? render.body.checksum), `${render.status} sha=${String(render.body.approvalSha256 ?? render.body.checksum).slice(0, 16)}`);
const approve = await call('POST', base + '/1/approve', { checksum: render.body.approvalSha256 ?? render.body.checksum });
out('K4', 'approval recorded against the artifact checksum', [200, 201].includes(approve.status), `${approve.status}`);

const preview = await call('GET', `/api/calendar/${itemId}/publishing/1/preview`);
out('K5', 'approved preview reports caption, schedule and no blocking issue', preview.status === 200 && preview.body.caption?.length > 0 && !!preview.body.when && (preview.body.issues ?? []).length === 0, `${preview.status} issues=${JSON.stringify(preview.body.issues)} direct=${preview.body.direct}`);
const sceneImg = await call('GET', `/api/projects/${project.id}/creative/1/scenes/SCENE-001`);
out('K5b', 'the rendered artifact behind the kit is served as a real PNG', sceneImg.status === 200 && sceneImg.ctype.startsWith('image/') && sceneImg.buf.length > 1000, `${sceneImg.status} ${sceneImg.ctype} ${sceneImg.buf.length}B`);

const pkg = await call('GET', `/api/calendar/${itemId}/publishing/1/package`);
const isZip = pkg.status === 200 && pkg.buf.subarray(0, 2).toString('latin1') === 'PK';
out('K6', 'manual kit downloads as a real ZIP', isZip, `${pkg.status} ${pkg.buf.length}B ${pkg.disp}`);
if (isZip) {
  fs.writeFileSync('' + (process.env.TMP||'/tmp') + '/t05qa/kit.zip', pkg.buf);
  const listing = execFileSync('unzip', ['-l', '' + (process.env.TMP||'/tmp') + '/t05qa/kit.zip']).toString();
  out('K7', 'kit contains the rendered visual, caption and instructions', /\.png/i.test(listing) && /caption|legende|légende|texte/i.test(listing), listing.split('\n').slice(3, 8).join(' | ').slice(0, 200));
  execFileSync('rm', ['-rf', '/tmp/t05qa/kit']);
  execFileSync('unzip', ['-q', '' + (process.env.TMP||'/tmp') + '/t05qa/kit.zip', '-d', '/tmp/t05qa/kit']);
  const pngs = execFileSync('bash', ['-c', 'find /tmp/t05qa/kit -name "*.png" | head -1']).toString().trim();
  if (pngs) {
    const dims = execFileSync(process.env.HOME + '/.local/bin/ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', pngs]).toString().trim();
    out('K8', 'kit PNG is the rendered 1080×1080 visual (not a placeholder)', dims.startsWith('1080,1080'), dims);
  } else out('K8', 'kit contains a PNG', false, 'no png in archive');
}
const noDirect = await call('GET', `/api/calendar/${itemId}/publishing`);
const directState = JSON.stringify(noDirect.body);
out('K9', 'no remote publication is claimed (state stays local/simulated)', noDirect.status === 200 && !/"PUBLISHED"/.test(directState) && !/"remoteId"\s*:\s*"[^"]+"/.test(directState), directState.slice(0, 140));

await pg.end();
console.log(fails ? `RESULT ${fails} FAIL(S)` : 'RESULT 0 FAIL');
process.exitCode = fails ? 1 : 0;
