/**
 * DSH-04 — reproduction réelle de 429 creative_busy et de l'attente bornée client.
 *
 * Prérequis : pile QA sur 127.0.0.1:3190/3191, DEMO_EMAIL / DEMO_PASSWORD (compte QA) dans l'environnement.
 * Aucune donnée de production, aucun fournisseur payant. À exécuter avec tsx depuis la racine.
 */
import { withBusyRetry, ApiRequestError } from '../../apps/web/lib/api';

const base = process.env.QA_API_URL ?? 'http://127.0.0.1:3191';
const email = process.env.DEMO_EMAIL ?? '';
const password = process.env.DEMO_PASSWORD ?? '';
if (!email || !password) throw new Error('DEMO_EMAIL et DEMO_PASSWORD requis (compte QA).');

async function main() {
  const login = await fetch(base + '/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if (!login.ok) throw new Error('login ' + login.status);
  const cookie = (login.headers.getSetCookie?.() ?? []).map((value) => value.split(';')[0]).join('; ');
  const csrf = (await login.json()).csrfToken as string;
  const headers = { cookie, 'x-csrf-token': csrf, 'content-type': 'application/json' };

  const context = await (await fetch(base + '/api/contexts', {
    method: 'POST', headers, body: JSON.stringify({ name: 'Sonde 429 ' + Date.now(), description: 'Sonde de concurrence QA' })
  })).json();
  const project = await (await fetch(base + '/api/projects', {
    method: 'POST', headers,
    body: JSON.stringify({ contextId: context.context.id, title: 'Sonde 429', platform: 'Instagram', format: 'Affiche', objective: 'Sonder la concurrence' })
  })).json();
  const spec = {
    schemaVersion: 1, width: 1080, height: 1080, safeArea: 0.05,
    brand: { background: '#101820', accent: '#f5d867' },
    delivery: { kind: 'square', platform: 'Instagram' },
    scenes: [{
      key: 'SCENE-001', seconds: 1,
      layers: [{ type: 'text', role: 'headline', text: 'Sonde 429', x: 0.1, y: 0.1, w: 0.8, h: 0.2, opacity: 1, size: 48, bold: true, color: '#ffffff' }]
    }]
  };
  const created = await fetch(base + '/api/projects/' + project.project.id + '/creative', {
    method: 'POST', headers, body: JSON.stringify({ expectedVersion: 0, spec })
  });
  if (!created.ok) throw new Error('creative ' + created.status + ' ' + (await created.text()));
  const url = base + '/api/projects/' + project.project.id + '/creative/preview';
  const body = JSON.stringify(spec);
  const post = () => fetch(url, { method: 'POST', headers, body });

  const burst = await Promise.all([post(), post(), post()]);
  const statuses = burst.map((response) => response.status);
  await Promise.all(burst.map((response) => response.arrayBuffer()));
  console.log('BURST_STATUSES=' + statuses.join(','));
  console.log('BUSY_429=' + statuses.filter((status) => status === 429).length);

  // Deux rendus occupent déjà les deux créneaux : la requête suivante reçoit 429 et attend.
  const held = [post(), post()];
  let waits = 0;
  const retried = await withBusyRetry(
    async () => {
      // Même requête que le navigateur ; l'erreur typée porte le statut réel du serveur.
      const response = await fetch(url, { method: 'POST', headers, body });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({} as { message?: string }));
        throw new ApiRequestError(payload.message ?? 'Erreur ' + response.status, response.status);
      }
      await response.arrayBuffer();
      return response.status;
    },
    {
      attempts: 5,
      delaysMs: [300, 600, 1200, 2000],
      onWait: (attempt, attempts) => { waits += 1; console.log('WAIT attempt=' + attempt + '/' + attempts); }
    }
  );
  const heldBodies = (await Promise.all(held)).map((response) => response.arrayBuffer());
  await Promise.all(heldBodies);
  console.log('RETRY_FINAL=' + retried + ' WAITS=' + waits);

  // Une erreur de contrat n'est jamais rejouée.
  try {
    await withBusyRetry(async () => { throw new ApiRequestError('Calque hors zone sûre.', 422); });
  } catch (error) {
    console.log('CONTRACT_NOT_RETRIED=' + (error instanceof ApiRequestError ? error.status : 'unknown'));
  }
}

void main().catch((error) => { console.error('REPRO_FAILED', error instanceof Error ? error.message : error); process.exitCode = 1; });
