'use client';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { CreativeSpec } from '@vululu/contracts';
import {
  boxStyle, isImageLayer, isTextLayer, moveLayers, resizeLayer, selectionBounds
} from '../lib/studioGeometry';
import type {
  ChannelPreset, StudioLayerSpec, StudioResizeHandle, StudioSource
} from '../lib/studioTypes';
import type { StudioPreviewState } from '../lib/useStudioPreview';

const HANDLES: StudioResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const ZOOMS = [0.5, 0.75, 1] as const;

type DragState =
  | {
      kind: 'move';
      startX: number;
      startY: number;
      rect: DOMRect;
      initial: StudioLayerSpec[];
      selection: number[];
    }
  | {
      kind: 'resize';
      handle: StudioResizeHandle;
      index: number;
      startX: number;
      startY: number;
      rect: DOMRect;
      initial: StudioLayerSpec[];
    };

export type StudioCanvasProps = {
  spec: CreativeSpec;
  sceneIndex: number;
  selected: number[];
  sources: StudioSource[];
  channel: ChannelPreset | undefined;
  preview: StudioPreviewState;
  busy: boolean;
  onSelect: (index: number, additive: boolean) => void;
  onGestureStart: () => void;
  onGestureEnd: () => void;
  onChange: (layers: StudioLayerSpec[], mode: 'gesture' | 'commit') => void;
  onRefreshPreview: () => void;
};

function layerName(layer: StudioLayerSpec, sources: StudioSource[]) {
  if (isTextLayer(layer)) return layer.text.length > 34 ? layer.text.slice(0, 34) + '…' : layer.text;
  const source = sources.find((item) => item.id === (layer as Extract<StudioLayerSpec, { type: 'image' }>).versionId);
  return source?.name ?? 'Image';
}

