'use client';
import { useState, type DragEvent } from 'react';
import { isVideoOutput, type CreativeSpec } from '@vululu/contracts';
import type { StudioTimelineProps } from '../lib/studioComponentTypes';
import { describeAudioTrim, trimAudioToDuration } from '../lib/studioAudio';

const MIN_SECONDS = 0.5;
const MAX_SECONDS = 30;
const MAX_TOTAL_SECONDS = 180;
const TRANSITION_LABELS: Record<'cut' | 'dip', string> = { cut: 'Coupe', dip: 'Fondu' };
const TRACK_KIND_LABELS: Record<'voiceover' | 'music' | 'sfx', string> = {
  voiceover: 'Voix off',
  music: 'Musique',
  sfx: 'Effet sonore'
};
const formatSeconds = (value: number) => String(Math.round(value * 10) / 10).replace('.', ',');

const roundSeconds = (value: number) =>
  Math.round(Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, value)) * 2) / 2;

const sceneNumber = (key: string) => {
  const value = Number(key.slice('SCENE-'.length));
  return Number.isFinite(value) ? value : 0;
};

const nextKey = (scenes: CreativeSpec['scenes']) =>
  'SCENE-' + String(Math.max(0, ...scenes.map((scene) => sceneNumber(scene.key))) + 1).padStart(3, '0');

/**
 * P09A — timeline horizontale des scènes sous le canvas.
 * Une seule bande de scènes : sélection, réordonnancement (boutons accessibles + glisser-déposer),
 * durée par pas de 0,5 s (0,5 à 30 s) et ajout/duplication/retrait dans les limites du contrat.
 * Chaque mutation appelle onSpec : révision locale avec historique, puis enregistrement serveur.
 * P09B : les pistes audio et les sous-titres réels de la composition remplacent les anciennes
 * lignes réservées ; aucune piste, durée ou repère n'est inventé.
 */
