import { availableFormats, productionFormats } from '@vululu/contracts';
/**
 * Contrats d'affichage du Studio V1.
 * Aucun de ces contrats n'est connecte a un backend quand status vaut
 * NOT_CONNECTED : l'interface ne doit jamais afficher de fausses donnees.
 */

export type StudioAvailability = 'AVAILABLE' | 'DECLARED_NOT_IMPLEMENTED' | 'NOT_CONNECTED' | 'MOCK';

export type NetworkProfile = {
  key: string;
  label: string;
  aspectRatios: string[];
  formats: string[];
  publishing: 'POSTIZ_MOCK';
  note: string;
};

export const NETWORK_PROFILES: NetworkProfile[] = [
  { key: 'tiktok', label: 'TikTok', aspectRatios: ['9:16'], formats: [...availableFormats.TikTok], publishing: 'POSTIZ_MOCK', note: 'Profil déclaré ; publication simulée via Postiz MOCK.' },
  { key: 'instagram', label: 'Instagram', aspectRatios: ['9:16', '4:5', '1:1'], formats: [...availableFormats.Instagram], publishing: 'POSTIZ_MOCK', note: 'Profil interne versionné ; compatibilité réseau/format/ratio contrôlée dans le brief.' },
  { key: 'linkedin', label: 'LinkedIn', aspectRatios: ['1:1', '16:9'], formats: [...availableFormats.LinkedIn], publishing: 'POSTIZ_MOCK', note: 'Profil déclaré ; publication simulée uniquement.' }
];

export type FormatCatalogEntry = {
  key: string;
  label: string;
  availability: StudioAvailability;
  detail: string;
};

export const FORMAT_CATALOG: FormatCatalogEntry[] = Object.entries(productionFormats).map(([key, format]) => ({
  key,
  label: format.label,
  availability: 'AVAILABLE',
  detail: `${format.studio ? 'Composition Studio' : 'Vidéo multiscène'} · ${format.file.toUpperCase()}`
}));

export const CAPABILITY_STATUS: Array<{ key: string; label: string; status: StudioAvailability; detail: string }> = [
  { key: 'render.deterministic', label: 'Rendu image/vidéo déterministe', status: 'AVAILABLE', detail: 'Sharp PNG + FFmpeg MP4, sans IA générative.' },
  { key: 'audio', label: 'Voix, musique, mix', status: 'NOT_CONNECTED', detail: 'Piste audio silencieuse uniquement.' },
  { key: 'postiz', label: 'Transfert Postiz', status: 'MOCK', detail: 'Adaptateur postiz-mock, aucune publication.' },
  { key: 'costs', label: 'Coûts et estimation', status: 'MOCK', detail: 'Coûts simulés, aucun coût fournisseur réel.' },
  { key: 'assets', label: 'Bibliothèque de ressources', status: 'AVAILABLE', detail: 'Import, versions, droits et sélection par contexte.' },
  { key: 'campaigns', label: 'Campagnes', status: 'AVAILABLE', detail: 'Regroupements persistants de projets, isolés par propriétaire.' },
  { key: 'mcp', label: 'MCP V1', status: 'NOT_CONNECTED', detail: 'Aucun serveur MCP.' }
];
