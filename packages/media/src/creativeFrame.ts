import sharp, { type OverlayOptions } from 'sharp';
import type { CreativeSpec } from '@vululu/contracts';
import { escapeMarkup, MediaLayoutError } from './textLayout';

/** Pure frame compositor. Asset lookup is injected; no client-supplied file paths or URLs. */
export async function creativeFrame(
  spec: CreativeSpec,
  scene: CreativeSpec['scenes'][number],
  resolve: (id: string) => Promise<Buffer>
) {
  const { width, height, brand } = spec;
  const overlays: OverlayOptions[] = [];
  for (const l of scene.layers) {
    const left = Math.round(l.x * width),
      top = Math.round(l.y * height);
    const w = Math.min(width - left, Math.max(1, Math.round(l.w * width))),
      h = Math.min(height - top, Math.max(1, Math.round(l.h * height)));
    let pixels: Buffer;
    if (l.type === 'image') {
      pixels = await sharp(await resolve(l.versionId), { limitInputPixels: 16_000_000 })
        .rotate()
        .resize(w, h, { fit: l.fit, position: l.gravity, background: '#00000000' })
        .ensureAlpha()
        .png()
        .toBuffer();
    } else {
      const text = `<span foreground="${l.color}"${l.bold ? ' weight="bold"' : ''}>${escapeMarkup(l.text)}</span>`;
      const layout = sharp({
        text: { text, font: `${l.family ?? 'sans'} ${l.size}`, width: w, wrap: 'word-char', rgba: true }
      });
      const info = await layout.metadata();
      if (info.height > h || info.width > w) throw new MediaLayoutError(l.role);
      pixels = await layout.png().toBuffer();
    }
    if (l.opacity !== 1)
      pixels = await sharp(pixels).ensureAlpha().linear([1, 1, 1, l.opacity], [0, 0, 0, 0]).png().toBuffer();
    overlays.push({ input: pixels, left, top });
  }
  const background = Buffer.from(
    `<svg width="${width}" height="${height}"><defs><linearGradient id="g"><stop stop-color="${brand.background}"/><stop offset="1" stop-color="${brand.accent}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`
  );
  return sharp(background).composite(overlays).png().toBuffer();
}
