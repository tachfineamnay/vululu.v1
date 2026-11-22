'use client';

/**
 * P08 — inspecteur contextuel du studio.
 * Toutes les éditions passent par onSpec (composition courante) ; aucune route serveur n’est
 * appelée ici : la sauvegarde de révision valide les droits et les règles du contrat.
 * Les champs additifs crop (image), align et spacing (texte) proviennent de l’extension
 * additive du contrat créatif P08 ; aucune donnée n’est simulée dans ce panneau.
 */

import { isVideoOutput, studioExportExtension } from '@vululu/contracts';
import type { StudioInspectorProps } from '../lib/studioComponentTypes';
import { StudioAudioPanel } from './StudioAudioPanel';
import { StudioSubtitles } from './StudioSubtitles';
import {
  MIN_LAYER_SIZE,
  clamp,
  clampLayer,
  createTextLayer,
  isImageLayer,
  withSafeArea,
  isTextLayer,
  moveLayerOrder,
  patchLayer,
  specWithLayers,
  type TextRole
} from '../lib/studioGeometry';
import { describeAudioTrim, withSceneDuration } from '../lib/studioAudio';
import type { ChannelZone, StudioLayerSpec, StudioScene, StudioSource } from '../lib/studioTypes';

type TextLayer = Extract<StudioLayerSpec, { type: 'text' }>;
type ImageLayer = Extract<StudioLayerSpec, { type: 'image' }>;
type LayerCrop = { zoom: number; focusX: number; focusY: number };

const MAX_LAYERS = 16;
const ROLES: { value: TextLayer['role']; label: string }[] = [
  { value: 'headline', label: 'Titre' },
  { value: 'body', label: 'Corps' },
  { value: 'cta', label: 'Appel à l’action' }
];
const FAMILIES: { value: NonNullable<TextLayer['family']>; label: string }[] = [
  { value: 'sans', label: 'Sans sérif' },
  { value: 'serif', label: 'Sérif' },
  { value: 'monospace', label: 'Chasse fixe' }
];
const ALIGNS: { value: NonNullable<TextLayer['align']>; label: string }[] = [
  { value: 'left', label: 'Gauche' },
  { value: 'center', label: 'Centre' },
  { value: 'right', label: 'Droite' }
];
const GRAVITIES: { value: ImageLayer['gravity']; label: string }[] = [
  { value: 'centre', label: 'Centre' },
  { value: 'north', label: 'Haut' },
  { value: 'south', label: 'Bas' },
  { value: 'east', label: 'Droite' },
  { value: 'west', label: 'Gauche' }
];
const TRANSITIONS: { value: NonNullable<StudioScene['transition']>; label: string }[] = [
  { value: 'cut', label: 'Coupe (cut)' },
  { value: 'dip', label: 'Fondu (dip)' }
];

function formatDecimal(value: number, digits = 2) {
  return value.toFixed(digits).replace('.', ',');
}

function truncated(text: string, size = 42) {
  const single = text.replace(/\s+/g, ' ').trim();
  return single.length > size ? single.slice(0, size) + '…' : single;
}

function sourceName(source: StudioSource | undefined) {
  return source?.name ?? 'Ressource non fournie';
}

/** Provenance réelle uniquement : outil Python interne, ou fournisseur d’image IA reconnu. */
function provenanceBadge(source: StudioSource | undefined): 'Python' | 'IA' | null {
  if (!source?.provenance) return null;
  const provenance = source.provenance.toLowerCase();
  if (provenance.includes('python-tools')) return 'Python';
  if (/gemini|replicate|runway|imagen/.test(provenance)) return 'IA';
  return null;
}

function zoneLabel(zone: ChannelZone) {
  const sides: string[] = [];
  if (zone.top !== undefined) sides.push('haut ' + Math.round(zone.top * 100) + ' %');
  if (zone.bottom !== undefined) sides.push('bas ' + Math.round(zone.bottom * 100) + ' %');
  if (zone.left !== undefined) sides.push('gauche ' + Math.round(zone.left * 100) + ' %');
  if (zone.right !== undefined) sides.push('droite ' + Math.round(zone.right * 100) + ' %');
  return sides.length ? zone.label + ' (' + sides.join(', ') + ')' : zone.label;
}