/** Canvas central : aperçu exact rendu par le serveur, boîtes de sélection interactives. */
export function StudioCanvas({
  spec, sceneIndex, selected, sources, channel, preview, busy,
  onSelect, onGestureStart, onGestureEnd, onChange, onRefreshPreview
}: StudioCanvasProps) {
  const scene = spec.scenes[sceneIndex];
  const overlay = useRef<HTMLDivElement | null>(null);
  const drag = useRef<DragState | null>(null);
  const [zoom, setZoom] = useState<'fit' | 0.5 | 0.75 | 1>('fit');
  const [guides, setGuides] = useState(true);
  const [moved, setMoved] = useState(false);
  const bounds = selectionBounds(scene?.layers ?? [], selected);

  const endListeners = useRef<{ move: (event: globalThis.PointerEvent) => void; up: () => void } | null>(null);
  const detach = useCallback(() => {
    const listeners = endListeners.current;
    if (!listeners) return;
    window.removeEventListener('pointermove', listeners.move);
    window.removeEventListener('pointerup', listeners.up);
    endListeners.current = null;
  }, []);
  useEffect(() => detach, [detach]);

  function beginMove(event: PointerEvent<HTMLButtonElement>, index: number) {
    if (busy || !overlay.current) return;
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    let selection = selected;
    if (additive) {
      if (selected.includes(index)) {
        onSelect(index, true);
        return;
      }
      selection = [...selected, index];
      onSelect(index, true);
    } else if (!selected.includes(index)) {
      selection = [index];
      onSelect(index, false);
    }
    event.preventDefault();
    const rect = overlay.current.getBoundingClientRect();
    const initial = scene.layers;
    drag.current = { kind: 'move', startX: event.clientX, startY: event.clientY, rect, initial, selection };
    onGestureStart();
    setMoved(false);
    const move = (pointer: globalThis.PointerEvent) => {
      const state = drag.current;
      if (!state || state.kind !== 'move') return;
      if (Math.abs(pointer.clientX - state.startX) + Math.abs(pointer.clientY - state.startY) < 3) return;
      setMoved(true);
      const dx = (pointer.clientX - state.startX) / state.rect.width;
      const dy = (pointer.clientY - state.startY) / state.rect.height;
      onChange(moveLayers(state.initial, state.selection, dx, dy, spec.safeArea), 'gesture');
    };
    const up = () => {
      detach();
      drag.current = null;
      setMoved(false);
      onGestureEnd();
    };
    endListeners.current = { move, up };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function beginResize(event: PointerEvent<HTMLDivElement>, handle: StudioResizeHandle, index: number) {
    if (busy || !overlay.current) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = overlay.current.getBoundingClientRect();
    drag.current = { kind: 'resize', handle, index, startX: event.clientX, startY: event.clientY, rect, initial: scene.layers };
    onGestureStart();
    const move = (pointer: globalThis.PointerEvent) => {
      const state = drag.current;
      if (!state || state.kind !== 'resize') return;
      const layer = state.initial[state.index];
      if (!layer) return;
      const dx = (pointer.clientX - state.startX) / state.rect.width;
      const dy = (pointer.clientY - state.startY) / state.rect.height;
      const next = state.initial.map((item, position) => (position === state.index ? resizeLayer(layer, state.handle, dx, dy, spec.safeArea) : item));
      onChange(next, 'gesture');
    };
    const up = () => {
      detach();
      drag.current = null;
      onGestureEnd();
    };
    endListeners.current = { move, up };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function keydown(event: KeyboardEvent<HTMLDivElement>) {
    if (!scene || busy) return;
    if (event.key === 'Escape') {
      onSelect(-1, false);
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (!selected.length || scene.layers.length <= selected.length) return;
      event.preventDefault();
      onChange(scene.layers.filter((_, index) => !selected.includes(index)), 'commit');
      onSelect(-1, false);
      return;
    }
    if (event.key.startsWith('Arrow')) {
      if (!selected.length) return;
      event.preventDefault();
      const step = event.shiftKey ? 0.02 : 0.005;
      const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
      const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
      onChange(moveLayers(scene.layers, selected, dx, dy, spec.safeArea), 'commit');
    }
  }

  if (!scene) return <p className="hint">Aucune scène à afficher.</p>;
  const status = preview.state === 'loading'
    ? 'Actualisation de l’aperçu serveur…'
    : preview.state === 'invalid'
      ? 'Composition incomplète : ' + preview.message
      : preview.state === 'error'
        ? 'Aperçu indisponible : ' + preview.message
        : preview.state === 'ready'
          ? 'Aperçu exact rendu par le serveur (même moteur que le rendu final).'
          : 'Préparation de l’aperçu…';

  return (
    <section className="studio-canvas" aria-label={'Canvas de composition · ' + scene.key}>
      <div className="studio-canvas-toolbar">
        <p className="hint" role="status" aria-live="polite">
          {spec.width} × {spec.height}
          {channel ? ' · ' + channel.label : ''} · {scene.key} · marge sûre {Math.round(spec.safeArea * 100)} %
        </p>
        <div className="studio-canvas-actions">
          <button type="button" className="btn btn-ghost btn-small" aria-pressed={guides} onClick={() => setGuides((value) => !value)}>
            Repères {guides ? 'visibles' : 'masqués'}
          </button>
          <label className="label studio-zoom">
            Zoom
            <select className="input" value={String(zoom)} onChange={(event) => setZoom(event.target.value === 'fit' ? 'fit' : Number(event.target.value) as 0.5 | 0.75 | 1)}>
              <option value="fit">Ajuster</option>
              {ZOOMS.map((value) => <option key={value} value={value}>{Math.round(value * 100)} %</option>)}
            </select>
          </label>
          <button type="button" className="btn btn-ghost btn-small" disabled={busy} onClick={onRefreshPreview}>
            Actualiser l’aperçu
          </button>
        </div>
      </div>
      <div className="studio-canvas-viewport">
        <div
          className="studio-canvas-frame"
          ref={overlay}
          style={{ aspectRatio: spec.width + ' / ' + spec.height, ...(zoom === 'fit' ? { width: '100%' } : { width: Math.round(spec.width * zoom), maxWidth: '100%' }) }}
          tabIndex={0}
          role="application"
          aria-label="Sélection et déplacement des calques. Flèches pour ajuster, Maj+flèches pour un pas large, Suppr pour retirer, Échap pour désélectionner."
          onKeyDown={keydown}
        >
          {preview.url ? (
            <img
              className="studio-canvas-image"
              data-testid="studio-canvas-image"
              src={preview.url}
              alt={'Aperçu exact de la scène ' + scene.key}
              style={{ opacity: preview.state === 'loading' ? 0.72 : 1 }}
              draggable={false}
            />
          ) : (
            <div className="studio-canvas-placeholder" role="status">
              <p>{preview.state === 'error' || preview.state === 'invalid' ? status : 'Préparation de l’aperçu serveur…'}</p>
            </div>
          )}
          <div className={'studio-canvas-layer' + (busy ? ' is-busy' : '')}>
            {/* Ordre de peinture du contrat : le dernier calque du tableau est au-dessus, comme
                dans le compositeur serveur. Les boîtes de sélection suivent donc l'ordre du tableau,
                sinon un clic sélectionne le calque masqué au lieu de celui qui est visible. */}
            {scene.layers.map((layer, index) => ({ layer, index })).map(({ layer, index }) => {
              const isSelected = selected.includes(index);
              return (
                <button
                  key={scene.key + ':' + index}
                  type="button"
                  className={'studio-layer-box' + (isSelected ? ' is-selected' : '') + (isTextLayer(layer) ? ' is-text' : ' is-image')}
                  style={boxStyle(layer)}
                  aria-pressed={isSelected}
                  aria-label={'Calque ' + (index + 1) + ' · ' + (isTextLayer(layer) ? 'texte' : 'image') + ' · ' + layerName(layer, sources)}
                  onPointerDown={(event) => beginMove(event, index)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelect(index, event.shiftKey);
                    }
                  }}
                >
                  {isImageLayer(layer) ? null : <span className="studio-layer-tag">{index + 1}</span>}
                </button>
              );
            })}
            {bounds && selected.length > 1 && (
              <div className="studio-selection-bounds" style={boxStyle(bounds)} aria-hidden="true" />
            )}
            {selected.length === 1 && scene.layers[selected[0]] && (
              <div className="studio-resize-handles" style={boxStyle(scene.layers[selected[0]])}>
                {HANDLES.map((handle) => (
                  <div
                    key={handle}
                    role="presentation"
                    className={'studio-resize-handle handle-' + handle}
                    onPointerDown={(event) => beginResize(event, handle, selected[0])}
                  />
                ))}
              </div>
            )}
          </div>
          {guides && (
            <div className="studio-guides" aria-hidden="true">
              <div className="studio-safe-area" style={{ inset: Math.round(spec.safeArea * 1000) / 10 + '%' }} />
              {channel?.zones.map((zone) => {
                const style: Record<string, string | number> = {};
                if (zone.top !== undefined) { style.top = 0; style.height = zone.top * 100 + '%'; style.left = 0; style.right = 0; }
                if (zone.bottom !== undefined) { style.bottom = 0; style.height = zone.bottom * 100 + '%'; style.left = 0; style.right = 0; }
                if (zone.left !== undefined) { style.left = 0; style.width = zone.left * 100 + '%'; style.top = 0; style.bottom = 0; }
                if (zone.right !== undefined) { style.right = 0; style.width = zone.right * 100 + '%'; style.top = 0; style.bottom = 0; }
                return (
                  <div key={zone.label} className="studio-guide-zone" style={style}>
                    <span>{zone.label}</span>
                  </div>
                );
              })}
            </div>
          )}
          {moved && <span className="studio-canvas-hint">Relâchez pour valider le déplacement · un seul pas d’annulation.</span>}

        </div>
      </div>
      <p className="hint" role={preview.state === 'error' || preview.state === 'invalid' ? 'alert' : 'status'}>
        {status}
        {channel?.zones.length ? ' Les repères de canal signalent les zones d’interface habituelles ; ils ne garantissent pas l’affichage final sur le réseau.' : ''}
        {preview.state === 'error' ? <> <button type="button" className="text-link" onClick={onRefreshPreview}>Réessayer</button></> : null}
      </p>
      <p className="hint">
        Astuce : cliquez un calque pour le sélectionner, Maj+clic pour en sélectionner plusieurs, glissez pour déplacer,
        poignées pour redimensionner. Flèches ±0,5 % (Maj : ±2 %), Suppr retire le calque, Échap désélectionne.
      </p>
    </section>
  );
}