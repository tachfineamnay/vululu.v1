import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buffer } from 'node:stream/consumers';
import {
  creativeSpec,
  defaultSubtitleStyle,
  isVideoOutput,
  type CreativeAssetApply,
  type CreativeSpec
} from '@vululu/contracts';
import type { ArtifactStoragePort } from '@vululu/application';
import {
  creativeFrame,
  assembleMaster,
  buildAssText,
  buildSrtText,
  clipPoster,
  extractAudio,
  masterDurationTolerance,
  mediaRun,
  mixTracks,
  type AudioMixTrack
} from '@vululu/media';
import { HttpError } from '../errors';

const missing = () => new HttpError(404, 'creative_not_found', 'Projet, révision ou ressource introuvable.');
/** Un apercu video est borne : au-dela, le rendu final (file durable) reste la reference. */
const PREVIEW_SECONDS = 20;
const hash = (v: Buffer | string) => createHash('sha256').update(v).digest('hex');
const sourceIds = (s: CreativeSpec) => [
  ...new Set([
    ...s.scenes.flatMap((scene) => [
      ...scene.layers.flatMap((l) => (l.type === 'image' ? [l.versionId] : [])),
      ...(scene.clip ? [scene.clip.versionId] : [])
    ]),
    ...(s.delivery?.audio ? [s.delivery.audio.versionId] : []),
    ...(s.audio?.tracks ?? []).map((track) => track.versionId)
  ])
];
type ObjectRef = { provider: string; key: string; sha256: string; sizeBytes: number };
type Frame = ObjectRef & {
  overlay?: ObjectRef;
  sceneKey: string;
  fingerprint: string;
  sources: { id: string; sha256: string }[];
  seconds: number;
};
export type Manifest = {
  renderer: 'creative-1' | 'creative-2';
  approvalSha256?: string;
  frames: Frame[];
  master: ObjectRef;
  seconds: number;
  /** P09B — provenance du mixage et des sous-titres effectivement encodés. */
  audio?: {
    seconds: number;
    tracks: { kind: string; versionId: string; sha256: string }[];
    subtitles: number;
  };
};
type RevisionMeta = { version: number; approvedAt: Date | null; createdAt: Date };
type Revision = RevisionMeta & { spec: CreativeSpec; manifest: Manifest | null };
export interface CreativeRepository {
  project(userId: string, id: string): Promise<{ usage: string; contextId: string }>;
  sources(
    userId: string,
    contextId: string,
    usage: string,
    ids: string[]
  ): Promise<
    Map<
      string,
      {
        id: string;
        storageKey: string;
        storageProvider: string;
        mimeType?: string;
        metadata?: unknown;
        sha256: string;
      }
    >
  >;
  history(userId: string, id: string): Promise<RevisionMeta[]>;
  get(userId: string, id: string, version: number): Promise<Revision>;
  append(userId: string, id: string, expectedVersion: number, spec: CreativeSpec): Promise<Revision>;
  approve(userId: string, id: string, version: number): Promise<void>;
  previous(userId: string, id: string, version: number): Promise<Manifest | null>;
  seal(userId: string, id: string, version: number, manifest: Manifest): Promise<void>;
}

