'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJson, SessionUser } from '../../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('demo@vululu.local');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await postJson<{ user: SessionUser }>('/api/auth/login', { email, password });
      router.push('/');
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
        <p className="muted">Ton interlocutrice unique pour transformer une marque en contenus prets a publier.</p>
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
          Compte demo local : demo@vululu.local. Mot de passe defini dans .env via V0_DEMO_PASSWORD.
        </p>
      </section>
    </main>
  );
}
