import crypto from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';

export type AssetInspection = { mimeType: string; extension: string; sizeBytes: number; sha256: string; metadata: Record<string, number | string> };
const extensions: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'video/mp4': 'mp4', 'audio/wav': 'wav', 'audio/mpeg': 'mp3', 'application/pdf': 'pdf', 'text/plain': 'txt', 'font/ttf': 'ttf', 'font/otf': 'otf' };
const run = promisify(execFile);

/** Inspection bornée ; aucune URL ni nom de fichier utilisateur n'est exécuté. */
export async function inspectAsset(bytes: Buffer, mimeType: string): Promise<AssetInspection> {
  const extension = extensions[mimeType];
  if (!extension || bytes.length === 0 || bytes.length > 32 * 1024 * 1024) throw new Error('asset_invalid_file');
  let metadata: Record<string, number | string> = {};
  try {
    if (mimeType.startsWith('image/')) {
      const image = sharp(bytes, { failOn: 'warning', limitInputPixels: 16_000_000 });
      const info = await image.metadata();
      const expected = mimeType === 'image/jpeg' ? 'jpeg' : extension;
      if (info.format !== expected || !info.width || !info.height || (info.pages ?? 1) !== 1) throw new Error('invalid');
      await image.stats();
      metadata = { width: info.width, height: info.height };
    } else if (mimeType === 'text/plain') {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      // eslint-disable-next-line no-control-regex -- Seuls tabulation, CR et LF sont admis parmi les contrôles ASCII.
      if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw new Error('invalid');
    } else if (mimeType === 'application/pdf') {
      if (!/^%PDF-[12]\.\d/.test(bytes.subarray(0, 8).toString('ascii')) || !bytes.subarray(-1024).includes(Buffer.from('%%EOF'))) throw new Error('invalid');
    } else if (mimeType.startsWith('font/')) {
      if (bytes.length < 12 || (mimeType === 'font/otf' ? bytes.toString('ascii', 0, 4) !== 'OTTO' : bytes.readUInt32BE(0) !== 0x00010000)) throw new Error('invalid');
      const tables = bytes.readUInt16BE(4);
      if (tables < 1 || tables > 256 || 12 + tables * 16 > bytes.length) throw new Error('invalid');
      for (let i = 0; i < tables; i++) {
        const pos = 12 + i * 16;
        if (bytes.readUInt32BE(pos + 8) + bytes.readUInt32BE(pos + 12) > bytes.length) throw new Error('invalid');
      }
      metadata = { tables };
    } else {
      const validHeader = mimeType === 'video/mp4' ? bytes.length >= 12 && bytes.toString('ascii', 4, 8) === 'ftyp'
        : mimeType === 'audio/wav' ? bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE'
        : bytes.length >= 3 && (bytes.toString('ascii', 0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0));
      if (!validHeader) throw new Error('invalid');
      const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'vululu-asset-'));
      try {
        const file = path.join(directory, 'input.' + extension);
        await fs.writeFile(file, bytes);
        const ffmpeg = process.env.FFMPEG_PATH;
        const probe = process.env.FFPROBE_PATH || (ffmpeg ? path.join(path.dirname(ffmpeg), path.extname(ffmpeg) === '.exe' ? 'ffprobe.exe' : 'ffprobe') : 'ffprobe');
        const args = ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-probesize', '2097152', '-analyzeduration', '2000000'];
        if (mimeType === 'video/mp4') args.push('-enable_drefs', '0', '-use_absolute_path', '0');
        args.push('-show_entries', 'format=format_name,duration:stream=codec_type,codec_name,width,height', '-of', 'json', file);
        const { stdout } = await run(probe, args, { timeout: 10000, maxBuffer: 65536, windowsHide: true });
        const result = JSON.parse(stdout) as { format: { format_name: string; duration: string }; streams: Array<{ codec_type: string; codec_name: string; width?: number; height?: number }> };
        const duration = Number(result.format.duration);
        if (!Number.isFinite(duration) || duration <= 0 || duration > 600 || result.streams.length > 8) throw new Error('invalid');
        const stream = result.streams.find((item) => item.codec_type === (mimeType === 'video/mp4' ? 'video' : 'audio'));
        if (!stream || (mimeType === 'video/mp4' && stream.codec_name !== 'h264') || (mimeType === 'audio/mpeg' && (stream.codec_name !== 'mp3' || result.format.format_name !== 'mp3')) || (mimeType === 'audio/wav' && (!stream.codec_name.startsWith('pcm_') || result.format.format_name !== 'wav'))) throw new Error('invalid');
        metadata = { duration, codec: stream.codec_name, ...(stream.width ? { width: stream.width, height: stream.height! } : {}) };
      } finally {
        await fs.rm(path.join(directory, 'input.' + extension), { force: true });
        await fs.rmdir(directory);
      }
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw Object.assign(new Error('asset_inspector_unavailable', { cause: error }), { code: 'asset_inspector_unavailable' });
    }
    throw new Error('asset_invalid_file', { cause: error });
  }
  return { mimeType, extension, sizeBytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), metadata };
}
