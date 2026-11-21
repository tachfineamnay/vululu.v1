'use client';
import { useEffect, useState } from 'react';
import { api, postJson } from '../lib/api';
import type { StudioRegenerateProps } from '../lib/studioComponentTypes';
import { mediaActiveStates, mediaStateLabels } from './MediaGenerationPanel';

type MediaCapabilityView = {
  kind: 'image' | 'video';
  provider: string;
  model: string;
  sizes: readonly string[];
  seconds: readonly number[];
  requiresReference: boolean;
  maxCents: number;
  availability: 'disabled' | 'missing_credential' | 'configured';
  accountAuthorized: boolean;
};
type MediaRow = {
  id: string;
  revision: number;
  sceneKey: string;
  model: string;
  parameters: { prompt: string; size: string; kind: string; seconds?: number; referenceVersion?: string };
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

const availabilityLabels: Record<MediaCapabilityView['availability'], string> = {
  disabled: 'Génération externe désactivée',
  missing_credential: 'Identifiant fournisseur manquant',
  configured: 'Configuré (disponibilité non testée)'
};
const proposeStates = ['PROPOSED', 'QUEUED', 'POLLING', 'CLAIMED'];
const MAX_PROVIDER_SECONDS = 5;

/**
 * P09A — régénération ciblée de la scène sélectionnée.
 * Une génération fournisseur n'est jamais présentée comme un résultat : elle est préparée,
 * autorisée explicitement (plafond), suivie via ses états réels, puis appliquée comme nouvelle
 * révision seulement quand un média READY existe. Une scène photo renvoie vers l'outil
 * d'édition d'image existant ; aucune clé fournisseur n'est manipulée dans le navigateur.
 */
export function StudioRegenerate({
  project,
  revision,
  sceneKey,
  sceneSeconds,
  clipSize,
  video,
  assets,
  run,
  onPlaced,
  onNotice
}: StudioRegenerateProps) {
  const base = '/api/projects/' + encodeURIComponent(project) + '/media-generation';
  const [open, setOpen] = useState(false);
  const [caps, setCaps] = useState<MediaCapabilityView[]>([]);
  const [rows, setRows] = useState<MediaRow[]>([]);
  const [prompt, setPrompt] = useState('');
  const [reference, setReference] = useState('');
  const [rights, setRights] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const cap = caps.find((item) => item.kind === 'video');
  const pending = rows.some((row) => mediaActiveStates.includes(row.operation.state));
  const canSubmit =
    video &&
    revision > 0 &&
    sceneSeconds <= MAX_PROVIDER_SECONDS &&
    cap !== undefined &&
    cap.availability === 'configured' &&
    cap.accountAuthorized &&
    rights &&
    prompt.trim().length >= 3 &&
    reference !== '';

  async function refresh() {
    const [capabilities, history] = await Promise.all([
      api<MediaCapabilityView[]>('/api/media/capabilities'),
      api<MediaRow[]>(base)
    ]);
    setCaps(capabilities);
    setRows(history.filter((row) => row.sceneKey === sceneKey));
    setLoaded(true);
    setRefreshFailed(false);
  }

  useEffect(() => {
    if (!open || !pending) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const next = await api<MediaRow[]>(base);
        if (!stopped) {
          setRows(next.filter((row) => row.sceneKey === sceneKey));
          setRefreshFailed(false);
        }
      } catch {
        if (!stopped) setRefreshFailed(true);
      }
      if (!stopped) timer = setTimeout(poll, 10000);
    }
    timer = setTimeout(poll, 10000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [base, open, pending, sceneKey]);

  if (!video) {
    return (
      <section className="card stack studio-regenerate" aria-labelledby="studio-regenerate-heading">
        <h3 id="studio-regenerate-heading">Régénérer la scène {sceneKey}</h3>
        <p className="hint">
          Scène image : la régénération ciblée passe par l’outil d’édition d’image IA du projet, disponible plus bas
          sur cette page une fois la sélection de ressources confirmée. Le résultat est appliqué comme nouvelle
          révision, sans écraser celle-ci.
        </p>
        <a className="text-link" href="#image-editing-heading">
          Aller à l’outil « Éditer ou générer une image »
        </a>
      </section>
    );
  }

  function prepare() {
    if (!canSubmit) return;
    void run(async () => {
      await postJson(base, {
        schemaVersion: 1,
        requestId: crypto.randomUUID(),
        revision,
        sceneKey,
        kind: 'video',
        prompt,
        rightsConfirmed: true,
        size: clipSize,
        seconds: 5,
        referenceVersion: reference
      });
      await refresh();
      onNotice('Génération de clip préparée pour ' + sceneKey + ' : elle devra être autorisée avant tout appel fournisseur.');
    });
  }

  function authorize(row: MediaRow) {
    void run(async () => {
      await postJson('/api/execution/' + encodeURIComponent(row.operation.id) + '/approve', {
        digest: row.operation.digest
      });
      await refresh();
      onNotice('Autorisation enregistrée. Le suivi affiche l’état réel renvoyé par le serveur.');
    });
  }

  function cancelJob(row: MediaRow) {
    void run(async () => {
      await postJson(base + '/' + encodeURIComponent(row.id) + '/cancel', {});
      await refresh();
      onNotice('Annulation demandée pour la génération de clip.');
    });
  }

  function place(row: MediaRow) {
    if (!row.outputVersion || row.revision !== revision) return;
    void run(async () => {
      await postJson(base + '/' + encodeURIComponent(row.id) + '/place', {
        expectedRevision: revision,
        approved: true
      });
      await onPlaced();
      onNotice('Clip appliqué à ' + sceneKey + ' : une nouvelle révision a été créée, le rendu final reste à lancer.');
    });
  }

  return (
    <section className="card stack studio-regenerate" aria-labelledby="studio-regenerate-heading">
      <h3 id="studio-regenerate-heading">Régénérer la scène {sceneKey}</h3>
      <p className="hint">
        Régénération ciblée : une proposition de clip Runway est préparée pour cette scène uniquement, puis
        appliquée comme nouvelle révision. Les autres scènes ne sont pas modifiées.
      </p>
      <details
        className="studio-regenerate-details"
        onToggle={(event) => {
          if (event.target !== event.currentTarget) return;
          setOpen(event.currentTarget.open);
          if (event.currentTarget.open && revision > 0) void run(refresh);
        }}
      >
        <summary>Préparer un clip pour {sceneKey}</summary>
        <div className="stack">
          <p className="studio-regenerate-notice">
            Un appel fournisseur réel exige une configuration et une autorisation explicite du coût. Aucun résultat
            n’est annoncé avant qu’un média <strong>READY</strong> n’apparaisse ci-dessous et dans la bibliothèque.
          </p>
          {!revision ? (
            <p className="hint">Enregistrez d’abord une révision de composition pour cibler une régénération.</p>
          ) : !loaded ? (
            <p role="status">Chargement des capacités et des générations…</p>
          ) : (
            <>
              {cap ? (
                <>
                  <p>
                    <strong>
                      {cap.provider} · {cap.model}
                    </strong>{' '}
                    · {availabilityLabels[cap.availability]} · plafond {cap.maxCents} centime(s) USD
                  </p>
                  {cap.availability === 'configured' && !cap.accountAuthorized ? (
                    <p>
                      La génération n’est pas autorisée pour ce compte.{' '}
                      <a href="/account">Vérifier mes droits ou contacter l’assistance</a>.
                    </p>
                  ) : null}
                  {sceneSeconds > MAX_PROVIDER_SECONDS ? (
                    <p role="alert">
                      La scène dure {sceneSeconds} s : le clip fournisseur est limité à {MAX_PROVIDER_SECONDS} s.
                      Réduisez la durée de la scène dans la timeline avant de préparer un clip.
                    </p>
                  ) : null}
                  <p className="hint">
                    Format demandé : {clipSize === '1280:720' ? 'paysage 16:9' : 'portrait 9:16'} ({clipSize}) ·{' '}
                    {MAX_PROVIDER_SECONDS} s. Le fournisseur génère un clip, jamais la composition finale.
                  </p>
                  <label className="label">
                    Description du clip souhaité
                    <textarea
                      className="input"
                      value={prompt}
                      maxLength={900}
                      onChange={(event) => setPrompt(event.target.value)}
                    />
                  </label>
                  <label className="label">
                    Image de référence (PNG/JPEG)
                    <select className="input" value={reference} onChange={(event) => setReference(event.target.value)}>
                      <option value="">Choisir une image</option>
                      {assets.map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          {asset.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="check-row">
                    <input type="checkbox" checked={rights} onChange={(event) => setRights(event.target.checked)} />
                    <span>J’ai les droits nécessaires et j’autorise l’envoi des données sélectionnées.</span>
                  </label>
                  <button type="button" className="btn btn-primary btn-small" disabled={!canSubmit} onClick={prepare}>
                    Préparer sans facturer
                  </button>
                </>
              ) : (
                <p className="hint">Aucune capacité vidéo fournie par le serveur pour le moment.</p>
              )}
              <div className="actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={() => void run(refresh)}
                >
                  Actualiser les générations
                </button>
              </div>
              {refreshFailed ? (
                <p role="status">Actualisation indisponible ; nouvelle tentative automatique pendant le suivi.</p>
              ) : null}
              {rows.length ? (
                <div className="stack" aria-label={'Générations de la scène ' + sceneKey}>
                  {rows.map((row) => {
                    const active = mediaActiveStates.includes(row.operation.state);
                    const placeable = Boolean(row.outputVersion) && row.revision === revision;
                    return (
                      <article key={row.id} className="execution-row">
                        <div className="execution-row-head">
                          <strong>{row.model} · scène {row.sceneKey}</strong>
                          <span className={'pill execution-state state-' + row.state.toLowerCase()}>
                            {mediaStateLabels[row.state] ?? row.state}
                          </span>
                        </div>
                        <p className="hint">
                          {row.parameters.prompt} · {row.parameters.size}
                          {row.parameters.seconds ? ' · ' + row.parameters.seconds + ' s' : ''}
                          {' · composition source v' + row.revision}
                        </p>
                        <p className="hint">
                          Coût :{' '}
                          {row.operation.reportedCents === null
                            ? row.operation.costState === 'UNKNOWN'
                              ? 'incertain, réservation conservée pour rapprochement'
                              : row.operation.costState
                            : row.operation.reportedCents + ' centime(s) USD'}
                          .
                        </p>
                        {row.cancelRequested && active ? (
                          <p className="hint">Annulation demandée, non garantie. Le suivi continue.</p>
                        ) : null}
                        <div className="actions">
                          {row.operation.state === 'PROPOSED' ? (
                            <button
                              type="button"
                              className="btn btn-primary btn-small"
                              onClick={() => authorize(row)}
                            >
                              Autoriser jusqu’à {row.operation.maxCents} centime(s) USD
                            </button>
                          ) : null}
                          {proposeStates.includes(row.operation.state) && row.operation.state !== 'PROPOSED' ? (
                            <button
                              type="button"
                              className="btn btn-ghost btn-small"
                              disabled={row.cancelRequested}
                              onClick={() => cancelJob(row)}
                            >
                              Demander l’annulation
                            </button>
                          ) : null}
                          {row.outputVersion ? (
                            <button
                              type="button"
                              className="btn btn-secondary btn-small"
                              disabled={!placeable}
                              onClick={() => place(row)}
                            >
                              Appliquer comme nouvelle révision
                            </button>
                          ) : null}
                        </div>
                        {row.outputVersion && !placeable ? (
                          <p className="hint">
                            La composition a changé depuis cette génération : le clip reste disponible dans la
                            bibliothèque. Relancez une génération ciblée pour l’appliquer à la scène actuelle.
                          </p>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="hint">Aucune génération pour cette scène.</p>
              )}
            </>
          )}
        </div>
      </details>
    </section>
  );
}
