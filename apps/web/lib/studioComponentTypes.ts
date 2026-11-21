import type { CreativeSpec } from '@vululu/contracts';
import type {
  ChannelPreset, StudioRenderState, StudioRevision, StudioSource, StudioVersion
} from './studioTypes';

export type StudioSpecChange = (next: CreativeSpec | ((current: CreativeSpec) => CreativeSpec)) => void;

/**
 * Timeline de scènes sous le canvas : sélection, réordonnancement, durée et ajout/retrait.
 * Toute mutation passe par onSpec (historique local + enregistrement de révision existant).
 */
export type StudioTimelineProps = {
  spec: CreativeSpec;
  sceneIndex: number;
  busy: boolean;
  /** Bibliothèque fournie : noms réels des pistes audio, jamais un nom inventé. */
  sources: StudioSource[];
  onSpec: StudioSpecChange;
  onSelect: (index: number) => void;
  onNotice: (message: string) => void;
};

/**
 * Régénération ciblée d'une scène : préparation d'une génération fournisseur pour la scène
 * sélectionnée, états réels des opérations et application explicite comme nouvelle révision.
 * Une scène photo renvoie vers l'outil d'édition d'image existant au lieu d'être dupliquée.
 */
export type StudioRegenerateProps = {
  project: string;
  revision: number;
  sceneKey: string;
  sceneSeconds: number;
  clipSize: '1280:720' | '720:1280';
  video: boolean;
  assets: Array<{ id: string; name: string }>;
  run: (fn: () => Promise<void>) => Promise<void>;
  onPlaced: () => Promise<void>;
  onNotice: (message: string) => void;
};

/**
 * Contexte réel des opérations audio : projet, routes créatives, révision enregistrée,
 * version approuvée exportable et retour à l'éditeur après application (jamais un écrasement).
 */
export type StudioAudioOperations = {
  project: string;
  /** Base des routes créatives (/api/projects/:id/creative), pour les exports M4A et SRT. */
  base: string;
  /** Révision enregistrée ciblée par les propositions et applications serveur. */
  revision: number;
  /** Version approuvée affichée, seule exportable en M4A et SRT (null sinon). */
  approvedVersion: number | null;
  /** Vrai si l'inspecteur affiche la révision courante sans brouillon en attente. */
  ready: boolean;
  run: (fn: () => Promise<void>) => Promise<void>;
  /** Applique la révision renvoyée par une route audio, puis recharge l'éditeur. */
  onApplied: (view: StudioRevision) => Promise<void>;
};

/** Inspecteur contextuel de l'atelier : canvas, calque sélectionné, scène, ressources. */
export type StudioInspectorProps = {
  spec: CreativeSpec;
  sceneIndex: number;
  selected: number[];
  sources: StudioSource[];
  /** Bibliothèque complète (audio comprise) : pistes audio et transcription. */
  media: StudioSource[];
  confirmedIds: string[];
  presets: ChannelPreset[];
  channel: ChannelPreset | undefined;
  busy: boolean;
  onSpec: StudioSpecChange;
  onSelect: (index: number, additive: boolean) => void;
  onChannel: (presetId: string) => void;
  onNotice: (message: string) => void;
  /** Opérations audio réelles, montées uniquement pour les sorties vidéo. */
  audio: StudioAudioOperations;
};

/** P09B — pistes audio, transcription et voix off de la composition vidéo. */
export type StudioAudioPanelProps = {
  spec: CreativeSpec;
  media: StudioSource[];
  busy: boolean;
  operations: StudioAudioOperations;
  onSpec: StudioSpecChange;
  onNotice: (message: string) => void;
};

/** P09B — sous-titres horodatés et style ; le SRT n'est exportable que pour une révision approuvée. */
export type StudioSubtitlesProps = {
  spec: CreativeSpec;
  busy: boolean;
  /** Base des routes créatives, pour le lien SRT de la révision approuvée. */
  base: string;
  /** Version approuvée affichée, seule exportable en SRT (null sinon). */
  approvedVersion: number | null;
  onSpec: StudioSpecChange;
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
  onCancel?: () => void | Promise<void>;
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
