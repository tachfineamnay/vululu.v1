'use client';
import { useEffect, useRef, useState } from 'react';
import { socialChannels } from './SocialConnections';
import { api, postJson } from '../../lib/api';
import {
  displayRequestState,
  evaluateRequestControls,
  formatKind,
  isSafeHttpsUrl,
  isVideoKind,
  requestStates
} from '../../lib/publishingPresentation';

type PanelConnection = {
  id: string;
  channel: string;
  displayName: string | null;
  platform: string;
  expiresAt: string;
};
type PanelRequest = {
  id: string;
  revision: number;
  itemVersion: number;
  scheduledAt: string | null;
  connection: { platform: string; channel: string; displayName: string | null; revoked: boolean; expiresAt?: string };
  state: string;
  reason: string | null;
  remoteId: string | null;
  networkReceipt: string | null;
  operationId?: string;
  execution?: string;
  cancelOperationId?: string;
  cancellation?: string;
};
type Panel = {
  directEnabled: boolean;
  scheduleAuthorized: boolean;
  revisions: { revision: number; platform: string; kind?: string }[];
  connections: PanelConnection[];
  requests: PanelRequest[];
};
type Preview = {
  itemVersion: number;
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
  directReason?: 'platform_manual_only' | 'format_not_supported_for_direct' | 'direct_disabled' | null;
  supportedScheduledKinds?: string[];
  schedulableInFuture?: boolean;
};
type Cmd = { id: string; operationId: string; digest: string; state: string };
type Operation = {
  id: string;
  key: string;
  state: string;
  digest: string;
  maxCents: number;
  reportedCents: number | null;
};
type Detail = {
  id: string;
  itemId: string;
  itemVersion: number;
  revision: number;
  scheduledAt: string | null;
  state: string;
  reason: string | null;
  remoteId: string | null;
  networkReceipt: string | null;
  connection: {
    platform: string;
    channel: string;
    displayName: string | null;
    revoked: boolean;
    expiresAt: string;
  };
  events: { eventId: string; createdAt: string }[];
  submission: Operation | null;
  cancellation: Operation | null;
};

