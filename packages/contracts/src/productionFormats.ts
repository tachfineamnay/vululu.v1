import type { z } from 'zod';
import type { platformSchema } from './channels';
import { isVideoOutput, type OutputKind } from './creative';

export const productionFormats = {
  Affiche: { label: 'Post', studio: 'square', file: 'png' },
  Story: { label: 'Story', studio: 'story', file: 'png' },
  Carrousel: { label: 'Carrousel', studio: 'carousel', file: 'zip' },
  Reel: { label: 'Reel', studio: 'short', file: 'mp4' },
  // P09A : la vidéo multiscène s'ouvre dans l'atelier (défaut 9:16, preset paysage 16:9 disponible).
  Video: { label: 'Vidéo multiscène', studio: 'short', file: 'mp4' }
} as const satisfies Record<string, { label: string; studio: OutputKind | null; file: string }>;
export type ProductionFormat = keyof typeof productionFormats;
export const availableFormats = {
  Instagram: ['Affiche', 'Story', 'Carrousel', 'Reel', 'Video'],
  TikTok: ['Reel', 'Video'],
  LinkedIn: ['Affiche', 'Carrousel', 'Video']
} as const satisfies Record<z.infer<typeof platformSchema>, readonly ProductionFormat[]>;
export const studioExportExtension = (kind?: OutputKind) => kind === 'carousel' ? 'zip' : !kind || isVideoOutput(kind) ? 'mp4' : 'png';
export function productionCapability(format: string) {
  return Object.hasOwn(productionFormats, format) ? productionFormats[format as ProductionFormat] : undefined;
}
