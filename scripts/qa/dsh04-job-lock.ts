/**
 * DSH-04 — reproduction réelle du 409 job_running après approbation, puis vérification
 * de l'artefact rendu (approbation exacte, checksum, export) après reprise.
 *
 * Prérequis : pile QA (API 3191), DEMO_EMAIL / DEMO_PASSWORD du compte QA, FFmpeg dans le worker.
 * Aucune publication, aucun fournisseur payant. À exécuter avec tsx depuis la racine.
 */
import { createHash } from 'node:crypto';

const base = process.env.QA_API_URL ?? 'http://127.0.0.1:3191';
const email = process.env.DEMO_EMAIL ?? '';
const password = process.env.DEMO_PASSWORD ?? '';
if (!email || !password) throw new Error('DEMO_EMAIL et DEMO_PASSWORD requis (compte QA).');

type Session = { cookie: string; csrf: string };
type Json = Record<string, unknown>;
type Master = { id: string; version: number; checksum: string; qaStatus?: string };
type Bundle = {
  master: Master | null;
  masterVersions: Master[];
  scenes: Array<{ sceneKey: string }>;
  brief: { revisions: Array<{ version: number; checksum: string }> };
  jobRun?: { status?: string } | null;
};
type Result = { status: number; json: Json | null; text: string };
let session: Session;

async function request(path: string, method = 'GET', body?: unknown): Promise<Result> {
  const headers: Record<string, string> = { cookie: session.cookie };
  if (method !== 'GET') { headers['x-csrf-token'] = session.csrf; headers['content-type'] = 'application/json'; }
  const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let json: Json | null;
  try { json = text ? (JSON.parse(text) as Json) : null; } catch { json = null; }
  return { status: response.status, json, text };
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const active = ['queued', 'running', 'waiting_approval', 'recovery_pending'];

async function main() {
  const login = await fetch(base + '/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password })
  });
  if (!login.ok) throw new Error('login ' + login.status);
  session = {
    cookie: (login.headers.getSetCookie?.() ?? []).map((value) => value.split(';')[0]).join('; '),
    csrf: (await login.json()).csrfToken
  };

  const context = await request('/api/contexts', 'POST', { name: 'Sonde 409 ' + Date.now(), description: 'Sonde job_running QA' });
  const projectResult = await request('/api/projects', 'POST', {
    contextId: (context.json as { context: { id: string } }).context.id,
    title: 'Sonde 409', platform: 'Instagram', format: 'Video', objective: 'Vérifier le verrou de run'
  });
  const id = (projectResult.json as { project: { id: string } }).project.id;
  await request('/api/projects/' + id + '/brief', 'PATCH', {
    objective: 'Vérifier le verrou de run', audience: 'Recette QA', tone: 'Direct', cta: 'Découvrir',
    platform: 'Instagram', format: 'Video'
  });
  const bundle0 = (await request('/api/projects/' + id)).json as unknown as Bundle;
  const revision = bundle0.brief.revisions.at(-1)!;
  await request('/api/projects/' + id + '/brief/confirm', 'POST', { version: revision.version, checksum: revision.checksum });
  await request('/api/projects/' + id + '/storyboard', 'POST', {});
  const produced = await request('/api/projects/' + id + '/produce', 'POST', {});
  console.log('PRODUCE=' + produced.status);

  let bundle = bundle0;
  const produceStart = Date.now();
  while (!bundle.master && Date.now() - produceStart < 480000) {
    await sleep(1500);
    bundle = (await request('/api/projects/' + id)).json as unknown as Bundle;
  }
  if (!bundle.master) throw new Error('master v1 absent');
  console.log('MASTER_V1=' + bundle.master.version + ' QA=' + bundle.master.qaStatus);

  const approved = await request('/api/projects/' + id + '/approve', 'POST', {
    artifactVersionId: bundle.master.id, checksum: bundle.master.checksum
  });
  console.log('APPROVE_V1=' + approved.status);

  const sceneKey = bundle.scenes[0].sceneKey;
  const correct1 = await request('/api/projects/' + id + '/scenes/' + sceneKey + '/correct', 'POST', {
    instruction: 'Rendre le sujet plus visible sans changer la mise en page.'
  });
  const code = correct1.json && typeof correct1.json.code === 'string' ? correct1.json.code : '';
  console.log('CORRECT_IMMEDIATE=' + correct1.status + ' CODE=' + code);

  const runStart = Date.now();
  const timeline: string[] = [];
  let last = '';
  while (Date.now() - runStart < 180000) {
    const current = (await request('/api/projects/' + id)).json as unknown as Bundle;
    const status = current.jobRun?.status ?? 'none';
    if (status !== last) { timeline.push(status + '+' + Math.round((Date.now() - runStart) / 1000) + 's'); last = status; }
    if (!active.includes(status)) break;
    await sleep(500);
  }
  console.log('RUN_TIMELINE=' + timeline.join('>'));
  console.log('RUN_FINISHED_AFTER_S=' + Math.round((Date.now() - runStart) / 1000));

  const correct2 = await request('/api/projects/' + id + '/scenes/' + sceneKey + '/correct', 'POST', {
    instruction: 'Rendre le sujet plus visible sans changer la mise en page.'
  });
  console.log('CORRECT_AFTER_RUN=' + correct2.status);

  // Le run de correction s'arrête à l'étape d'approbation : on attend le master v2 rendu,
  // puis on approuve cette version exacte (l'approbation est justement l'étape attendue).
  const correctionStart = Date.now();
  let master2: Master | null = null;
  while (Date.now() - correctionStart < 480000) {
    await sleep(1500);
    const current = (await request('/api/projects/' + id)).json as unknown as Bundle;
    master2 = current.master;
    if (master2 && master2.version >= 2) break;
  }
  if (!master2 || master2.version < 2) throw new Error('master v2 absent');
  console.log('MASTER_V2=' + master2.version + ' QA=' + master2.qaStatus + ' CHECKSUM=' + master2.checksum.slice(0, 12));

  const approve2 = await request('/api/projects/' + id + '/approve', 'POST', {
    artifactVersionId: master2.id, checksum: master2.checksum
  });
  console.log('APPROVE_V2=' + approve2.status);

  const exported = await fetch(base + '/api/projects/' + id + '/master?version=' + master2.version, {
    headers: { cookie: session.cookie, accept: 'video/mp4' }
  });
  const bytes = Buffer.from(await exported.arrayBuffer());
  const digest = createHash('sha256').update(bytes).digest('hex');
  console.log('EXPORT_STATUS=' + exported.status + ' BYTES=' + bytes.length + ' CHECKSUM_OK=' + (digest === master2.checksum));
}

void main().catch((error) => { console.error('REPRO_FAILED', error instanceof Error ? error.message : error); process.exitCode = 1; });
