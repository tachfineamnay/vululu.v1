'use client';

import { useEffect, useState } from 'react';
import ConfirmDialog from '../../../components/admin/ConfirmDialog';
import ErrorState from '../../../components/admin/ErrorState';
import LoadingState from '../../../components/admin/LoadingState';
import SectionCard from '../../../components/admin/SectionCard';
import { SelectField } from '../../../components/admin/Fields';
import StatusBadge from '../../../components/admin/StatusBadge';
import { useAdminResource } from '../../../components/admin/useAdminResource';
import {
  adminApi,
  errorMessage,
  formatDateTime,
  formatNumber,
  roleLabel,
  shortId,
  userStatusLabel,
  type AdminUserStatus
} from '../../../lib/admin';

const ROLE_OPTIONS = [
  { value: 'user', label: 'Utilisateur' },
  { value: 'support', label: 'Assistance (sans administration)' },
  { value: 'super_admin', label: 'Super administrateur' }
];

type PendingAction =
  | { kind: 'role'; role: string }
  | { kind: 'suspend' }
  | { kind: 'reactivate' }
  | null;

/**
 * Fiche utilisateur : compteurs bornes, audit recent et actions reelles
 * (changement de role, suspension, reactivation) avec confirmation.
 * Aucun secret n est affiche : ni hash de mot de passe, ni jeton de session,
 * ni identifiant fournisseur.
 */
