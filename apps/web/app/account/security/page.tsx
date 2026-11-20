'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import StudioNav from '../../../components/StudioNav';
import { useWorkspace } from '../../../components/WorkspacePreferences';
import { ApiRequestError, api, patchJson, postJson, type SessionUser } from '../../../lib/api';

export default function AccountSecurity() {
  const { t } = useWorkspace();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser>();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const feedback = useRef<HTMLDivElement>(null);
  useEffect(() => { if (error || note) feedback.current?.focus(); }, [error, note]);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    void api<{ user: SessionUser }>('/api/auth/me').then(({ user }) => {
      if (active) { setUser(user); setName(user.name); }
    }).catch((e: Error) => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);

  async function action(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(''); setNote('');
    try { await fn(); }
    catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) setUser(undefined);
      setError(e instanceof Error ? e.message : t('Action impossible.', 'Action failed.'));
    }
    finally { setBusy(false); }
  }
  function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void action(async () => {
      const result = await patchJson<{ user: SessionUser }>('/api/auth/profile', { name });
      setUser(result.user); setName(result.user.name);
      setNote(t('Votre profil a été enregistré.', 'Your profile was saved.'));
    });
  }
  function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const password = String(fields.get('password'));
    void action(async () => {
      if (password !== fields.get('confirmation') || new TextEncoder().encode(password).length > 72) {
        throw new Error(t('Les mots de passe doivent correspondre et ne pas dépasser 72 octets.', 'Passwords must match and be no longer than 72 bytes.'));
      }
      await postJson('/api/auth/change-password', { currentPassword: fields.get('currentPassword'), password });
      form.reset();
      setNote(t('Mot de passe modifié. Les autres appareils ont été déconnectés.', 'Password changed. Other devices have been signed out.'));
    });
  }
  function logout(path: string) {
    void action(async () => {
      const result = await postJson<{ revokedSessions?: number }>('/api/auth/' + path, {});
      if (path !== 'logout-others') router.replace('/login');
      else setNote(result.revokedSessions
        ? t('Les autres appareils ont été déconnectés.', 'Other devices have been signed out.')
        : t('Aucune autre session à fermer.', 'No other sessions to close.'));
    });
  }
  return <div className="shell" data-vululu-theme="blue">
    <StudioNav><Link href="/account">{t('Retour à mon compte', 'Back to my account')}</Link></StudioNav>
    <main className="page narrow stack">
      <p className="eyebrow">{t('Mon compte', 'My account')}</p>
      <h1>{t('Profil et sécurité', 'Profile and security')}</h1>
      {loading && <p role="status">{t('Chargement du compte…', 'Loading your account…')}</p>}
      {(error || note) && <div ref={feedback} tabIndex={-1}>
        {error ? <p className="error" role="alert">{error}</p> : <p role="status">{note}</p>}
      </div>}
      {!loading && !user && <div className="account-links">
        <Link className="btn btn-primary" href="/login?next=/account/security">{t('Se connecter', 'Sign in')}</Link>
        <button className="btn btn-secondary" onClick={() => setRetry((n) => n + 1)}>{t('Réessayer', 'Retry')}</button>
      </div>}
      {user && <>
        <form className="card stack" onSubmit={saveProfile} aria-busy={busy}>
          <h2>{t('Votre profil', 'Your profile')}</h2>
          <p className="account-email">Email : {user.email}</p>
          <label className="label">{t('Votre nom', 'Your name')}<input className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={120} required /></label>
          <button className="btn btn-primary" disabled={busy || name.trim() === user.name}>{t('Enregistrer le profil', 'Save profile')}</button>
        </form>
        <form className="card stack" onSubmit={savePassword} aria-busy={busy}>
          <h2>{t('Modifier le mot de passe', 'Change password')}</h2>
          <label className="label">{t('Mot de passe actuel', 'Current password')}<input className="input" name="currentPassword" type="password" autoComplete="current-password" required /></label>
          <label className="label">{t('Nouveau mot de passe', 'New password')}<input className="input" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={72} required /></label>
          <label className="label">{t('Confirmer le mot de passe', 'Confirm password')}<input className="input" name="confirmation" type="password" autoComplete="new-password" required /></label>
          <p className="hint">{t('Au moins 12 caractères, au maximum 72 octets. Les autres appareils seront déconnectés.', 'At least 12 characters and no more than 72 bytes. Other devices will be signed out.')}</p>
          <button className="btn btn-primary" disabled={busy}>{t('Enregistrer le mot de passe', 'Save password')}</button>
        </form>
        <section className="card stack" aria-labelledby="session-heading">
          <h2 id="session-heading">{t('Sessions', 'Sessions')}</h2>
          <p className="muted">{t('Fermez les sessions des autres appareils sans vous déconnecter ici, ou fermez toutes les sessions.', 'Sign out other devices without leaving this one, or sign out everywhere.')}</p>
          <div className="account-links">
            <button className="btn btn-secondary" disabled={busy} onClick={() => logout('logout-others')}>{t('Déconnecter les autres appareils', 'Sign out other devices')}</button>
            <button className="btn btn-secondary" disabled={busy} onClick={() => logout('logout-all')}>{t('Déconnecter tous les appareils', 'Sign out all devices')}</button>
            <button className="btn btn-secondary" disabled={busy} onClick={() => logout('logout')}>{t('Me déconnecter ici', 'Sign out here')}</button>
          </div>
        </section>
      </>}
    </main>
  </div>;
}
