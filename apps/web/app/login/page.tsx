'use client';

import Link from 'next/link';
import {LanguageControl,useWorkspace} from '../../components/WorkspacePreferences';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJson, SessionUser } from '../../lib/api';

/** Only accept a same-origin path, before passing it into Next navigation. */
function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
  try {
    const target = new URL(value, window.location.origin);
    return target.origin === window.location.origin && !target.pathname.startsWith('//')
      ? target.pathname + target.search + target.hash : '/';
  } catch { return '/'; }
}

export default function LoginPage() {
  const {t}=useWorkspace();
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const result = await postJson<{ user: SessionUser; needsBusinessProfile?: boolean }>('/api/auth/login', { email: data.get('email'), password: data.get('password') });
      const next = new URLSearchParams(window.location.search).get('next');
      router.push(!next && result.needsBusinessProfile ? '/contexts/new?onboarding=1' : safeNextPath(next));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connexion impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page account-entry" data-vululu-theme="blue">
      <section className="auth-card stack"><LanguageControl/>
        <div className="brand-mark">V</div>
        <p className="eyebrow">{t('Studio créatif','Creative studio')}</p>
        <h1>Vululu AI</h1>
        <p className="muted">{t('Un espace de création, de la marque au master validé.','A workspace from business profile to approved master.')}</p>
        <form method="post" onSubmit={submit} className="stack">
          <label className="label">
            Email
            <input
              className="input"
              data-testid="login-email"
              type="email"
              name="email"
              autoComplete="email"
              disabled={!ready || busy}
              required
            />
          </label>
          <label className="label">
            {t('Mot de passe','Password')}
            <input
              className="input"
              data-testid="login-password"
              type="password"
              name="password"
              autoComplete="current-password"
              disabled={!ready || busy}
              required
            />
          </label>
          {error ? <p role="alert" className="error" data-testid="login-error">{error}</p> : null}
          <button className="btn btn-primary" data-testid="login-submit" type="submit" disabled={!ready || busy}>
            {busy ? t('Connexion…','Signing in…') : t('Entrer dans le studio','Sign in')}
          </button>
        </form>
        <div className="account-links">
          <Link href="/register">{t('Créer un compte', 'Create an account')}</Link>
          <Link href="/forgot-password">{t('Mot de passe oublié ?', 'Forgot your password?')}</Link>
          <Link href="/resend-verification">{t('Renvoyer le lien de vérification', 'Resend verification link')}</Link>
        </div>
        <p className="hint">
          <Link href="/activate">{t('Activer une invitation','Activate an invitation')}</Link> · <Link href="/catalog">{t('Guide','Guide')}</Link> · <Link href="/terms">{t('Conditions','Terms')}</Link>
        </p>
      </section>
    </main>
  );
}
