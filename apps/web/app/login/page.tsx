'use client';

import Link from 'next/link';
import {LanguageControl,useWorkspace} from '../../components/WorkspacePreferences';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJson, SessionUser } from '../../lib/api';

/**
 * Accepte uniquement un chemin interne (commence par / sans // ni /\\).
 * Evite toute redirection ouverte via le parametre next.
 */
function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/';
  }
  if (value.charAt(1) === '\\') {
    return '/';
  }
  return value;
}

export default function LoginPage() {
  const {t}=useWorkspace();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await postJson<{ user: SessionUser }>('/api/auth/login', { email, password });
      const next = new URLSearchParams(window.location.search).get('next');
      router.push(safeNextPath(next));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connexion impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-orb" />
      <section className="auth-card"><LanguageControl/>
        <div className="brand-mark">V</div>
        <p className="eyebrow">{t('Studio créatif','Creative studio')}</p>
        <h1>Vululu AI</h1>
        <p className="muted">{t('Un espace de création, de la marque au master validé.','A workspace from business profile to approved master.')}</p>
        <form onSubmit={submit} className="stack">
          <label className="label">
            Email
            <input
              className="input"
              data-testid="login-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label className="label">
            {t('Mot de passe','Password')}
            <input
              className="input"
              data-testid="login-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {error ? <p role="alert" className="error" data-testid="login-error">{error}</p> : null}
          <button className="btn btn-primary" data-testid="login-submit" type="submit" disabled={busy}>
            {busy ? t('Connexion…','Signing in…') : t('Entrer dans le studio','Sign in')}
          </button>
        </form>
        <p className="hint">
          <Link href="/activate">{t('Activer une invitation','Activate an invitation')}</Link> · <Link href="/catalog">{t('Guide','Guide')}</Link> · <Link href="/terms">{t('Conditions','Terms')}</Link>
        </p>
      </section>
    </main>
  );
}
