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
  { key: 'tiktok', label: 'TikTok', aspectRatios: ['9:16'], formats: ['Video', 'Reel', 'Motion'], publishing: 'POSTIZ_MOCK', note: 'Profil declare ; publication simulee via Postiz MOCK.' },
  { key: 'instagram', label: 'Instagram', aspectRatios: ['9:16', '4:5', '1:1'], formats: ['Affiche', 'Carrousel', 'Video', 'Reel'], publishing: 'POSTIZ_MOCK', note: 'Profil declare ; aucun controle de ratio par reseau n est applique.' },
  { key: 'linkedin', label: 'LinkedIn', aspectRatios: ['1:1', '16:9'], formats: ['Affiche', 'Carrousel', 'Video'], publishing: 'POSTIZ_MOCK', note: 'Profil declare ; publication simulee uniquement.' }
];

export type FormatCatalogEntry = {
  key: string;
  label: string;
  availability: StudioAvailability;
  detail: string;
};

export const FORMAT_CATALOG: FormatCatalogEntry[] = [
  { key: 'Video', label: 'Video multiscene', availability: 'AVAILABLE', detail: '5 scenes PNG 1080x1920 + master MP4 deterministe (Sharp/FFmpeg), QA technique.' },
  { key: 'Reel', label: 'Reel vertical', availability: 'DECLARED_NOT_IMPLEMENTED', detail: 'Format declare ; le pipeline actuel produit le meme master video que Video, sans logique Reel dediee.' },
  { key: 'Affiche', label: 'Affiche / image', availability: 'DECLARED_NOT_IMPLEMENTED', detail: 'Format declare ; le rendu image unique n est pas implemente.' },
  { key: 'Carrousel', label: 'Carrousel', availability: 'DECLARED_NOT_IMPLEMENTED', detail: 'Format declare ; aucun rendu multi-images n est implemente.' },
  { key: 'Motion', label: 'Motion design', availability: 'DECLARED_NOT_IMPLEMENTED', detail: 'Format declare ; pas de moteur motion implemente.' }
];

export const CAPABILITY_STATUS: Array<{ key: string; label: string; status: StudioAvailability; detail: string }> = [
  { key: 'render.deterministic', label: 'Rendu image/video deterministe', status: 'AVAILABLE', detail: 'Sharp PNG + FFmpeg MP4, sans IA generative.' },
  { key: 'audio', label: 'Voix, musique, mix', status: 'NOT_CONNECTED', detail: 'Piste audio silencieuse uniquement.' },
  { key: 'postiz', label: 'Transfert Postiz', status: 'MOCK', detail: 'Adaptateur postiz-mock, aucune publication.' },
  { key: 'costs', label: 'Couts et estimation', status: 'MOCK', detail: 'CostEvent mock, aucun cout fournisseur reel.' },
  { key: 'assets', label: 'Bibliotheque d actifs', status: 'AVAILABLE', detail: 'Import, versions, droits et sélection par contexte.' },
  { key: 'campaigns', label: 'Campagnes', status: 'AVAILABLE', detail: 'Regroupements persistants de projets, isolés par propriétaire.' },
  { key: 'mcp', label: 'MCP V1', status: 'NOT_CONNECTED', detail: 'Aucun serveur MCP.' }
];
