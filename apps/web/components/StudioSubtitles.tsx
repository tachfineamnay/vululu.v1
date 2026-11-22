'use client';

import { useState } from 'react';
import {
  audioLanguage,
  defaultSubtitleStyle,
  type AudioLanguage,
  type CreativeSpec,
  type SubtitleCue,
  type SubtitleStyle
} from '@vululu/contracts';
import type { StudioSubtitlesProps } from '../lib/studioComponentTypes';

/**
 * P09B — sous-titres de la composition vidéo : repères horodatés, style réellement appliqué
 * par le rendu serveur, langue et lien SRT de la révision approuvée. Les modifications passent
 * par onSpec (brouillon local) ; le contrat serveur reste l'autorité de validation.
 */

const MAX_CUES = 200;
const MAX_CUE_TEXT = 200;
const MAX_START = 179.5;
const MAX_END = 180;
const FORBIDDEN_TEXT = /[\\{}]|[\u0000-\u001f\u007f]/; // eslint-disable-line no-control-regex -- Refus explicite des contrôles et balises ASS.
const LANGUAGE_LABELS: Record<string, string> = {
  'fr-FR': 'Français (fr-FR)',
  'en-US': 'Anglais (en-US)',
  'es-ES': 'Espagnol (es-ES)',
  'de-DE': 'Allemand (de-DE)',
  'ar-MA': 'Arabe (ar-MA)',
  'pt-BR': 'Portugais (pt-BR)'
};
const POSITIONS: { value: SubtitleStyle['position']; label: string }[] = [
  { value: 'bottom', label: 'Bas' },
  { value: 'center', label: 'Centre' },
  { value: 'top', label: 'Haut' }
];
const ALIGNS: { value: SubtitleStyle['align']; label: string }[] = [
  { value: 'left', label: 'Gauche' },
  { value: 'center', label: 'Centre' },
  { value: 'right', label: 'Droite' }
];

type Subtitles = NonNullable<NonNullable<CreativeSpec['audio']>['subtitles']>;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const roundTenth = (value: number) => Math.round(value * 10) / 10;
const formatSeconds = (value: number, digits = 1) => value.toFixed(digits).replace('.', ',');

function languageLabel(value: string) {
  return LANGUAGE_LABELS[value] ?? value;
}

/**
 * P09B — panneau sous-titres : activation, langue, repères et style. Le texte refuse
 * immédiatement les caractères interdits par le contrat (accolades, barres obliques
 * inverses, contrôles) avec un message actionnable ; le serveur revalide à l'enregistrement.
 */
