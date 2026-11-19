import sharp, { type OverlayOptions } from 'sharp';
import type { CreativeSpec } from '@vululu/contracts';
import { escapeMarkup, MediaLayoutError } from './textLayout';

/** Pure frame compositor. Asset lookup is injected; no client-supplied file paths or URLs. */
export async function creativeFrame(
  spec: CreativeSpec,
  scene: CreativeSpec['scenes'][number],
  resolve: (id: string) => Promise<Buffer>,
  motion?: { height: number; poster?: Buffer }
) {
  const { width, height, brand } = spec;
  const overlays: OverlayOptions[] = [];
  if (motion) {
    const h = Math.round((height * motion.height) / 2) * 2;
    // Punch out the clip window in the overlay; the very same mask is used for the poster.
    overlays.push({
      input: await sharp({ create: { width, height: h, channels: 4, background: '#ffffff' } })
        .png()
        .toBuffer(),
      left: 0,
      top: 0,
      blend: 'dest-out'
    });
    if (motion.poster) overlays.push({ input: motion.poster, left: 0, top: 0 });
  }
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
      const pad = l.plate ? Math.min(20, Math.floor(h * 0.12), Math.floor(w * 0.08)) : 0;
      let size = l.size;
      for (;;) {
        const layout = sharp({
          text: {
            text,
            font: `${l.family ?? 'sans'} ${size}`,
            width: w - 2 * pad,
            wrap: 'word-char',
            rgba: true
          }
        });
        const info = await layout.metadata();
        if (info.height <= h - 2 * pad && info.width <= w - 2 * pad) {
          pixels = await layout.png().toBuffer();
          if (l.plate)
            pixels = await sharp({ create: { width: w, height: h, channels: 4, background: l.plate } })
              .composite([{ input: pixels, left: pad, top: Math.floor((h - info.height) / 2) }])
              .png()
              .toBuffer();
          break;
        }
        if (size <= (l.minSize ?? l.size)) throw new MediaLayoutError(l.role);
        size = Math.max(l.minSize!, Math.floor(size * 0.88));
      }
    }
    if (l.opacity !== 1)
      pixels = await sharp(pixels).ensureAlpha().linear([1, 1, 1, l.opacity], [0, 0, 0, 0]).png().toBuffer();
    overlays.push({ input: pixels, left, top });
  }
  const background = Buffer.from(
    `<svg width="${width}" height="${height}"><defs><linearGradient id="g"><stop stop-color="${brand.background}"/><stop offset="1" stop-color="${brand.accent}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`
  );
  return (
    spec.delivery || scene.background
      ? sharp({ create: { width, height, channels: 4, background: scene.background ?? brand.background } })
      : sharp(background)
  )
    .ensureAlpha()
    .composite(overlays)
    .png()
    .toBuffer();
}

/** A free commercial-mode preview must not be an alternate full-resolution master endpoint. */
export async function draftThumbnail(frame: Buffer) {
  const { data, info } = await sharp(frame).resize({ width: 384, height: 384, fit: 'inside', withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
  const mark = Buffer.from(`<svg width="${info.width}" height="${info.height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="28" fill="#111" opacity=".8"/><text x="8" y="20" fill="white" font-size="16">Vululu · aperçu</text></svg>`);
  return sharp(data).composite([{ input: mark }]).png().toBuffer();
}