function NumberField({
  id,
  label,
  value,
  min,
  max,
  step,
  onChange
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="label" htmlFor={id}>
      {label}
      <input
        id={id}
        className="input"
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => {
          const parsed = Number(event.target.value);
          if (Number.isFinite(parsed)) onChange(parsed);
        }}
      />
    </label>
  );
}

/** Inspecteur contextuel : canvas, calques, calque sélectionné, ressources et scène. */
export function StudioInspector({
  spec,
  sceneIndex,
  selected,
  sources,
  media,
  confirmedIds,
  presets,
  channel,
  busy,
  onSpec,
  onSelect,
  onChannel,
  onNotice,
  audio
}: StudioInspectorProps) {
  const scene = spec.scenes[sceneIndex];
  const layers = scene?.layers ?? [];
  const selectedIndexes = selected.filter((index) => Number.isInteger(index) && index >= 0 && index < layers.length);
  const activeIndex = selectedIndexes.length ? selectedIndexes[0] : -1;
  const active = activeIndex >= 0 ? layers[activeIndex] : undefined;
  const activeSource = active && isImageLayer(active) ? sources.find((source) => source.id === active.versionId) : undefined;
  const imageSources = sources.filter(
    (source) => source.kind === 'logo' || source.kind === 'image' || (source.mimeType ?? '').startsWith('image/')
  );
  const videoSources = sources.filter((source) => source.mimeType === 'video/mp4');
  const timedExport = studioExportExtension(spec.delivery?.kind) !== 'png';
  // Toute sortie vidéo (courte ou paysage) accepte clip, transitions et cadrage de clip.
  const videoOutput = isVideoOutput(spec.delivery?.kind);
  const totalSeconds = spec.scenes.reduce((total, item) => total + item.seconds, 0);
  const imageLayerSelected = Boolean(active && isImageLayer(active));

  function changeScene(patch: Partial<StudioScene>) {
    onSpec({ ...spec, scenes: spec.scenes.map((item, index) => (index === sceneIndex ? { ...item, ...patch } : item)) });
  }

  function updateLayers(next: StudioLayerSpec[]) {
    onSpec(specWithLayers(spec, sceneIndex, next));
  }

  function updateLayer(index: number, patch: Partial<StudioLayerSpec>) {
    const layer = layers[index];
    if (!layer) return;
    updateLayers(
      layers.map((item, position) => (position === index ? clampLayer(patchLayer(item, patch), spec.safeArea) : item))
    );
  }

  function updateCrop(index: number, patch: Partial<LayerCrop>) {
    const layer = layers[index];
    if (!layer || !isImageLayer(layer) || !layer.crop) return;
    updateLayer(index, { crop: { ...layer.crop, ...patch } });
  }

  function changeSafeArea(value: number) {
    onSpec(withSafeArea(spec, value));
  }

  function changeBrand(key: 'background' | 'accent', value: string) {
    onSpec({ ...spec, brand: { ...spec.brand, [key]: value } });
  }

  function moveLayer(index: number, delta: 1 | -1) {
    // +1 = au-dessus (dernier indice du tableau = calque peint en dernier par le serveur).
    const moved = moveLayerOrder(layers, index, delta);
    if (moved.layers === layers) return;
    updateLayers(moved.layers);
    if (selectedIndexes.length === 1 && selectedIndexes[0] === index) onSelect(moved.index, false);
  }

  function removeLayer(index: number) {
    if (layers.length < 2) return;
    updateLayers(layers.filter((_, position) => position !== index));
    if (selectedIndexes.includes(index)) onSelect(Math.max(0, index - 1), false);
  }

  function changeSeconds(value: number) {
    const seconds = Math.round(clamp(value, 0.5, 30) * 2) / 2;
    if (seconds === scene?.seconds) return;
    const trim = withSceneDuration(spec, sceneIndex, seconds);
    onSpec(trim.spec);
    const message = describeAudioTrim(trim);
    if (message) onNotice(message);
  }

  function changeClipVersion(versionId: string) {
    if (!scene) return;
    if (!versionId) {
      changeScene({ clip: undefined });
      return;
    }
    changeScene({ clip: { versionId, start: scene.clip?.start ?? 0, height: scene.clip?.height ?? 0.65 } });
  }

  function changeClipStart(value: number) {
    if (!scene?.clip) return;
    changeScene({ clip: { ...scene.clip, start: clamp(value, 0, 600) } });
  }

  function changeClipFit(fit: 'cover' | 'contain') {
    if (!scene?.clip) return;
    changeScene({ clip: { ...scene.clip, fit } });
  }

  function changeClipFocusY(value: number) {
    if (!scene?.clip) return;
    changeScene({ clip: { ...scene.clip, focusY: clamp(value, 0, 1) } });
  }

  function insertSource(source: StudioSource) {
    if (layers.length >= MAX_LAYERS) {
      onNotice('Limite de 16 calques atteinte : retirez un calque avant d’insérer une ressource.');
      return;
    }
    const layer: StudioLayerSpec = {
      type: 'image',
      versionId: source.id,
      x: 0,
      y: 0,
      w: 1,
      h: scene?.clip ? 0.65 : 1,
      fit: 'cover',
      gravity: 'centre',
      opacity: 1
    };
    updateLayers([...layers, layer]);
    onSelect(layers.length, false);
    onNotice('Ressource « ' + source.name + ' » insérée en haut de la pile.');
  }

  function addTextLayer(role: TextRole) {
    if (layers.length >= MAX_LAYERS) {
      onNotice('Limite de 16 calques atteinte : retirez un calque avant d’ajouter du texte.');
      return;
    }
    updateLayers([...layers, createTextLayer(role, spec.safeArea)]);
    onSelect(layers.length, false);
    onNotice('Calque texte ajouté au-dessus de la pile : modifiez son contenu dans « Calque sélectionné ».');
  }

  function replaceSelectedSource(source: StudioSource) {
    if (activeIndex < 0 || !active || !isImageLayer(active)) return;
    updateLayer(activeIndex, { versionId: source.id });
    onNotice('Calque image remplacé par « ' + source.name + ' ».');
  }

  function boxControls(layer: StudioLayerSpec, index: number) {
    return (
      <>
        <p className="hint">
          Position et taille en fractions du canvas (0 à 1) : X et Y depuis le coin haut gauche, largeur et hauteur de la
          boîte.
        </p>
        <div className="two-col">
          <NumberField id="inspector-box-x" label="X (0 à 1)" value={layer.x} min={0} max={1} step={0.01} onChange={(value) => updateLayer(index, { x: value })} />
          <NumberField id="inspector-box-y" label="Y (0 à 1)" value={layer.y} min={0} max={1} step={0.01} onChange={(value) => updateLayer(index, { y: value })} />
        </div>
        <div className="two-col">
          <NumberField id="inspector-box-w" label={'Largeur (' + formatDecimal(MIN_LAYER_SIZE) + ' à 1)'} value={layer.w} min={MIN_LAYER_SIZE} max={1} step={0.01} onChange={(value) => updateLayer(index, { w: value })} />
          <NumberField id="inspector-box-h" label={'Hauteur (' + formatDecimal(MIN_LAYER_SIZE) + ' à 1)'} value={layer.h} min={MIN_LAYER_SIZE} max={1} step={0.01} onChange={(value) => updateLayer(index, { h: value })} />
        </div>
        <NumberField id="inspector-box-opacity" label="Opacité (0 à 1)" value={layer.opacity} min={0} max={1} step={0.01} onChange={(value) => updateLayer(index, { opacity: clamp(value, 0, 1) })} />
      </>
    );
  }

  function textControls(layer: TextLayer, index: number) {
    return (
      <div className="stack">
        <label className="label">
          Texte à l’écran
          <textarea
            className="input"
            rows={3}
            maxLength={2000}
            value={layer.text}
            onChange={(event) => updateLayer(index, { text: event.target.value })}
          />
        </label>
        {!layer.text.trim() ? (
          <p className="hint">Le texte ne peut pas être vide : la sauvegarde de la révision sera refusée.</p>
        ) : null}
        <div className="two-col">
          <label className="label">
            Rôle sémantique (verrouillé)
            <select className="input" value={layer.role} disabled>
              {ROLES.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </label>
          <label className="label">
            Police
            <select
              className="input"
              value={layer.family ?? 'sans'}
              onChange={(event) => updateLayer(index, { family: event.target.value as NonNullable<TextLayer['family']> })}
            >
              {FAMILIES.map((family) => (
                <option key={family.value} value={family.value}>
                  {family.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="hint">Le rôle structure la composition et ne se modifie pas depuis l’inspecteur.</p>
        <div className="two-col">
          <NumberField
            id="inspector-text-size"
            label="Corps (10 à 240)"
            value={layer.size}
            min={10}
            max={240}
            step={1}
            onChange={(value) => {
              const size = Math.round(clamp(value, 10, 240));
              updateLayer(index, { size, ...(layer.minSize && layer.minSize > size ? { minSize: size } : {}) });
            }}
          />
          <label className="label">
            Couleur du texte
            <input className="input" type="color" value={layer.color} onChange={(event) => updateLayer(index, { color: event.target.value })} />
          </label>
        </div>
        <label className="check-row">
          <input type="checkbox" checked={layer.bold} onChange={(event) => updateLayer(index, { bold: event.target.checked })} />
          <span>Gras</span>
        </label>
        <div className="two-col">
          <label className="label">
            Cartouche de fond (optionnel)
            <span className="actions">
              <input
                className="input"
                type="color"
                value={layer.plate ?? spec.brand.background}
                onChange={(event) => updateLayer(index, { plate: event.target.value })}
              />
              {layer.plate ? <span className="studio-swatch" style={{ background: layer.plate }} aria-hidden="true" /> : null}
            </span>
          </label>
          <div className="stack">
            {layer.plate ? (
              <button type="button" className="btn btn-ghost" onClick={() => updateLayer(index, { plate: undefined })}>
                Retirer le cartouche
              </button>
            ) : (
              <p className="hint">Aucun cartouche appliqué : le texte repose sur le fond de scène.</p>
            )}
          </div>
        </div>
        <div className="two-col">
          <label className="label">
            Alignement (optionnel)
            <select
              className="input"
              value={layer.align ?? ''}
              onChange={(event) =>
                updateLayer(index, {
                  align: event.target.value === '' ? undefined : (event.target.value as NonNullable<TextLayer['align']>)
                })
              }
            >
              <option value="">Par défaut</option>
              {ALIGNS.map((align) => (
                <option key={align.value} value={align.value}>
                  {align.label}
                </option>
              ))}
            </select>
          </label>
          <label className="label">
            Interligne (0 à 200, optionnel)
            <input
              className="input"
              type="number"
              min={0}
              max={200}
              step={1}
              value={layer.spacing ?? ''}
              onChange={(event) => {
                const raw = event.target.value;
                const parsed = Number(raw);
                updateLayer(index, {
                  spacing: raw === '' || !Number.isFinite(parsed) ? undefined : Math.round(clamp(parsed, 0, 200))
                });
              }}
            />
          </label>
        </div>
        {boxControls(layer, index)}
      </div>
    );
  }

  function imageControls(layer: ImageLayer, index: number, source: StudioSource | undefined) {
    const badge = provenanceBadge(source);
    return (
      <div className="stack">
        <label className="label">
          Ressource
          <select className="input" value={layer.versionId} onChange={(event) => updateLayer(index, { versionId: event.target.value })}>
            {!imageSources.some((item) => item.id === layer.versionId) ? (
              <option value={layer.versionId}>{layer.versionId} (hors liste fournie)</option>
            ) : null}
            {imageSources.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.kind}
              </option>
            ))}
          </select>
        </label>
        {source ? (
          <p className="hint">
            Licence : {source.license ?? 'non fournie'} · Provenance : {source.provenance ?? 'non fournie'}
          </p>
        ) : (
          <p className="hint">Ressource absente de la liste fournie : provenance inconnue, non inventée.</p>
        )}
        {badge ? (
          <p className="hint">
            <span className={'studio-badge ' + (badge === 'Python' ? 'is-python' : 'is-ai')}>{badge}</span>{' '}
            {badge === 'Python' ? 'Provenance : outil Python interne.' : 'Provenance : fournisseur d’image IA.'}
          </p>
        ) : null}
        <div className="two-col">
          <label className="label">
            Cadrage
            <select
              className="input"
              value={layer.crop ? 'cover' : layer.fit}
              disabled={Boolean(layer.crop)}
              onChange={(event) => updateLayer(index, { fit: event.target.value as ImageLayer['fit'] })}
            >
              <option value="cover">Remplir (cover)</option>
              <option value="contain">Contenir (contain)</option>
            </select>
          </label>
          <label className="label">
            Ancrage
            <select
              className="input"
              value={layer.gravity}
              onChange={(event) => updateLayer(index, { gravity: event.target.value as ImageLayer['gravity'] })}
            >
              {GRAVITIES.map((gravity) => (
                <option key={gravity.value} value={gravity.value}>
                  {gravity.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {layer.crop ? <p className="hint">Recadrage fin actif : le cadrage est fixé sur « remplir » tant que le recadrage est présent.</p> : null}
        {layer.crop ? (
          <div className="stack">
            <div className="two-col">
              <NumberField
                id="inspector-crop-zoom"
                label="Zoom du recadrage (1 à 4)"
                value={layer.crop.zoom}
                min={1}
                max={4}
                step={0.05}
                onChange={(value) => updateCrop(index, { zoom: clamp(value, 1, 4) })}
              />
              <NumberField
                id="inspector-crop-focus-x"
                label="Focus X (0 à 1)"
                value={layer.crop.focusX}
                min={0}
                max={1}
                step={0.01}
                onChange={(value) => updateCrop(index, { focusX: clamp(value, 0, 1) })}
              />
            </div>
            <NumberField
              id="inspector-crop-focus-y"
              label="Focus Y (0 à 1)"
              value={layer.crop.focusY}
              min={0}
              max={1}
              step={0.01}
              onChange={(value) => updateCrop(index, { focusY: clamp(value, 0, 1) })}
            />
            <button type="button" className="btn btn-secondary" onClick={() => updateLayer(index, { crop: undefined })}>
              Réinitialiser le cadrage
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => updateLayer(index, { crop: { zoom: 1, focusX: 0.5, focusY: 0.5 }, fit: 'cover' })}
          >
            Activer le recadrage fin
          </button>
        )}
        {boxControls(layer, index)}
      </div>
    );
  }

  if (!scene) {
    return (
      <aside className="studio-inspector" aria-label="Inspecteur de composition">
        <p className="hint">Aucune scène à inspecter.</p>
      </aside>
    );
  }

  return (
    <aside className="studio-inspector" aria-labelledby="studio-inspector-heading" aria-busy={busy}>
      <div className="stack">
        <header className="stack">
          <p className="eyebrow">Inspecteur</p>
          <h2 id="studio-inspector-heading">Composition</h2>
          <p className="hint">
            {channel ? 'Repère de canal : ' + channel.label : 'Aucun repère de canal sélectionné'} · {spec.width} ×{' '}
            {spec.height} px
          </p>
          <p className="hint">
            Les repères d’interface du canal sont indicatifs : ils ne garantissent pas le rendu final sur le réseau.
          </p>
          {channel && channel.zones.length > 0 ? (
            <ul className="hint" aria-label="Zones d’interface du canal">
              {channel.zones.map((zone) => (
                <li key={zone.label}>{zoneLabel(zone)}</li>
              ))}
            </ul>
          ) : null}
        </header>
        {busy ? (
          <p className="hint" role="status">
            Traitement en cours… Les réglages restent désactivés jusqu’à la fin de l’action.
          </p>
        ) : null}
        <fieldset className="stack" disabled={busy}>
          <legend className="sr-only">Réglages de la composition</legend>

          <section className="studio-inspector-section stack" aria-labelledby="inspector-canvas-heading">
            <div className="section-head">
              <h3 id="inspector-canvas-heading">Canvas</h3>
              <span className="hint">
                {spec.width} × {spec.height} px
              </span>
            </div>
            <div className="two-col">
              <label className="label">
                Fond de marque
                <span className="actions">
                  <input
                    className="input"
                    type="color"
                    value={spec.brand.background}
                    onChange={(event) => changeBrand('background', event.target.value)}
                  />
                  <span className="studio-swatch" style={{ background: spec.brand.background }} aria-hidden="true" />
                </span>
              </label>
              <label className="label">
                Accent de marque
                <span className="actions">
                  <input
                    className="input"
                    type="color"
                    value={spec.brand.accent}
                    onChange={(event) => changeBrand('accent', event.target.value)}
                  />
                  <span className="studio-swatch" style={{ background: spec.brand.accent }} aria-hidden="true" />
                </span>
              </label>
            </div>
            <p className="hint">
              Identité de marque : les deux couleurs proviennent du contexte du projet. Le détail complet de la marque n’est
              pas fourni à cet inspecteur.
            </p>
            <div className="two-col">
              <label className="label">
                Fond de scène
                <span className="actions">
                  <input
                    className="input"
                    type="color"
                    value={scene.background ?? spec.brand.background}
                    onChange={(event) => changeScene({ background: event.target.value })}
                  />
                  <span
                    className="studio-swatch"
                    style={{ background: scene.background ?? spec.brand.background }}
                    aria-hidden="true"
                  />
                </span>
              </label>
              <div className="stack">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={scene.background === spec.brand.background}
                  onClick={() => changeScene({ background: spec.brand.background })}
                >
                  Utiliser le fond de marque
                </button>
                {scene.background ? (
                  <button type="button" className="btn btn-ghost" onClick={() => changeScene({ background: undefined })}>
                    Retirer le fond de scène
                  </button>
                ) : (
                  <p className="hint">Fond hérité de la marque tant qu’aucune couleur de scène n’est choisie.</p>
                )}
              </div>
            </div>
            <label className="label">
              Marge sûre (0 à 0,2)
              <input
                className="input"
                type="range"
                min={0}
                max={0.2}
                step={0.01}
                value={spec.safeArea}
                onChange={(event) => changeSafeArea(Number(event.target.value))}
                aria-describedby="inspector-safe-area-hint"
              />
            </label>
            <p className="hint" id="inspector-safe-area-hint">
              Valeur appliquée : {formatDecimal(spec.safeArea)}. Les calques texte sont recentrés dans la zone sûre ; les
              images peuvent occuper tout le cadre.
            </p>
            <div className="stack" role="group" aria-labelledby="inspector-channel-heading">
              <p className="label" id="inspector-channel-heading">
                Repère de canal
              </p>
              <div className="actions">
                {presets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className="btn btn-secondary"
                    aria-pressed={channel?.id === preset.id}
                    onClick={() => onChannel(preset.id)}
                  >
                    {preset.label} · {preset.width} × {preset.height}
                  </button>
                ))}
              </div>
              <p className="hint">
                Changer de canal réapplique les dimensions, la marge sûre et les formats admis ; les scènes superflues
                peuvent être retirées par la règle du canal.
              </p>
            </div>
          </section>

          <section className="studio-inspector-section stack" aria-labelledby="inspector-layers-heading">
            <div className="section-head">
              <h3 id="inspector-layers-heading">Calques</h3>
              <span className="hint">
                {layers.length} / {MAX_LAYERS}
              </span>
            </div>
            <p className="hint">
              Ordre d’affichage : du calque le plus haut au plus bas. Ctrl ou Maj + clic pour sélectionner plusieurs calques.
            </p>
            <div className="actions" role="group" aria-label="Ajouter un calque texte">
              {ROLES.map((role) => (
                <button
                  key={role.value}
                  type="button"
                  className="btn btn-ghost btn-small"
                  disabled={busy || layers.length >= MAX_LAYERS}
                  aria-label={'Ajouter un calque texte · ' + role.label}
                  onClick={() => addTextLayer(role.value)}
                >
                  + {role.label}
                </button>
              ))}
            </div>
            <ol className="studio-layer-list">
              {layers
                .map((layer, index) => ({ layer, index }))
                .reverse()
                .map(({ layer, index }) => {
                  const isSelected = selectedIndexes.includes(index);
                  return (
                    <li key={scene.key + ':' + index} className="studio-layer-row" data-selected={isSelected ? 'true' : undefined}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        aria-pressed={isSelected}
                        aria-label={'Calque ' + (index + 1) + ' · ' + (isTextLayer(layer) ? 'texte' : 'image') + ' · ' + (isTextLayer(layer) ? truncated(layer.text) : sourceName(sources.find((source) => source.id === layer.versionId)))}
                        onClick={(event) => onSelect(index, event.shiftKey || event.ctrlKey || event.metaKey)}
                      >
                        <span>{isTextLayer(layer) ? truncated(layer.text) || 'Texte vide' : sourceName(sources.find((source) => source.id === layer.versionId))}</span>
                        <span className="studio-badge">{isTextLayer(layer) ? 'Texte' : 'Image'}</span>
                      </button>
                      <div className="actions">
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={index >= layers.length - 1}
                          aria-label={'Monter le calque ' + (index + 1)}
                          onClick={() => moveLayer(index, 1)}
                        >
                          Monter
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={index === 0}
                          aria-label={'Descendre le calque ' + (index + 1)}
                          onClick={() => moveLayer(index, -1)}
                        >
                          Descendre
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={layers.length < 2}
                          aria-label={'Supprimer le calque ' + (index + 1)}
                          onClick={() => removeLayer(index)}
                        >
                          Supprimer
                        </button>
                      </div>
                    </li>
                  );
                })}
            </ol>
          </section>

          <section className="studio-inspector-section stack" aria-labelledby="inspector-selected-heading">
            <div className="section-head">
              <h3 id="inspector-selected-heading">Calque sélectionné</h3>
              {selectedIndexes.length > 1 ? <span className="hint">{selectedIndexes.length} calques</span> : null}
            </div>
            {!active ? (
              <p className="hint">Sélectionnez un calque dans la liste ou sur le canvas pour régler son contenu et sa position.</p>
            ) : (
              <>
                <p className="hint">
                  Calque {activeIndex + 1} sur {layers.length} · {isTextLayer(active) ? 'Texte' : 'Image'}
                  {selectedIndexes.length > 1 ? ' · l’édition porte sur le premier calque sélectionné' : ''}
                </p>
                {isTextLayer(active) ? textControls(active, activeIndex) : imageControls(active, activeIndex, activeSource)}
              </>
            )}
          </section>

          <section className="studio-inspector-section stack" aria-labelledby="inspector-resources-heading">
            <div className="section-head">
              <h3 id="inspector-resources-heading">Ressources</h3>
              <span className="hint">
                {imageSources.length} image(s) ou logo(s)
              </span>
            </div>
            {imageSources.length === 0 ? (
              <p className="hint">Aucune ressource image ou logo fournie pour ce contexte.</p>
            ) : (
              <ul className="studio-layer-list">
                {imageSources.map((source) => {
                  const badge = provenanceBadge(source);
                  const confirmed = confirmedIds.includes(source.id);
                  return (
                    <li key={source.id} className="studio-layer-row">
                      <div className="stack">
                        <span className="actions">
                          <strong>{source.name}</strong>
                          <span className="studio-badge">{source.kind === 'logo' ? 'Logo' : source.kind === 'image' ? 'Image' : source.kind}</span>
                          {badge ? <span className={'studio-badge ' + (badge === 'Python' ? 'is-python' : 'is-ai')}>{badge}</span> : null}
                          {confirmed ? <span className="studio-badge">Confirmée</span> : null}
                        </span>
                        <p className="hint">
                          Licence : {source.license ?? 'non fournie'} · Provenance : {source.provenance ?? 'non fournie'}
                          {source.metadata?.width && source.metadata?.height
                            ? ' · ' + source.metadata.width + ' × ' + source.metadata.height + ' px'
                            : ''}
                        </p>
                      </div>
                      <div className="actions">
                        <button
                          type="button"
                          className="btn btn-secondary"
                          disabled={layers.length >= MAX_LAYERS}
                          onClick={() => insertSource(source)}
                        >
                          Insérer
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={!imageLayerSelected}
                          onClick={() => replaceSelectedSource(source)}
                        >
                          Remplacer le calque
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="hint">
              « Insérer » ajoute une image en haut de la pile ; « Remplacer le calque » remplace la ressource du calque image
              sélectionné. Aucune route d’application n’est appelée ici : la sauvegarde de révision valide les droits.
            </p>
            {!imageLayerSelected ? <p className="hint">Sélectionnez un calque image pour activer « Remplacer le calque ».</p> : null}
          </section>

          <section className="studio-inspector-section stack" aria-labelledby="inspector-scene-heading">
            <div className="section-head">
              <h3 id="inspector-scene-heading">Scène</h3>
              <span className="hint">
                {sceneIndex + 1} / {spec.scenes.length} · {scene.key}
              </span>
            </div>
            {timedExport ? (
              <NumberField
                id="inspector-scene-seconds"
                label="Durée (secondes, 0,5 à 30)"
                value={scene.seconds}
                min={0.5}
                max={30}
                step={0.5}
                onChange={changeSeconds}
              />
            ) : (
              <p className="hint">La durée de scène ne s’applique pas à cette sortie image.</p>
            )}
            <p className="hint">
              Durée totale : {formatDecimal(totalSeconds, 1)} s · maximum 180 s sur l’ensemble des scènes.
            </p>
            {videoOutput ? (
              <label className="label">
                Clip de la bibliothèque
                <select className="input" value={scene.clip?.versionId ?? ''} onChange={(event) => changeClipVersion(event.target.value)}>
                  <option value="">Aucun clip</option>
                  {videoSources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.name}
                      {source.metadata?.duration !== undefined ? ' · ' + source.metadata.duration + ' s' : ''}
                    </option>
                  ))}
                  {scene.clip && !videoSources.some((source) => source.id === scene.clip?.versionId) ? (
                    <option value={scene.clip.versionId}>{scene.clip.versionId} (hors liste fournie)</option>
                  ) : null}
                </select>
              </label>
            ) : null}
            {scene.clip ? (
              <>
                <NumberField
                  id="inspector-clip-start"
                  label="Début du clip (secondes, 0 à 600)"
                  value={scene.clip.start}
                  min={0}
                  max={600}
                  step={0.5}
                  onChange={changeClipStart}
                />
                <label className="label">
                  Cadrage du clip
                  <select
                    className="input"
                    value={scene.clip.fit ?? 'cover'}
                    onChange={(event) => changeClipFit(event.target.value as 'cover' | 'contain')}
                  >
                    <option value="cover">Remplir</option>
                    <option value="contain">Contenir</option>
                  </select>
                </label>
                <label className="label">
                  Point de mire vertical du clip (0 = haut, 1 = bas)
                  <input
                    className="input"
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={scene.clip.focusY ?? 0.5}
                    aria-describedby="inspector-clip-focus-hint"
                    onChange={(event) => changeClipFocusY(Number(event.target.value))}
                  />
                </label>
                <p className="hint" id="inspector-clip-focus-hint">
                  Cadrage appliqué par le rendu serveur : « remplir » recadre le clip dans le cadre, « contenir »
                  l’insère en entier. Le point de mire déplace le recadrage vertical. Valeur actuelle :{' '}
                  {formatDecimal(scene.clip.focusY ?? 0.5)}.
                </p>
                <button type="button" className="btn btn-ghost btn-small" onClick={() => changeClipFocusY(0.5)}>
                  Recentrer le point de mire
                </button>
              </>
            ) : null}
            {videoOutput ? (
              <label className="label">
                Transition de scène
                <select
                  className="input"
                  value={scene.transition ?? ''}
                  onChange={(event) => {
                    const value = event.target.value;
                    changeScene({ transition: value === '' ? undefined : (value as NonNullable<StudioScene['transition']>) });
                  }}
                >
                  <option value="">Aucune</option>
                  {TRANSITIONS.map((transition) => (
                    <option key={transition.value} value={transition.value}>
                      {transition.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="hint">Clip, cadrage du clip et transition sont réservés aux sorties vidéo.</p>
            )}
          </section>

          {videoOutput ? (
            <>
              <StudioAudioPanel
                spec={spec}
                media={media}
                busy={busy}
                operations={audio}
                onSpec={onSpec}
                onNotice={onNotice}
              />
              <StudioSubtitles
                spec={spec}
                busy={busy}
                base={audio.base}
                approvedVersion={audio.approvedVersion}
                onSpec={onSpec}
                onNotice={onNotice}
              />
            </>
          ) : null}
        </fieldset>
      </div>
    </aside>
  );
}
