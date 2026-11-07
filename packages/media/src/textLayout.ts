import crypto from 'node:crypto';
import sharp from 'sharp';

export const COMPOSITION_VERSION = 'v1-demo-layout-2026-11-05';
export type SceneTextBox = { field: 'brand' | 'title' | 'description' | 'label'; contentSha256: string; x: number; y: number; width: number; height: number; fontSize: number; minFontSize: number };
export type SceneTextLayout = { compositionVersion: string; complete: boolean; artifactSha256: string; width: number; height: number; boxes: SceneTextBox[] };
export class MediaLayoutError extends Error {
  readonly code = 'media_text_overflow';
  constructor(field: string) { super('Le texte du champ ' + field + ' ne tient pas dans sa zone. Réduisez-le avant production.'); }
}

export function escapeMarkup(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** Pango mesure et compose tout le texte ; aucune coupe de lignes ou de caractères. */
export async function renderText(input: { field: SceneTextBox['field']; value: string; x: number; y: number; width: number; maxHeight: number; maxFontSize: number; minFontSize: number; bold?: boolean }) {
  if (!input.value.trim() || input.value.length > 5000) throw new MediaLayoutError(input.field);
  let fontSize = Math.max(1, input.maxFontSize);
  const minFontSize = Math.max(1, input.minFontSize);
  while (true) {
    const { data, info } = await sharp({ text: { text: '<span foreground="#ffffff"' + (input.bold ? ' weight="bold"' : '') + '>' + escapeMarkup(input.value) + '</span>', font: 'sans ' + fontSize, width: input.width, wrap: 'word-char', rgba: true } }).png().toBuffer({ resolveWithObject: true });
    if (info.width <= input.width && info.height <= input.maxHeight) {
      const box: SceneTextBox = { field: input.field, contentSha256: crypto.createHash('sha256').update(input.value).digest('hex'), x: input.x, y: input.y, width: info.width, height: info.height, fontSize, minFontSize };
      return { input: data, left: input.x, top: input.y, box };
    }
    if (fontSize <= minFontSize) throw new MediaLayoutError(input.field);
    fontSize = Math.max(minFontSize, Math.min(fontSize - 1, Math.floor(fontSize * Math.sqrt(input.maxHeight / info.height) * 0.95)));
  }
}

export function validTextLayout(layout: SceneTextLayout | undefined, checksum: string, width: number, height: number): boolean {
  if (!layout || layout.compositionVersion !== COMPOSITION_VERSION || layout.complete !== true || layout.artifactSha256 !== checksum || layout.width !== width || layout.height !== height || !Array.isArray(layout.boxes) || layout.boxes.length !== 4 || ['brand', 'title', 'description', 'label'].some((field) => layout.boxes.filter((box) => box.field === field).length !== 1)) return false;
  return layout.boxes.every((box, index) => [box.x, box.y, box.width, box.height].every(Number.isInteger) && box.x >= 0 && box.y >= 0 && box.width > 0 && box.height > 0 && box.x + box.width <= width && box.y + box.height <= height && Number.isFinite(box.fontSize) && Number.isFinite(box.minFontSize) && box.minFontSize > 0 && box.fontSize >= box.minFontSize && /^[a-f0-9]{64}$/.test(box.contentSha256)
    && layout.boxes.slice(index + 1).every((other) => box.x + box.width <= other.x || other.x + other.width <= box.x || box.y + box.height <= other.y || other.y + other.height <= box.y));
}
