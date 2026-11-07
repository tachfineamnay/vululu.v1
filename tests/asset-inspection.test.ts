import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';
import { renderScene } from '../packages/media/src/index';
import { inspectAsset } from '../packages/media/src/assetInspection';

let png: Buffer;
const sharp = createRequire(path.resolve('packages/media/package.json'))('sharp');
beforeAll(async () => {
  const output = await renderScene({ projectId: 'asset-fixture', artifactRoot: path.resolve('.v1/asset-inspection'), sceneKey: 'SCENE-001', position: 1, title: 'Fixture', description: 'Image de test', brandName: 'Marque fictive', colorPrimary: '#123456', colorSecondary: '#789abc', version: 1 });
  png = fs.readFileSync(output.absolutePath);
});
describe('Inspection de fichiers : octets reels, pas extension declaree', () => {
  it('decode un PNG et mesure ses dimensions et SHA', async () => {
    const result = await inspectAsset(png, 'image/png');
    expect(result).toMatchObject({ mimeType: 'image/png', extension: 'png', sizeBytes: png.length, sha256: crypto.createHash('sha256').update(png).digest('hex'), metadata: { width: 1080, height: 1920 } });
  });
  it('refuse une image tronquee ou un faux MIME', async () => {
    await expect(inspectAsset(png.subarray(0, 40), 'image/png')).rejects.toThrow();
    await expect(inspectAsset(png, 'image/jpeg')).rejects.toThrow();
  });
  it.each(['image/svg+xml', 'text/html', 'application/zip'])('refuse le format actif ou non declare %s', async (mime) => {
    await expect(inspectAsset(Buffer.from('<script>alert(1)</script>'), mime)).rejects.toThrow();
  });
  it('accepte un texte UTF-8 sans le presenter comme analyse', async () => {
    expect(await inspectAsset(Buffer.from('Notes fictives : céramique.'), 'text/plain')).toMatchObject({ extension: 'txt' });
  });
  it('refuse les octets invalides et le PDF sans enveloppe complete', async () => {
    await expect(inspectAsset(Buffer.from([0xff, 0x00]), 'text/plain')).rejects.toThrow();
    await expect(inspectAsset(Buffer.from('%PDF-1.7\ntruncated'), 'application/pdf')).rejects.toThrow();
  });
  it.each(['jpeg', 'webp'])('decode aussi une image %s complete', async (format) => {
    const bytes = await sharp(png).resize(64, 64).toFormat(format).toBuffer();
    expect(await inspectAsset(bytes, 'image/' + format)).toMatchObject({ metadata: { width: 64, height: 64 } });
  });
  it('refuse plus de 16 megapixels avant decodage complet', async () => {
    const oversized = await sharp({ create: { width: 4001, height: 4000, channels: 3, background: '#abcdef' } }).png().toBuffer();
    await expect(inspectAsset(oversized, 'image/png')).rejects.toThrow();
  });
  it.each([{ ext: 'wav', mime: 'audio/wav', args: ['-c:a', 'pcm_s16le'] }, { ext: 'mp3', mime: 'audio/mpeg', args: ['-c:a', 'libmp3lame'] }, { ext: 'mp4', mime: 'video/mp4', args: ['-f', 'lavfi', '-i', 'color=c=blue:s=64x64:d=0.3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-shortest'] }])('sonde un vrai fichier $ext', async ({ ext, mime, args }) => {
    const file = path.resolve('.v1/asset-inspection/fixture.' + ext);
    if (!process.env.FFMPEG_PATH) throw new Error('FFMPEG_PATH requis pour ce test reel');
    execFileSync(process.env.FFMPEG_PATH, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.3', ...args, file], { timeout: 20000, stdio: 'pipe', windowsHide: true });
    const result = await inspectAsset(fs.readFileSync(file), mime);
    expect(result.mimeType).toBe(mime); expect(result.metadata.duration).toBeGreaterThan(0);
  });
  it('controle les enveloppes PDF et SFNT sans promettre leur analyse', async () => {
    expect(await inspectAsset(Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF'), 'application/pdf')).toMatchObject({ extension: 'pdf' });
    const font = Buffer.alloc(32); font.writeUInt32BE(0x00010000, 0); font.writeUInt16BE(1, 4); font.write('head', 12); font.writeUInt32BE(28, 20); font.writeUInt32BE(4, 24);
    expect(await inspectAsset(font, 'font/ttf')).toMatchObject({ metadata: { tables: 1 } });
    font.writeUInt32BE(1000, 20);
    await expect(inspectAsset(font, 'font/ttf')).rejects.toThrow();
  });
  it('signale un inspecteur absent sans accuser le fichier', async () => {
    const previous = process.env.FFPROBE_PATH;
    process.env.FFPROBE_PATH = path.resolve('.v1/absent-ffprobe-fixture');
    try { await expect(inspectAsset(Buffer.from('RIFF0000WAVE'), 'audio/wav')).rejects.toMatchObject({ code: 'asset_inspector_unavailable' }); }
    finally { if (previous === undefined) delete process.env.FFPROBE_PATH; else process.env.FFPROBE_PATH = previous; }
  });
});
