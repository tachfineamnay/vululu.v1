'use client';
import { useEffect, useRef, useState } from 'react';
import { creativeSpec, type CreativeSpec } from '@vululu/contracts';
import { api, apiResponse } from '../lib/api';
import type { StudioCompareProps } from '../lib/studioComponentTypes';
import { previewSpecForScene } from '../lib/studioPreview';
import {
  isAbortError,
  isRetryableBusyError,
  runWithBoundedBusyRetry,
  studioPreviewCoordinator
} from '../lib/studioConcurrency';

type ComparePreview = { url: string; sceneKey: string };

const stamp = (value: string) => new Date(value).toLocaleString('fr-FR');

/**
 * Réduit une composition à un seul cadre : le moteur d'aperçu serveur n'accepte qu'une scène.
 * L'audio est retiré par `previewSpecForScene` : l'image fixe ne le dessine pas et ses bornes
 * de durée (sous-titres, pistes) ne concernent pas une scène isolée.
 */
function singleScene(spec: CreativeSpec, sceneKey: string) {
  const scene = spec.scenes.find((item) => item.key === sceneKey) ?? spec.scenes[0];
  return scene ? { scene, single: previewSpecForScene(spec, scene) } : null;
}

/** Aperçu d'un cadre rendu par le même moteur serveur que le master (aucun rendu navigateur approximatif). */
async function renderScene(
  base: string,
  spec: CreativeSpec,
  sceneKey: string,
  signal: AbortSignal,
  onWaiting?: (message: string) => void
): Promise<ComparePreview> {
  const picked = singleScene(spec, sceneKey);
  if (!picked) throw new Error('Composition sans scène à comparer.');
  const parsed = creativeSpec.safeParse(picked.single);
  if (!parsed.success) throw new Error(parsed.error.issues.map((issue) => issue.message).join(' · '));
  const response = await runWithBoundedBusyRetry(
    () =>
      studioPreviewCoordinator.schedule(
        () =>
          apiResponse(base + '/preview', {
            method: 'POST',
            body: JSON.stringify(parsed.data),
            signal
          }),
        signal
      ),
    {
      signal,
      onWaiting: (info) => onWaiting?.(info.message)
    }
  );
  return { url: URL.createObjectURL(await response.blob()), sceneKey: picked.scene.key };
}

const imageIds = (spec: CreativeSpec) =>
  new Set(
    spec.scenes.flatMap((scene) =>
      scene.layers.flatMap((layer) => (layer.type === 'image' ? [layer.versionId] : []))
    )
  );
const layerCount = (spec: CreativeSpec) => spec.scenes.reduce((count, scene) => count + scene.layers.length, 0);
const totalSeconds = (spec: CreativeSpec) => spec.scenes.reduce((total, scene) => total + scene.seconds, 0);
const palette = (spec: CreativeSpec) => JSON.stringify(spec.brand);

/**
 * Comparaison visuelle de deux révisions : les deux aperçus viennent du moteur serveur
 * (POST .../preview pour la révision de référence, image scellée du manifest quand elle existe).
 * Coordonnée par la file locale d'aperçus et protégée par reprise bornée en cas de 429 légitime.
 */
