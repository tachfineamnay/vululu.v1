'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, postJson } from '../lib/api';
export function WeeklyReminder() {
  const [due, set] = useState(false),
    [error, fail] = useState(false);
  useEffect(() => {
    let live = true;
    void api<{ due: boolean }>('/api/results/reminder')
      .then((x) => {
        if (live) set(x.due);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  if (!due) return null;
  return (
    <aside className="card stack">
      <strong>Votre rappel hebdomadaire</strong>
      <Link href="/results">Faire le point et préparer la semaine</Link>
      <button
        className="btn"
        onClick={async () => {
          try {
            await postJson('/api/results/reminder', { dismiss: true });
            set(false);
          } catch {
            fail(true);
          }
        }}
      >
        Masquer pour cette semaine
      </button>
      {error && <p role="alert">Préférence non enregistrée.</p>}
    </aside>
  );
}
