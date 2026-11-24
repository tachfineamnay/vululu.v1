'use client';
import Link from 'next/link';
import type { Connection, StudioState } from '../lib/useStudioFeed';
import type { ProjectBundle } from '../lib/api';
const connections: Record<Connection, string> = {
  connecting: 'Connexion…',
  live: 'En direct',
  polling: 'Actualisation périodique',
  offline: 'Hors ligne · dernier état reçu',
  denied: 'Accès interrompu',
};
const names: Record<string, string> = {
  project: 'Projet',
  creative: 'Composition',
  render: 'Rendu',
  job: 'Production',
  run: 'Exécution',
  step: 'Étape',
  execution: 'Opération',
  approval: 'Approbation',
  brief: 'Brief',
  scene: 'Scène',
  selection: 'Ressource',
  marketing: 'Plan éditorial',
  media: 'Média',
  calendar: 'Calendrier',
  publication: 'Publication',
  message: 'Conversation',
};
const labels: Record<string, string> = {
  PROPOSED: 'À autoriser',
  QUEUED: 'En file',
  CLAIMED: 'Pris en charge',
  POLLING: 'En attente du fournisseur',
  UNKNOWN: 'Résultat ou coût à vérifier',
  CANCELLED: 'Annulé',
  SUCCEEDED: 'Exécution terminée',
  RESOLVED: 'Rapproché',
  SUBMISSION_UNKNOWN: 'Envoi non confirmé',
  OUTCOME_UNKNOWN: 'Résultat non confirmé',
  READY: 'Prêt',
  INVALID_INPUT: 'Entrée invalide',
  UNAVAILABLE: 'Fournisseur indisponible',
  INVALID_OUTPUT: 'Fichier non conforme',
  CREDENTIAL_REJECTED: 'Identifiant refusé',
  COST_INCIDENT: 'Plafond dépassé',
  PENDING: 'En attente',
  DRAFT: 'Préparé',
  SUBMITTING: 'Envoi en cours',
  FAILED: 'Échec',
  running: 'En cours',
  waiting_approval: 'En attente d’approbation',
  recovery_pending: 'Reprise en cours',
  succeeded: 'Terminé',
  failed: 'Échec · réessayable',
  cancelled: 'Annulé · réessayable',
  timed_out: 'Délai dépassé · réessayable',
  approved: 'Approuvé',
  rendered: 'Rendu',
  draft: 'Brouillon',
  updated: 'Mis à jour',
  queued: 'En file',
};
export function StudioDesk({
  bundle: b,
  state,
  connection,
  go,
}: {
  bundle: ProjectBundle;
  state: StudioState | null;
  connection: Connection;
  go: (id: string) => void;
}) {
  const id = b.project.id,
    rev = state?.revisions[0];
  return (
    <section className="studio-desk" aria-labelledby="desk-heading">
      <header>
        <div>
          <p className="eyebrow">ATELIER / PROJET</p>
          <h2 id="desk-heading">Table de travail</h2>
        </div>
        <span className={'desk-signal ' + connection} role="status" data-testid="studio-connection">
          {connections[connection]}
        </span>
      </header>
      <div className="desk-stages">
        {[
          ['01', 'Préparer', 'Brief, marque et intention', 'brief-heading'],
          [
            '02',
            'Composer',
            rev
              ? `Composition v${rev.version}${rev.approvedAt ? ' · approuvée' : ''}`
              : 'Choisir un concept et éditer',
            'composition-heading',
          ],
          [
            '03',
            'Livrer',
            'Vérifier, approuver et exporter',
            rev ? 'creative-deliver' : 'finalization-heading',
          ],
        ].map(([n, title, hint, target]) => (
          <button key={n} onClick={() => go(target)}>
            <span>{n}</span>
            <strong>{title}</strong>
            <small>{hint}</small>
          </button>
        ))}
      </div>
      <nav className="desk-links" aria-label="Ressources de cette création">
        <Link href={'/assets?project=' + id}>Ressources et import</Link>
        <Link href={'/calendar?project=' + id}>Offres et calendrier</Link>
        <Link href={'/campaigns' + (b.project.campaignId ? '?campaign=' + b.project.campaignId : '')}>
          {state?.project.campaign?.name ?? 'Associer une campagne'}
        </Link>
        <button onClick={() => go('marketing-heading')}>Idées marketing</button>
      </nav>
      <details className="desk-activity">
        <summary>Activité et coûts {state && <small>· événement {state.cursor}</small>}</summary>
        {!state ? (
          <p>En attente du serveur.</p>
        ) : (
          <>
            <p>
              Profil : {b.context.name} · Offres confirmées :{' '}
              {state.project.context.offers.map((o) => o.name).join(', ') || 'aucune'}
            </p>
            <h3>Fournisseurs</h3>
            {state.providers.map((p) => (
              <p key={p.kind}>
                {p.model} —{' '}
                {p.availability === 'configured'
                  ? 'configuré, disponibilité non testée'
                  : p.availability === 'disabled'
                    ? 'désactivé'
                    : 'identifiant manquant'}
              </p>
            ))}
            <h3>Production et rendus</h3>
            {state.production && <p>{state.production.label} · export {state.production.file.toUpperCase()}</p>}
            {!b.job && !state.renders.length && <p>Aucun traitement lancé.</p>}
            {b.job && (
              <p>
                {b.job.type} · {labels[b.job.status] ?? b.job.status} · {b.job.step}{' '}
                {b.job.error && `— ${b.job.error}`}
              </p>
            )}
            {b.jobRun?.steps
              .filter((s) => s.attempts > 1 || s.error)
              .map((s) => (
                <p key={s.name}>
                  {s.name} · tentative {s.attempts} · {s.error ?? s.status}
                </p>
              ))}
            {state.renders.map((r) => (
              <p key={r.id}>
                Rendu v{r.revision} · {labels[r.state] ?? r.state} ·{' '}
                {new Date(r.createdAt).toLocaleTimeString('fr-FR')} {r.reason}{' '}
                {r.state === 'failed' && (
                  <button onClick={() => go('composition-heading')}>
                    Revoir la composition avant de réessayer
                  </button>
                )}
              </p>
            ))}
            <h3>Opérations autorisables</h3>
            {!state.operations.length && <p>Aucune réservation pour ce projet.</p>}
            {state.operations.map((o) => (
              <p key={o.id}>
                {o.tool} · v{o.revision} · {labels[o.state] ?? o.state} ·{' '}
                {o.reportedCents !== null
                  ? `${o.reportedCents} ¢ USD comptabilisés`
                  : `plafond ${o.maxCents} ¢ USD, ${o.costState}`}
              </p>
            ))}
            {state.media.map((m) => (
              <p key={m.id}>
                {m.sceneKey} · {m.model} · {labels[m.state] ?? m.state}
              </p>
            ))}
            <h3>Derniers changements</h3>
            <ol>
              {state.events.map((e) => (
                <li key={e.cursor}>
                  #{e.cursor} · {names[e.kind] ?? e.kind} · {labels[e.state] ?? e.state}
                </li>
              ))}
            </ol>
          </>
        )}
      </details>
    </section>
  );
}
