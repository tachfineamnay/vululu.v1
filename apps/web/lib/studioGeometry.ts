import type { CreativeSpec } from '@vululu/contracts';
import type { StudioAlignMode, StudioBox, StudioLayerSpec, StudioResizeHandle, StudioScene } from './studioTypes';

/** Taille minimale d'un calque (le contrat exige 0,01 ; on garde une marge manipulable). */
export const MIN_LAYER_SIZE = 0.02;
export const roundBox = (value: number) => Math.round(value * 1000) / 1000;
export const clamp = (value: number, min: number, max: number) => (value < min ? min : value > max ? max : value);

/** Le texte doit rester dans la zone sûre ; les images peuvent occuper tout le cadre. */
export function layerMargin(layer: StudioLayerSpec, safeArea: number) {
  return layer.type === 'text' ? safeArea : 0;
}

export function clampLayer(layer: StudioLayerSpec, safeArea: number): StudioLayerSpec {
  const m = layerMargin(layer, safeArea);
  // `1 - 2 * m` et `1 - m - w` ne sont pas exactement sur la grille au millième : borner aussi
  // le maximum par la marge évite un x = 0,049999… qui sortirait de la zone sûre du contrat
  // (le contrat compare `x < safeArea` sans tolérance) et invaliderait toute la composition.
  const maxSize = Math.max(MIN_LAYER_SIZE, roundBox(1 - 2 * m));
  const w = clamp(roundBox(layer.w), MIN_LAYER_SIZE, maxSize);
  const h = clamp(roundBox(layer.h), MIN_LAYER_SIZE, maxSize);
  const maxX = Math.max(m, roundBox(1 - m - w));
  const maxY = Math.max(m, roundBox(1 - m - h));
  return {
    ...layer,
    w,
    h,
    x: roundBox(clamp(roundBox(layer.x), m, maxX)),
    y: roundBox(clamp(roundBox(layer.y), m, maxY))
  };
}

export function selectionBounds(layers: StudioLayerSpec[], selected: number[]): StudioBox | null {
  const boxes = selected.map((index) => layers[index]).filter(Boolean) as StudioBox[];
  if (!boxes.length) return null;
  const left = Math.min(...boxes.map((b) => b.x));
  const top = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.w));
  const bottom = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/** Translation groupée, bornée par le calque le plus contraint (texte = zone sûre). */
export function moveLayers(layers: StudioLayerSpec[], selected: number[], dx: number, dy: number, safeArea: number): StudioLayerSpec[] {
  if (!selected.length) return layers;
  let minDx = -Infinity, maxDx = Infinity, minDy = -Infinity, maxDy = Infinity;
  for (const index of selected) {
    const layer = layers[index];
    if (!layer) continue;
    const m = layerMargin(layer, safeArea);
    minDx = Math.max(minDx, m - layer.x);
    maxDx = Math.min(maxDx, 1 - m - (layer.x + layer.w));
    minDy = Math.max(minDy, m - layer.y);
    maxDy = Math.min(maxDy, 1 - m - (layer.y + layer.h));
  }
  const tdx = clamp(dx, minDx, maxDx);
  const tdy = clamp(dy, minDy, maxDy);
  return layers.map((layer, index) =>
    selected.includes(index) ? clampLayer({ ...layer, x: layer.x + tdx, y: layer.y + tdy }, safeArea) : layer
  );
}

/** Redimensionnement depuis une poignée ; le calque reste dans son cadre et garde une taille minimale. */
export function resizeLayer(layer: StudioLayerSpec, handle: StudioResizeHandle, dx: number, dy: number, safeArea: number): StudioLayerSpec {
  const m = layerMargin(layer, safeArea);
  let { x, y, w, h } = layer;
  const west = handle.includes('w'), east = handle.includes('e'), north = handle.includes('n'), south = handle.includes('s');
  if (east) w = clamp(roundBox(w + dx), MIN_LAYER_SIZE, 1 - m - x);
  if (west) {
    const nextW = clamp(roundBox(w - dx), MIN_LAYER_SIZE, x + w - m);
    x = roundBox(x + (w - nextW));
    w = nextW;
  }
  if (south) h = clamp(roundBox(h + dy), MIN_LAYER_SIZE, 1 - m - y);
  if (north) {
    const nextH = clamp(roundBox(h - dy), MIN_LAYER_SIZE, y + h - m);
    y = roundBox(y + (h - nextH));
    h = nextH;
  }
  return clampLayer({ ...layer, x, y, w, h }, safeArea);
}

