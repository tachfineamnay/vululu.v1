'use client';
import { useEffect, useState } from 'react';
import type { MediaCapability, MediaRequest } from '@vululu/contracts';
import { api, postJson } from '../lib/api';
type CustomerCapability = MediaCapability & { accountAuthorized: boolean };
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
function mediaStatus(row: Row) {
  if (row.operation.state === 'CANCELLED') return 'Annulé avant envoi';
  if (row.operation.state === 'UNKNOWN') {
    if (row.state === 'MATERIALIZING') return 'Stockage interrompu : vérifier la bibliothèque';
    if (['DRAFT', 'SUBMITTING', 'PENDING'].includes(row.state)) return 'Suivi interrompu : résultat non confirmé';
  }
  return statuses[row.state] ?? row.state;
}
const active = ['QUEUED', 'POLLING', 'CLAIMED'];
const statuses: Record<string, string> = {
  DRAFT: 'En attente', SUBMITTING: 'Envoi en cours', PENDING: 'En cours chez le fournisseur',
  MATERIALIZING: 'Vérification et stockage', READY: 'Disponible dans la bibliothèque', FAILED: 'Échec fournisseur', CANCELLED: 'Annulation signalée',
  UNAVAILABLE: 'Fournisseur indisponible', CREDENTIAL_REJECTED: 'Accès fournisseur refusé',
  QUOTA_REJECTED: 'Quota fournisseur atteint ; aucune génération lancée',
  PROVIDER_REJECTED: 'Paramètres refusés par le fournisseur', INVALID_INPUT: 'Source modifiée ou invalide',
  INVALID_OUTPUT: 'Fichier reçu mais invalide ou non conservé', SUBMISSION_UNKNOWN: 'Envoi incertain : ne pas relancer',
  OUTCOME_UNKNOWN: 'Résultat non confirmé', COST_INCIDENT: 'Coût hors plafond : contrôle nécessaire'
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
  const [caps, config] = useState<CustomerCapability[]>([]),
    [rows, list] = useState<Row[]>([]),
    [kind, choose] = useState<MediaRequest['kind']>('image'),
    [prompt, write] = useState(''),
    [ref, source] = useState(''),
    [size, resize] = useState('1280:720'),
    [rights, confirm] = useState(false),
    [open, setOpen] = useState(false),
    [refreshError, setRefreshError] = useState(false);
  const pending = rows.some((row) => active.includes(row.operation.state));
  useEffect(() => {
    if (!open || !pending) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const next = await api<Row[]>(base);
        if (!stopped) { list(next); setRefreshError(false); }
      } catch { if (!stopped) setRefreshError(true); }
      if (!stopped) timer = setTimeout(poll, 10000);
    }
    timer = setTimeout(poll, 10000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [base, open, pending]);
  const cap = caps.find((c) => c.kind === kind);
  async function refresh() {
    const [c, h] = await Promise.all([api<CustomerCapability[]>('/api/media/capabilities'), api<Row[]>(base)]);
    config(c);
    list(h);
    setRefreshError(false);
  }
  return (
    <details
      className="card stack"
      onToggle={(e) => {
        if (e.target !== e.currentTarget) return;
        setOpen(e.currentTarget.open);
        if (e.currentTarget.open) void run(refresh);
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
          {cap.availability === 'configured' && !cap.accountAuthorized && <p>La génération n’est pas autorisée pour ce compte. <a href="/account">Vérifier mes droits ou contacter l’assistance</a>.</p>}
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
                Format du clip
                <select value={size} onChange={(e) => resize(e.target.value)}>
                  {cap.sizes.map((x) => (
                    <option key={x} value={x}>{x === '1280:720' ? 'Paysage · 16:9' : 'Portrait · 9:16'} ({x})</option>
                  ))}
                </select>
              </label>
            </>
          )}
          {kind === 'image' && <p>Format carré · PNG. Aucune image de référence.</p>}
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
              !cap.accountAuthorized ||
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
      {refreshError && <p role="status">Actualisation indisponible ; nouvelle tentative automatique.</p>}
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
              Média : {mediaStatus(r)}. Coût :{' '}
              {r.operation.reportedCents === null
                ? r.operation.costState === 'UNKNOWN' ? 'incertain, réservation conservée pour rapprochement' : r.operation.costState
                : r.operation.reportedCents + ' centime(s) USD'}
              .
            </p>
            {r.cancelRequested && active.includes(r.operation.state) && <p>Annulation demandée, non garantie. Le suivi continue.</p>}
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
            {r.outputVersion && r.revision !== revision && <p>La scène a changé. Réutilisez le fichier depuis la bibliothèque dans l’éditeur, sans écraser la révision actuelle.</p>}
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
