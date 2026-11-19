'use client';
import { useState } from 'react';
import { postJson } from '../lib/api';
export type Ticket = {
  id: string;
  userId: string;
  kind: string;
  subject: string;
  status: string;
  entries: { id: string; role: string; message: string; status: string; createdAt: string }[];
};
export function ServiceCases({
  items,
  mode,
  reload,
}: {
  items: Ticket[];
  mode: 'customer' | 'support' | 'admin';
  reload: () => Promise<void>;
}) {
  const [error, fail] = useState(''),
    [busy, work] = useState(false);
  return (
    <section className="card stack">
      <h2>{mode === 'customer' ? 'Mes demandes' : 'Dossiers d’assistance'}</h2>
      {!items.length && <p>Aucun dossier.</p>}
      {items.map((t) => (
        <details key={t.id}>
          <summary>
            {t.subject} · {t.status}
          </summary>
          <p>
            Référence {t.id}
            {mode !== 'customer' && ' · Compte ' + t.userId}
          </p>
          <ol>
            {t.entries.map((e) => (
              <li key={e.id}>
                <strong>{e.role}</strong> · {new Date(e.createdAt).toLocaleString('fr-FR')} · {e.status}
                <p>{e.message}</p>
              </li>
            ))}
          </ol>
          {t.status !== 'CLOSED' && mode !== 'admin' && (
            <form
              className="stack"
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget,
                  f = new FormData(form);
                work(true);
                fail('');
                try {
                  await postJson(
                    (mode === 'support' ? '/api/support/cases/' : '/api/billing/tickets/') + t.id,
                    { expected: t.status, status: f.get('status'), message: f.get('message') },
                  );
                  form.reset();
                  await reload();
                } catch (x) {
                  fail((x as Error).message);
                } finally {
                  work(false);
                }
              }}
            >
              <label>
                Réponse
                <textarea name="message" minLength={2} maxLength={3000} required />
              </label>
              <label>
                État
                <select name="status" defaultValue={t.status}>
                  {[...new Set([t.status, ...(mode === 'support' ? ['IN_PROGRESS'] : []), 'CLOSED'])].map(
                    (s) => (
                      <option key={s}>{s}</option>
                    ),
                  )}
                </select>
              </label>
              <button disabled={busy}>Enregistrer</button>
            </form>
          )}
        </details>
      ))}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