/** Alignement sur le cadre ou sur la zone sûre ; une sélection multiple s'aligne sur son union. */
export function alignLayers(
  layers: StudioLayerSpec[],
  selected: number[],
  mode: StudioAlignMode,
  safeArea: number,
  onSafeArea: boolean
): StudioLayerSpec[] {
  const bounds = selectionBounds(layers, selected);
  if (!bounds) return layers;
  const margin = onSafeArea && selected.some((index) => layers[index]?.type === 'text') ? safeArea : 0;
  const target = { x: margin, y: margin, w: 1 - 2 * margin, h: 1 - 2 * margin };
  let dx = 0, dy = 0;
  if (mode === 'left') dx = target.x - bounds.x;
  if (mode === 'hcenter') dx = target.x + target.w / 2 - (bounds.x + bounds.w / 2);
  if (mode === 'right') dx = target.x + target.w - (bounds.x + bounds.w);
  if (mode === 'top') dy = target.y - bounds.y;
  if (mode === 'vcenter') dy = target.y + target.h / 2 - (bounds.y + bounds.h / 2);
  if (mode === 'bottom') dy = target.y + target.h - (bounds.y + bounds.h);
  return moveLayers(layers, selected, dx, dy, safeArea);
}

/** Distribution régulière des centres sur l'axe choisi ; à partir de trois calques. */
export function distributeLayers(layers: StudioLayerSpec[], selected: number[], axis: 'x' | 'y', safeArea: number): StudioLayerSpec[] {
  const indices = [...selected].sort((a, b) => {
    const la = layers[a], lb = layers[b];
    return axis === 'x' ? la.x + la.w / 2 - (lb.x + lb.w / 2) : la.y + la.h / 2 - (lb.y + lb.h / 2);
  });
  if (indices.length < 3) return layers;
  const first = layers[indices[0]], last = layers[indices[indices.length - 1]];
  const startCentre = axis === 'x' ? first.x + first.w / 2 : first.y + first.h / 2;
  const endCentre = axis === 'x' ? last.x + last.w / 2 : last.y + last.h / 2;
  const gap = (endCentre - startCentre) / (indices.length - 1);
  const next = [...layers];
  indices.forEach((index, position) => {
    if (position === 0 || position === indices.length - 1) return;
    const layer = next[index];
    const centre = startCentre + gap * position;
    next[index] = clampLayer(
      axis === 'x' ? { ...layer, x: centre - layer.w / 2 } : { ...layer, y: centre - layer.h / 2 },
      safeArea
    );
  });
  return next;
}

export function replaceLayers(scene: StudioScene, layers: StudioLayerSpec[]): StudioScene {
  return { ...scene, layers };
}

/** Boîte en pourcentage du canvas, pour le positionnement des boîtes de sélection. */
export function boxStyle(box: StudioBox) {
  return { left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` };
}

/** Applique un patch de calque en préservant le type (union discriminée). */
export function patchLayer(layer: StudioLayerSpec, patch: Partial<StudioLayerSpec>): StudioLayerSpec {
  return { ...layer, ...patch } as StudioLayerSpec;
}

export function isTextLayer(layer: StudioLayerSpec): layer is Extract<StudioLayerSpec, { type: 'text' }> {
  return layer.type === 'text';
}
export function isImageLayer(layer: StudioLayerSpec): layer is Extract<StudioLayerSpec, { type: 'image' }> {
  return layer.type === 'image';
}

export function specWithLayers(spec: CreativeSpec, sceneIndex: number, layers: StudioLayerSpec[]): CreativeSpec {
  return { ...spec, scenes: spec.scenes.map((scene, index) => (index === sceneIndex ? { ...scene, layers } : scene)) };
}

/**
 * Ordre de peinture : le contrat (« array order is paint order ») et le compositeur serveur
 * (sharp compose les calques dans l'ordre) peignent le DERNIER indice au-dessus. Les contrôles
 * de pile parlent donc en indices de tableau : +1 = monter d'un niveau visuel.
 */
export function moveLayerOrder(
  layers: StudioLayerSpec[],
  index: number,
  delta: number
): { layers: StudioLayerSpec[]; index: number } {
  const target = index + delta;
  if (!layers[index] || target < 0 || target >= layers.length || delta === 0) {
    return { layers, index };
  }
  const next = [...layers];
  const moved = next[index];
  next[index] = next[target];
  next[target] = moved;
  return { layers: next, index: target };
}

export type TextRole = Extract<StudioLayerSpec, { type: 'text' }>['role'];

const TEXT_PRESETS: Record<TextRole, { text: string; y: number; h: number; size: number; bold: boolean }> = {
  headline: { text: 'Nouveau titre', y: 0.55, h: 0.14, size: 52, bold: true },
  body: { text: 'Nouveau texte', y: 0.7, h: 0.11, size: 28, bold: false },
  cta: { text: 'Nous contacter', y: 0.82, h: 0.12, size: 32, bold: true }
};

/**
 * Nouveau calque texte placé dans la zone sûre. Le texte proposé est éditable immédiatement ;
 * aucun contenu de marque n'est inventé au-delà de ce libellé neutre.
 */
export function createTextLayer(role: TextRole, safeArea: number): StudioLayerSpec {
  const preset = TEXT_PRESETS[role];
  const m = clamp(safeArea, 0, 0.2);
  const layer: StudioLayerSpec = {
    type: 'text',
    role,
    text: preset.text,
    x: roundBox(m),
    y: roundBox(m),
    w: roundBox(1 - 2 * m),
    h: roundBox(preset.h),
    size: preset.size,
    bold: preset.bold,
    color: '#ffffff',
    opacity: 1
  };
  return clampLayer({ ...layer, y: preset.y }, m);
}
