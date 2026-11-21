import type { CreativeLayer, CreativeSpec, OutputKind, Platform } from '@vululu/contracts';

/** Une version de ressource telle que renvoyée par /api/contexts/:id/assets (immuable). */
export type StudioSource = {
  id: string;
  /** Identifiant de l'actif parent, requis pour lire le contenu de la version. */
  assetId?: string;
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

/* P09B — vues réelles de l'audio : capacités, opérations et résultats renvoyés par le serveur. */

/** Capacité audio exposée par GET /api/audio/capabilities (aucune sonde payante). */
export type StudioAudioCapability = {
  provider: string;
  model: string;
  availability: 'disabled' | 'missing_credential' | 'configured';
  reason: string | null;
  languages: string[];
  maxCents: number;
  estimatedCents: number;
  /** false = la disponibilité décrit la configuration, aucun appel fournisseur n'a été vérifié. */
  providerCallVerified: boolean;
};

export type StudioAudioCapabilities = {
  transcription: StudioAudioCapability;
  tts: StudioAudioCapability & { voices: string[] };
};

/** Segment horodaté d'une transcription réellement exécutée. */
export type StudioAudioSegment = { start: number; end: number; text: string };

/** Résultat serveur d'une opération audio ; jamais fabriqué côté navigateur. */
export type StudioAudioJobResult = {
  segments?: StudioAudioSegment[];
  segmentCount?: number;
  language?: string;
  provider?: string;
  model?: string;
  assetId?: string;
  assetVersionId?: string;
  mimeType?: string;
  voice?: string;
  durationSeconds?: number;
} | null;

/** Opération audio renvoyée par GET /api/projects/:id/audio/jobs. */
export type StudioAudioJob = {
  id: string;
  tool: string;
  state: string;
  costState: string;
  maxCents: number;
  reportedCents: number | null;
  digest: string;
  result: StudioAudioJobResult;
  params: {
    requestId?: string;
    revision?: number;
    language?: string;
    voice?: string;
    text?: string;
    sourceVersionId?: string;
    rightsConfirmed?: boolean;
  } | null;
  approvedBy: string | null;
  createdAt: string;
};

/** Opération outillée générique (GET /api/projects/:id/execution), sans contrat de résultat inventé. */
export type StudioExecutionView = {
  id: string;
  tool: string;
  state: string;
  costState: string;
  maxCents: number;
  reportedCents: number | null;
  digest: string;
  result: unknown;
  createdAt: string;
  approvedBy: string | null;
};
