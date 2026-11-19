'use client';
import { useState } from 'react';
import type { MediaCapability, MediaRequest } from '@vululu/contracts';
import { api, postJson } from '../lib/api';
type Row = {
  id: string;
  revision: number;
  sceneKey: string;
  model: string;
  parameters: MediaRequest;
  state: string;
  outputVersion: string | null;
  cancelRequested: boolean;
  operation: {
    id: string;
    digest: string;
    maxCents: number;
    reportedCents: number | null;
    state: string;
    costState: string;
  };
};
export function MediaGenerationPanel({
  project,
  revision,
  sceneKey,
  images,
  short,
  run,
  reload
}: {
  project: string;
  revision: number;
  sceneKey: string;
  images: { id: string; name: string }[];
  short: boolean;
  run: (fn: () => Promise<void>) => Promise<void>;
  reload: () => Promise<void>;
}) {
  const base = '/api/projects/' + project + '/media-generation';
  const [caps, config] = useState<MediaCapability[]>([]),
    [rows, list] = useState<Row[]>([]),
    [kind, choose] = useState<MediaRequest['kind']>('image'),
    [prompt, write] = useState(''),
    [ref, source] = useState(''),
    [size, resize] = useState('1280:720'),
    [rights, confirm] = useState(false);
  const cap = caps.find((c) => c.kind === kind);
  async function refresh() {
    const [c, h] = await Promise.all([api<MediaCapability[]>('/api/media/capabilities'), api<Row[]>(base)]);
    config(c);
    list(h);
  }
  return (
    <details
      className="card stack"
      onToggle={(e) => {
        if (e.target === e.currentTarget && e.currentTarget.open) void run(refresh);
      }}
    >
      <summary>Générer un média pour {sceneKey}</summary>
      <p>
        Un fournisseur externe recevra votre description et, pour un clip, l’image choisie. La génération ne
        modifie pas le projet.
      </p>
      <label>
        Type
        <select value={kind} onChange={(e) => choose(e.target.value as typeof kind)}>
          <option value="image">Image</option>
          <option value="video" disabled={!short}>
            Clip · scène vidéo courte de 5 s maximum
          </option>
        </select>
      </label>
      {cap && (
        <>
          <p>
            {cap.model} ·{' '}
            {cap.availability === 'disabled'
              ? 'Génération externe désactivée'
              : cap.availability === 'missing_credential'
                ? 'Identifiant fournisseur manquant'
                : 'Configuré (disponibilité non testée)'}{' '}
            · plafond : {cap.maxCents} centime(s) USD
          </p>
          <label>
            Description
            <textarea
              className="input"
              value={prompt}
              maxLength={900}
              onChange={(e) => write(e.target.value)}
            />
          </label>
          {kind === 'video' && (
            <>
              <label>
                Image de référence (PNG/JPEG)
                <select value={ref} onChange={(e) => source(e.target.value)}>
                  <option value="">Choisir</option>
                  {images.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Dimensions
                <select value={size} onChange={(e) => resize(e.target.value)}>
                  {cap.sizes.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
            </>
          )}
          <label>
            <input type="checkbox" checked={rights} onChange={(e) => confirm(e.target.checked)} /> J’ai les
            droits nécessaires et j’autorise l’envoi des données sélectionnées.
          </label>
          <button
            type="button"
            disabled={
              !rights ||
              prompt.trim().length < 3 ||
              cap.availability !== 'configured' ||
              (kind === 'video' && !ref)
            }
            onClick={() =>
              void run(async () => {
                await postJson(base, {
                  schemaVersion: 1,
                  requestId: crypto.randomUUID(),
                  revision,
                  sceneKey,
                  kind,
                  prompt,
                  rightsConfirmed: rights,
                  ...(kind === 'video' ? { size, seconds: 5, referenceVersion: ref } : { size: cap.sizes[0] })
                });
                await refresh();
              })
            }
          >
            Préparer sans facturer
          </button>
        </>
      )}
      <button type="button" onClick={() => void run(refresh)}>
        Actualiser les générations
      </button>
      {rows
        .filter((r) => r.sceneKey === sceneKey)
        .map((r) => (
          <article key={r.id}>
            <strong>
              {r.model} · scène source v{r.revision}
            </strong>
            <p>
              {r.parameters.prompt} · {r.parameters.size}
              {r.parameters.kind === 'video'
                ? ` · ${r.parameters.seconds} s · référence ${r.parameters.referenceVersion}`
                : ''}
            </p>
            <p>
              Média : {r.state}. Exécution : {r.operation.state}. Coût :{' '}
              {r.operation.reportedCents === null
                ? r.operation.costState
                : r.operation.reportedCents + ' centime(s) USD'}
              .
            </p>
            {r.operation.state === 'PROPOSED' && (
              <button
                onClick={() =>
                  void run(async () => {
                    await postJson(`/api/execution/${r.operation.id}/approve`, {
                      digest: r.operation.digest
                    });
                    await refresh();
                  })
                }
              >
                Autoriser jusqu’à {r.operation.maxCents} centime(s) USD
              </button>
            )}
            {['PROPOSED', 'QUEUED', 'POLLING', 'CLAIMED'].includes(r.operation.state) && (
              <button
                disabled={r.cancelRequested}
                onClick={() =>
                  void run(async () => {
                    await postJson(base + '/' + r.id + '/cancel', {});
                    await refresh();
                  })
                }
              >
                Demander l’annulation
              </button>
            )}
            {r.outputVersion && (
              <button
                disabled={r.revision !== revision}
                onClick={() =>
                  void run(async () => {
                    await postJson(base + '/' + r.id + '/place', {
                      expectedRevision: revision,
                      approved: true
                    });
                    await reload();
                  })
                }
              >
                Remplacer le visuel principal de cette scène (nouvelle version)
              </button>
            )}
          </article>
        ))}
    </details>
  );
}
