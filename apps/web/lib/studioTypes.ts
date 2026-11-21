import type { CreativeLayer, CreativeSpec, OutputKind, Platform } from '@vululu/contracts';

/** Une version de ressource telle que renvoyée par /api/contexts/:id/assets (immuable). */
export type StudioSource = {
  id: string;
  name: string;
  kind: string;
  mimeType?: string;
  license?: string;
  sizeBytes?: number;
  provenance?: string;
  metadata?: { width?: number; height?: number; duration?: number };
};

export type StudioRenderState = { revision: number; state: string; reason: string | null; progress: number };
export type StudioVersion = { version: number; approvedAt: string | null };
export type StudioRevision = StudioVersion & {
  spec: CreativeSpec;
  manifest: { approvalSha256?: string; master: { sha256: string } } | null;
};

/** Repère de canal : dimensions de sortie et marges d'interface. Jamais une garantie de rendu réseau. */
export type ChannelZone = { label: string; top?: number; bottom?: number; left?: number; right?: number };
export type ChannelPreset = {
  id: string;
  label: string;
  platform: Platform;
  kind: OutputKind;
  width: number;
  height: number;
  safeArea: number;
  zones: ChannelZone[];
};

export type StudioAlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';
export type StudioResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export type StudioBox = { x: number; y: number; w: number; h: number };
export type StudioLayerSpec = CreativeSpec['scenes'][number]['layers'][number];
export type StudioScene = CreativeSpec['scenes'][number];
export type { CreativeLayer, CreativeSpec, OutputKind, Platform };
