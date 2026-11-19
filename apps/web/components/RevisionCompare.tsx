'use client';
import { useState } from 'react';
import type { CreativeSpec } from '@vululu/contracts';
import { api } from '../lib/api';
export function RevisionCompare({
  base,
  version,
  spec,
  versions,
}: {
  base: string;
  version: number;
  spec: CreativeSpec;
  versions: { version: number }[];
}) {
  const [other, choose] = useState<number>(),
    [prior, compare] = useState<CreativeSpec>(),
    [err, fail] = useState('');
  const [busy, wait] = useState(false);
  if (versions.length < 2) return null;
  return (
    <details>
      <summary>Comparer deux compositions</summary>
      <label>
        Comparer v{version} avec
        <select
          disabled={busy}
          value={other ?? ''}
          onChange={async (e) => {
            const n = Number(e.target.value);
            choose(n);
            compare(undefined);
            fail('');
            if (!n) return;
            wait(true);
            try {
              const v = await api<{ spec: CreativeSpec }>(`${base}/${n}`);
              compare(v.spec);
            } catch {
              fail('Version inaccessible.');
            } finally {
              wait(false);
            }
          }}
        >
          <option value="">Choisir une version</option>
          {versions
            .filter((v) => v.version !== version)
            .map((v) => (
              <option key={v.version} value={v.version}>
                v{v.version}
              </option>
            ))}
        </select>
      </label>
      {err && <p role="alert">{err}</p>}
      {prior && (
        <>
          <p>
            v{other} → v{version} · {prior.width}×{prior.height} → {spec.width}×{spec.height} · palette{' '}
            {JSON.stringify(prior.brand) === JSON.stringify(spec.brand) ? 'identique' : 'modifiée'}
          </p>
          <ul>
            {[...new Set([...prior.scenes, ...spec.scenes].map((s) => s.key))].map((k) => {
              const i = prior.scenes.findIndex((s) => s.key === k),
                j = spec.scenes.findIndex((s) => s.key === k);
              return (
                <li key={k}>
                  {k} ·{' '}
                  {i < 0
                    ? 'ajoutée'
                    : j < 0
                      ? 'retirée'
                      : JSON.stringify(prior.scenes[i]) !== JSON.stringify(spec.scenes[j])
                        ? 'contenu modifié'
                        : 'contenu identique'}
                  {i >= 0 && j >= 0 && i !== j ? ` · position ${i + 1} → ${j + 1}` : ''}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </details>
  );
}
