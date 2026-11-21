import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildMixArgs, mixTracks } from '../packages/media/src/audio';
import { assembleMaster, mediaRun, renderScene, runQa } from '../packages/media/src/index';

/**
 * P12-07 — régressions du pipeline média réel.
 * - mixage : une voix courte ne doit plus tronquer la musique (défaut constaté : 2,6 s pour 3,5 s) ;
 * - montage vidéo : une géométrie de clip invalide échoue explicitement avant FFmpeg.
 * Les cas FFmpeg exigent FFMPEG_PATH (binaire complet) ; ils ne sont jamais simulés.
 */

const root = path.resolve('.v1', 'media-p12-07');
const base = { artifactRoot: root, brandName: 'Atelier', colorPrimary: '#163148', colorSecondary: '#f2c94c' };
const scene = (projectId: string, key: string, position: number) => renderScene({ ...base, projectId, sceneKey: key, position, version: 1, title: 'Scène ' + position, description: 'Une scène réelle pour le pipeline.', width: 1080, height: 1920 });

describe('mixage audio borné à la durée du master', () => {
  it('complète chaque piste et le bus final en silence jusqu à la durée demandée', () => {
    const args = buildMixArgs(
      [
        { path: 'voice.wav', kind: 'voiceover', gain: 1, start: 0.2, fadeIn: 0.1 },
        { path: 'music.wav', kind: 'music', gain: 0.4, start: 0, fadeOut: 0.4, ducking: true }
      ],
      3.5,
      'out.wav'
    );
    const filter = args[args.indexOf('-filter_complex') + 1];
    expect(filter.match(/apad=whole_dur=3\.300/g)?.length).toBeGreaterThanOrEqual(1);
    expect(filter.match(/apad=whole_dur=3\.500/g)?.length).toBeGreaterThanOrEqual(1);
    expect(filter).toContain('sidechaincompress');
    expect(args).toContain('-t');
  });

  it('refuse une liste vide et une durée invalide', () => {
    expect(() => buildMixArgs([], 3, 'out.wav')).toThrow('audio_tracks_required');
    expect(() => buildMixArgs([{ path: 'v.wav', kind: 'voiceover', gain: 1, start: 0 }], 0, 'out.wav'))
      .toThrow('audio_duration_invalid');
  });

  it('produit réellement un mix de la durée demandée (voix courte + musique duckée)', async () => {
    await fs.mkdir(root, { recursive: true });
    const voice = path.join(root, 'voice.wav');
    const music = path.join(root, 'music.wav');
    await mediaRun(['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=660:duration=1.2', '-ar', '48000', '-ac', '2', voice]);
    await mediaRun(['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=4', '-ar', '48000', '-ac', '2', music]);
    const out = path.join(root, 'mix.wav');
    await mixTracks({
      tracks: [
        { path: voice, kind: 'voiceover', gain: 1, start: 0.2 },
        { path: music, kind: 'music', gain: 0.35, start: 0, fadeIn: 0.25, fadeOut: 0.4, ducking: true }
      ],
      durationSeconds: 3.5, out, run: mediaRun
    });
    const probe = await mediaRun(['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', out]);
    expect(Math.abs(Number(probe.trim()) - 3.5)).toBeLessThanOrEqual(0.06);
  });
});

describe('montage vidéo : géométrie validée avant FFmpeg', () => {
  it('refuse une hauteur de clip nulle, impaire ou hors bornes', async () => {
    const a = await scene('geometry', 'SCENE-001', 1);
    for (const height of [1, 1247, 5000]) {
      await expect(assembleMaster({
        projectId: 'geometry', artifactRoot: root, version: height,
        scenePaths: [a.absolutePath], sceneDurationsSeconds: [1],
        motion: { width: 1080, height: 1920, dip: false, clips: [{ path: a.absolutePath, overlay: a.absolutePath, start: 0, height, fit: 'cover' }] }
      })).rejects.toThrow('media_motion_geometry_invalid');
    }
  });

  it('refuse un canvas impair, nul ou hors bornes', async () => {
    const a = await scene('canvas', 'SCENE-001', 1);
    for (const width of [1081, 0, 5000]) {
      await expect(assembleMaster({
        projectId: 'canvas', artifactRoot: root, version: 1,
        scenePaths: [a.absolutePath], sceneDurationsSeconds: [1],
        motion: { width, height: 1920, dip: false, clips: [] }
      })).rejects.toThrow('media_motion_geometry_invalid');
    }
  });
});

describe('master vidéo réel : codecs, durée et intégrité', () => {
  it('encode un MP4 H.264/AAC de la durée exacte et passe la QA', async () => {
    const a = await scene('real', 'SCENE-001', 1);
    const b = await scene('real', 'SCENE-002', 2);
    const master = await assembleMaster({
      projectId: 'real', artifactRoot: root, version: 1,
      scenePaths: [a.absolutePath, b.absolutePath], sceneDurationsSeconds: [1.5, 1],
      motion: { width: 1080, height: 1920, dip: true, clips: [], preset: 'ultrafast' }
    });
    expect(master.videoCodec).toBe('h264');
    expect(master.audioCodec).toBe('aac');
    expect(Math.abs(master.duration - 2.5)).toBeLessThanOrEqual(0.04);
    expect(master.width).toBe(1080);
    expect(master.height).toBe(1920);
    const qa = await runQa([a, b], master, { width: 1080, height: 1920 });
    expect(qa.status).toBe('PASS');
  });
});
