import { creativeSpec, outputSize, type CreativeLayer, type CreativeSpec, type OutputKind } from './creative';

export const formatLabels: Record<OutputKind, string> = {
  square: 'Publication carrée',
  portrait: 'Publication portrait',
  story: 'Story verticale',
  carousel: 'Carrousel',
  short: 'Vidéo courte'
};
function luminance(hex: string) {
  return [0, 1, 2]
    .map((i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255)
    .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
    .reduce((v, x, i) => v + x * [0.2126, 0.7152, 0.0722][i], 0);
}
export function readableInk(plate: string) {
  return luminance(plate) > 0.179 ? '#000000' : '#ffffff';
}
export type GuideInput = {
  concept?: 'editorial' | 'immersive';
  delivery: NonNullable<CreativeSpec['delivery']>;
  brand: CreativeSpec['brand'];
  name: string;
  title: string;
  offer: string;
  cta: string;
  photos: string[];
  logo?: string;
  clip?: string;
  sceneDurationSeconds?: number;
};
/** Assemble editable layers, not a flattened mockup. No synthetic copy, prices or asset URLs. */
export function composeGuide({
  concept='editorial',
  delivery,
  brand,
  name,
  title,
  offer,
  cta,
  photos,
  logo,
  clip,
  sceneDurationSeconds = 2
}: GuideInput): CreativeSpec {
  const { kind } = delivery,
    [width, height] = outputSize[kind];
  if (!photos.length && !(kind === 'short' && clip))
    throw new Error('Choisissez au moins une photo ou un clip.');
  if (kind === 'carousel' && photos.length < 2)
    throw new Error('Choisissez au moins deux photos pour un carrousel.');
  const pages =
    kind === 'carousel' ? photos.length : kind === 'short' ? Math.max(1, photos.length + (clip ? 1 : 0)) : 1;
  const img = (
    versionId: string,
    x: number,
    y: number,
    w: number,
    h: number,
    fit: 'contain' | 'cover' = 'cover'
  ): CreativeLayer => ({ type: 'image', versionId, x, y, w, h, fit, gravity: 'centre', opacity: 1 });
  const txt = (
    role: 'headline' | 'body' | 'cta',
    text: string,
    x: number,
    y: number,
    w: number,
    h: number,
    size: number,
    plate: string
  ): CreativeLayer => ({
    type: 'text',
    role,
    text,
    x,
    y,
    w,
    h,
    size,
    minSize: Math.min(size, 24),
    bold: role !== 'body',
    color: readableInk(plate),
    plate,
    opacity: 1
  });
  return creativeSpec.parse({
    schemaVersion: 1,
    width,
    height,
    brand,
    safeArea: 0.05,
    delivery,
    scenes: Array.from({ length: pages }, (_, i) => {
      const video = kind === 'short' && clip && i === 0;
      const photo = photos[kind === 'short' && clip ? Math.max(0, i - 1) : i];
      const layers: CreativeLayer[] = [];
      const square = kind === 'square',
        inset = kind === 'carousel' && i % 2 === 1;
      if (!video)
        layers.push(
          square
            ? img(photo, 0.44, 0, 0.56, 1)
            : inset
              ? img(photo, 0.07, 0.16, 0.86, 0.48)
              : ({
                  ...img(photo, 0, 0, 1, kind === 'story' || kind === 'short' ? 0.7 : 0.59),
                  gravity: 'north'
                } as CreativeLayer)
        );
      if (concept==='immersive' && !video) layers[0]=img(photo,0,0,1,1);
      if (logo) layers.push(img(logo, square ? 0.07 : 0.79, square ? 0.1 : 0.07, 0.15, 0.115, 'contain'));
      if (square) {
        layers.push(
          txt('body', name, 0.06, 0.25, 0.36, 0.08, 27, brand.background),
          txt('headline', title, 0.06, 0.36, 0.47, 0.25, 62, brand.background),
          txt('body', offer, 0.06, 0.64, 0.36, 0.13, 31, brand.background),
          txt('cta', cta, 0.06, 0.81, 0.37, 0.12, 32, brand.accent)
        );
      } else {
        const tall = kind === 'short' || kind === 'story';
        layers.push(
          txt(
            'body',
            name + (kind === 'carousel' ? `   ${i + 1} / ${pages}` : ''),
            0.07,
            inset ? 0.07 : tall ? 0.14 : 0.07,
            inset ? 0.54 : 0.32,
            tall ? 0.047 : 0.064,
            30,
            brand.background
          ),
          txt(
            'headline',
            kind === 'carousel' && i > 0 ? offer : title,
            0.07,
            inset ? 0.66 : tall ? 0.56 : 0.54,
            0.86,
            tall ? 0.12 : 0.16,
            70,
            brand.background
          ),
          txt(
            'body',
            kind === 'carousel' && i > 0 ? title : offer,
            0.07,
            inset ? 0.82 : tall ? 0.71 : 0.73,
            0.86,
            inset ? 0.055 : 0.078,
            38,
            brand.background
          ),
          txt('cta', cta, 0.07, tall ? 0.81 : inset ? 0.89 : 0.84, 0.72, inset ? 0.058 : 0.09, 38, brand.accent)
        );
      }
      return {
        key: 'SCENE-' + String(i + 1).padStart(3, '0'),
        seconds: kind === 'short' ? sceneDurationSeconds : 2,
        layers,
        ...(video ? { clip: { versionId: clip, start: 0, height: 0.7 } } : {})
      };
    })
  });
}
