'use client';
import { useEffect, useState } from 'react';
import { socialChannels } from './SocialConnections';
import { api, postJson } from '../../lib/api';
type Panel = {
  directEnabled: boolean;
  scheduleAuthorized: boolean;
  revisions: { revision: number; platform: string }[];
  connections: { id: string; channel: string; displayName: string | null; platform: string; expiresAt: string }[];
  requests: {
    id: string;
    revision: number;
    itemVersion: number;
    scheduledAt: string | null;
    connection: { platform: string; channel: string; displayName: string | null; revoked: boolean };
    state: string;
    reason: string | null;
    remoteId: string | null;
    networkReceipt: string | null;
    operationId?: string;
    execution?: string;
    cancellation?: string;
  }[];
};
type Preview = {
  projectId: string;
  revision: number;
  caption: string;
  platform: string;
  sourcePlatform: string;
  kind: string;
  when: string;
  keys: (string | null)[];
  issues: string[];
  direct: boolean;
};
type Cmd = { id: string; operationId: string; digest: string; state: string };
const labels: Record<string, string> = {
  PREPARED: 'Demande préparée',
  SENDING: 'Envoi en cours',
  SUBMITTED: 'Soumission acceptée · publication non confirmée',
  CANCELLING: 'Annulation en cours',
  CANCELLED: 'Annulée',
  PUBLISHED: 'Publication confirmée',
  FAILED: 'Échec',
  UNKNOWN: 'Issue inconnue · vérifier auprès du fournisseur',
  TOKEN_EXPIRED: 'Identifiant expiré ou refusé',
  DISABLED: 'Envoi direct désactivé',
  CHANNEL_MISMATCH: 'Compte destinataire non vérifié',
  PROVIDER_UNAVAILABLE: 'Fournisseur indisponible',
  RECEIPT_UNKNOWN: 'Accusé de réception perdu',
  VALIDATION_FAILED: 'Contenu ou autorisation à revérifier',
  REJECTED: 'Demande refusée ou créneau non annulable',
  PROVIDER_FAILED: 'Échec signalé par le fournisseur',
  editorial_approval_required: 'Contenu du calendrier à approuver',
  caption_too_long: 'Légende et appel à l’action trop longs'
};
export function PublishingPanel({ id, connectionsVersion = 0 }: { id: string; connectionsVersion?: number }) {
  const base = `/api/calendar/${id}/publishing`;
  const [info, set] = useState<Panel>(),
    [rev, select] = useState(0),
    [p, view] = useState<Preview>(),
    [target, destination] = useState(''),
    [channel, choose] = useState(''),
    [error, fail] = useState(''),
    [busy, work] = useState(false),
    [refresh, reload] = useState(0),
    [cmd, confirm] = useState<Cmd & { label: string }>();
  const query = target ? `?target=${encodeURIComponent(target)}` : '';
  useEffect(() => {
    let active = true;
    api<Panel>(base)
      .then((data) => {
        if (active) {
          set(data);
          select((old) =>
            data.revisions.some((r) => r.revision === old) ? old : (data.revisions[0]?.revision ?? 0)
          );
        }
      })
      .catch(() => active && fail('Statut de publication indisponible.'));
    return () => {
      active = false;
    };
  }, [base, refresh, connectionsVersion]);
  useEffect(() => {
    let active = true;
    view(undefined);
    confirm(undefined);
    if (rev)
      api<Preview>(`${base}/${rev}/preview${query}`)
        .then((v) => active && view(v))
        .catch(() => active && fail('Aperçu approuvé indisponible.'));
    return () => {
      active = false;
    };
  }, [base, rev, query, refresh, connectionsVersion]);
  async function action(fn: () => Promise<void>) {
    if (busy) return;
    fail('');
    work(true);
    try {
      await fn();
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Action impossible');
    } finally {
      work(false);
    }
  }
  const eligible = info?.connections.filter((c) => c.platform === p?.platform && Date.parse(c.expiresAt) > Date.now()) ?? [];
  const selection = eligible.find((c) => c.id === channel);
  return (
    <section className="card stack">
      <h2>Publication et reçus</h2>
      <p>Le statut éditorial ne confirme pas une publication distante.</p>
      {info && !info.directEnabled && <p>Programmation directe indisponible ici. Utilisez le kit manuel après les deux approbations.</p>}
      {info?.directEnabled && !info.scheduleAuthorized && <p>La programmation directe n’est pas autorisée pour ce compte. Le kit manuel reste disponible.</p>}
      {error && <p role="alert">{error}</p>}
      <button type="button" onClick={() => reload((n) => n + 1)}>
        Actualiser les reçus
      </button>
      {info && !info.revisions.length && (
        <p>
          Aucune création approuvée pour ce contenu. Dans le Studio, liez la composition au contenu actuel, rendez-la et approuvez-la.
        </p>
      )}
      {info?.requests.map((r) => (
        <article key={r.id}>
          <strong>
            Création v{r.revision} · {r.connection.platform} · {r.connection.displayName || r.connection.channel} · {labels[r.state] ?? r.state}
          </strong>{' '}
          — exécution : {r.execution ?? 'non approuvée'} {r.reason && ` · ${labels[r.reason] ?? r.reason}`}{' '}
          {r.remoteId && ` · reçu de soumission : ${r.remoteId}`}{' '}
          {r.networkReceipt && ` · preuve réseau : ${r.networkReceipt}`}{' '}
          {r.cancellation && ` · annulation : ${r.cancellation}`}{' '}
          {r.operationId && ['PROPOSED', 'QUEUED'].includes(r.execution ?? '') && (
            <button
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  await postJson(`/api/execution/${r.operationId}/cancel`, {});
                  reload((n) => n + 1);
                })
              }
            >
              Retirer la demande locale
            </button>
          )}
          {r.state === 'FAILED' &&
            ['TOKEN_EXPIRED', 'CHANNEL_MISMATCH', 'DISABLED'].includes(r.reason ?? '') && (
              <button
                disabled={busy}
                onClick={() =>
                  void action(async () =>
                    confirm({
                      ...(await postJson<Cmd>(`/api/publishing/${r.id}/prepare-retry`, {})),
                      label: `Autoriser une nouvelle tentative v${r.revision}`
                    })
                  )
                }
              >
                Préparer une nouvelle tentative
              </button>
            )}
          {r.remoteId && !r.connection.revoked && ['SUBMITTED', 'UNKNOWN'].includes(r.state) && (
            <button type="button" disabled={busy} onClick={() => void action(async () => {
              await postJson(`/api/publishing/${r.id}/reconcile`, {}); reload((n) => n + 1);
            })}>Vérifier chez Postiz</button>
          )}
          {r.state === 'SUBMITTED' && !r.connection.revoked && (!r.scheduledAt || Date.parse(r.scheduledAt) > Date.now()) && (
            <button
              disabled={busy}
              onClick={() =>
                void action(async () =>
                  confirm({
                    ...(await postJson<Cmd>(`/api/publishing/${r.id}/prepare-cancel`, {})),
                    label: `Confirmer l’annulation du reçu ${r.remoteId}`
                  })
                )
              }
            >
              Préparer l’annulation
            </button>
          )}
        </article>
      ))}
      {!!info?.revisions.length && (
        <label>
          Création approuvée
          <select value={rev} onChange={(e) => { select(+e.target.value); choose(''); }}>
            {info.revisions.map((r) => (
              <option key={r.revision} value={r.revision}>
                {r.platform} · v{r.revision}
              </option>
            ))}
          </select>
        </label>
      )}
      {!!info?.revisions.length && <label>Réseau destinataire
        <select value={target} onChange={(e) => { destination(e.target.value); view(undefined); confirm(undefined); choose(''); }}>
          <option value="">Réseau de la création approuvée</option>
          {socialChannels.map((name) => <option key={name}>{name}</option>)}
        </select>
      </label>}
      {p && p.revision === rev && (
        <>
          <h3>
            {p.platform} · {p.kind}
          </h3>
          {p.platform !== p.sourcePlatform && <p>La création et la légende approuvées pour {p.sourcePlatform} seront réutilisées. Vérifiez leur pertinence pour {p.platform}.</p>}
          <p style={{ whiteSpace: 'pre-wrap' }}>{p.caption}</p>
          <time>{new Date(p.when).toLocaleString('fr-FR')}</time>
          <div>
            {p.keys.map((key, i) => {
              const url = `/api/projects/${p.projectId}/creative/${p.revision}/${key ? 'scenes/' + key : 'master'}`;
              return p.kind === 'short' ? (
                <video key={i} controls src={url} style={{ maxHeight: 280, maxWidth: '100%' }} />
              ) : (
                <img
                  key={i}
                  src={url}
                  alt={`Aperçu ${p.platform}, visuel ${i + 1}`}
                  style={{ maxHeight: 280, maxWidth: '100%' }}
                />
              );
            })}
          </div>
          {p.issues.length ? (
            <p role="status">À corriger : {p.issues.map((x) => labels[x] ?? x).join(', ')}</p>
          ) : null}
          {!p.issues.some((issue) => issue !== 'caption_too_long') && (
            <a href={`${base}/${rev}/package${query}`} download>
              Télécharger le kit manuel (médias + légende)
            </a>
          )}
          {p.direct && info?.scheduleAuthorized && !p.issues.length && (
            <>
              <label>
                Compte destinataire
                <select
                  value={channel}
                  onChange={(e) => {
                    choose(e.target.value);
                    confirm(undefined);
                  }}
                >
                  <option value="">Choisir un compte connecté</option>
                  {eligible.map((c) => <option key={c.id} value={c.id}>{c.displayName || c.channel}</option>)}
                </select>
              </label>
              <button
                disabled={!eligible.some((c) => c.id === channel) || busy || Date.parse(p.when) <= Date.now()}
                onClick={() =>
                  void action(async () =>
                    confirm({
                      ...(await postJson<Cmd>(`${base}/${rev}/prepare`, { connectionId: channel, target: p.platform })),
                      label: `Autoriser la programmation v${rev} sur ${selection?.displayName || selection?.channel}`
                    })
                  )
                }
              >
                Préparer la programmation
              </button>
            </>
          )}
          {!p.direct ? (info?.directEnabled && <p>Ce réseau ou format est à publier manuellement.</p>) : !info?.scheduleAuthorized ? null : !eligible.length ? <p>Aucun compte actif pour ce réseau. Associez un compte ou utilisez le kit manuel.</p> : Date.parse(p.when) <= Date.now() ? <p>Choisissez une date future dans le calendrier ou utilisez le kit manuel.</p> : null}
        </>
      )}
      {cmd && (
        <button
          disabled={busy}
          onClick={() =>
            void action(async () => {
              await postJson(`/api/execution/${cmd.operationId}/approve`, { digest: cmd.digest });
              confirm(undefined);
              reload((n) => n + 1);
            })
          }
        >
          {cmd.label}
        </button>
      )}
    </section>
  );
}
