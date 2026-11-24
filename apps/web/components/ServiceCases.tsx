'use client';
import { useState } from 'react';
import { postJson } from '../lib/api';

export type TicketEntry = {
  id: string;
  role: string;
  message: string;
  status: string;
  createdAt: string;
};
export type TicketUser = { email: string; name?: string | null; status: string };
export type Ticket = {
  id: string;
  userId: string;
  kind: string;
  subject: string;
  status: string;
  entries: TicketEntry[];
  createdAt?: string;
  updatedAt?: string;
  user?: TicketUser | null;
  entriesCount?: number;
  entriesTruncated?: boolean;
  lastEntryRole?: string | null;
  lastEntryAt?: string | null;
};

/** P11-E — état lisible dérivé des données réelles (aucun compteur de non-lu inventé). */
export type TicketState = 'open' | 'awaiting_support' | 'answered' | 'in_progress' | 'closed';

export const TICKET_STATE_LABELS: Record<TicketState, string> = {
  open: 'Ouvert',
  awaiting_support: 'En attente d’assistance',
  answered: 'Répondu',
  in_progress: 'En cours',
  closed: 'Clôturé'
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Ouvert',
  IN_PROGRESS: 'En cours',
  CLOSED: 'Clôturé'
};

const ROLE_LABELS: Record<string, string> = {
  customer: 'Client',
  support: 'Assistance',
  admin: 'Administration'
};

// BETA01 : libellé de tri, pour distinguer un retour de bêta d'un incident de facturation.
const KIND_LABELS: Record<string, string> = {
  SUPPORT: 'Assistance',
  BETA_FEEDBACK: 'Retour bêta',
  ERASURE: 'Effacement'
};

export function ticketState(ticket: Ticket): TicketState {
  if (ticket.status === 'CLOSED') return 'closed';
  if (ticket.status === 'IN_PROGRESS') return 'in_progress';
  const lastRole =
    ticket.lastEntryRole ??
    (ticket.entries.length > 0 ? ticket.entries[ticket.entries.length - 1].role : null);
  if (lastRole === 'customer') return 'awaiting_support';
  if (lastRole === 'support' || lastRole === 'admin') return 'answered';
  return 'open';
}

function lastActivity(ticket: Ticket): string | null {
  if (ticket.lastEntryAt) return ticket.lastEntryAt;
  if (ticket.updatedAt) return ticket.updatedAt;
  const last = ticket.entries[ticket.entries.length - 1];
  return last ? last.createdAt : null;
}

function replyStatuses(ticket: Ticket, mode: 'customer' | 'support' | 'admin'): string[] {
  if (mode === 'customer') return [...new Set([ticket.status, 'CLOSED'])];
  return [...new Set([ticket.status, 'IN_PROGRESS', 'CLOSED'])];
}

export function ServiceCases({
  items,
  mode,
  reload
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
      {mode !== 'customer' ? (
        <p className="muted">
          File partagée : aucune assignation nominative n’est modélisée. Les transitions d’état et les réponses
          sont horodatées dans l’historique du dossier.
        </p>
      ) : null}
      {!items.length && <p>Aucun dossier.</p>}
      {items.map((t) => {
        const state = ticketState(t);
        const activity = lastActivity(t);
        return (
          <details key={t.id} open={mode === 'customer' && state === 'answered'}>
            <summary>
              {mode !== 'customer' && KIND_LABELS[t.kind] ? KIND_LABELS[t.kind] + ' · ' : ''}
              {t.subject} · <strong>{TICKET_STATE_LABELS[state]}</strong>
              {activity ? ' · ' + new Date(activity).toLocaleString('fr-FR') : ''}
            </summary>
            <p>
              Référence {t.id} · état technique {t.status}
              {mode !== 'customer' && t.user
                ? ' · Compte ' +
                  t.user.email +
                  (t.user.name ? ' (' + t.user.name + ')' : '') +
                  (t.user.status === 'suspended' ? ' · suspendu' : '')
                : mode !== 'customer'
                  ? ' · Compte ' + t.userId
                  : ''}
            </p>
            {t.entriesTruncated && typeof t.entriesCount === 'number' ? (
              <p className="muted">
                Affichage des {t.entries.length} messages les plus récents sur {t.entriesCount}.
              </p>
            ) : null}
            <ol>
              {t.entries.map((e) => (
                <li key={e.id}>
                  <strong>{ROLE_LABELS[e.role] ?? e.role}</strong> ·{' '}
                  {new Date(e.createdAt).toLocaleString('fr-FR')} · {STATUS_LABELS[e.status] ?? e.status}
                  <p>{e.message}</p>
                </li>
              ))}
            </ol>
            {t.status !== 'CLOSED' && mode !== 'admin' && (
              <form
                key={t.id + ':' + t.status}
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
                      { expected: t.status, status: f.get('status'), message: f.get('message') }
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
                  État après réponse
                  <select name="status" defaultValue={t.status}>
                    {replyStatuses(t, mode).map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s] ?? s}
                      </option>
                    ))}
                  </select>
                </label>
                <button disabled={busy}>Enregistrer</button>
              </form>
            )}
            {t.status === 'CLOSED' ? (
              <p className="muted">Dossier clôturé : l’historique reste consultable, aucune réponse n’est possible.</p>
            ) : null}
          </details>
        );
      })}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
