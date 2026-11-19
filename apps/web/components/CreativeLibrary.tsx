'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useWorkspace } from './WorkspacePreferences';
export function CreativeLibrary({ id }: { id: string }) {
  const { t } = useWorkspace(),
    [items, set] = useState<{ version: number; approvedAt: string | null }[] | null>(null),
    [error, fail] = useState(false),
    [retry, bump] = useState(0);
  useEffect(() => {
    let live = true;
    set(null);
    fail(false);
    api<NonNullable<typeof items>>(`/api/projects/${id}/creative`)
      .then((rows) => {
        if (live) set(rows);
      })
      .catch(() => {
        if (live) fail(true);
      });
    return () => {
      live = false;
    };
  }, [id, retry]);
  return (
    <section className="card stack">
      <h2>{t('Versions créatives', 'Creative versions')}</h2>
      {error ? (
        <button onClick={() => bump(retry + 1)}>{t('Réessayer', 'Try again')}</button>
      ) : items === null ? (
        <p role="status">{t('Chargement…', 'Loading…')}</p>
      ) : !items.length ? (
        <p>{t('Aucune version enregistrée.', 'No saved versions yet.')}</p>
      ) : (
        <ul>
          {items.map((r) => (
            <li key={r.version}>
              v{r.version} ·{' '}
              {r.approvedAt ? (
                <a download href={`/api/projects/${id}/creative/${r.version}/master?export=1`}>
                  {t('Exporter la version approuvée', 'Download approved version')}
                </a>
              ) : (
                t('Non approuvée', 'Not approved')
              )}
            </li>
          ))}
        </ul>
      )}
      <Link href={'/projects/' + id}>
        {t('Modifier ou approuver dans le Studio', 'Edit or approve in Studio')}
      </Link>
    </section>
  );
}
