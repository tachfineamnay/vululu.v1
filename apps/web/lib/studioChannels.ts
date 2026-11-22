import { isVideoOutput, outputSize, type CreativeSpec } from '@vululu/contracts';
import { clampLayer } from './studioGeometry';
import type { ChannelPreset, OutputKind, Platform } from './studioTypes';

/**
 * Repères de canal utilisés par l'atelier : dimensions de sortie du contrat et marges
 * d'interface généralement masquées par les applications (barres de profil, légendes).
 * Ces marges sont des repères de composition, pas une garantie de rendu côté réseau.
 */
export const CHANNEL_PRESETS: ChannelPreset[] = [
  { id: 'ig-square', label: 'Instagram · Post carré', platform: 'Instagram', kind: 'square', width: 1080, height: 1080, safeArea: 0.05, zones: [{ label: 'Zone de légende', bottom: 0.08 }] },
  { id: 'ig-portrait', label: 'Instagram · Post portrait', platform: 'Instagram', kind: 'portrait', width: 1080, height: 1350, safeArea: 0.06, zones: [{ label: 'Zone de légende', bottom: 0.1 }] },
  { id: 'ig-story', label: 'Instagram · Story', platform: 'Instagram', kind: 'story', width: 1080, height: 1920, safeArea: 0.1, zones: [{ label: 'En-tête de story', top: 0.14 }, { label: 'Zone de réponse', bottom: 0.2 }] },
  { id: 'ig-reel', label: 'Instagram · Reel', platform: 'Instagram', kind: 'short', width: 1080, height: 1920, safeArea: 0.1, zones: [{ label: 'En-tête de reel', top: 0.14 }, { label: 'Zone de légende', bottom: 0.2 }] },
  { id: 'ig-carousel', label: 'Instagram · Carrousel', platform: 'Instagram', kind: 'carousel', width: 1080, height: 1350, safeArea: 0.06, zones: [{ label: 'Zone de légende', bottom: 0.1 }] },
  { id: 'tt-reel', label: 'TikTok · Vidéo', platform: 'TikTok', kind: 'short', width: 1080, height: 1920, safeArea: 0.08, zones: [{ label: 'En-tête TikTok', top: 0.1 }, { label: 'Légende et navigation', bottom: 0.18 }, { label: 'Boutons latéraux', right: 0.12 }] },
  { id: 'li-square', label: 'LinkedIn · Post carré', platform: 'LinkedIn', kind: 'square', width: 1080, height: 1080, safeArea: 0.06, zones: [{ label: 'Pied de post', bottom: 0.06 }] },
  { id: 'li-portrait', label: 'LinkedIn · Post portrait', platform: 'LinkedIn', kind: 'portrait', width: 1080, height: 1350, safeArea: 0.06, zones: [{ label: 'Pied de post', bottom: 0.06 }] },
  { id: 'li-carousel', label: 'LinkedIn · Carrousel', platform: 'LinkedIn', kind: 'carousel', width: 1080, height: 1350, safeArea: 0.06, zones: [{ label: 'Pied de post', bottom: 0.06 }] },
  // P09A — vidéo multiscène paysage : même pipeline MP4 que la vidéo courte, sans retirer clips ni audio.
  { id: 'li-landscape', label: 'LinkedIn · Vidéo paysage', platform: 'LinkedIn', kind: 'landscape', width: 1920, height: 1080, safeArea: 0.05, zones: [{ label: 'Interface LinkedIn', bottom: 0.08 }] }
];

/** Le format du projet sert de valeur par défaut quand aucun contenu de calendrier n'est lié. */
export function presetFor(platform: Platform | string, kind: OutputKind): ChannelPreset | undefined {
  return CHANNEL_PRESETS.find((preset) => preset.platform === platform && preset.kind === kind);
}

export function defaultPreset(platform: Platform | string, kind: OutputKind, width: number, height: number, safeArea: number): ChannelPreset | undefined {
  const match = presetFor(platform, kind);
  if (match) return match;
  return CHANNEL_PRESETS.find((preset) => preset.kind === kind && preset.width === width && preset.height === height)
    ?? CHANNEL_PRESETS.find((preset) => preset.width === width && preset.height === height && preset.safeArea === safeArea);
}

/**
 * Presets compatibles avec le nombre de scènes courant : une image par publication hors
 * carrousel et vidéo (règle déjà appliquée par creativeSpec).
 */
export function compatiblePresets(sceneCount: number): ChannelPreset[] {
  if (sceneCount > 1)
    return CHANNEL_PRESETS.filter((preset) => preset.kind === 'carousel' || isVideoOutput(preset.kind));
  return CHANNEL_PRESETS.filter((preset) => preset.kind !== 'carousel');
}

export type ChannelChange = { spec: CreativeSpec; preset: ChannelPreset; note: string };

/**
 * Applique un preset de canal : dimensions, zone sûre, livraison. Les clips, transitions et
 * pistes audio ne survivent pas à une sortie image ; les scènes au-delà de la première non plus.
 * Toute sortie vidéo (courte ou paysage) conserve clips, transitions, audio et plusieurs scènes.
 */
export function applyChannelPreset(spec: CreativeSpec, preset: ChannelPreset): ChannelChange {
  const [width, height] = outputSize[preset.kind];
  if (preset.width !== width || preset.height !== height)
    throw new Error('Repère de canal incohérent avec les dimensions de sortie.');
  const notes: string[] = [];
  let scenes = spec.scenes;
  if (!isVideoOutput(preset.kind) && preset.kind !== 'carousel' && scenes.length > 1) {
    scenes = scenes.slice(0, 1);
    notes.push('Les pages supplémentaires sont retirées : ce canal n’accepte qu’une image.');
  }
  const keepVideo = isVideoOutput(preset.kind);
  let clamped = 0;
  const next: CreativeSpec = {
    ...spec,
    width,
    height,
    safeArea: preset.safeArea,
    delivery: {
      ...(spec.delivery ?? { kind: preset.kind, platform: preset.platform }),
      kind: preset.kind,
      platform: preset.platform,
      ...(keepVideo ? {} : { audio: undefined, transition: undefined })
    },
    scenes: scenes.map((scene) => {
      const stripped = keepVideo ? scene : { ...scene, clip: undefined, transition: undefined };
      return {
        ...stripped,
        layers: stripped.layers.map((layer) => {
          const placed = clampLayer(layer, preset.safeArea);
          if (placed !== layer) clamped += 1;
          return placed;
        })
      };
    })
  };
  if (!keepVideo && (spec.delivery?.audio || spec.scenes.some((scene) => scene.clip)))
    notes.push('Clip et piste audio retirés : ils concernent uniquement les sorties vidéo.');
  if (clamped) notes.push(clamped + ' calque(s) de texte replacé(s) dans la nouvelle marge sûre.');
  return { spec: next, preset, note: notes.join(' ') };
}
