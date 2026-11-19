'use client';
import Link from 'next/link';
import { useState } from 'react';
import { postJson } from '../../lib/api';
import { LanguageControl, useWorkspace } from '../../components/WorkspacePreferences';
export default function Activate() {
  const { t } = useWorkspace(),
    [done, set] = useState(false),
    [busy, work] = useState(false),
    [error, fail] = useState(false);
  return (
    <main className="auth-page">
      <section className="auth-card stack">
        <LanguageControl />
        <h1>{t('Activer mon invitation', 'Activate my invitation')}</h1>
        {done ? (
          <p role="status">
            {t(
              'Compte activé. Connectez-vous avec votre adresse invitée.',
              'Account activated. Sign in with your invited email address.',
            )}
          </p>
        ) : (
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              work(true);
              fail(false);
              try {
                await postJson('/api/auth/activate', {
                  token: f.get('token'),
                  name: f.get('name'),
                  password: f.get('password'),
                });
                set(true);
              } catch {
                fail(true);
              } finally {
                work(false);
              }
            }}
          >
            <label>
              {t('Code d’invitation', 'Invitation code')}
              <input
                className="input"
                name="token"
                type="password"
                required
                minLength={16}
                maxLength={512}
                autoComplete="off"
              />
            </label>
            <label>
              {t('Nom', 'Name')}
              <input
                className="input"
                name="name"
                minLength={2}
                maxLength={120}
                required
                autoComplete="name"
              />
            </label>
            <label>
              {t('Nouveau mot de passe (8 caractères minimum)', 'New password (at least 8 characters)')}
              <input
                className="input"
                name="password"
                type="password"
                minLength={8}
                maxLength={200}
                required
                autoComplete="new-password"
              />
            </label>
            <button className="btn btn-primary" disabled={busy}>
              {t('Activer le compte', 'Activate account')}
            </button>
            {error && (
              <p role="alert">
                {t(
                  'Activation non confirmée. Vérifiez le code ou contactez la personne qui vous a invité.',
                  'Activation not confirmed. Check the code or contact the person who invited you.',
                )}
              </p>
            )}
          </form>
        )}
        <Link href="/login">{t('Se connecter', 'Sign in')}</Link>
      </section>
    </main>
  );
}