export function StudioTimeline({ spec, sceneIndex, busy, sources, onSpec, onSelect, onNotice }: StudioTimelineProps) {
  const [dragging, setDragging] = useState<number | null>(null);
  const kind = spec.delivery?.kind;
  const multiScene = !spec.delivery || kind === 'carousel' || isVideoOutput(kind);
  const total = spec.scenes.reduce((sum, scene) => sum + scene.seconds, 0);
  const over = total > MAX_TOTAL_SECONDS + 1e-9;
  const current = spec.scenes[sceneIndex] ?? spec.scenes[0];
  const audio = spec.audio;
  const tracks = audio?.tracks ?? [];
  const subtitles = audio?.subtitles;
  const cues = subtitles?.cues ?? [];
  const firstCue = [...cues].sort((left, right) => left.start - right.start)[0];

  function move(from: number, to: number) {
    if (to < 0 || to >= spec.scenes.length || from === to) return;
    const scenes = [...spec.scenes];
    const [moved] = scenes.splice(from, 1);
    scenes.splice(to, 0, moved);
    onSpec({ ...spec, scenes });
    onSelect(to);
  }

  function changeSeconds(index: number, value: number) {
    const scene = spec.scenes[index];
    if (!scene || !Number.isFinite(value)) return;
    const seconds = roundSeconds(value);
    if (seconds === scene.seconds) return;
    // Une durée plus courte peut laisser des pistes ou des sous-titres au-delà de la fin :
    // on les ramène dans la durée et on annonce l'ajustement (aucune suppression silencieuse).
    const trim = trimAudioToDuration({
      ...spec,
      scenes: spec.scenes.map((item, position) => (position === index ? { ...item, seconds } : item))
    });
    onSpec(trim.spec);
    const message = describeAudioTrim(trim);
    if (message) onNotice(message);
  }

  function addScene() {
    if (!multiScene || !current) return;
    const scenes = [...spec.scenes, { ...current, key: nextKey(spec.scenes) }];
    onSpec({ ...spec, scenes });
    onSelect(scenes.length - 1);
    onNotice('Scène ajoutée à la fin de la timeline.');
  }

  function duplicateScene() {
    if (!multiScene || !current) return;
    const scenes = [
      ...spec.scenes.slice(0, sceneIndex + 1),
      { ...current, key: nextKey(spec.scenes) },
      ...spec.scenes.slice(sceneIndex + 1)
    ];
    onSpec({ ...spec, scenes });
    onSelect(sceneIndex + 1);
    onNotice('Scène ' + current.key + ' dupliquée.');
  }

  function removeScene() {
    if (!current || spec.scenes.length < 2) return;
    const scenes = spec.scenes.filter((_, position) => position !== sceneIndex);
    const trim = trimAudioToDuration({ ...spec, scenes });
    onSpec(trim.spec);
    onSelect(Math.min(sceneIndex, scenes.length - 1));
    const message = describeAudioTrim(trim);
    onNotice(
      'Scène ' + current.key + ' retirée de la composition courante.' + (message ? ' ' + message : '')
    );
  }

  function dragStart(event: DragEvent<HTMLSpanElement>, index: number) {
    setDragging(index);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
  }

  function drop(event: DragEvent<HTMLLIElement>, index: number) {
    event.preventDefault();
    if (dragging !== null) move(dragging, index);
    setDragging(null);
  }

  return (
    <section className="studio-timeline" aria-labelledby="studio-timeline-heading">
      <div className="studio-timeline-head">
        <h3 id="studio-timeline-heading">Timeline des scènes</h3>
        <p className="hint" role="status">
          Durée totale : {String(Math.round(total * 10) / 10).replace('.', ',')} s · maximum {MAX_TOTAL_SECONDS} s
        </p>
      </div>
      {over ? (
        <p className="error studio-timeline-warning" role="alert">
          Durée totale supérieure à {MAX_TOTAL_SECONDS} s : la sauvegarde de la révision sera refusée. Réduisez une
          durée de scène avant d’enregistrer.
        </p>
      ) : null}
      <ol className="studio-timeline-list" aria-label="Scènes de la composition">
        {spec.scenes.map((scene, index) => (
          <li
            key={scene.key}
            className="studio-timeline-item"
            data-dragging={dragging === index ? 'true' : undefined}
            onDragOver={(event) => {
              if (dragging !== null) {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
              }
            }}
            onDrop={(event) => drop(event, index)}
          >
            <button
              type="button"
              className="studio-timeline-scene"
              aria-pressed={index === sceneIndex}
              aria-label={
                'Sélectionner la scène ' + (index + 1) + ' · ' + scene.key + ' · ' + scene.seconds + ' s · ' +
                scene.layers.length + ' calque(s)' +
                (scene.clip ? ' · clip' : '') +
                (scene.transition ? ' · transition ' + TRANSITION_LABELS[scene.transition] : '')
              }
              disabled={busy}
              onClick={() => onSelect(index)}
            >
              <span className="studio-timeline-index" aria-hidden="true">{index + 1}</span>
              <span className="studio-timeline-key">{scene.key}</span>
              <span className="studio-timeline-meta">{scene.seconds} s · {scene.layers.length} calque(s)</span>
              <span className="studio-timeline-badges">
                {scene.transition ? <span className="studio-badge">{TRANSITION_LABELS[scene.transition]}</span> : null}
                {scene.clip ? <span className="studio-badge">Clip</span> : null}
              </span>
            </button>
            <div className="studio-timeline-controls">
              <span
                className="studio-timeline-grip"
                draggable={!busy}
                aria-hidden="true"
                title="Glisser pour réordonner la scène"
                onDragStart={(event) => dragStart(event, index)}
                onDragEnd={() => setDragging(null)}
              >
                ⠿
              </span>
              <label className="studio-timeline-duration">
                <input
                  className="input"
                  type="number"
                  inputMode="decimal"
                  min={MIN_SECONDS}
                  max={MAX_SECONDS}
                  step={0.5}
                  value={scene.seconds}
                  disabled={busy}
                  aria-label={'Durée de la scène ' + (index + 1) + ' en secondes (0,5 à 30, pas de 0,5)'}
                  onChange={(event) => changeSeconds(index, Number(event.target.value))}
                />
                <span aria-hidden="true">s</span>
              </label>
              <button
                type="button"
                className="btn btn-ghost btn-small"
                disabled={busy || index === 0}
                aria-label={'Déplacer la scène ' + (index + 1) + ' vers la gauche'}
                onClick={() => move(index, index - 1)}
              >
                ◀
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-small"
                disabled={busy || index === spec.scenes.length - 1}
                aria-label={'Déplacer la scène ' + (index + 1) + ' vers la droite'}
                onClick={() => move(index, index + 1)}
              >
                ▶
              </button>
            </div>
          </li>
        ))}
      </ol>
      <div className="studio-timeline-actions">
        <button type="button" className="btn btn-secondary btn-small" disabled={busy || !multiScene} onClick={addScene}>
          Ajouter une scène
        </button>
        <button type="button" className="btn btn-secondary btn-small" disabled={busy || !multiScene || !current} onClick={duplicateScene}>
          Dupliquer la scène
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-small"
          disabled={busy || spec.scenes.length < 2}
          onClick={removeScene}
        >
          Retirer la scène
        </button>
        {!multiScene ? (
          <p className="hint">
            Ce format n’accepte qu’une scène. Choisissez une vidéo ou un carrousel dans l’inspecteur pour ajouter des
            scènes.
          </p>
        ) : null}
      </div>
      <div className="studio-timeline-lanes" role="group" aria-label="Pistes audio et sous-titres de la timeline">
        {spec.delivery?.audio ? (
          <p className="studio-timeline-lane studio-audio-lane">
            <strong>Piste liée</strong>
            <span>
              Piste audio de livraison · volume {Math.round(spec.delivery.audio.gain * 100)} %. Elle reste distincte des
              pistes audio de la composition.
            </span>
          </p>
        ) : null}
        {tracks.length === 0 ? (
          <p className="studio-timeline-lane studio-audio-lane">
            <strong>Audio</strong>
            <span>Aucune piste audio dans la composition : le rendu vidéo reste muet.</span>
          </p>
        ) : (
          tracks.map((track, index) => {
            const source = sources.find((item) => item.id === track.versionId);
            return (
              <p key={track.id} className="studio-timeline-lane studio-audio-lane">
                <strong>Audio {index + 1}</strong>
                <span>
                  {TRACK_KIND_LABELS[track.kind]} · {source?.name ?? 'ressource non fournie'} · début{' '}
                  {formatSeconds(track.start)} s · volume {Math.round(track.gain * 100)} % · fondus{' '}
                  {formatSeconds(track.fadeIn)} s / {formatSeconds(track.fadeOut)} s
                  {track.ducking ? ' · ducking' : ''}
                  {track.start >= total - 1e-6 ? ' · commence après la fin de la vidéo' : ''}
                </span>
              </p>
            );
          })
        )}
        <p className="studio-timeline-lane studio-subtitle-lane">
          <strong>Sous-titres</strong>
          <span>
            {subtitles?.enabled
              ? firstCue
                ? cues.length +
                  ' repère(s) · premier de ' +
                  formatSeconds(firstCue.start) +
                  ' à ' +
                  formatSeconds(firstCue.end) +
                  ' s'
                : 'Activés · aucun repère horodaté'
              : cues.length
                ? 'Désactivés · ' + cues.length + ' repère(s) enregistré(s)'
                : 'Aucun sous-titre dans la composition'}
          </span>
        </p>
      </div>
    </section>
  );
}
