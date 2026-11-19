import { expect, it } from 'vitest';
import { creativeSpec, type CreativeSpec } from '@vululu/contracts';
import { creativeFrame } from '../packages/media/src/creativeFrame';
import { createRequire } from 'node:module';
import path from 'node:path';
const sharp = createRequire(path.resolve('packages/media/package.json'))('sharp');
const spec: CreativeSpec = {
  schemaVersion: 1,
  width: 320,
  height: 320,
  safeArea: 0.05,
  brand: { background: '#000000', accent: '#000000' },
  scenes: [
    {
      key: 'SCENE-001',
      seconds: 1,
      layers: [
        {
          type: 'image',
          versionId: 'photo',
          fit: 'cover',
          gravity: 'centre',
          x: 0.25,
          y: 0.25,
          w: 0.5,
          h: 0.5,
          opacity: 0.5
        }
      ]
    }
  ]
};
it('composites actual raster pixels at the specified location and opacity', async () => {
  const red = await sharp({ create: { width: 16, height: 32, channels: 3, background: '#ff0000' } })
    .png()
    .toBuffer();
  const result = await creativeFrame(spec, spec.scenes[0], async () => red);
  const pixel = (x: number, y: number) =>
    sharp(result).extract({ left: x, top: y, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
  expect([...(await pixel(0, 0))]).toEqual([0, 0, 0]);
  const center = await pixel(160, 160);
  expect(center[0]).toBeGreaterThanOrEqual(126);
  expect(center[0]).toBeLessThanOrEqual(129);
  expect(center[1]).toBe(0);
});
it('accepts arbitrary ordered scenes, rejects duplicate identities and off-canvas boxes', () => {
  expect(
    creativeSpec.parse({
      ...spec,
      scenes: Array.from({ length: 7 }, (_, i) => ({ ...spec.scenes[0], key: 'SCENE-00' + (i + 1) }))
    }).scenes
  ).toHaveLength(7);
  expect(creativeSpec.safeParse({ ...spec, scenes: [spec.scenes[0], spec.scenes[0]] }).success).toBe(false);
  expect(
    creativeSpec.safeParse({
      ...spec,
      scenes: [{ ...spec.scenes[0], layers: [{ ...spec.scenes[0].layers[0], x: 0.8 }] }]
    }).success
  ).toBe(false);
});
it('rejects unsafe text placement and text that does not fit rather than silently clipping', async () => {
  const text = {
    type: 'text' as const,
    role: 'cta' as const,
    x: 0,
    y: 0,
    w: 0.5,
    h: 0.1,
    color: '#ffffff',
    size: 36,
    bold: true,
    opacity: 1,
    text: 'Exemple'
  };
  expect(creativeSpec.safeParse({ ...spec, scenes: [{ ...spec.scenes[0], layers: [text] }] }).success).toBe(false);
  await expect(
    creativeFrame(
      spec,
      { ...spec.scenes[0], layers: [{ ...text, x: 0.1, y: 0.1, text: 'Une ligne\n'.repeat(30) }] },
      async () => Buffer.alloc(0)
    )
  ).rejects.toMatchObject({ code: 'media_text_overflow' });
});