export function StudioSubtitles({ spec, busy, base, approvedVersion, onSpec, onNotice }: StudioSubtitlesProps) {
  const subtitles = spec.audio?.subtitles;
  const cues = subtitles?.cues ?? [];
  const enabled = subtitles?.enabled ?? false;
  const language = subtitles?.language ?? 'fr-FR';
  const style = subtitles?.style ?? defaultSubtitleStyle;
  const totalSeconds = spec.scenes.reduce((sum, scene) => sum + scene.seconds, 0);
  const [textError, setTextError] = useState<{ index: number; message: string } | null>(null);

  function write(patch: Partial<Subtitles>) {
    const current: Subtitles = subtitles ?? { enabled: false, language: 'fr-FR', cues: [] };
    onSpec({
      ...spec,
      audio: {
        tracks: spec.audio?.tracks ?? [],
        subtitles: { ...current, ...patch }
      }
    });
  }

  function writeStyle(patch: Partial<SubtitleStyle>) {
    write({ style: { ...style, ...patch } });
  }

  function updateCue(index: number, patch: Partial<SubtitleCue>) {
    write({ cues: cues.map((cue, position) => (position === index ? { ...cue, ...patch } : cue)) });
  }

  function changeCueTime(index: number, key: 'start' | 'end', raw: string) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    updateCue(index, {
      [key]: roundTenth(clamp(parsed, key === 'start' ? 0 : 0.5, key === 'start' ? MAX_START : MAX_END))
    });
  }

  function changeCueText(index: number, value: string) {
    if (FORBIDDEN_TEXT.test(value)) {
      setTextError({
        index,
        message:
          'Texte refusé : les accolades, barres obliques inverses et caractères de contrôle ne sont pas autorisés dans un sous-titre.'
      });
      return;
    }
    if (textError?.index === index) setTextError(null);
    updateCue(index, { text: value });
  }

  function addCue() {
    if (cues.length >= MAX_CUES) {
      onNotice('Maximum de 200 sous-titres atteint : retirez un repère avant d’en ajouter un.');
      return;
    }
    const sorted = [...cues].sort((left, right) => left.end - right.end);
    const last = sorted[sorted.length - 1];
    const start = last ? roundTenth(last.end) : 0;
    const available = totalSeconds - start;
    if (available <= 0.7) {
      onNotice('La durée totale ne laisse pas assez de place pour un nouveau sous-titre.');
      return;
    }
    const end = roundTenth(Math.min(totalSeconds, start + 2));
    if (end - start <= 0.2) {
      onNotice('La durée totale ne laisse pas assez de place pour un nouveau sous-titre.');
      return;
    }
    write({ cues: [...cues, { start, end, text: '' }] });
    setTextError(null);
  }

  function removeCue(index: number) {
    write({ cues: cues.filter((_, position) => position !== index) });
    setTextError(null);
  }

  function splitCue(index: number) {
    const cue = cues[index];
    if (!cue) return;
    const midpoint = roundTenth((cue.start + cue.end) / 2);
    if (midpoint - cue.start <= 0.2 || cue.end - midpoint <= 0.2) {
      onNotice('La fenêtre de ce sous-titre est trop courte pour être scindée (0,2 s minimum par partie).');
      return;
    }
    const words = cue.text.trim().split(/\s+/).filter(Boolean);
    if (words.length < 2) {
      onNotice('Le texte doit contenir au moins deux mots pour être scindé.');
      return;
    }
    const cut = Math.ceil(words.length / 2);
    const first = words.slice(0, cut).join(' ');
    const second = words.slice(cut).join(' ');
    const next = [...cues];
    next.splice(
      index,
      1,
      { start: cue.start, end: midpoint, text: first },
      { start: midpoint, end: cue.end, text: second }
    );
    write({ cues: next });
    setTextError(null);
  }

  const warnings: string[] = [];
  const sortedCues = cues.map((cue, index) => ({ cue, index })).sort((left, right) => left.cue.start - right.cue.start);
  cues.forEach((cue, index) => {
    const number = index + 1;
    if (cue.end <= cue.start + 0.2) {
      warnings.push('Sous-titre ' + number + ' : la fin doit dépasser le début de plus de 0,2 s.');
    }
    if (cue.end > totalSeconds + 1e-6) {
      warnings.push(
        'Sous-titre ' + number + ' : dépasse la durée totale de la composition (' + formatSeconds(totalSeconds) + ' s).'
      );
    }
    if (!cue.text.trim()) warnings.push('Sous-titre ' + number + ' : le texte ne peut pas être vide.');
    if (cue.text.length > MAX_CUE_TEXT) {
      warnings.push('Sous-titre ' + number + ' : le texte dépasse ' + MAX_CUE_TEXT + ' caractères.');
    }
  });
  for (let index = 1; index < sortedCues.length; index += 1) {
    const previous = sortedCues[index - 1];
    const current = sortedCues[index];
    if (current && previous && current.cue.start < previous.cue.end - 1e-6) {
      warnings.push(
        'Les sous-titres ' + (previous.index + 1) + ' et ' + (current.index + 1) + ' se chevauchent : le rendu peut être ambigu.'
      );
    }
  }

  const srtAvailable = approvedVersion !== null && cues.length > 0;

  return (
    <section
      className="studio-inspector-section stack studio-subtitles-panel"
      aria-labelledby="inspector-subtitles-heading"
      aria-busy={busy}
    >
      <div className="section-head">
        <h3 id="inspector-subtitles-heading">Sous-titres</h3>
        <span className="hint">
          {cues.length} / {MAX_CUES} repère(s)
        </span>
      </div>
      <p className="hint">
        Les sous-titres sont rendus par le serveur à partir de la composition enregistrée. Le fichier SRT n’est
        exportable que pour une révision approuvée.
      </p>
      {warnings.length ? (
        <ul className="studio-subtitle-warnings" role="alert">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}

      <div className="stack">
        <label className="check-row">
          <input
            type="checkbox"
            checked={enabled}
            disabled={busy}
            onChange={(event) => write({ enabled: event.target.checked })}
          />
          <span>Afficher les sous-titres dans la vidéo rendue</span>
        </label>
        <label className="label">
          Langue des sous-titres
          <select
            className="input"
            value={language}
            disabled={busy}
            onChange={(event) => write({ language: event.target.value as AudioLanguage })}
          >
            {audioLanguage.options.map((value) => (
              <option key={value} value={value}>
                {languageLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <p className="hint">
          Langue déclarée de la piste : {languageLabel(language)}. Le rendu applique le style ci-dessous à chaque scène.
        </p>
      </div>

      <div className="studio-subtitle-style">
        <h4>Style des sous-titres</h4>
        <div className="studio-subtitle-style-grid">
          <label className="label">
            Taille (12 à 96)
            <input
              className="input"
              type="number"
              min={12}
              max={96}
              step={1}
              value={style.size}
              disabled={busy}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                if (!Number.isFinite(parsed)) return;
                writeStyle({ size: Math.round(clamp(parsed, 12, 96)) });
              }}
            />
          </label>
          <label className="label">
            Couleur du texte
            <input
              className="input"
              type="color"
              value={style.color}
              disabled={busy}
              onChange={(event) => writeStyle({ color: event.target.value })}
            />
          </label>
          <label className="label">
            Opacité (0 à 1) · {Math.round(style.opacity * 100)} %
            <input
              className="input"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={style.opacity}
              disabled={busy}
              onChange={(event) => writeStyle({ opacity: Number(event.target.value) })}
            />
          </label>
          <label className="label">
            Position verticale
            <select
              className="input"
              value={style.position}
              disabled={busy}
              onChange={(event) => writeStyle({ position: event.target.value as SubtitleStyle['position'] })}
            >
              {POSITIONS.map((position) => (
                <option key={position.value} value={position.value}>
                  {position.label}
                </option>
              ))}
            </select>
          </label>
          <label className="label">
            Alignement horizontal
            <select
              className="input"
              value={style.align}
              disabled={busy}
              onChange={(event) => writeStyle({ align: event.target.value as SubtitleStyle['align'] })}
            >
              {ALIGNS.map((align) => (
                <option key={align.value} value={align.value}>
                  {align.label}
                </option>
              ))}
            </select>
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={style.bold}
              disabled={busy}
              onChange={(event) => writeStyle({ bold: event.target.checked })}
            />
            <span>Gras</span>
          </label>
        </div>
        <label className="check-row">
          <input
            type="checkbox"
            checked={Boolean(style.background)}
            disabled={busy}
            onChange={(event) =>
              writeStyle({ background: event.target.checked ? (style.background ?? '#000000') : undefined })
            }
          />
          <span>Cartouche de fond derrière le texte</span>
        </label>
        {style.background ? (
          <label className="label">
            Couleur du cartouche
            <input
              className="input"
              type="color"
              value={style.background}
              disabled={busy}
              onChange={(event) => writeStyle({ background: event.target.value })}
            />
          </label>
        ) : null}
        <p className="hint">
          Le style est enregistré avec la révision et appliqué par le rendu serveur. Sans cartouche, seul le contour
          du texte est dessiné.
        </p>
      </div>

      <div className="stack">
        <div className="section-head">
          <h4>Repères horodatés</h4>
          <button
            type="button"
            className="btn btn-secondary btn-small"
            disabled={busy || cues.length >= MAX_CUES}
            onClick={addCue}
          >
            Ajouter un sous-titre
          </button>
        </div>
        {cues.length === 0 ? (
          <p className="hint">Aucun sous-titre : ajoutez un repère ou appliquez une transcription réussie.</p>
        ) : (
          <ol className="studio-cue-list" aria-label="Repères de sous-titres">
            {cues.map((cue, index) => (
              <li key={index} className="studio-cue-row">
                <div className="studio-cue-times">
                  <label className="label">
                    Début (s, 0 à 179,5)
                    <input
                      className="input"
                      type="number"
                      min={0}
                      max={MAX_START}
                      step={0.1}
                      value={cue.start}
                      disabled={busy}
                      aria-label={'Début du sous-titre ' + (index + 1) + ' en secondes'}
                      onChange={(event) => changeCueTime(index, 'start', event.target.value)}
                    />
                  </label>
                  <label className="label">
                    Fin (s, 0,5 à 180)
                    <input
                      className="input"
                      type="number"
                      min={0.5}
                      max={MAX_END}
                      step={0.1}
                      value={cue.end}
                      disabled={busy}
                      aria-label={'Fin du sous-titre ' + (index + 1) + ' en secondes'}
                      onChange={(event) => changeCueTime(index, 'end', event.target.value)}
                    />
                  </label>
                </div>
                <label className="label">
                  Texte (1 à 200 caractères)
                  <textarea
                    className="input"
                    rows={2}
                    maxLength={MAX_CUE_TEXT}
                    value={cue.text}
                    disabled={busy}
                    placeholder="Texte affiché à l’écran."
                    aria-label={'Texte du sous-titre ' + (index + 1)}
                    onChange={(event) => changeCueText(index, event.target.value)}
                  />
                </label>
                {textError?.index === index ? (
                  <p className="studio-audio-error" role="alert">
                    {textError.message}
                  </p>
                ) : null}
                <div className="studio-cue-actions">
                  <button type="button" className="btn btn-ghost btn-small" disabled={busy} onClick={() => splitCue(index)}>
                    Scinder au milieu
                  </button>
                  <button type="button" className="btn btn-ghost btn-small" disabled={busy} onClick={() => removeCue(index)}>
                    Retirer le sous-titre
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
        <p className="hint">
          « Scinder au milieu » coupe la fenêtre temporelle et répartit les mots du texte en deux repères ; chaque
          partie doit durer plus de 0,2 s.
        </p>
      </div>

      <div className="stack">
        {srtAvailable ? (
          <>
            <a
              className="btn btn-secondary btn-small"
              href={base + '/' + approvedVersion + '/subtitles'}
              download={'sous-titres-v' + approvedVersion + '.srt'}
              onClick={() =>
                onNotice(
                  'Téléchargement des sous-titres SRT de la révision approuvée v' +
                    approvedVersion +
                    ' : fichier dérivé, aucune publication.'
                )
              }
            >
              Télécharger les sous-titres (SRT)
            </a>
            <p className="hint">
              Le fichier correspond à la révision approuvée v{approvedVersion}, pas aux modifications locales non
              enregistrées.
            </p>
          </>
        ) : (
          <p className="hint">
            L’export SRT nécessite une révision approuvée contenant des sous-titres : approuvez la version affichée pour
            activer le téléchargement.
          </p>
        )}
      </div>
    </section>
  );
}
