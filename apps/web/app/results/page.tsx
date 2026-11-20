'use client';
import {useWorkspace} from '../../components/WorkspacePreferences';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import StudioNav from '../../components/StudioNav';
import { api, postJson } from '../../lib/api';
import './results.css';
import { campaignLink } from '../../lib/utm';
type Pref = { enabled: boolean; due: boolean };
type Pub = {
  observation: Metrics | null;
  id: string;
  revision: number;
  projectId: string;
  creative: { project: { title: string } };
};
type Report = {
  usage: {
    firstApproved: string | null;
    firstExport: string | null;
    firstPublication: string | null;
    activeDays: number;
    centsPerUsable: number | null;
    usable: number;
  };
  publications: Pub[];
  offers: { id: string; name: string; previous: string | null; project: string | null }[];
  reminder: Pref;
};
type Cursor = { at: string; key: string };
type History = {
  rows: (Cursor & { kind: string; subject: string; version: number | null; detail: string })[];
  next: Cursor | null;
};
const definitions = {
  impressions: ['Impressions', 'Nombre d’affichages, pas de personnes uniques.'],
  engagement: ['Interactions', 'Mentions J’aime, commentaires et partages.'],
  clicks: ['Clics', 'Clics rapportés par la plateforme.'],
  leads: ['Prospects', 'Demandes de contact confirmées. Aucun CRM connecté.'],
  sales: ['Ventes', 'Transactions confirmées. Aucune source de vente connectée.'],
};
type Metrics = {
  source: string;
  retrievedAt: string | null;
  metrics: Record<keyof typeof definitions, number | 'NOT_AVAILABLE'>;
};
const fmt = (d: string | null) => (d ? new Date(d).toLocaleString('fr-FR') : 'Non observé');
const kinds: Record<string, string> = {
  campaign: 'Campagne créée',
  content: 'Contenu éditorial',
  plan: 'Plan préparé',
  'plan-approved': 'Plan approuvé',
  approved: 'Création approuvée',
  publication: 'Publication',
  export: 'Export servi',
};
const states: Record<string, string> = {
  IDEA: 'Idée',
  DRAFT: 'Brouillon',
  READY_FOR_REVIEW: 'En relecture',
  APPROVED: 'Approuvé',
  SCHEDULED: 'Planifié',
  PREPARED: 'Demande préparée',
  SENDING: 'Envoi en cours',
  SUBMITTED: 'Demande transmise (pas encore publiée)',
  CANCELLING: 'Annulation en cours',
  CANCELLED: 'Annulée',
  FAILED: 'Échec',
  UNKNOWN: 'Résultat inconnu',
  PUBLISHED: 'Diffusion confirmée',
};
function detail(kind: string, value: string) {
  if (kind === 'publication') return states[value] ?? value;
  if (kind !== 'content') return value;
  const cut = value.lastIndexOf(' · ');
  if (cut < 0) return value;
  const status = value.slice(cut + 3);
  return (
    value.slice(0, cut) +
    ' · ' +
    (status === 'PUBLISHED' ? 'Publication déclarée (non vérifiée)' : (states[status] ?? status))
  );
}
function Publication({ p }: { p: Pub }) {
  const [data, set] = useState<Metrics | null>(p.observation),
    [busy, work] = useState(false),
    [err, fail] = useState(false);
  return (
    <article className="stack">
      <h3>
        {p.creative.project.title} · v{p.revision}
      </h3>
      <button
        className="btn btn-secondary"
        disabled={busy}
        onClick={async () => {
          work(true);
          fail(false);
          try {
            set(await postJson<Metrics>('/api/results/publications/' + p.id + '/metrics', {}));
          } catch {
            set(null);
            fail(true);
          } finally {
            work(false);
          }
        }}
      >
        {busy ? 'Lecture…' : 'Consulter les mesures Postiz'}
      </button>
      {err && <p role="alert">Lecture impossible. Réessayez.</p>}
      {data && (
        <>
          <p>
            {data.source} ·{' '}
            {data.retrievedAt ? 'Dernier relevé le ' + fmt(data.retrievedAt) : 'Aucun relevé disponible'}
          </p>
          <dl>
            {(Object.keys(definitions) as (keyof typeof definitions)[]).map((k) => (
              <div key={k}>
                <dt>{definitions[k][0]}</dt>
                <dd>{data.metrics[k] === 'NOT_AVAILABLE' ? 'Non disponible' : data.metrics[k]}</dd>
              </div>
            ))}
          </dl>
          {typeof data.metrics.clicks === 'number' && data.metrics.clicks > 0 && (
            <p>
              Cette version a obtenu des clics. Si son message reste pertinent,{' '}
              <a href={`/api/projects/${p.projectId}/creative/${p.revision}/export`} download>
                reprendre le master v{p.revision}
              </a>{' '}
              et adapter le prochain contenu. Rien ne sera republié.
            </p>
          )}
        </>
      )}
    </article>
  );
}
function Utm() {
  const [link, set] = useState(''),
    [err, fail] = useState('');
  return (
    <details>
      <summary>Ajouter un suivi UTM facultatif</summary>
      <p>
        Préparez un lien pour votre outil d’analyse. Ne saisissez aucune donnée personnelle. Ce lien ne prouve
        ni prospect ni vente.
      </p>
      <form
        className="stack"
        onChange={() => {
          set('');
          fail('');
        }}
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            set(campaignLink(String(f.get('url')), String(f.get('src')), String(f.get('campaign'))));
          } catch (x) {
            fail((x as Error).message);
          }
        }}
      >
        <label>
          Destination HTTPS
          <input name="url" type="url" required />
        </label>
        <label>
          Source
          <input name="src" defaultValue="linkedin" required />
        </label>
        <label>
          Code de campagne
          <input name="campaign" required />
        </label>
        <button className="btn">Préparer le lien</button>
        {link && (
          <label>
            Lien à copier
            <input readOnly value={link} onFocus={(e) => e.target.select()} />
          </label>
        )}
        {err && <p role="alert">{err}</p>}
      </form>
    </details>
  );
}
export default function Results() {
  const {t}=useWorkspace();
  const [data, set] = useState<Report | null>(null),
    [h, list] = useState<History | null>(null),
    [error, fail] = useState(''),
    [busy, work] = useState(false);
  useEffect(() => {
    let live = true;
    Promise.all([api<Report>('/api/results'), api<History>('/api/results/history')])
      .then(([d, x]) => {
        if (live) {
          set(d);
          list(x);
        }
      })
      .catch(() => {
        if (live) fail('Chargement impossible. Vérifiez votre session puis rechargez la page.');
      });
    return () => {
      live = false;
    };
  }, []);
  return (
    <div className="shell" data-vululu-theme="blue">
      <a href="#results" className="skip-link">
        Aller au contenu
      </a>
      <StudioNav />
      <main id="results" className="page stack">
        <header>
          <p className="eyebrow">BILAN MARKETING</p>
          <h1>{t("Résultats et prochaine semaine","Results and next week")}</h1>
          <p>Ce que vous avez produit, ce qui a été diffusé et ce que vous pouvez réellement mesurer.</p>
        </header>
        {error && <p role="alert">{error}</p>}
        {!data && !error && <p role="status">Chargement…</p>}
        {data && (
          <>
            <section className="card stack">
              <h2>{t("Votre activité","Your activity")}</h2>
              <dl>
                {[
                  ['Première création approuvée', fmt(data.usage.firstApproved)],
                  ['Premier export observé', fmt(data.usage.firstExport)],
                  ['Première publication confirmée observée', fmt(data.usage.firstPublication)],
                  ['Jours actifs depuis lundi (UTC)', data.usage.activeDays],
                  [
                    'Coût déclaré par version utilisable',
                    data.usage.centsPerUsable === null
                      ? 'Non disponible'
                      : `${data.usage.centsPerUsable} ¢ USD`,
                  ],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>
                      <strong>{v}</strong>
                    </dd>
                  </div>
                ))}
              </dl>
              <p>
                Un jour actif contient au moins un événement de l’historique. Sur 30 jours : coûts du moteur
                d’exécution déclarés ou rapprochés ÷ versions rendues et approuvées ({data.usage.usable}). Un
                coût inconnu n’est pas zéro.
              </p>
            </section>
            <section className="card stack">
              <h2>{t("Performances des publications","Post performance")}</h2>
              <p>
                Une publication confirmée n’est pas une conversion. « Non disponible » signifie qu’aucune
                mesure vérifiable n’est fournie.
              </p>
              <dl>
                {Object.entries(definitions).map(([k, [label, text]]) => (
                  <div key={k}>
                    <dt>{label}</dt>
                    <dd>{text}</dd>
                  </div>
                ))}
              </dl>
              {!data.publications.length ? (
                <p>Aucune publication confirmée. Les cinq mesures sont non disponibles.</p>
              ) : (
                data.publications.map((p) => <Publication key={p.id} p={p} />)
              )}
              <Utm />
            </section>
            <section className="card stack">
              <h2>{t("Préparer la semaine prochaine","Plan next week")}</h2>
              <p>
                Choisissez une offre confirmée. Le calendrier vous laisse modifier chaque idée avant de
                l’enregistrer.
              </p>
              {!data.offers.length && <Link href="/calendar">Confirmer une première offre</Link>}
              {data.offers.map((o) => (
                <article key={o.id}>
                  <strong>{o.name}</strong>
                  <p>
                    {o.previous
                      ? `Après « ${o.previous} », répondez à une question sur cette offre avec un exemple différent.`
                      : 'Présentez cette offre et son public.'}
                  </p>
                  <Link
                    href={
                      '/calendar?week=next&offer=' +
                      encodeURIComponent(o.id) +
                      (o.previous ? '&angle=question' : '') +
                      (o.project ? '&project=' + encodeURIComponent(o.project) : '')
                    }
                  >
                    Préparer une idée
                  </Link>
                  {o.project && (
                    <>
                      {' '}
                      ·{' '}
                      <Link
                        href={`/projects/${encodeURIComponent(o.project)}?plan=next&offer=${encodeURIComponent(o.id)}#marketing-heading`}
                      >
                        Préparer le plan dans le Studio
                      </Link>
                    </>
                  )}
                </article>
              ))}
              <label>
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={data.reminder.enabled}
                  onChange={async (e) => {
                    const enabled = e.target.checked;
                    work(true);
                    try {
                      const reminder = await postJson<Pref>('/api/results/reminder', { enabled });
                      set({ ...data, reminder });
                    } catch {
                      fail('Préférence non enregistrée.');
                    } finally {
                      work(false);
                    }
                  }}
                />{' '}
                Rappel hebdomadaire sur l’accueil uniquement (aucun e-mail)
              </label>
            </section>
            <section className="card stack">
              <h2>{t("Historique · 180 derniers jours","History \u00b7 last 180 days")}</h2>
              <p>Les exports sont observés à partir de C11. Un fichier servi n’est pas une publication.</p>
              {!h?.rows.length && <p>Aucun événement dans cette période.</p>}
              <ol>
                {h?.rows.map((x) => (
                  <li key={x.key}>
                    <time dateTime={x.at}>{fmt(x.at)}</time> · {kinds[x.kind] ?? x.kind} :{' '}
                    {detail(x.kind, x.detail)}
                    {x.version ? ` · v${x.version}` : ''}
                  </li>
                ))}
              </ol>
              {h?.next && (
                <button
                  className="btn"
                  disabled={busy}
                  onClick={async () => {
                    work(true);
                    try {
                      const page = await api<History>(
                        '/api/results/history?' + new URLSearchParams(h.next!).toString(),
                      );
                      list({ rows: [...h.rows, ...page.rows], next: page.next });
                    } catch {
                      fail('Suite de l’historique indisponible.');
                    } finally {
                      work(false);
                    }
                  }}
                >
                  Événements plus anciens
                </button>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
