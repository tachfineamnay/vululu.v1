'use client';

import { useState, type FormEvent } from 'react';
import ConfirmDialog from '../../../components/admin/ConfirmDialog';
import ErrorState from '../../../components/admin/ErrorState';
import { SelectField, TextField } from '../../../components/admin/Fields';
import LoadingState from '../../../components/admin/LoadingState';
import PageHeader from '../../../components/admin/PageHeader';
import Pagination from '../../../components/admin/Pagination';
import SectionCard from '../../../components/admin/SectionCard';
import StatusBadge from '../../../components/admin/StatusBadge';
import { useAdminResource } from '../../../components/admin/useAdminResource';
import {
  adminApi,
  copyText,
  errorMessage,
  formatDateTime,
  roleLabel,
  type AdminInvitation,
  type AdminUser
} from '../../../lib/admin';

type Tab = 'users' | 'invitations';

const ROLE_OPTIONS = [
  { value: 'user', label: 'Utilisateur' },
  { value: 'super_admin', label: 'Super administrateur' }
];

export default function AdminUsersPage() {
  const [tab, setTab] = useState<Tab>('users');

  return (
    <div className="admin-page">
      <PageHeader
        eyebrow="Administration"
        title="Utilisateurs"
        description="Comptes, sessions actives et invitations en cours."
      />
      <div className="admin-tabs" role="tablist" aria-label="Sections utilisateurs">
        <button
          type="button"
          role="tab"
          id="tab-users"
          aria-selected={tab === 'users'}
          aria-controls="panel-users"
          className={'admin-tab' + (tab === 'users' ? ' is-active' : '')}
          onClick={() => setTab('users')}
        >
          Utilisateurs
        </button>
        <button
          type="button"
          role="tab"
          id="tab-invitations"
          aria-selected={tab === 'invitations'}
          aria-controls="panel-invitations"
          className={'admin-tab' + (tab === 'invitations' ? ' is-active' : '')}
          onClick={() => setTab('invitations')}
        >
          Invitations
        </button>
      </div>
      <div role="tabpanel" id="panel-users" aria-labelledby="tab-users" hidden={tab !== 'users'}>
        {tab === 'users' ? <UsersPanel /> : null}
      </div>
      <div
        role="tabpanel"
        id="panel-invitations"
        aria-labelledby="tab-invitations"
        hidden={tab !== 'invitations'}
      >
        {tab === 'invitations' ? <InvitationsPanel /> : null}
      </div>
    </div>
  );
}

