'use client';
import {useWorkspace} from '../../components/WorkspacePreferences';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import StudioNav from '../../components/StudioNav';
import { api, postJson } from '../../lib/api';
import './results.css';
import { campaignLink } from '../../lib/utm';
import { isSafeHttpsUrl, metricsBlockReason } from '../../lib/publishingPresentation';
type Pref = { enabled: boolean; due: boolean };
type ConnectionStatus = 'active' | 'expired' | 'revoked';
type Pub = {
  observation: Metrics | null;
  id: string;
  itemId?: string;
  revision: number;
  projectId: string;
  remoteId?: string | null;
  networkReceipt?: string | null;
  scheduledAt?: string | null;
  platform?: string;
  channel?: string;
  displayName?: string | null;
  connectionStatus?: ConnectionStatus;
  metricsStatus?: 'observed' | 'analytics_disabled' | 'connection_revoked' | 'connection_expired' | 'not_fetched';
  creative: { project: { title: string } };
};
type PendingPub = {
  id: string;
  itemId: string;
  revision: number;
  projectId: string;
  state: string;
  reason: string | null;
  remoteId: string | null;
  scheduledAt: string | null;
  platform: string;
  channel: string;
  displayName: string | null;
  connectionStatus: ConnectionStatus;
  creative: { project: { title: string } };
};
type ObservedContent = {
  created: number;
  draft: number;
  approved: number;
  scheduled: number;
  published: number;
  failed: number;
  states: Record<string, number>;
  publications: {
    prepared: number;
    sending: number;
    submitted: number;
    published: number;
    publishedConfirmed: number;
    failed: number;
    unknown: number;
    cancelled: number;
    states: Record<string, number>;
  };
  sources: {
    content: string;
    publications: string;
    metrics: string;
    metricsEnabled: boolean;
    analyticsMode?: 'postiz_live' | 'disabled';
    mockAnalyticsIncluded?: boolean;
    observedAt: string;
  };
};
type CampaignReport = {
  id: string;
  name: string;
  projects: number;
  content: number;
  approved: number;
  scheduled: number;
  published: number;
};
type CreativeReport = {
  projectId: string;
  projectTitle: string;
  version: number;
  approvedAt: string;
  campaignId: string | null;
  campaignName: string | null;
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
  content?: ObservedContent;
  campaigns?: CampaignReport[];
  creatives?: CreativeReport[];
  suggestions?: string[];
  publications: Pub[];
  pendingPublications?: PendingPub[];
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
  unavailableReason?: string;
};
const unavailableReasons: Record<string, string> = {
  analytics_disabled:
    'La lecture des mesures Postiz est désactivée sur cet environnement (POSTIZ_ANALYTICS_ENABLED ≠ 1). Aucune donnée simulée ou estimée n’est affichée.',
  connection_revoked:
    'Le compte de publication a été dissocié de Vululu. Associez-le à nouveau dans le calendrier pour relever de nouvelles mesures.',
  connection_expired:
    'La clé API du compte de publication a expiré. Renouvelez-la dans le calendrier (« Comptes de publication ») pour relever des mesures.',
  token_expired:
    'La clé API Postiz a été refusée ou a expiré. Renouvelez-la dans le calendrier avant de relire les mesures.',
  missing_remote_id: 'Aucun identifiant distant Postiz n’est rattaché à cette publication.',
  credentials_unreadable: 'Identifiant de connexion illisible sur cet environnement.',
  provider_unavailable: 'Postiz est temporairement indisponible : aucune mesure n’a pu être lue.',
  response_too_large: 'Réponse Postiz ignorée (taille excessive).',
  invalid_response: 'Réponse Postiz invalide : aucune mesure vérifiable.',
  invalid_remote_id: 'Identifiant de publication distant invalide.',
};
const fmt = (d: string | null) => (d ? new Date(d).toLocaleString('fr-FR') : 'Non observé');
// États observés uniquement : un état éditorial n’est pas une diffusion, une soumission n’est pas
// une publication. Seul le compteur « publiée confirmée » exige un reçu réseau.
const contentStateLabels: Record<string, string> = {
  IDEA: 'Idée',
  DRAFT: 'Brouillon',
  READY_FOR_REVIEW: 'En relecture',
  APPROVED: 'Approuvé',
  SCHEDULED: 'Planifié',
  PUBLISHED: 'Publication déclarée (non vérifiée)',
  FAILED: 'Échec déclaré',
};
const publicationStateLabels: Record<string, string> = {
  PREPARED: 'Demande préparée',
  SENDING: 'Envoi en cours',
  SUBMITTED: 'Soumission acceptée (non publiée)',
  CANCELLING: 'Annulation en cours',
  CANCELLED: 'Annulée',
  PUBLISHED: 'Diffusion confirmée par le réseau',
  FAILED: 'Échec',
  UNKNOWN: 'Issue inconnue',
};
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
function Publication({ p, metricsEnabled }: { p: Pub; metricsEnabled: boolean }) {
  const [data, set] = useState<Metrics | null>(p.observation),
    [busy, work] = useState(false),
    [err, fail] = useState(false);
  const inFlight = useRef(false);
  const blockedReason = metricsBlockReason(metricsEnabled, p.connectionStatus);
  const activeReason = data?.retrievedAt ? null : (data?.unavailableReason ?? blockedReason);
  const accountName = p.displayName || p.channel;
  return (
    <article className="stack">
      <h3>
        {p.creative.project.title} · v{p.revision}
        {p.platform ? ` · ${p.platform}` : ''}
      </h3>
      <p className="hint">
        {accountName ? `Compte : ${accountName}` : 'Compte connecté'}
        {p.scheduledAt ? ` · prévu le ${fmt(p.scheduledAt)}` : ''}
        {p.remoteId ? ` · reçu de soumission : ${p.remoteId}` : ''}
      </p>
      <p className="hint">
        Preuve réseau vérifiée :{' '}
        {p.networkReceipt ? (
          isSafeHttpsUrl(p.networkReceipt) ? (
            <a href={p.networkReceipt} target="_blank" rel="noopener noreferrer">
              {p.networkReceipt}
            </a>
          ) : (
            <code>{p.networkReceipt}</code>
          )
        ) : (
          'Aucune preuve réseau vérifiée'
        )}
      </p>
      <div className="actions">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy || Boolean(blockedReason)}
          onClick={async () => {
            if (inFlight.current || blockedReason) return;
            inFlight.current = true;
            work(true);
            fail(false);
            try {
              set(await postJson<Metrics>('/api/results/publications/' + p.id + '/metrics', {}));
            } catch {
              set(null);
              fail(true);
            } finally {
              inFlight.current = false;
              work(false);
            }
          }}
        >
          {busy ? 'Lecture…' : 'Consulter les mesures Postiz'}
        </button>
        {p.itemId && (
          <Link href={'/calendar?item=' + encodeURIComponent(p.itemId)}>
            Ouvrir dans le calendrier
          </Link>
        )}
      </div>
      {activeReason && (
        <p className="hint" role="status">
          {unavailableReasons[activeReason] ?? 'Mesures actuellement indisponibles.'}
        </p>
      )}
      {err && <p role="alert">Lecture impossible. Réessayez.</p>}
      {data ? (
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
      ) : (
        <p className="hint">
          Aucun relevé enregistré pour cette publication : les cinq mesures sont actuellement « Non disponible ».
        </p>
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
    [busy, work] = useState(false),
    [projectFilter, setProjectFilter] = useState('');
  const actionInFlight = useRef(false);
  const observed = data?.content;
  const metricsEnabled = Boolean(observed?.sources.metricsEnabled);
  const [missingHashCampaign, setMissingHashCampaign] = useState('');
  useEffect(() => {
    const project = new URLSearchParams(location.search).get('project')?.trim() ?? '';
    setProjectFilter(project);
  }, []);
  useEffect(() => {
    const match = /^#campaign-(.+)$/.exec(location.hash);
    if (!match || !data) return;
    const wanted = decodeURIComponent(match[1]);
    setMissingHashCampaign(data.campaigns?.some((campaign) => campaign.id === wanted) ? '' : wanted);
  }, [data]);
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
  const visiblePublications = data
    ? projectFilter
      ? data.publications.filter((p) => p.projectId === projectFilter)
      : data.publications
    : [];
  const visiblePending = data?.pendingPublications
    ? projectFilter
      ? data.pendingPublications.filter((p) => p.projectId === projectFilter)
      : data.pendingPublications
    : [];
  const visibleCreatives = data?.creatives
    ? projectFilter
      ? data.creatives.filter((c) => c.projectId === projectFilter)
      : data.creatives
    : [];
  const focusedProjectTitle =
    visiblePublications[0]?.creative.project.title ??
    visiblePending[0]?.creative.project.title ??
    visibleCreatives[0]?.projectTitle ??
    null;
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
          <div className="actions"><Link href="/calendar?week=next">{t('Planifier la prochaine semaine', 'Plan next week')}</Link><Link href="/creations">{t('Retrouver mes créations', 'Find my creations')}</Link><Link href="/account">{t('Facturation et assistance', 'Billing and support')}</Link></div>
          <p>Ce que vous avez produit, ce qui a été diffusé et ce que vous pouvez réellement mesurer.</p>
        </header>
        {error && <p role="alert">{error}</p>}
        {!data && !error && <p role="status">Chargement…</p>}
        {data && projectFilter && (
          <section className="card stack" aria-label="Filtre par projet" role="status">
            <strong>
              Vue filtrée sur le projet {focusedProjectTitle ? `« ${focusedProjectTitle} »` : projectFilter}
            </strong>
            <p className="hint">
              Les publications confirmées, demandes en attente et créations approuvées ci-dessous sont filtrées sur ce
              projet. Les compteurs globaux d’activité restent affichés pour l’ensemble de l’espace.
            </p>
            <div className="actions">
              <Link href={'/projects/' + encodeURIComponent(projectFilter)}>Retourner au projet</Link>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setProjectFilter('');
                  history.replaceState(null, '', '/results');
                }}
              >
                Afficher tous les projets
              </button>
            </div>
          </section>
        )}
        {data && (
          <>
            {observed ? (
              <section className="card stack result-observed" aria-labelledby="observed-heading">
                <h2 id="observed-heading">{t('Activité observée', 'Observed activity')}</h2>
                <p className="hint">
                  Relevé le {fmt(observed.sources.observedAt)}. Sources : {observed.sources.content} pour les
                  contenus et {observed.sources.publications} pour les publications. Aucune mesure n’est déduite
                  d’une soumission.
                </p>
                <div className="result-grid">
                  <div className="result-block">
                    <h3>Contenus</h3>
                    <dl>
                      {[
                        ['Créés', observed.created],
                        ['Brouillons', observed.draft],
                        ['Approuvés', observed.approved],
                        ['Planifiés', observed.scheduled],
                        ['Publication déclarée', observed.published],
                        ['En échec', observed.failed],
                      ].map(([label, value]) => (
                        <div key={String(label)}>
                          <dt>{label}</dt>
                          <dd>
                            <strong>{value}</strong>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                  <div className="result-block">
                    <h3>Demandes de publication</h3>
                    <dl>
                      {[
                        ['Préparées', observed.publications.prepared],
                        ['Envoi en cours', observed.publications.sending],
                        ['Soumissions acceptées (non publiées)', observed.publications.submitted],
                        ['Diffusions déclarées', observed.publications.published],
                        ['Diffusions confirmées par le réseau', observed.publications.publishedConfirmed],
                        ['En échec', observed.publications.failed],
                        ['Issue inconnue', observed.publications.unknown],
                        ['Annulées', observed.publications.cancelled],
                      ].map(([label, value]) => (
                        <div key={String(label)}>
                          <dt>{label}</dt>
                          <dd>
                            <strong>{value}</strong>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </div>
                <div id="published-confirmed" className="result-confirmed">
                  <h3>Publications confirmées par le réseau</h3>
                  <p>
                    <strong>{observed.publications.publishedConfirmed}</strong> demande(s) avec preuve réseau, sur{' '}
                    {observed.publications.published} demande(s) au statut publié.
                  </p>
                  <p className="hint">
                    Source : {observed.sources.publications} · relevé le{' '}
                    {fmt(observed.sources.observedAt)}. Un statut publié sans reçu réseau n’est pas compté comme
                    confirmé.
                  </p>
                  {!observed.publications.publishedConfirmed && (
                    <p role="status">
                      Aucune publication confirmée par le réseau pour l’instant. Préparez un lot manuel ou une
                      programmation, puis vérifiez les reçus dans le calendrier.
                    </p>
                  )}
                </div>
                <p className="hint">
                  Mesures réseau :{' '}
                  {observed.sources.metricsEnabled
                    ? 'prises en charge via ' +
                      observed.sources.metrics +
                      ' ; une mesure absente reste « non disponible ».'
                    : 'non connectées (source prévue : ' +
                      observed.sources.metrics +
                      '). Aucun chiffre de performance n’est affiché sans relevé réel.'}
                </p>
                <details>
                  <summary>Détail par état</summary>
                  <dl className="result-states">
                    <div>
                      <dt>Contenus</dt>
                      <dd>
                        {Object.entries(observed.states)
                          .map(([key, value]) => (contentStateLabels[key] ?? key) + ' : ' + value)
                          .join(' · ') || 'Aucun contenu'}
                      </dd>
                    </div>
                    <div>
                      <dt>Publications</dt>
                      <dd>
                        {Object.entries(observed.publications.states)
                          .map(([key, value]) => (publicationStateLabels[key] ?? key) + ' : ' + value)
                          .join(' · ') || 'Aucune demande'}
                      </dd>
                    </div>
                  </dl>
                </details>
              </section>
            ) : (
              <p className="hint" role="status">
                Le bilan observé des contenus et publications n’est pas fourni par ce serveur.
              </p>
            )}
            <section className="card stack" aria-labelledby="campaigns-heading">
              <h2 id="campaigns-heading">Campagnes</h2>
              {missingHashCampaign && (
                <p className="hint" role="status">
                  La campagne demandée n’apparaît pas parmi les 20 dernières campagnes du relevé courant. Ouvrez-la depuis
                  la page Campagnes pour la retrouver.
                </p>
              )}
              {data.campaigns?.length ? (
                <ul className="result-campaigns">
                  {data.campaigns.map((campaign) => (
                    <li key={campaign.id} id={'campaign-' + campaign.id} className="result-campaign">
                      <div>
                        <h3>{campaign.name}</h3>
                        <p className="hint">
                          {campaign.projects} projet(s) · {campaign.content} contenu(s) · {campaign.approved}{' '}
                          approuvé(s) · {campaign.scheduled} planifié(s) · {campaign.published} publication déclarée
                        </p>
                      </div>
                      <Link href={'/campaigns?campaign=' + encodeURIComponent(campaign.id)}>Ouvrir la campagne</Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="hint">Aucune campagne avec des contenus pour l’instant.</p>
              )}
            </section>
            <section className="card stack" aria-labelledby="creatives-heading">
              <h2 id="creatives-heading">Créations approuvées</h2>
              {visibleCreatives.length ? (
                <ul className="result-creatives">
                  {visibleCreatives.map((creative) => (
                    <li key={creative.projectId + ':' + creative.version} className="result-creative">
                      <div>
                        <h3>
                          {creative.projectTitle} · v{creative.version}
                        </h3>
                        <p className="hint">
                          Approuvée le {fmt(creative.approvedAt)}
                          {creative.campaignName ? ' · campagne ' + creative.campaignName : ''}
                        </p>
                      </div>
                      <Link href={'/projects/' + encodeURIComponent(creative.projectId)}>
                        Reprendre dans le Studio
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="hint">
                  {projectFilter ? 'Aucune création approuvée pour ce projet.' : 'Aucune création approuvée.'}
                </p>
              )}
              <p className="hint">
                Reprendre une création dans le Studio crée une nouvelle révision de travail : la version approuvée
                reste inchangée et reste téléchargeable.
              </p>
            </section>
            <section className="card stack" aria-labelledby="suggestions-heading">
              <h2 id="suggestions-heading">Suggestions du serveur</h2>
              {data.suggestions?.length ? (
                <ul className="result-suggestions">
                  {data.suggestions.map((suggestion) => (
                    <li key={suggestion}>{suggestion}</li>
                  ))}
                </ul>
              ) : (
                <p className="hint">Aucune suggestion fournie pour le moment.</p>
              )}
              <p className="hint">
                Ces suggestions proviennent du serveur et des compteurs ci-dessus ; elles ne constituent ni une mesure
                ni une promesse de résultat.
              </p>
            </section>
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
                mesure vérifiable n’est fournie. Aucune donnée simulée (MOCK) ni estimation n’est affichée :
                les transferts Postiz MOCK du Studio ne sont jamais comptés ici.
              </p>
              <dl>
                {Object.entries(definitions).map(([k, [label, text]]) => (
                  <div key={k}>
                    <dt>{label}</dt>
                    <dd>{text}</dd>
                  </div>
                ))}
              </dl>
              {!visiblePublications.length ? (
                <p>
                  {projectFilter
                    ? 'Aucune publication confirmée avec preuve réseau vérifiée pour ce projet. Les cinq mesures sont non disponibles.'
                    : 'Aucune publication confirmée. Les cinq mesures sont non disponibles.'}
                </p>
              ) : (
                visiblePublications.map((p) => <Publication key={p.id} p={p} metricsEnabled={metricsEnabled} />)
              )}
              {visiblePending.length > 0 && (
                <div className="stack">
                  <h3>Demandes non confirmées ou en attente ({visiblePending.length})</h3>
                  <p className="hint">
                    Ces demandes n’ont pas de preuve réseau vérifiée et ne disposent d’aucune mesure de performance.
                    Ouvrez le calendrier pour vérifier leur statut auprès du fournisseur ou les résoudre.
                  </p>
                  <ul>
                    {visiblePending.map((item) => (
                      <li key={item.id}>
                        <strong>
                          {item.creative.project.title} · v{item.revision} · {item.platform}
                        </strong>{' '}
                        ({item.displayName || item.channel}) — {publicationStateLabels[item.state] ?? item.state}
                        {item.connectionStatus === 'revoked'
                          ? ' · compte dissocié'
                          : item.connectionStatus === 'expired'
                            ? ' · clé expirée'
                            : ''}
                        {item.remoteId ? ` · reçu ${item.remoteId}` : ''}{' '}
                        <Link href={'/calendar?item=' + encodeURIComponent(item.itemId)}>
                          Vérifier dans le calendrier
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
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
                    if (actionInFlight.current) return;
                    actionInFlight.current = true;
                    const enabled = e.target.checked;
                    work(true);
                    try {
                      const reminder = await postJson<Pref>('/api/results/reminder', { enabled });
                      set({ ...data, reminder });
                    } catch {
                      fail('Préférence non enregistrée.');
                    } finally {
                      actionInFlight.current = false;
                      work(false);
                    }
                  }}
                />{' '}
                Rappel hebdomadaire sur l’accueil uniquement (aucun e-mail)
              </label>
            </section>
            <section className="card stack">
              <h2>{t("Historique · 180 derniers jours","History \u00b7 last 180 days")}</h2>
              <p>Un téléchargement enregistré ne prouve pas que le contenu a été publié.</p>
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
                    if (actionInFlight.current) return;
                    actionInFlight.current = true;
                    work(true);
                    try {
                      const page = await api<History>(
                        '/api/results/history?' + new URLSearchParams(h.next!).toString(),
                      );
                      list({ rows: [...h.rows, ...page.rows], next: page.next });
                    } catch {
                      fail('Suite de l’historique indisponible.');
                    } finally {
                      actionInFlight.current = false;
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