const operationStates: Record<string, string> = {
  PROPOSED: 'Autorisation requise',
  QUEUED: 'En file d’exécution',
  CLAIMED: 'Prise en charge par le worker',
  POLLING: 'Suivi en cours',
  SUCCEEDED: 'Terminée',
  FAILED: 'Échec',
  CANCELLED: 'Annulée',
  UNKNOWN: 'Issue inconnue',
  RESOLVED: 'Résolue manuellement'
};
const issueLabels: Record<string, string> = {
  caption_too_long: 'Légende, hashtags et appel à l’action trop longs pour ce réseau',
  editorial_approval_required: 'Le contenu doit être au statut Approuvé ou Planifié dans le calendrier',
  unsupported_format: 'Le format choisi dans le calendrier n’est pas pris en charge',
  incompatible_artifact_format: 'La création approuvée ne correspond pas au format défini dans le calendrier',
  calendar_changed: 'Le contenu du calendrier a changé depuis l’approbation de cette création',
  approved_revision_required: 'La révision n’est pas rendue et approuvée',
  variant_missing: 'Aucune déclinaison ne correspond au réseau de la création',
  not_schedulable: 'La préparation est refusée : contenu incomplet, date passée ou réseau non éligible'
};
const reasonLabels: Record<string, string> = {
  TOKEN_EXPIRED: 'Identifiant expiré ou refusé',
  DISABLED: 'Envoi direct désactivé',
  CHANNEL_MISMATCH: 'Compte destinataire non vérifié',
  PROVIDER_UNAVAILABLE: 'Fournisseur indisponible',
  RECEIPT_UNKNOWN: 'Accusé de réception perdu',
  MISSING_NETWORK_RECEIPT: 'Publication signalée sans preuve réseau vérifiable',
  MANUAL_CONFIRMED_ABSENT: 'Absence confirmée manuellement chez Postiz',
  RESOLVED_EXTERNALLY: 'Clôturée comme gérée hors Vululu (sans preuve réseau)',
  VALIDATION_FAILED: 'Contenu ou autorisation à revérifier',
  REJECTED: 'Demande refusée ou créneau non annulable',
  PROVIDER_FAILED: 'Échec signalé par le fournisseur',
  INVALID_RECEIPT: 'Accusé de réception du fournisseur invalide'
};
const reconcileOutcomes: Record<string, string> = {
  published_verified: 'Publication confirmée avec preuve réseau vérifiée.',
  provider_failed: 'Le fournisseur a signalé un échec pour cette programmation.',
  recovered_queued: 'Postiz confirme que la programmation est toujours en file : état rétabli en soumission acceptée.',
  still_queued: 'Programmation toujours en file chez Postiz (publication non encore confirmée).',
  missing_network_receipt: 'Postiz signale la publication sans lien/preuve réseau vérifiable : le statut reste non confirmé.',
  not_found_on_provider: 'Aucune programmation correspondante trouvée sur le créneau chez Postiz.',
  not_found_without_receipt: 'Aucune programmation correspondante trouvée chez Postiz sans reçu initial. Vérifiez directement dans votre espace Postiz avant toute confirmation manuelle.',
  ambiguous_without_receipt: 'Plusieurs publications correspondent ou aucun reçu unique ne permet de trancher sans risque de doublon. Vérifiez directement chez Postiz.',
  no_action_needed: 'Aucune mise à jour supplémentaire renvoyée par le fournisseur.'
};
const actionErrors: Record<string, string> = {
  direct_disabled: 'Programmation directe désactivée sur cet environnement. Utilisez le kit manuel.',
  DISABLED: 'Programmation directe désactivée sur cet environnement. Utilisez le kit manuel.',
  connection_not_found: 'Compte de publication introuvable. Associez-le dans « Comptes de publication ».',
  connection_revoked: 'Ce compte de publication a été dissocié. Associez-le à nouveau dans « Comptes de publication ».',
  token_expired: 'La clé du compte a expiré. Renouvelez-la dans « Comptes de publication », puis actualisez.',
  TOKEN_EXPIRED: 'La clé du compte a expiré ou été refusée par Postiz. Renouvelez-la dans « Comptes de publication ».',
  PROVIDER_UNAVAILABLE: 'Postiz est temporairement indisponible. Aucune nouvelle soumission n’a été envoyée ; réessayez plus tard.',
  not_schedulable: 'Programmation impossible : date passée, contenu à approuver ou réseau/format non compatible.',
  existing_publication: 'Une demande existe déjà pour cette version sur ce compte. Vérifiez-la avant d’en créer une autre.',
  publication_outcome_unknown: 'Une tentative précédente a une issue inconnue : vérifiez chez Postiz ou résolvez-la manuellement pour éviter toute double publication.',
  retry_required: 'Cette demande a échoué : utilisez « Préparer une nouvelle tentative » sur la demande existante si la cause le permet.',
  revision_conflict: 'La révision de la création a changé. Rechargez le contenu et choisissez la création à nouveau.',
  unsafe_retry: 'La nouvelle tentative est bloquée pour éviter une double publication : vérifiez d’abord l’état chez Postiz.',
  not_submitted: 'L’annulation n’est possible que pour une soumission acceptée par le fournisseur.',
  cancellation_unsupported: 'L’annulation directe n’est pas prise en charge pour cette demande.',
  schedule_already_passed: 'La date prévue est dépassée : l’annulation n’est plus possible depuis Vululu.',
  not_unknown: 'Cette demande n’est pas en état d’issue inconnue.',
  too_late_to_cancel: 'Trop tard pour retirer cette demande locale : elle est déjà prise en charge.',
  not_proposed: 'Cette autorisation a déjà été traitée. Actualisez les reçus pour voir l’état réel.',
  approval_mismatch: 'L’empreinte de l’autorisation ne correspond plus. Actualisez puis préparez à nouveau.',
  budget_exhausted: 'Budget d’exécution insuffisant pour autoriser cette opération.',
  tool_disabled: 'L’outil de programmation n’est pas autorisé pour ce compte.',
  approved_revision_required: 'Aucune création rendue et approuvée ne correspond à ce contenu.',
  calendar_changed: 'Le contenu du calendrier a changé : l’ancienne création approuvée n’est plus compatible. Réapprouvez une création liée à la version actuelle.',
  variant_missing: 'Aucune déclinaison du calendrier ne correspond au réseau de la création.',
  item_not_found: 'Contenu du calendrier introuvable ou non accessible.',
  publication_not_found: 'Demande de publication introuvable pour ce compte.'
};
const when = (iso: string) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' });
const accountLabel = (c: { displayName: string | null; channel: string }) => c.displayName || c.channel;
const actionMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : '';
  return actionErrors[message] ?? (message || 'Action impossible.');
};