export function StudioCompare({ base, current, versions, sceneKey, onNotice }: StudioCompareProps) {
  const [chosen, setChosen] = useState<number | null>(null);
  const [prior, setPrior] = useState<CreativeSpec | null>(null);
  const [priorPreview, setPriorPreview] = useState<ComparePreview | null>(null);
  const [currentPreview, setCurrentPreview] = useState<ComparePreview | null>(null);
  const [phase, setPhase] = useState<'idle' | 'loading' | 'waiting' | 'ready' | 'error'>('idle');
  const [waitingNote, setWaitingNote] = useState('');
  const [error, setError] = useState('');
  const [retryToken, setRetryToken] = useState(0);
  // Référence stable au callback de notification : une prop recréée à chaque rendu du parent
  // ne doit pas relancer les aperçus serveur en boucle.
  const noticeRef = useRef(onNotice);
  useEffect(() => {
    noticeRef.current = onNotice;
  }, [onNotice]);

  const candidates = versions
    .filter((item) => item.version !== current.version)
    .sort((a, b) => b.version - a.version);
  const defaultVersion = candidates.length ? Math.min(...candidates.map((item) => item.version)) : null;
  const reference = candidates.some((item) => item.version === chosen) ? chosen : defaultVersion;
  const referenceMeta = versions.find((item) => item.version === reference);
  const currentScene = singleScene(current.spec, sceneKey)?.scene;

  useEffect(() => {
    setPrior(null);
    setPriorPreview(null);
    setCurrentPreview(null);
    setError('');
    setWaitingNote('');
    if (reference === null) {
      setPhase('idle');
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    const urls: string[] = [];
    setPhase('loading');
    void (async () => {
      try {
        const loaded = await api<{ spec: CreativeSpec }>(base + '/' + reference, {
          signal: controller.signal
        });
        const parsed = creativeSpec.safeParse(loaded.spec);
        if (!parsed.success) throw new Error(parsed.error.issues.map((issue) => issue.message).join(' · '));
        const onWaiting = (message: string) => {
          if (cancelled) return;
          setPhase('waiting');
          setWaitingNote(message);
        };
        const before = await renderScene(base, parsed.data, sceneKey, controller.signal, onWaiting);
        urls.push(before.url);
        if (cancelled) return;
        setPrior(parsed.data);
        setPriorPreview(before);
        if (!current.manifest) {
          const now = await renderScene(base, current.spec, sceneKey, controller.signal, onWaiting);
          urls.push(now.url);
          if (cancelled) return;
          setCurrentPreview(now);
        }
        if (!cancelled) {
          setWaitingNote('');
          setPhase('ready');
        }
      } catch (caught) {
        if (cancelled || controller.signal.aborted || isAbortError(caught)) return;
        const message = isRetryableBusyError(caught)
          ? 'Serveur de rendu occupé après plusieurs tentatives. Vous pouvez réessayer.'
          : caught instanceof Error
            ? caught.message
            : 'Comparaison indisponible.';
        setWaitingNote('');
        setPhase('error');
        setError(message);
        noticeRef.current?.('Comparaison indisponible : ' + message);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [base, reference, sceneKey, current.version, current.manifest, retryToken]);

  if (versions.length < 2) return null;

  const referenceLabel = reference ?? current.version;
  const currentImage = currentPreview?.url
    ?? (current.manifest && currentScene ? base + '/' + current.version + '/scenes/' + currentScene.key : null);
  const currentSceneKey = currentPreview?.sceneKey ?? currentScene?.key ?? sceneKey;
  const beforeIds = prior ? imageIds(prior) : null;
  const afterIds = imageIds(current.spec);
  const commonIds = beforeIds ? [...beforeIds].filter((id) => afterIds.has(id)).length : 0;
  const removedIds = beforeIds ? beforeIds.size - commonIds : 0;
  const addedIds = afterIds.size - commonIds;

  return (
    <section className="studio-compare" aria-labelledby="creative-compare">
      <h4 id="creative-compare">Comparer deux révisions</h4>
      <label>
        Comparer v{current.version} avec
        <select
          value={referenceLabel}
          disabled={phase === 'loading' || phase === 'waiting'}
          onChange={(event) => setChosen(event.target.value ? Number(event.target.value) : null)}
        >
          {candidates.map((item) => (
            <option key={item.version} value={item.version}>
              v{item.version}
              {item.approvedAt ? ' · approuvée' : ' · brouillon'}
            </option>
          ))}
        </select>
      </label>
      {phase === 'waiting' && waitingNote && (
        <p role="status" className="hint">
          {waitingNote}
        </p>
      )}
      {phase === 'error' && (
        <p role="alert" className="error">
          {error}{' '}
          <button type="button" className="text-link" onClick={() => setRetryToken((n) => n + 1)}>
            Réessayer
          </button>
        </p>
      )}
      <div className="studio-compare-grid">
        <figure>
          {priorPreview ? (
            <img
              src={priorPreview.url}
              alt={'Aperçu rendu de la révision v' + referenceLabel + ' · ' + priorPreview.sceneKey}
              style={{ display: 'block', maxWidth: '100%', height: 'auto' }}
            />
          ) : (
            <div className="scene-placeholder">
              {phase === 'waiting'
                ? 'En attente d’un créneau serveur…'
                : phase === 'loading'
                  ? 'Rendu serveur en cours…'
                  : 'Aperçu indisponible'}
            </div>
          )}
          <figcaption>
            v{referenceLabel}
            {prior ? ' · ' + prior.width + ' × ' + prior.height : ''}
            {' · '}
            {referenceMeta?.approvedAt ? 'approuvée le ' + stamp(referenceMeta.approvedAt) : 'non approuvée'}
            {' · scène '}
            {priorPreview?.sceneKey ?? '…'}
          </figcaption>
        </figure>
        <figure>
          {currentImage ? (
            <img
              src={currentImage}
              alt={'Aperçu rendu de la révision v' + current.version + ' · ' + currentSceneKey}
              style={{ display: 'block', maxWidth: '100%', height: 'auto' }}
            />
          ) : (
            <div className="scene-placeholder">
              {phase === 'waiting'
                ? 'En attente d’un créneau serveur…'
                : phase === 'loading'
                  ? 'Rendu serveur en cours…'
                  : 'Aperçu indisponible'}
            </div>
          )}
          <figcaption>
            v{current.version} · {current.spec.width} × {current.spec.height}
            {' · '}
            {current.approvedAt ? 'approuvée le ' + stamp(current.approvedAt) : 'non approuvée'}
            {' · scène '}
            {currentSceneKey}
          </figcaption>
        </figure>
      </div>
      {prior && (
        <>
          <ul className="studio-compare-summary">
            <li>
              Scènes : {prior.scenes.length} → {current.spec.scenes.length}
            </li>
            <li>
              Calques : {layerCount(prior)} → {layerCount(current.spec)}
            </li>
            <li>
              Dimensions : {prior.width} × {prior.height} → {current.spec.width} × {current.spec.height}
              {prior.width === current.spec.width && prior.height === current.spec.height ? ' (identiques)' : ' (modifiées)'}
            </li>
            <li>Palette : {palette(prior) === palette(current.spec) ? 'identique' : 'modifiée'}</li>
            <li>
              Durée totale : {totalSeconds(prior)} s → {totalSeconds(current.spec)} s
            </li>
            <li>
              Ressources visuelles : {commonIds} identique(s) · {removedIds} retirée(s) · {addedIds} ajoutée(s)
            </li>
          </ul>
          <p className="hint">
            Les deux aperçus sont rendus par le même moteur serveur sur la scène {sceneKey} ;
            aucune composition approximative n’est dessinée dans le navigateur. Une ressource
            remplacée compte une ressource retirée et une ressource ajoutée.
          </p>
        </>
      )}
    </section>
  );
}