export class CreativeStudio {
  constructor(
    private readonly repo: CreativeRepository,
    private readonly storage: ArtifactStoragePort,
    private readonly readers: Record<string, ArtifactStoragePort>
  ) {}
  history(userId: string, id: string) {
    return this.repo.history(userId, id);
  }
  get(userId: string, id: string, version: number) {
    return this.repo.get(userId, id, version);
  }
  async save(userId: string, id: string, expectedVersion: number, input: CreativeSpec) {
    const spec = creativeSpec.parse(input),
      p = await this.repo.project(userId, id);
    await this.checked(userId, p, spec);
    return this.repo.append(userId, id, expectedVersion, spec);
  }
  async restore(userId: string, id: string, version: number, expectedVersion: number) {
    const row = await this.get(userId, id, version);
    return this.save(userId, id, expectedVersion, creativeSpec.parse(row.spec));
  }
  /** P08 — applique une ressource existante à un calque image, sans écraser la révision courante. */
  async applyAsset(userId: string, id: string, input: CreativeAssetApply) {
    const row = await this.get(userId, id, input.expectedRevision),
      p = await this.repo.project(userId, id),
      source = (await this.repo.sources(userId, p.contextId, p.usage, [input.versionId])).get(input.versionId);
    if (!source?.mimeType?.startsWith('image/'))
      throw new HttpError(422, 'creative_asset_unsupported', 'Seules les images peuvent être appliquées à un calque image.');
    const spec = row.spec,
      scene = input.sceneKey ? spec.scenes.find((s) => s.key === input.sceneKey) : spec.scenes[0];
    if (!scene) throw new HttpError(404, 'creative_not_found', 'Scène introuvable.');
    if (input.layerIndex !== undefined) {
      const layer = scene.layers[input.layerIndex];
      if (!layer) throw new HttpError(422, 'creative_layer_missing', 'Calque introuvable.');
      if (layer.type !== 'image')
        throw new HttpError(422, 'creative_layer_unsupported', "Le calque ciblé n'est pas une image.");
      layer.versionId = input.versionId;
      layer.fit = input.fit;
    } else {
      const hero = scene.layers.findIndex((l) => l.type === 'image' && l.x === 0 && l.y === 0 && l.w === 1),
        layer = hero >= 0 ? scene.layers[hero] : undefined;
      if (layer?.type === 'image') {
        layer.versionId = input.versionId;
        layer.fit = input.fit;
      } else {
        if (scene.layers.length >= 16)
          throw new HttpError(422, 'creative_layer_limit', 'Nombre maximal de calques atteint.');
        scene.layers.unshift({
          type: 'image',
          versionId: input.versionId,
          x: 0,
          y: 0,
          w: 1,
          h: scene.clip ? 0.65 : 1,
          fit: input.fit,
          gravity: 'centre',
          opacity: 1
        });
      }
    }
    return this.save(userId, id, input.expectedRevision, spec);
  }
  async approve(userId: string, id: string, version: number, checksum: string) {
    const row = await this.get(userId, id, version);
    if ((row.manifest?.approvalSha256 ?? row.manifest?.master.sha256) !== checksum)
      throw new HttpError(409, 'creative_unrendered', 'Vérifiez le master exact avant approbation.');
    await this.repo.approve(userId, id, version);
    return this.get(userId, id, version);
  }
  private reader(ref: { provider: string }) {
    const r = this.readers[ref.provider];
    if (!r) throw new HttpError(503, 'storage_unavailable', 'Stockage indisponible.');
    return r;
  }
  async file(userId: string, id: string, version: number, sceneKey?: string) {
    const m = (await this.get(userId, id, version)).manifest;
    const ref = sceneKey ? m?.frames.find((f) => f.sceneKey === sceneKey) : m?.master;
    if (!ref) throw missing();
    const reader = this.reader(ref);
    return {
      size: ref.sizeBytes,
      sha256: ref.sha256,
      contentType: sceneKey || ref.key.endsWith('.png') ? ('image/png' as const) : ('video/mp4' as const),
      openRead: async (range?: { start: number; end?: number }) => (await reader.get(ref.key, range)).stream
    };
  }
  /** Sous-titres SRT d'une révision rendue (texte seul, aucun média). */
  async subtitleFile(userId: string, id: string, version: number) {
    const row = await this.get(userId, id, version);
    if (!row.manifest) throw new HttpError(409, 'creative_unrendered', 'Rendez la révision avant d’exporter ses sous-titres.');
    const cues = row.spec.audio?.subtitles?.enabled ? row.spec.audio.subtitles.cues : [];
    if (!cues.length) throw new HttpError(404, 'creative_subtitles_missing', 'Aucun sous-titre dans cette révision.');
    return { text: buildSrtText(cues), filename: `sous-titres-v${version}.srt`, count: cues.length };
  }
  /** Piste audio du master approuvé, extraite sans réencodage (AAC/M4A). */
  async audioFile(userId: string, id: string, version: number) {
    const row = await this.get(userId, id, version);
    const master = row.manifest?.master;
    if (!master) throw new HttpError(409, 'creative_unrendered', 'Rendez la révision avant d’exporter sa piste audio.');
    const reader = this.reader(master);
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vululu-audio-'));
    try {
      const source = path.join(dir, 'master.mp4');
      await fs.writeFile(source, await buffer((await reader.get(master.key)).stream));
      const out = path.join(dir, 'audio.m4a');
      await extractAudio({ master: source, out, run: mediaRun });
      return { bytes: await fs.readFile(out), contentType: 'audio/mp4' as const };
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
  private async checked(userId: string, p: { contextId: string; usage: string }, spec: CreativeSpec) {
    const rows = await this.repo.sources(userId, p.contextId, p.usage, sourceIds(spec));
    for (const scene of spec.scenes) {
      for (const l of scene.layers)
        if (
          l.type === 'image' &&
          rows.get(l.versionId)?.mimeType &&
          !rows.get(l.versionId)!.mimeType!.startsWith('image/')
        )
          throw missing();
      if (scene.clip) {
        const r = rows.get(scene.clip.versionId);
        if (r?.mimeType !== 'video/mp4') throw missing();
        const duration = (r.metadata as { duration?: number } | null)?.duration ?? NaN;
        if (!Number.isFinite(duration) || duration + 0.001 < scene.clip.start + scene.seconds)
          throw new HttpError(422, 'clip_duration', 'Le clip est trop court pour cette scène.');
      }
    }
    for (const track of this.audioTracks(spec))
      if (!rows.get(track.versionId)?.mimeType?.startsWith('audio/')) throw missing();
    return rows;
  }
  private async bytes(rows: Awaited<ReturnType<CreativeRepository['sources']>>, id: string) {
    const r = rows.get(id)!;
    const b = await buffer((await this.reader({ provider: r.storageProvider }).get(r.storageKey)).stream);
    if (hash(b) !== r.sha256) throw new Error('creative_asset_integrity');
    return b;
  }
  /** Pistes audio effectives : l'ancienne piste delivery.audio reste une musique de la timeline. */
  private audioTracks(spec: CreativeSpec) {
    const legacy = spec.delivery?.audio;
    return [
      ...(legacy
        ? [{ kind: 'music' as const, versionId: legacy.versionId, start: 0, gain: legacy.gain, fadeIn: 0, fadeOut: 0, ducking: false }]
        : []),
      ...(spec.audio?.tracks ?? []).map((track) => ({
        kind: track.kind,
        versionId: track.versionId,
        start: track.start,
        gain: track.gain,
        fadeIn: track.fadeIn,
        fadeOut: track.fadeOut,
        ducking: track.ducking === true
      }))
    ];
  }
  /** Sous-titres ASS par scène, ramenés au temps local de chaque partie vidéo. */
  private subtitleTexts(spec: CreativeSpec, durations: readonly number[]): (string | undefined)[] {
    const subtitles = spec.audio?.subtitles;
    if (!subtitles?.enabled || !subtitles.cues.length) return [];
    const style = subtitles.style ?? defaultSubtitleStyle;
    const texts: (string | undefined)[] = [];
    let cursor = 0;
    for (const [index, seconds] of durations.entries()) {
      const sceneEnd = cursor + seconds;
      const subset = subtitles.cues.filter((cue) => cue.start < sceneEnd && cue.end > cursor);
      if (subset.length) {
        const text = buildAssText({
          cues: subset,
          style,
          width: spec.width,
          height: spec.height,
          safeArea: spec.safeArea,
          sceneStart: cursor,
          sceneEnd
        });
        if (text) texts[index] = text;
      }
      cursor = sceneEnd;
    }
    return texts;
  }
  /** Mixage local déterministe des pistes de la timeline (WAV 48 kHz stéréo). */
  private async mixedAudio(
    spec: CreativeSpec,
    sources: Awaited<ReturnType<CreativeRepository['sources']>>,
    dir: string,
    durationSeconds: number
  ) {
    const tracks = this.audioTracks(spec);
    if (!tracks.length) return undefined;
    const inputs: AudioMixTrack[] = [];
    for (const [index, track] of tracks.entries()) {
      const source = sources.get(track.versionId);
      if (!source) throw missing();
      const file = path.join(dir, `track-${index}.${source.mimeType === 'audio/wav' ? 'wav' : 'mp3'}`);
      await fs.writeFile(file, await this.bytes(sources, track.versionId));
      inputs.push({
        path: file,
        kind: track.kind,
        gain: track.gain,
        start: track.start,
        fadeIn: track.fadeIn,
        fadeOut: track.fadeOut,
        ducking: track.ducking
      });
    }
    const mixed = path.join(dir, 'mixed.wav');
    await mixTracks({ tracks: inputs, durationSeconds, out: mixed, run: mediaRun });
    return mixed;
  }
  private async draw(
    spec: CreativeSpec,
    scene: CreativeSpec['scenes'][number],
    rows: Awaited<ReturnType<CreativeRepository['sources']>>,
    dir: string
  ) {
    const resolve = (id: string) => this.bytes(rows, id);
    if (!scene.clip) return { bytes: await creativeFrame(spec, scene, resolve) };
    const c = scene.clip,
      height = Math.round((spec.height * c.height) / 2) * 2,
      base = path.join(dir, scene.key),
      file = base + '.mp4',
      overlay = base + '-overlay.png';
    await fs.writeFile(file, await resolve(c.versionId));
    const poster = await clipPoster(file, c.start, spec.width, height, base + '-poster.png');
    await fs.writeFile(overlay, await creativeFrame(spec, scene, resolve, { height: c.height }));
    return {
      bytes: await creativeFrame(spec, scene, resolve, { height: c.height, poster }),
      clip: { path: file, overlay, start: c.start, height, fit: c.fit, focusY: c.focusY }
    };
  }
  async preview(userId: string, id: string, spec: CreativeSpec) {
    const p = await this.repo.project(userId, id),
      dir = await fs.mkdtemp(path.join(os.tmpdir(), 'creative-preview-'));
    try {
      return (await this.draw(spec, spec.scenes[0], await this.checked(userId, p, spec), dir)).bytes;
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
  /**
   * Apercu video reel (meme compositeur que le master), borne a 20 s, sans revision,
   * sans stockage et sans verification d'approbation : ce n'est pas un artefact livrable.
   */
  async previewVideo(userId: string, id: string, spec: CreativeSpec, hooks: { isCancelled?: () => boolean } = {}) {
    const p = await this.repo.project(userId, id),
      sources = await this.checked(userId, p, spec),
      dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vululu-creative-video-'));
    try {
      const clips: NonNullable<Parameters<typeof assembleMaster>[0]['motion']>['clips'] = [],
        paths: string[] = [],
        seconds: number[] = [],
        dips: boolean[] = [];
      const available = spec.scenes.reduce((sum, scene) => sum + scene.seconds, 0);
      let total = 0;
      for (const scene of spec.scenes) {
        if (total >= PREVIEW_SECONDS) break;
        if (hooks.isCancelled?.()) throw new Error('creative_render_cancelled');
        const draw = await this.draw(spec, scene, sources, dir),
          file = path.join(dir, scene.key + '.png'),
          take = Math.min(scene.seconds, PREVIEW_SECONDS - total);
        await fs.writeFile(file, draw.bytes);
        paths.push(file);
        seconds.push(take);
        clips[paths.length - 1] = draw.clip;
        dips.push((scene.transition ?? spec.delivery?.transition) === 'dip');
        total += take;
      }
      const previewSeconds = seconds.reduce((sum, value) => sum + value, 0);
      const mixed = await this.mixedAudio(spec, sources, dir, previewSeconds);
      const subtitles = this.subtitleTexts(spec, seconds);
      const master = await assembleMaster({
        motion: {
          width: spec.width,
          height: spec.height,
          clips,
          dip: spec.delivery?.transition === 'dip',
          sceneDip: dips,
          preset: 'ultrafast',
          ...(mixed ? { audio: { path: mixed, gain: 1 } } : {}),
          ...(subtitles.some(Boolean) ? { subtitles } : {})
        },
        artifactRoot: dir,
        projectId: 'preview',
        version: 1,
        scenePaths: paths,
        sceneDurationsSeconds: seconds
      });
      return {
        bytes: await fs.readFile(master.absolutePath),
        seconds: master.duration,
        bounded: available > PREVIEW_SECONDS + 0.001,
        contentType: 'video/mp4' as const
      };
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
  async render(
    userId: string,
    id: string,
    version: number,
    seal = (manifest: Manifest) => this.repo.seal(userId, id, version, manifest),
    hooks: { onProgress?: (percent: number) => void; isCancelled?: () => Promise<boolean> } = {}
  ) {
    const row = await this.get(userId, id, version);
    if (row.manifest) return row.manifest;
    const spec = creativeSpec.parse(row.spec),
      p = await this.repo.project(userId, id),
      sources = await this.checked(userId, p, spec);
    const cache = (await this.repo.previous(userId, id, version))?.frames;
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vululu-creative-'));
    const frames: Frame[] = [],
      paths: string[] = [];
    const persistFrame = async (bytes: Buffer): Promise<ObjectRef> => {
      const sha256 = hash(bytes),
        key = `creative/${id}/${sha256}.png`;
      await this.storage.putObject({
        key,
        body: bytes,
        contentType: 'image/png',
        sha256,
        sizeBytes: bytes.length
      });
      return { provider: this.storage.provider, key, sha256, sizeBytes: bytes.length };
    };
    try {
      const clips: NonNullable<Parameters<typeof assembleMaster>[0]['motion']>['clips'] = [];
      for (const scene of spec.scenes) {
        // Annulation cooperative : une scene en cours d'encodage se termine, la suivante non.
        if (hooks.isCancelled && (await hooks.isCancelled())) throw new Error('creative_render_cancelled');
        const deps = scene.layers.flatMap((l) =>
          l.type === 'image' ? [{ id: l.versionId, sha256: sources.get(l.versionId)!.sha256 }] : []
        );
        if (scene.clip)
          deps.push({ id: scene.clip.versionId, sha256: sources.get(scene.clip.versionId)!.sha256 });
        const fingerprint = hash(
          JSON.stringify([
            'creative-2',
            scene.clip,
            spec.width,
            spec.height,
            spec.brand,
            scene.layers,
            deps,
            ...(scene.background ? [scene.background] : []),
            ...(spec.delivery ? ['flat'] : [])
          ])
        );
        const hit = cache?.find((f) => f.fingerprint === fingerprint);
        let bytes: Buffer, ref: ObjectRef;
        let overlay: ObjectRef | undefined;
        if (hit && (!scene.clip || hit.overlay)) {
          bytes = await buffer((await this.reader(hit).get(hit.key)).stream);
          if (hash(bytes) !== hit.sha256) throw new Error('creative_cache_integrity');
          ref = hit;
          if (scene.clip && hit.overlay) {
            overlay = hit.overlay;
            const overlayBytes = await buffer((await this.reader(overlay).get(overlay.key)).stream);
            if (hash(overlayBytes) !== overlay.sha256) throw new Error('creative_cache_integrity');
            const clip = scene.clip,
              file = path.join(dir, scene.key + '.mp4'),
              overlayPath = path.join(dir, scene.key + '-overlay.png');
            await fs.writeFile(file, await this.bytes(sources, clip.versionId));
            await fs.writeFile(overlayPath, overlayBytes);
            clips[frames.length] = {
              path: file,
              overlay: overlayPath,
              start: clip.start,
              height: Math.round((spec.height * clip.height) / 2) * 2,
              fit: clip.fit,
              focusY: clip.focusY
            };
          }
        } else {
          const draw = await this.draw(spec, scene, sources, dir);
          bytes = draw.bytes;
          clips[frames.length] = draw.clip;
          if (draw.clip) overlay = await persistFrame(await fs.readFile(draw.clip.overlay));
          ref = await persistFrame(bytes);
        }
        const file = path.join(dir, `${frames.length}.png`);
        await fs.writeFile(file, bytes);
        paths.push(file);
        frames.push({
          ...ref,
          ...(overlay ? { overlay } : {}),
          sceneKey: scene.key,
          fingerprint,
          sources: deps,
          seconds: scene.seconds
        });
        hooks.onProgress?.(10 + Math.round((frames.length / spec.scenes.length) * 70));
      }
      if (spec.delivery && !isVideoOutput(spec.delivery.kind)) {
        await seal({
          renderer: 'creative-2',
          approvalSha256: hash(JSON.stringify(frames.map((f) => [f.sceneKey, f.sha256]))),
          frames,
          master: frames[0],
          seconds: 0
        });
        return (await this.get(userId, id, version)).manifest!;
      }
      hooks.onProgress?.(85);
      const totalSeconds = frames.reduce((sum, frame) => sum + frame.seconds, 0);
      const mixed = await this.mixedAudio(spec, sources, dir, totalSeconds);
      const subtitles = this.subtitleTexts(spec, frames.map((frame) => frame.seconds));
      const master = await assembleMaster({
        motion: spec.delivery
          ? {
              width: spec.width,
              height: spec.height,
              clips,
              dip: spec.delivery.transition === 'dip',
              sceneDip: spec.scenes.map((s) => (s.transition ?? spec.delivery?.transition) === 'dip'),
              ...(mixed ? { audio: { path: mixed, gain: 1 } } : {}),
              ...(subtitles.some(Boolean) ? { subtitles } : {})
            }
          : undefined,
        artifactRoot: dir,
        projectId: 'output',
        version,
        scenePaths: paths,
        sceneDurationsSeconds: frames.map((f) => f.seconds)
      });
      if (
        master.videoCodec !== 'h264' ||
        master.audioCodec !== 'aac' ||
        master.width !== spec.width ||
        master.height !== spec.height ||
        Math.abs(master.duration - master.expectedDurationSeconds) > masterDurationTolerance()
      )
        throw new Error('creative_master_integrity');
      const key = `creative/${id}/${master.checksum}.mp4`,
        sizeBytes = (await fs.stat(master.absolutePath)).size;
      await this.storage.putFile({
        key,
        filePath: master.absolutePath,
        sha256: master.checksum,
        sizeBytes,
        contentType: 'video/mp4'
      });
      const tracks = this.audioTracks(spec);
      const manifest: Manifest = {
        renderer: spec.delivery ? 'creative-2' : 'creative-1',
        frames,
        master: { key, provider: this.storage.provider, sha256: master.checksum, sizeBytes },
        seconds: master.duration,
        ...(mixed || subtitles.some(Boolean)
          ? {
              audio: {
                seconds: mixed ? master.audioDuration : 0,
                tracks: tracks.map((track) => ({
                  kind: track.kind,
                  versionId: track.versionId,
                  sha256: sources.get(track.versionId)!.sha256
                })),
                subtitles: subtitles.some(Boolean) ? (spec.audio?.subtitles?.cues.length ?? 0) : 0
              }
            }
          : {})
      };
      hooks.onProgress?.(95);
      // Never replace a sealed manifest, even on concurrent render requests.
      await seal(manifest);
      hooks.onProgress?.(100);
      return (await this.get(userId, id, version)).manifest!;
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
}
