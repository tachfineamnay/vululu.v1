'use client';
import { useEffect, useState } from 'react';
import { api, postJson } from '../../lib/api';
type Panel = {
  revisions: { revision: number; platform: string }[];
  connections: { id: string; channel: string; platform: string; expiresAt: string }[];
  requests: {
    id: string;
    revision: number;
    itemVersion: number;
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
  PROVIDER_FAILED: 'Échec signalé par le fournisseur',
  editorial_approval_required: 'Contenu du calendrier à approuver',
  caption_too_long: 'Légende et appel à l’action trop longs'
};
export function PublishingPanel({ id }: { id: string }) {
  const base = `/api/calendar/${id}/publishing`;
  const [info, set] = useState<Panel>(),
    [rev, select] = useState(0),
    [p, view] = useState<Preview>(),
    [channel, choose] = useState(''),
    [error, fail] = useState(''),
    [busy, work] = useState(false),
    [refresh, reload] = useState(0),
    [cmd, confirm] = useState<Cmd & { label: string }>();
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
  }, [base, refresh]);
  useEffect(() => {
    let active = true;
    view(undefined);
    confirm(undefined);
    if (rev)
      api<Preview>(`${base}/${rev}/preview`)
        .then((v) => active && view(v))
        .catch(() => active && fail('Aperçu approuvé indisponible.'));
    return () => {
      active = false;
    };
  }, [base, rev, refresh]);
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
  return (
    <section className="card stack">
      <h2>Publication et reçus</h2>
      <p>Le statut éditorial ne confirme pas une publication distante.</p>
      {error && <p role="alert">{error}</p>}
      <button type="button" onClick={() => reload((n) => n + 1)}>
        Actualiser les reçus
      </button>
      {info && !info.revisions.length && (
        <p>
          Aucune création approuvée pour cette version du contenu. Liez et approuvez une déclinaison dans le
          Studio.
        </p>
      )}
      {info?.requests.map((r) => (
        <article key={r.id}>
          <strong>
            Création v{r.revision} · {labels[r.state] ?? r.state}
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
          {r.state === 'SUBMITTED' && (
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
          <select value={rev} onChange={(e) => select(+e.target.value)}>
            {info.revisions.map((r) => (
              <option key={r.revision} value={r.revision}>
                {r.platform} · v{r.revision}
              </option>
            ))}
          </select>
        </label>
      )}
      {p && p.revision === rev && (
        <>
          <h3>
            {p.platform} · {p.kind}
          </h3>
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
          ) : (
            <a href={`${base}/${rev}/package`} download>
              Télécharger le kit manuel (médias + légende)
            </a>
          )}
          {p.direct && !p.issues.length && (
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
                  {info?.connections
                    .filter((c) => c.platform === p.platform && Date.parse(c.expiresAt) > Date.now())
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.channel}
                      </option>
                    ))}
                </select>
              </label>
              <button
                disabled={!channel || busy}
                onClick={() =>
                  void action(async () =>
                    confirm({
                      ...(await postJson<Cmd>(`${base}/${rev}/prepare`, { connectionId: channel })),
                      label: `Autoriser la programmation v${rev} sur ${info?.connections.find((c) => c.id === channel)?.channel}`
                    })
                  )
                }
              >
                Préparer la programmation
              </button>
            </>
          )}
          {!p.direct && <p>Réseau ou format en publication manuelle.</p>}
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
