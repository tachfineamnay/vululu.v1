'use client';

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
      <section className="auth-card">
        <div className="brand-mark">V</div>
        <p className="eyebrow">Studio creatif agentique</p>
        <h1>Vululu AI</h1>
        <p className="muted">Un espace de création, de la marque au master validé.</p>
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
            Mot de passe
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
          {error ? <p className="error" data-testid="login-error">{error}</p> : null}
          <button className="btn btn-primary" data-testid="login-submit" type="submit" disabled={busy}>
            {busy ? 'Connexion...' : 'Entrer dans le studio'}
          </button>
        </form>
        <p className="hint">
          Accès sur invitation. Utilise les identifiants transmis par ton administrateur.
        </p>
      </section>
    </main>
  );
}
