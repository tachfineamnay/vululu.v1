import type { z } from 'zod';
import type { platformSchema } from './channels';
import type { OutputKind } from './creative';

export const productionFormats = {
  Affiche: { label: 'Post', studio: 'square', file: 'png' },
  Story: { label: 'Story', studio: 'story', file: 'png' },
  Carrousel: { label: 'Carrousel', studio: 'carousel', file: 'zip' },
  Reel: { label: 'Reel', studio: 'short', file: 'mp4' },
  Video: { label: 'Vidéo multiscène', studio: null, file: 'mp4' }
} as const satisfies Record<string, { label: string; studio: OutputKind | null; file: string }>;
export type ProductionFormat = keyof typeof productionFormats;
export const availableFormats = {
  Instagram: ['Affiche', 'Story', 'Carrousel', 'Reel', 'Video'],
  TikTok: ['Reel', 'Video'],
  LinkedIn: ['Affiche', 'Carrousel', 'Video']
} as const satisfies Record<z.infer<typeof platformSchema>, readonly ProductionFormat[]>;
export const studioExportExtension = (kind?: OutputKind) => kind === 'carousel' ? 'zip' : !kind || kind === 'short' ? 'mp4' : 'png';
export function productionCapability(format: string) {
  return Object.hasOwn(productionFormats, format) ? productionFormats[format as ProductionFormat] : undefined;
}