/**
 * P10 — parcours de publication réelle : aperçu validé, compte exact, confirmation,
 * autorisation explicite, états réels, reçu distant, journal et actions de reprise.
 * Rien n’est présenté comme publié sans preuve réseau ; aucun flux OAuth n’est inventé.
 */
export function PublishingPanel({ id, connectionsVersion = 0 }: { id: string; connectionsVersion?: number }) {
  const base = `/api/calendar/${id}/publishing`;
  const [info, set] = useState<Panel>(),
    [rev, select] = useState(0),
    [p, view] = useState<Preview>(),
    [previewLoading, setPreviewLoading] = useState(false),
    [target, destination] = useState(''),
    [channel, choose] = useState(''),
    [error, fail] = useState(''),
    [notice, say] = useState(''),
    [busy, work] = useState(false),
    [refresh, reload] = useState(0),
    [cmd, confirm] = useState<Cmd & { label: string }>(),
    [details, detail] = useState<Record<string, Detail>>({}),
    [detailOpen, openDetail] = useState('');
  const inFlight = useRef(false);
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
    if (!rev) {
      setPreviewLoading(false);
      return () => {
        active = false;
      };
    }
    setPreviewLoading(true);
    api<Preview>(`${base}/${rev}/preview${query}`)
      .then((v) => {
        if (active) {
          view(v);
          fail('');
        }
      })
      .catch((e) => active && fail(actionMessage(e)))
      .finally(() => active && setPreviewLoading(false));
    return () => {
      active = false;
    };
  }, [base, rev, query, refresh, connectionsVersion]);
  async function action(fn: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    fail('');
    say('');
    work(true);
    try {
      await fn();
    } catch (e) {
      fail(actionMessage(e));
    } finally {
      inFlight.current = false;
      work(false);
    }
  }
  function refreshAll() {
    detail({});
    openDetail('');
    reload((n) => n + 1);
  }
  async function authorize() {
    if (!cmd) return;
    await action(async () => {
      const operation = await postJson<{ state?: string }>(
        `/api/execution/${encodeURIComponent(cmd.operationId)}/approve`,
        { digest: cmd.digest }
      );
      say(
        'Autorisation enregistrée. État de l’opération : ' +
          (operationStates[operation?.state ?? 'QUEUED'] ?? operation?.state ?? 'envoyée') +
          '.'
      );
      confirm(undefined);
      reload((n) => n + 1);
    });
  }
  const eligible = info?.connections.filter((c) => c.platform === p?.platform && Date.parse(c.expiresAt) > Date.now()) ?? [];
  const expired =
    info?.connections.filter((c) => c.platform === p?.platform && Date.parse(c.expiresAt) <= Date.now()) ?? [];
  const selection = eligible.find((c) => c.id === channel);
  return (
    <section className="card stack pub-panel" aria-labelledby="publishing-heading">
      <h2 id="publishing-heading">Publication et reçus</h2>
      <p className="hint">
        Le statut éditorial ne confirme pas une publication distante. Une soumission acceptée par le fournisseur
        n’est pas une publication : seule une preuve réseau reçue confirme la diffusion.
      </p>
      {info && !info.directEnabled && (
        <p className="pub-notice" role="status">
          Programmation directe indisponible sur cet environnement : POSTIZ_PUBLISH_ENABLED n’est pas à 1 ou la clé de
          chiffrement des identifiants de publication est absente (PUBLISHING_ENCRYPTION_KEY). Aucun envoi ne peut
          partir d’ici ; utilisez le kit manuel après les deux approbations.
        </p>
      )}
      {info?.directEnabled && !info.scheduleAuthorized && (
        <p className="pub-notice" role="status">
          La programmation directe n’est pas autorisée pour ce compte (outil postiz.schedule@1 non activé). Le kit
          manuel reste disponible.
        </p>
      )}
      {error && (
        <p className="pub-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="pub-notice" role="status">
          {notice}
        </p>
      )}
      <div className="actions">
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={refreshAll}>
          Actualiser les reçus
        </button>
      </div>
      {info && !info.revisions.length && (
        <p>
          Aucune création approuvée pour ce contenu. Dans le Studio, liez la composition au contenu actuel, rendez-la et
          approuvez-la.
        </p>
      )}
      {info?.requests.map((r) => {
        const d = details[r.id];
        const revoked = r.connection.revoked;
        const {
          expired,
          canRetryReason,
          canRetryNow,
          canReconcileNow,
          canCancelNow,
          canWithdrawCancel
        } = evaluateRequestControls(r, {
          directEnabled: Boolean(info.directEnabled),
          scheduleAuthorized: Boolean(info.scheduleAuthorized)
        });
        return (
          <article key={r.id} className="pub-request">
            <div className="pub-request-head">
              <strong>
                Création v{r.revision} · {r.connection.platform} · {accountLabel(r.connection)} · {r.connection.channel}
              </strong>{' '}
              <span className="pill">{displayRequestState(r.state, r.networkReceipt)}</span>
            </div>
            <p className="hint">
              Contenu v{r.itemVersion}
              {r.scheduledAt ? ' · date prévue ' + when(r.scheduledAt) : ' · date non fixée'} · exécution :{' '}
              {r.execution ? operationStates[r.execution] ?? r.execution : 'non autorisée'}
              {r.reason && ` · cause : ${reasonLabels[r.reason] ?? r.reason}`}
            </p>
            {r.remoteId && <p className="hint">reçu de soumission : {r.remoteId}</p>}
            {r.networkReceipt ? (
              <p className="hint">
                preuve réseau vérifiée :{' '}
                {isSafeHttpsUrl(r.networkReceipt) ? (
                  <a href={r.networkReceipt} target="_blank" rel="noopener noreferrer">
                    {r.networkReceipt}
                  </a>
                ) : (
                  <code>{r.networkReceipt}</code>
                )}
              </p>
            ) : r.state === 'SUBMITTED' ? (
              <p className="hint">preuve réseau : aucune (soumission en attente de diffusion)</p>
            ) : r.state === 'PUBLISHED' ? (
              <p className="pub-warning" role="status">
                Aucune preuve réseau vérifiée n’est rattachée à cette demande. Ne la considérez pas comme confirmée sans vérification.
              </p>
            ) : null}
            {r.cancellation && (
              <p className="hint">annulation : {operationStates[r.cancellation] ?? r.cancellation}</p>
            )}
            {r.state === 'UNKNOWN' && (
              <p className="pub-warning" role="status">
                Issue fournisseur incertaine : Vululu bloque toute relance automatique pour éviter une double publication.
                {info.directEnabled && !revoked && !expired
                  ? ' Lancez « Vérifier chez Postiz » (lecture seule) ou vérifiez directement votre espace Postiz avant toute résolution.'
                  : ' Vérifiez directement dans votre espace Postiz, puis clôturez l’issue ci-dessous si besoin.'}
              </p>
            )}
            {revoked && (
              <p className="pub-warning" role="status">
                Ce compte a été dissocié de Vululu. Les demandes existantes ne peuvent plus être vérifiées ni annulées depuis ici.
                Associez un compte à nouveau dans « Comptes de publication », puis vérifiez chez Postiz avant toute
                nouvelle demande.
              </p>
            )}
            {!revoked && expired && (
              <p className="pub-warning" role="status">
                La clé de ce compte a expiré. Renouvelez-la dans « Comptes de publication » avant de vérifier, annuler ou relancer une demande.
              </p>
            )}
            <div className="actions">
              {r.operationId && ['PROPOSED', 'QUEUED'].includes(r.execution ?? '') && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      await postJson(`/api/execution/${encodeURIComponent(r.operationId!)}/cancel`, {});
                      say('Demande locale retirée : aucune soumission ne partira. Le reçu reste consultable.');
                      reload((n) => n + 1);
                    })
                  }
                >
                  Retirer la demande locale
                </button>
              )}
              {canWithdrawCancel && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      await postJson(`/api/execution/${encodeURIComponent(r.cancelOperationId!)}/cancel`, {});
                      say('Annulation locale retirée. La programmation reste en attente chez le fournisseur.');
                      reload((n) => n + 1);
                    })
                  }
                >
                  Retirer l’annulation locale
                </button>
              )}
              {canRetryReason && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy || !canRetryNow}
                  title={
                    !info.directEnabled
                      ? 'Programmation directe désactivée sur cet environnement'
                      : revoked
                        ? 'Compte dissocié'
                        : expired
                          ? 'Renouvelez la clé expirée dans « Comptes de publication »'
                          : !info.scheduleAuthorized
                            ? 'Outil postiz.schedule@1 non autorisé'
                            : undefined
                  }
                  onClick={() =>
                    void action(async () =>
                      confirm({
                        ...(await postJson<Cmd>(`/api/publishing/${encodeURIComponent(r.id)}/prepare-retry`, {})),
                        label: `Autoriser une nouvelle tentative v${r.revision}`
                      })
                    )
                  }
                >
                  Préparer une nouvelle tentative
                </button>
              )}
              {canReconcileNow && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      const result = await postJson<{ state: string; outcome?: string }>(
                        `/api/publishing/${encodeURIComponent(r.id)}/reconcile`,
                        {}
                      );
                      const detailMsg = result.outcome && reconcileOutcomes[result.outcome]
                        ? ' ' + reconcileOutcomes[result.outcome]
                        : '';
                      say(
                        'Vérification effectuée. État renvoyé par le fournisseur : ' +
                          (requestStates[result.state] ?? result.state) +
                          '.' +
                          detailMsg
                      );
                      reload((n) => n + 1);
                    })
                  }
                >
                  Vérifier chez Postiz
                </button>
              )}
              {r.state === 'UNKNOWN' && (
                <>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        if (
                          !window.confirm(
                            'Confirmez-vous avoir vérifié votre espace Postiz et qu’aucune publication n’y a été créée ? Cela débloquera une nouvelle préparation explicite sans rien envoyer automatiquement.'
                          )
                        )
                          return;
                        await postJson(`/api/publishing/${encodeURIComponent(r.id)}/resolve-unknown`, {
                          resolution: 'confirmed_absent'
                        });
                        say('Absence confirmée manuellement. Vous pouvez préparer une nouvelle tentative si souhaité.');
                        reload((n) => n + 1);
                      })
                    }
                  >
                    Confirmer l’absence chez Postiz
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        if (
                          !window.confirm(
                            'Clôturer cette demande comme déjà gérée hors Vululu ? Aucune preuve réseau ne sera fabriquée.'
                          )
                        )
                          return;
                        await postJson(`/api/publishing/${encodeURIComponent(r.id)}/resolve-unknown`, {
                          resolution: 'confirmed_external'
                        });
                        say('Demande clôturée comme gérée hors Vululu (sans preuve réseau vérifiée).');
                        reload((n) => n + 1);
                      })
                    }
                  >
                    Clôturer (gérée hors Vululu)
                  </button>
                </>
              )}
              {canCancelNow && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() =>
                    void action(async () =>
                      confirm({
                        ...(await postJson<Cmd>(`/api/publishing/${encodeURIComponent(r.id)}/prepare-cancel`, {})),
                        label: `Confirmer l’annulation du reçu ${r.remoteId}`
                      })
                    )
                  }
                >
                  Préparer l’annulation
                </button>
              )}
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                aria-expanded={detailOpen === r.id}
                onClick={() =>
                  void action(async () => {
                    if (detailOpen === r.id) {
                      openDetail('');
                      return;
                    }
                    if (details[r.id]) {
                      openDetail(r.id);
                      return;
                    }
                    const row = await api<Detail>('/api/publishing/' + encodeURIComponent(r.id));
                    detail((current) => ({ ...current, [r.id]: row }));
                    openDetail(r.id);
                  })
                }
              >
                {detailOpen === r.id ? 'Masquer le détail et le journal' : 'Afficher le détail et le journal'}
              </button>
            </div>
            {detailOpen === r.id && d && (
              <div className="pub-detail">
                <h3>Détail de la demande</h3>
                <dl>
                  <div>
                    <dt>Compte exact</dt>
                    <dd>
                      {d.connection.platform} · {d.connection.displayName || d.connection.channel} · identifiant{' '}
                      {d.connection.channel}
                    </dd>
                  </div>
                  <div>
                    <dt>État de la demande</dt>
                    <dd>{requestStates[d.state] ?? d.state}</dd>
                  </div>
                  <div>
                    <dt>Date prévue</dt>
                    <dd>{d.scheduledAt ? when(d.scheduledAt) : 'Non fixée'}</dd>
                  </div>
                  <div>
                    <dt>Reçu de soumission</dt>
                    <dd>{d.remoteId ?? 'Aucun'}</dd>
                  </div>
                  <div>
                    <dt>Preuve réseau</dt>
                    <dd>
                      {d.networkReceipt ? (
                        isSafeHttpsUrl(d.networkReceipt) ? (
                          <a href={d.networkReceipt} target="_blank" rel="noopener noreferrer">
                            {d.networkReceipt}
                          </a>
                        ) : (
                          <code>{d.networkReceipt}</code>
                        )
                      ) : (
                        'Aucune : la publication n’est pas confirmée'
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Cause affichée</dt>
                    <dd>{d.reason ? reasonLabels[d.reason] ?? d.reason : 'Aucune'}</dd>
                  </div>
                  <div>
                    <dt>Clé du compte</dt>
                    <dd>
                      {d.connection.revoked
                        ? 'Compte dissocié'
                        : Date.parse(d.connection.expiresAt) <= Date.now()
                          ? 'Clé expirée à renouveler'
                          : 'Active jusqu’au ' + when(d.connection.expiresAt)}
                    </dd>
                  </div>
                </dl>
                <dl>
                  <div>
                    <dt>Opération d’envoi</dt>
                    <dd>
                      {d.submission
                        ? `${operationStates[d.submission.state] ?? d.submission.state} · plafond ${d.submission.maxCents} centime(s) USD · coût rapporté ${d.submission.reportedCents === null ? 'inconnu' : d.submission.reportedCents + ' centime(s) USD'} · empreinte ${d.submission.digest.slice(0, 16)}…`
                        : 'Aucune opération d’envoi'}
                    </dd>
                  </div>
                  <div>
                    <dt>Opération d’annulation</dt>
                    <dd>
                      {d.cancellation
                        ? `${operationStates[d.cancellation.state] ?? d.cancellation.state} · empreinte ${d.cancellation.digest.slice(0, 16)}…`
                        : 'Aucune opération d’annulation'}
                    </dd>
                  </div>
                </dl>
                <h3>Événements reçus par le relais</h3>
                {d.events.length ? (
                  <ol className="pub-events">
                    {d.events.map((event) => (
                      <li key={event.eventId}>
                        <time dateTime={event.createdAt}>{when(event.createdAt)}</time> · événement{' '}
                        {event.eventId}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="hint">Aucun événement de publication reçu pour cette demande.</p>
                )}
              </div>
            )}
          </article>
        );
      })}
      {!!info?.revisions.length && (
        <label>
          Création approuvée
          <select
            className="input"
            value={rev}
            onChange={(e) => {
              select(+e.target.value);
              choose('');
              confirm(undefined);
            }}
          >
            {info.revisions.map((r) => (
              <option key={r.revision} value={r.revision}>
                {r.platform} · v{r.revision}{r.kind ? ` · ${formatKind(r.kind)}` : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      {!!info?.revisions.length && (
        <label>
          Réseau destinataire
          <select
            className="input"
            value={target}
            onChange={(e) => {
              destination(e.target.value);
              view(undefined);
              confirm(undefined);
              choose('');
            }}
          >
            <option value="">Réseau de la création approuvée</option>
            {socialChannels.map((name) => (
              <option key={name} value={name}>
                {name === 'TikTok' ? 'TikTok (publication manuelle uniquement)' : name}
              </option>
            ))}
          </select>
        </label>
      )}
      {p?.issues.length ? (
        <div className="pub-warning" role="status">
          <strong>Préparation impossible pour le moment</strong>
          <ul>
            {p.issues.map((issue) => (
              <li key={issue}>{issueLabels[issue] ?? issue}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {p && p.revision === rev && (
        <>
          <h3>
            {p.platform} · {formatKind(p.kind)}
          </h3>
          <p className="hint">
            Création v{p.revision} pour le contenu v{p.itemVersion}
          </p>
          {p.platform !== p.sourcePlatform && (
            <p>
              La création et la légende approuvées pour {p.sourcePlatform} seront réutilisées. Vérifiez leur pertinence
              pour {p.platform}.
            </p>
          )}
          <dl className="pub-summary">
            <div>
              <dt>Réseau</dt>
              <dd>{p.platform}</dd>
            </div>
            <div>
              <dt>Format</dt>
              <dd>{formatKind(p.kind)}</dd>
            </div>
            <div>
              <dt>Date et heure prévues</dt>
              <dd>{when(p.when)}</dd>
            </div>
            <div>
              <dt>Programmation directe</dt>
              <dd>
                {p.directReason === 'platform_manual_only'
                  ? 'Non prise en charge sur ce réseau · publication manuelle uniquement'
                  : p.directReason === 'format_not_supported_for_direct'
                    ? `Format ${formatKind(p.kind)} non pris en charge en programmation directe · publication manuelle`
                    : !info?.directEnabled
                      ? 'Désactivée sur cet environnement (kit manuel disponible)'
                      : p.direct
                        ? 'Compatible'
                        : 'Non éligible · publication manuelle'}
              </dd>
            </div>
          </dl>
          <p style={{ whiteSpace: 'pre-wrap' }}>{p.caption}</p>
          <div>
            {p.keys.map((key, i) => {
              const url = `/api/projects/${p.projectId}/creative/${p.revision}/${key ? 'scenes/' + key : 'master'}`;
              return isVideoKind(p.kind) ? (
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
          {!p.issues.some((issue) => issue !== 'caption_too_long') && (
            <a href={`${base}/${rev}/package${query}`} download>
              Télécharger le kit manuel (médias + légende)
            </a>
          )}
          {expired.length > 0 && p.directReason !== 'platform_manual_only' && (
            <p className="pub-warning" role="status">
              {expired.length === 1 ? 'Un compte' : expired.length + ' comptes'} de ce réseau{' '}
              {expired.length === 1 ? 'a une clé expirée' : 'ont une clé expirée'} : renouvelez la clé dans la section
              « Comptes de publication » de cette page, puis actualisez les reçus. Aucun flux d’autorisation n’est
              déclenché automatiquement.
            </p>
          )}
          {p.direct && info?.scheduleAuthorized && !p.issues.length && (
            <>
              <label>
                Compte destinataire
                <select
                  className="input"
                  value={channel}
                  onChange={(e) => {
                    choose(e.target.value);
                    confirm(undefined);
                  }}
                >
                  <option value="">Choisir un compte connecté</option>
                  {eligible.map((c) => (
                    <option key={c.id} value={c.id}>
                      {accountLabel(c)}
                    </option>
                  ))}
                </select>
              </label>
              {selection && (
                <div className="pub-confirm">
                  <h3>Récapitulatif avant programmation</h3>
                  <dl>
                    <div>
                      <dt>Réseau</dt>
                      <dd>{p.platform}</dd>
                    </div>
                    <div>
                      <dt>Compte</dt>
                      <dd>
                        {accountLabel(selection)} · identifiant {selection.channel}
                      </dd>
                    </div>
                    <div>
                      <dt>Création approuvée</dt>
                      <dd>
                        v{rev} · contenu v{p.itemVersion}
                      </dd>
                    </div>
                    <div>
                      <dt>Date et heure prévues</dt>
                      <dd>{when(p.when)}</dd>
                    </div>
                  </dl>
                  <p className="hint">
                    Cette étape ne publie rien : elle prépare une demande et une autorisation à approuver explicitement.
                  </p>
                </div>
              )}
              <button
                type="button"
                className="btn btn-primary"
                disabled={!selection || busy || Date.parse(p.when) <= Date.now()}
                onClick={() =>
                  void action(async () =>
                    confirm({
                      ...(await postJson<Cmd>(`${base}/${rev}/prepare`, {
                        connectionId: channel,
                        target: p.platform
                      })),
                      label: `Autoriser la programmation v${rev} sur ${accountLabel(selection ?? { displayName: null, channel: '' })}`
                    })
                  )
                }
              >
                Préparer la programmation
              </button>
            </>
          )}
          {!p.direct &&
            (p.directReason === 'platform_manual_only' ? (
              <p className="hint">
                Réseau ou format en publication manuelle. {p.platform} ne prend pas en charge la programmation directe ;
                téléchargez le kit, puis publiez depuis le compte du réseau.
              </p>
            ) : p.directReason === 'format_not_supported_for_direct' ? (
              <p className="hint">
                Réseau ou format en publication manuelle. Le format « {formatKind(p.kind)} » n’est pas pris en charge en
                programmation directe sur {p.platform}
                {p.supportedScheduledKinds?.length
                  ? ` (formats pris en charge : ${p.supportedScheduledKinds.map(formatKind).join(', ')})`
                  : ''}. Téléchargez le kit, puis publiez depuis le compte du réseau.
              </p>
            ) : info?.directEnabled ? (
              <p className="hint">Réseau ou format en publication manuelle. Téléchargez le kit, puis publiez depuis le compte du réseau.</p>
            ) : (
              <p className="hint">Publication manuelle : la programmation directe est désactivée sur cet environnement.</p>
            ))}
          {p.direct && info?.scheduleAuthorized && !p.issues.length && !eligible.length && (
            <p>Aucun compte actif pour ce réseau. Associez un compte dans « Comptes de publication » ou utilisez le kit manuel.</p>
          )}
          {p.direct && info?.scheduleAuthorized && Date.parse(p.when) <= Date.now() && (
            <p>Choisissez une date future dans le calendrier ou utilisez le kit manuel.</p>
          )}
        </>
      )}
      {previewLoading && !p && rev > 0 && (
        <p role="status">Chargement de l’aperçu approuvé…</p>
      )}
      {cmd && (
        <section className="pub-authorize" aria-labelledby="pub-authorize-heading">
          <h3 id="pub-authorize-heading">
            {cmd.state === 'PROPOSED' ? 'Autorisation requise' : 'Opération déjà autorisée'}
          </h3>
          <p>
            {cmd.label} · état de l’opération : {operationStates[cmd.state] ?? cmd.state} · opération{' '}
            {cmd.operationId} · empreinte {cmd.digest.slice(0, 16)}…
          </p>
          {cmd.state === 'PROPOSED' ? (
            <p className="hint">
              Autorisez explicitement pour que le worker tente l’opération. La soumission reste refusée si le compte, la
              date ou le contenu ne sont plus valides.
            </p>
          ) : (
            <p className="hint">
              Cette opération est déjà enregistrée ({operationStates[cmd.state] ?? cmd.state}). Aucune seconde autorisation n’est nécessaire.
            </p>
          )}
          <div className="actions">
            {cmd.state === 'PROPOSED' && (
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void authorize()}>
                {cmd.label}
              </button>
            )}
            {['PROPOSED', 'QUEUED'].includes(cmd.state) && (
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    await postJson(`/api/execution/${encodeURIComponent(cmd.operationId)}/cancel`, {});
                    confirm(undefined);
                    say('Autorisation retirée. Aucune soumission ne partira pour cette demande.');
                    reload((n) => n + 1);
                  })
                }
              >
                Annuler l’autorisation
              </button>
            )}
          </div>
        </section>
      )}
      <details className="pub-guidance">
        <summary>Reprogrammer ou annuler en sécurité</summary>
        <ol>
          <li>Une soumission acceptée (état « Soumission acceptée ») n’est pas encore publiée : préparez son annulation puis autorisez-la.</li>
          <li>
            Pour changer l’heure ou le texte, modifiez la date et le contenu dans le calendrier : cela crée une nouvelle
            version du contenu et une ancienne création approuvée n’est plus compatible.
          </li>
          <li>Préparez ensuite une nouvelle demande depuis la création approuvée de cette version, puis autorisez-la explicitement.</li>
          <li>
            Un état « Issue inconnue » ou « en cours » ne doit pas être relancé : vérifiez chez Postiz, puis utilisez
            « Vérifier chez Postiz » avant toute nouvelle demande.
          </li>
        </ol>
      </details>
    </section>
  );
}