function UsersPanel() {
  const pageSize = 20;
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const resource = useAdminResource(
    () => adminApi.users({ page, pageSize, q: search.length > 0 ? search : undefined }),
    'users:' + search + ':' + page
  );
  const [revokeTarget, setRevokeTarget] = useState<AdminUser | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = searchDraft.trim();
    if (next === search) {
      if (page !== 1) {
        setPage(1);
      } else {
        resource.reload();
      }
      return;
    }
    setSearch(next);
    setPage(1);
  }

  function resetSearch() {
    setSearchDraft('');
    setSearch('');
    setPage(1);
  }

  async function confirmRevoke() {
    if (!revokeTarget) {
      return;
    }
    const target = revokeTarget;
    setActionBusy(true);
    setActionError('');
    try {
      const result = await adminApi.revokeUserSessions(target.id);
      setNotice(
        result.revokedSessions +
          ' session(s) revoquee(s) pour ' +
          target.email +
          '. L utilisateur devra se reconnecter.'
      );
      setRevokeTarget(null);
      resource.reload();
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setActionBusy(false);
    }
  }

  const data = resource.data;

  return (
    <div className="admin-sections">
      <SectionCard
        title="Comptes"
        description="Recherche par email ou nom, pagination serveur."
        actions={
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={resource.reload}
            disabled={resource.loading}
          >
            Actualiser
          </button>
        }
      >
        <form className="admin-controls" role="search" onSubmit={submitSearch}>
          <TextField
            id="users-search"
            label="Recherche"
            type="search"
            value={searchDraft}
            onChange={setSearchDraft}
            placeholder="Email ou nom"
            className="admin-control-grow"
          />
          <button type="submit" className="btn btn-primary">
            Rechercher
          </button>
          <button type="button" className="btn btn-ghost" onClick={resetSearch}>
            Reinitialiser
          </button>
        </form>

        {notice ? (
          <p className="admin-banner admin-banner--success" role="status">
            {notice}
          </p>
        ) : null}
        {actionError ? (
          <p className="admin-banner admin-banner--danger" role="alert">
            {actionError}
          </p>
        ) : null}

        {resource.loading && !data ? <LoadingState label="Chargement des utilisateurs..." /> : null}
        {resource.error ? <ErrorState message={resource.error} onRetry={resource.reload} /> : null}

        {data ? (
          data.items.length === 0 ? (
            <p className="admin-empty">Aucun utilisateur ne correspond a cette recherche.</p>
          ) : (
            <>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Nom</th>
                      <th>Role</th>
                      <th>Projets</th>
                      <th>Sessions</th>
                      <th>Derniere activite</th>
                      <th>Statut session</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((user) => (
                      <tr key={user.id}>
                        <td>{user.email}</td>
                        <td>{user.name}</td>
                        <td className="admin-nowrap">{roleLabel(user.role)}</td>
                        <td>{user.projectsCount}</td>
                        <td>{user.sessionsCount}</td>
                        <td className="admin-nowrap">{formatDateTime(user.lastSessionAt)}</td>
                        <td>
                          <StatusBadge status={user.lastSessionStatus} />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-danger btn-small"
                            onClick={() => {
                              setActionError('');
                              setNotice('');
                              setRevokeTarget(user);
                            }}
                          >
                            Revoquer les sessions
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={data.page}
                totalPages={data.totalPages}
                total={data.total}
                pageSize={data.pageSize}
                onPageChange={setPage}
                disabled={resource.loading}
              />
            </>
          )
        ) : null}
      </SectionCard>

      <ConfirmDialog
        open={revokeTarget !== null}
        title="Revoquer les sessions"
        message={
          revokeTarget
            ? 'Toutes les sessions de ' +
              revokeTarget.email +
              ' seront revoquees immediatement. Cette action est journalisee dans l audit.'
            : ''
        }
        confirmLabel="Revoquer les sessions"
        tone="danger"
        busy={actionBusy}
        onConfirm={() => void confirmRevoke()}
        onCancel={() => {
          if (!actionBusy) {
            setRevokeTarget(null);
          }
        }}
      />
    </div>
  );
}

function InvitationsPanel() {
  const pageSize = 15;
  const resource = useAdminResource(() => adminApi.invitations(), 'invitations');
  const [emailDraft, setEmailDraft] = useState('');
  const [roleDraft, setRoleDraft] = useState('user');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');
  const [created, setCreated] = useState<{ email: string; token: string } | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [revokeTarget, setRevokeTarget] = useState<AdminInvitation | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setFormError('');
    setCopyState('idle');
    try {
      const result = await adminApi.createInvitation({ email: emailDraft.trim(), role: roleDraft });
      setCreated({ email: result.invitation.email, token: result.token });
      setEmailDraft('');
      setNotice('Invitation creee pour ' + result.invitation.email + '.');
      resource.reload();
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setCreating(false);
    }
  }

  async function copyToken() {
    if (!created) {
      return;
    }
    const ok = await copyText(created.token);
    setCopyState(ok ? 'copied' : 'failed');
  }

  async function confirmRevoke() {
    if (!revokeTarget) {
      return;
    }
    const target = revokeTarget;
    setActionBusy(true);
    setActionError('');
    try {
      await adminApi.revokeInvitation(target.id);
      setNotice('Invitation revoquee pour ' + target.email + '.');
      setRevokeTarget(null);
      resource.reload();
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setActionBusy(false);
    }
  }

  const items = resource.data ? resource.data.items : [];
  const normalizedFilter = filter.trim().toLowerCase();
  const filtered = items.filter((invitation) => {
    if (normalizedFilter.length === 0) {
      return true;
    }
    return (
      invitation.email.toLowerCase().includes(normalizedFilter) ||
      invitation.role.toLowerCase().includes(normalizedFilter)
    );
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="admin-sections">
      <SectionCard title="Nouvelle invitation" description="Le jeton est genere et affiche une seule fois.">
        <form className="admin-controls" onSubmit={submitCreate}>
          <TextField
            id="invitation-email"
            label="Email"
            type="email"
            value={emailDraft}
            onChange={setEmailDraft}
            placeholder="prenom.nom@exemple.fr"
            required
            autoComplete="email"
            className="admin-control-grow"
          />
          <SelectField
            id="invitation-role"
            label="Role"
            value={roleDraft}
            onChange={setRoleDraft}
            options={ROLE_OPTIONS}
          />
          <button type="submit" className="btn btn-primary" disabled={creating}>
            {creating ? 'Creation...' : "Creer l'invitation"}
          </button>
        </form>

        {formError ? (
          <p className="admin-banner admin-banner--danger" role="alert">
            {formError}
          </p>
        ) : null}

        {created ? (
          <div className="admin-banner admin-banner--success" role="status">
            <div className="admin-token">
              <div>
                <strong>Jeton d invitation - affiche une seule fois</strong>
                <p className="admin-meta">
                  Transmettez ce jeton a {created.email}. Il ne sera plus jamais affiche par l API.
                </p>
                <code className="admin-token-value" data-testid="invitation-token">
                  {created.token}
                </code>
              </div>
              <div className="admin-actions">
                <button type="button" className="btn btn-secondary btn-small" onClick={() => void copyToken()}>
                  Copier le jeton
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  onClick={() => {
                    setCreated(null);
                    setCopyState('idle');
                  }}
                >
                  Masquer
                </button>
              </div>
              {copyState === 'copied' ? <span className="admin-meta">Jeton copie.</span> : null}
              {copyState === 'failed' ? (
                <span className="admin-meta" role="alert">
                  Copie impossible : selectionnez le jeton manuellement.
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Invitations"
        description="Toutes les invitations, filtrees et paginees localement."
        actions={
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={resource.reload}
            disabled={resource.loading}
          >
            Actualiser
          </button>
        }
      >
        <div className="admin-controls">
          <TextField
            id="invitations-filter"
            label="Filtrer"
            type="search"
            value={filter}
            onChange={(value) => {
              setFilter(value);
              setPage(1);
            }}
            placeholder="Email ou role"
            className="admin-control-grow"
          />
        </div>

        {notice ? (
          <p className="admin-banner admin-banner--success" role="status">
            {notice}
          </p>
        ) : null}
        {actionError ? (
          <p className="admin-banner admin-banner--danger" role="alert">
            {actionError}
          </p>
        ) : null}

        {resource.loading && !resource.data ? <LoadingState label="Chargement des invitations..." /> : null}
        {resource.error ? <ErrorState message={resource.error} onRetry={resource.reload} /> : null}

        {resource.data ? (
          filtered.length === 0 ? (
            <p className="admin-empty">Aucune invitation ne correspond a ce filtre.</p>
          ) : (
            <>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Creee le</th>
                      <th>Expire le</th>
                      <th>Statut</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((invitation) => {
                      const status = invitationStatus(invitation);
                      return (
                        <tr key={invitation.id}>
                          <td>{invitation.email}</td>
                          <td className="admin-nowrap">{roleLabel(invitation.role)}</td>
                          <td className="admin-nowrap">{formatDateTime(invitation.createdAt)}</td>
                          <td className="admin-nowrap">{formatDateTime(invitation.expiresAt)}</td>
                          <td>
                            <StatusBadge status={status.status} label={status.label} />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-danger btn-small"
                              disabled={invitation.revokedAt !== null || invitation.usedAt !== null}
                              onClick={() => {
                                setActionError('');
                                setNotice('');
                                setRevokeTarget(invitation);
                              }}
                            >
                              Revoquer
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={currentPage}
                totalPages={totalPages}
                total={filtered.length}
                pageSize={pageSize}
                onPageChange={setPage}
                disabled={resource.loading}
              />
            </>
          )
        ) : null}
      </SectionCard>

      <ConfirmDialog
        open={revokeTarget !== null}
        title="Revoquer l'invitation"
        message={
          revokeTarget
            ? "L invitation de " +
              revokeTarget.email +
              ' ne pourra plus etre activee. La revocation est journalisee dans l audit.'
            : ''
        }
        confirmLabel="Revoquer"
        tone="danger"
        busy={actionBusy}
        onConfirm={() => void confirmRevoke()}
        onCancel={() => {
          if (!actionBusy) {
            setRevokeTarget(null);
          }
        }}
      />
    </div>
  );
}

function invitationStatus(invitation: AdminInvitation): { status: string; label: string } {
  if (invitation.revokedAt) {
    return { status: 'revoked', label: 'Revoquee' };
  }
  if (invitation.usedAt) {
    return { status: 'used', label: 'Utilisee' };
  }
  if (new Date(invitation.expiresAt).getTime() <= Date.now()) {
    return { status: 'expired', label: 'Expiree' };
  }
  return { status: 'active', label: 'Active' };
}