export default function UserDetailPanel(input: {
  userId: string;
  currentUserId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const resource = useAdminResource(() => adminApi.user(input.userId), 'user:' + input.userId);
  const detail = resource.data;
  const [roleDraft, setRoleDraft] = useState('');
  const [pending, setPending] = useState<PendingAction>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (detail) {
      setRoleDraft(detail.role);
    }
  }, [detail?.id, detail?.role]);

  const isSelf = input.currentUserId !== null && input.currentUserId === input.userId;
  const roleDirty = detail !== null && roleDraft.length > 0 && roleDraft !== detail.role;

  async function applyMutation(
    body: { role?: string; status?: AdminUserStatus },
    successMessage: (result: Awaited<ReturnType<typeof adminApi.updateUser>>) => string
  ) {
    setBusy(true);
    setError('');
    try {
      const result = await adminApi.updateUser(input.userId, body);
      setPending(null);
      setNotice(successMessage(result));
      resource.reload();
      input.onChanged();
    } catch (mutationError) {
      setPending(null);
      setError(errorMessage(mutationError));
    } finally {
      setBusy(false);
    }
  }

  function confirmPending() {
    if (!pending || busy) {
      return;
    }
    if (pending.kind === 'role') {
      void applyMutation({ role: pending.role }, (result) =>
        'Role mis a jour pour ' +
        result.user.email +
        ' : ' +
        roleLabel(result.user.role) +
        '. ' +
        formatNumber(result.revokedSessions) +
        ' session(s) revoquee(s).'
      );
      return;
    }
    if (pending.kind === 'suspend') {
      void applyMutation({ status: 'suspended' }, (result) =>
        'Compte ' +
        result.user.email +
        ' suspendu. ' +
        formatNumber(result.revokedSessions) +
        ' session(s) revoquee(s) ; la connexion est refusee jusqu a reactivation.'
      );
      return;
    }
    void applyMutation({ status: 'active' }, (result) =>
      'Compte ' + result.user.email + ' reactive. L utilisateur peut se reconnecter.'
    );
  }

  const publicationCounts = detail
    ? Object.entries(detail.counts.publicationRequests)
        .map(([state, count]) => state + ' : ' + formatNumber(count))
        .join(' - ')
    : '';

  return (
    <div>
      <SectionCard
        title="Fiche utilisateur"
        description="Compteurs du compte, audit recent et actions d administration."
        actions={
          <button type="button" className="btn btn-ghost btn-small" onClick={input.onClose}>
            Fermer la fiche
          </button>
        }
      >
        {resource.loading && !detail ? <LoadingState label="Chargement de la fiche utilisateur..." /> : null}
        {resource.error ? <ErrorState message={resource.error} onRetry={resource.reload} /> : null}

        {detail ? (
          <div className="admin-sections">
            {notice ? (
              <p className="admin-banner admin-banner--success" role="status">
                {notice}
              </p>
            ) : null}
            {error ? (
              <p className="admin-banner admin-banner--danger" role="alert">
                {error}
              </p>
            ) : null}
            {isSelf ? (
              <p className="admin-banner admin-banner--warn" role="status">
                <strong>Votre propre compte.</strong>
                <span>
                  Le role et le statut de votre compte ne peuvent pas etre modifies depuis cette fiche.
                </span>
              </p>
            ) : null}

            <div className="admin-kv">
              <div>
                <span>Email</span>
                <strong>{detail.email}</strong>
              </div>
              <div>
                <span>Nom</span>
                <strong>{detail.name}</strong>
              </div>
              <div>
                <span>Role</span>
                <strong>{roleLabel(detail.role)}</strong>
              </div>
              <div>
                <span>Statut du compte</span>
                <strong>
                  <StatusBadge status={detail.status} label={userStatusLabel(detail.status)} />
                </strong>
              </div>
              <div>
                <span>Compte cree le</span>
                <strong>{formatDateTime(detail.createdAt)}</strong>
              </div>
              <div>
                <span>Suspendu le</span>
                <strong>{detail.suspendedAt ? formatDateTime(detail.suspendedAt) : 'Non suspendu'}</strong>
              </div>
              <div>
                <span>Derniere session</span>
                <strong>{formatDateTime(detail.lastSessionAt)}</strong>
              </div>
              <div>
                <span>Statut de la derniere session</span>
                <strong>
                  <StatusBadge status={detail.lastSessionStatus} />
                </strong>
              </div>
            </div>

            <div className="admin-kv">
              <div>
                <span>Contextes de marque</span>
                <strong>{formatNumber(detail.counts.contexts)}</strong>
              </div>
              <div>
                <span>Projets</span>
                <strong>{formatNumber(detail.counts.projects)}</strong>
              </div>
              <div>
                <span>Contenus editoriaux</span>
                <strong>{formatNumber(detail.counts.contentItems)}</strong>
              </div>
              <div>
                <span>Sessions totales</span>
                <strong>{formatNumber(detail.counts.sessions)}</strong>
              </div>
              <div>
                <span>Sessions actives</span>
                <strong>{formatNumber(detail.counts.activeSessions)}</strong>
              </div>
              <div>
                <span>Demandes de publication par etat</span>
                <strong>{publicationCounts.length > 0 ? publicationCounts : 'Aucune'}</strong>
              </div>
            </div>

            <div className="admin-controls">
              <SelectField
                id="detail-role"
                label="Role du compte"
                value={roleDraft}
                onChange={setRoleDraft}
                options={ROLE_OPTIONS}
                disabled={isSelf || busy}
                className="admin-control-grow"
              />
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!roleDirty || isSelf || busy}
                onClick={() => {
                  setError('');
                  setNotice('');
                  setPending({ kind: 'role', role: roleDraft });
                }}
              >
                Changer le role
              </button>
              {detail.status === 'active' ? (
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={isSelf || busy}
                  onClick={() => {
                    setError('');
                    setNotice('');
                    setPending({ kind: 'suspend' });
                  }}
                >
                  Suspendre le compte
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={isSelf || busy}
                  onClick={() => {
                    setError('');
                    setNotice('');
                    setPending({ kind: 'reactivate' });
                  }}
                >
                  Reactiver le compte
                </button>
              )}
            </div>
            <p className="admin-meta">
              Un changement de role ou une suspension revoque immediatement toutes les sessions actives du compte.
              Chaque action est journalisee dans l audit avec l acteur et les valeurs avant/apres.
            </p>

            <h3>Audit recent</h3>
            {detail.recentAuditEvents.length === 0 ? (
              <p className="admin-empty">Aucun evenement d audit pour ce compte.</p>
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <caption className="admin-meta">
                    {formatNumber(detail.recentAuditEvents.length)} evenement(s) affiche(s) sur{' '}
                    {formatNumber(detail.auditEventsTotal)} - limite serveur de 20.
                  </caption>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Action</th>
                      <th>Acteur</th>
                      <th>Cible</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.recentAuditEvents.map((event) => (
                      <tr key={event.id}>
                        <td className="admin-nowrap">{formatDateTime(event.createdAt)}</td>
                        <td className="admin-mono">{event.action}</td>
                        <td className="admin-mono">{event.actorId ? shortId(event.actorId) : '-'}</td>
                        <td className="admin-mono">
                          {event.targetType}
                          {event.targetId ? ' - ' + shortId(event.targetId) : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}
      </SectionCard>

      <ConfirmDialog
        open={pending !== null}
        title={
          pending?.kind === 'role'
            ? 'Changer le role'
            : pending?.kind === 'suspend'
              ? 'Suspendre le compte'
              : 'Reactiver le compte'
        }
        message={
          detail && pending
            ? pending.kind === 'role'
              ? 'Le role de ' +
                detail.email +
                ' passera de ' +
                roleLabel(detail.role) +
                ' a ' +
                roleLabel(pending.role) +
                '. Toutes ses sessions actives seront revoquees immediatement. Action journalisee.'
              : pending.kind === 'suspend'
                ? 'Le compte de ' +
                  detail.email +
                  ' sera suspendu : ses sessions actives sont revoquees immediatement, sa connexion sera refusee et son statut sera visible dans la liste. Action journalisee.'
                : 'Le compte de ' +
                  detail.email +
                  ' sera reactive. L utilisateur pourra se reconnecter avec son mot de passe. Action journalisee.'
            : ''
        }
        confirmLabel={
          pending?.kind === 'role'
            ? 'Changer le role'
            : pending?.kind === 'suspend'
              ? 'Suspendre'
              : 'Reactiver'
        }
        tone={pending?.kind === 'suspend' ? 'danger' : 'primary'}
        busy={busy}
        onConfirm={confirmPending}
        onCancel={() => {
          if (!busy) {
            setPending(null);
          }
        }}
      />
    </div>
  );
}
