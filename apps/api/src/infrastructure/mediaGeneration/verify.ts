import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createMediaTempDir, inspectAsset } from '@vululu/media';
import type { MediaRequest } from '@vululu/contracts';
// Probe first, then decode the entire selected video stream: an MP4 header alone is not evidence of a usable clip.
export async function verifyOutput(bytes: Buffer, r: MediaRequest) {
  const mime = r.kind === 'image' ? 'image/png' : 'video/mp4',
    inspection = await inspectAsset(bytes, mime),
    m = inspection.metadata;
  if (`${m.width}:${m.height}` !== r.size) throw Error('media_output_dimensions');
  if (r.kind === 'video') {
    if (Math.abs(Number(m.duration) - r.seconds) > 0.12) throw Error('media_output_duration');
    const dir = await createMediaTempDir('vululu-media-check-');
    try {
      const file = path.join(dir, 'clip.mp4');
      await fs.writeFile(file, bytes);
      const { stdout } = await promisify(execFile)(
        process.env.FFMPEG_PATH || 'ffmpeg',
        [
          '-nostdin',
          '-v',
          'error',
          '-xerror',
          '-protocol_whitelist',
          'file,pipe',
          '-enable_drefs',
          '0',
          '-use_absolute_path',
          '0',
          '-threads',
          '2',
          '-i',
          file,
          '-map',
          '0:v:0',
          '-an',
          '-sn',
          '-dn',
          '-progress',
          'pipe:1',
          '-f',
          'null',
          '-'
        ],
        { timeout: 20000, maxBuffer: 65536 }
      );
      const times = [...stdout.matchAll(/^out_time_us=(\d+)/gm)];
      const end = Number(times.at(-1)?.[1]) / 1e6;
      if (!Number.isFinite(end) || Math.abs(end - r.seconds) > 0.15) throw Error('media_output_truncated');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
  return mime;
}
