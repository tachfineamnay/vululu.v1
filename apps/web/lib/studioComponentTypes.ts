import type { CreativeSpec } from '@vululu/contracts';
import type {
  ChannelPreset, StudioRenderState, StudioRevision, StudioSource, StudioVersion
} from './studioTypes';

export type StudioSpecChange = (next: CreativeSpec | ((current: CreativeSpec) => CreativeSpec)) => void;

/** Inspecteur contextuel de l'atelier : canvas, calque sélectionné, scène, ressources. */
export type StudioInspectorProps = {
  spec: CreativeSpec;
  sceneIndex: number;
  selected: number[];
  sources: StudioSource[];
  confirmedIds: string[];
  presets: ChannelPreset[];
  channel: ChannelPreset | undefined;
  busy: boolean;
  onSpec: StudioSpecChange;
  onSelect: (index: number, additive: boolean) => void;
  onChannel: (presetId: string) => void;
  onNotice: (message: string) => void;
};

/** Livraison : rendu, approbation exacte (version + checksum), export, historique. */
export type StudioDeliveryProps = {
  base: string;
  view: StudioRevision;
  versions: StudioVersion[];
  expectedVersion: number;
  dirty: boolean;
  busy: boolean;
  renderState: StudioRenderState | null;
  onAction: (fn: () => Promise<void>) => Promise<void>;
  onRender: () => void | Promise<void>;
  onApprove: (checksum: string) => void | Promise<void>;
  onRestore: (version: number) => void | Promise<void>;
  onView: (version: number) => void | Promise<void>;
  onNotice: (message: string) => void;
};

/** Comparaison visuelle de deux révisions, rendues par le même moteur serveur. */
export type StudioCompareProps = {
  base: string;
  current: StudioRevision;
  versions: StudioVersion[];
  sceneKey: string;
  onNotice?: (message: string) => void;
};
