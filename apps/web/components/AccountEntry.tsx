'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { postJson } from '../lib/api';
import { LanguageControl, useWorkspace } from './WorkspacePreferences';

export type AccountEntryMode = 'register' | 'resend-verification' | 'verify-email' | 'forgot-password' | 'reset-password';

export function AccountEntry({ mode }: { mode: AccountEntryMode }) {
  const { t } = useWorkspace();
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const verify = mode === 'verify-email';
  const reset = mode === 'reset-password';
  const claim = verify || reset;
  const recovery = mode === 'forgot-password' || reset;
  const requestLink = recovery ? '/forgot-password' : '/resend-verification';
  const headings = {
    register: t('Créer votre compte', 'Create your account'),
    'resend-verification': t('Renvoyer le lien de vérification', 'Resend verification link'),
    'verify-email': t('Terminer votre inscription', 'Finish setting up your account'),
    'forgot-password': t('Retrouver votre accès', 'Recover your account'),
    'reset-password': t('Choisir un nouveau mot de passe', 'Choose a new password')
  };
  useEffect(() => {
    setReady(true);
    if (!claim) return;
    // Keep the fragment for reloads; never copy it into a query, referrer or browser storage.
    function readLink() {
      const value = new URLSearchParams(window.location.hash.slice(1)).get('token');
      setToken(value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : '');
      setNote(''); setError('');
    }
    readLink();
    window.addEventListener('hashchange', readLink);
    return () => window.removeEventListener('hashchange', readLink);
  }, [claim]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get('password') ?? '');
    setNote(''); setError('');
    if (claim && (password !== data.get('confirmation') || new TextEncoder().encode(password).length > 72)) {
      setError(t('Les mots de passe doivent correspondre et ne pas dépasser 72 octets.', 'Passwords must match and be no longer than 72 bytes.'));
      return;
    }
    setBusy(true);
    try {
      await postJson(`/api/auth/${mode}`, claim ? { token, password, ...(verify ? { name: data.get('name') } : {}) } : { email: data.get('email') });
      if (claim) {
        window.history.replaceState(null, '', window.location.pathname);
        setNote(verify ? t('Adresse vérifiée. Connectez-vous pour configurer votre activité.', 'Email verified. Sign in to set up your business.') : t('Mot de passe modifié. Les anciennes sessions sont déconnectées.', 'Password changed. Previous sessions have been signed out.'));
      } else {
        setNote(t('Si cette adresse est éligible, vous recevrez un lien. Vérifiez aussi vos courriers indésirables.', 'If this address is eligible, you’ll receive a link. Check your spam folder too.'));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('La demande a échoué. Réessayez.', 'The request failed. Try again.'));
    } finally { setBusy(false); }
  }
  return <main className="auth-page account-entry" data-vululu-theme="blue">
    <section className="auth-card stack" aria-labelledby="account-entry-heading">
      <LanguageControl />
      <p className="eyebrow">Vululu · {t('Mon compte', 'My account')}</p>
      <h1 id="account-entry-heading">{headings[mode]}</h1>
      {note ? <p role="status">{note}</p> : null}
      {!claim && !note && <p className="muted">{recovery
        ? t('Saisissez votre adresse email pour demander un lien de réinitialisation.', 'Enter your email address to request a reset link.')
        : t('Vérifiez votre adresse email, puis choisissez votre mot de passe.', 'Verify your email address, then choose your password.')}</p>}
      {claim && !note && token === null && <p role="status">{t('Chargement du lien…', 'Loading link…')}</p>}
      {claim && !note && token === '' && <p className="error" role="alert">{t('Ouvrez le lien contenu dans votre email ou demandez un nouveau lien.', 'Open the link in your email or request a new one.')}</p>}
      {((!claim && !note) || (claim && token && !note)) && <form key={token ?? mode} className="stack" method="post" onSubmit={submit} aria-busy={busy}>
        {!claim && <label className="label">Email<input className="input" name="email" type="email" autoComplete="email" disabled={!ready || busy} maxLength={254} required /></label>}
        {verify && <label className="label">{t('Votre nom', 'Your name')}<input className="input" name="name" autoComplete="name" minLength={2} maxLength={120} required /></label>}
        {claim && <>
          <label className="label">{t('Nouveau mot de passe', 'New password')}<input className="input" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={72} aria-describedby="account-password-help" required /></label>
          <p className="hint" id="account-password-help">{t('Au moins 12 caractères, au maximum 72 octets.', 'At least 12 characters and no more than 72 bytes.')}</p>
          <label className="label">{t('Confirmer le mot de passe', 'Confirm password')}<input className="input" name="confirmation" type="password" autoComplete="new-password" required /></label>
        </>}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary" disabled={!ready || busy}>{busy ? t('Veuillez patienter…', 'Please wait…') : claim ? t('Enregistrer le mot de passe', 'Save password') : t('Envoyer le lien', 'Send link')}</button>
      </form>}
      {!claim && note && mode === requestLink.slice(1) && <button type="button" className="btn btn-secondary" onClick={() => setNote('')}>{t('Faire une autre demande', 'Make another request')}</button>}
      <div className="account-links">
        <Link href="/login" className={claim && note ? 'btn btn-primary' : 'text-link'}>{t('Se connecter', 'Sign in')}</Link>
        {mode !== requestLink.slice(1) && !(claim && note) && <Link className="text-link" href={requestLink}>{t('Demander un nouveau lien', 'Request a new link')}</Link>}
        {mode === 'register' && <Link className="text-link" href="/terms">{t('Conditions', 'Terms')}</Link>}
      </div>
    </section>
  </main>;
}
