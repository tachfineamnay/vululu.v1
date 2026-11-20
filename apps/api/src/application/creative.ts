import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buffer } from 'node:stream/consumers';
import { creativeSpec, type CreativeSpec } from '@vululu/contracts';
import type { ArtifactStoragePort } from '@vululu/application';
import { creativeFrame, assembleMaster, clipPoster, masterDurationTolerance } from '@vululu/media';
import { HttpError } from '../errors';

const missing = () => new HttpError(404, 'creative_not_found', 'Projet, révision ou ressource introuvable.');
const hash = (v: Buffer | string) => createHash('sha256').update(v).digest('hex');
const sourceIds = (s: CreativeSpec) => [
  ...new Set([
    ...s.scenes.flatMap((scene) => [
      ...scene.layers.flatMap((l) => (l.type === 'image' ? [l.versionId] : [])),
      ...(scene.clip ? [scene.clip.versionId] : [])
    ]),
    ...(s.delivery?.audio ? [s.delivery.audio.versionId] : [])
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
    if (spec.delivery?.audio && !rows.get(spec.delivery.audio.versionId)?.mimeType?.startsWith('audio/'))
      throw missing();
    return rows;
  }
  private async bytes(rows: Awaited<ReturnType<CreativeRepository['sources']>>, id: string) {
    const r = rows.get(id)!;
    const b = await buffer((await this.reader({ provider: r.storageProvider }).get(r.storageKey)).stream);
    if (hash(b) !== r.sha256) throw new Error('creative_asset_integrity');
    return b;
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
      clip: { path: file, overlay, start: c.start, height }
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
  async render(userId: string, id: string, version: number, seal = (manifest: Manifest) => this.repo.seal(userId, id, version, manifest)) {
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
              height: Math.round((spec.height * clip.height) / 2) * 2
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
      }
      if (spec.delivery && spec.delivery.kind !== 'short') {
        await seal({
          renderer: 'creative-2',
          approvalSha256: hash(JSON.stringify(frames.map((f) => [f.sceneKey, f.sha256]))),
          frames,
          master: frames[0],
          seconds: 0
        });
        return (await this.get(userId, id, version)).manifest!;
      }
      const audio = spec.delivery?.audio;
      const audioPath = path.join(dir, 'audio');
      if (audio) await fs.writeFile(audioPath, await this.bytes(sources, audio.versionId));
      const master = await assembleMaster({
        motion: spec.delivery
          ? {
              width: spec.width,
              height: spec.height,
              clips,
              dip: spec.delivery.transition === 'dip',
              sceneDip: spec.scenes.map((s) => (s.transition ?? spec.delivery?.transition) === 'dip'),
              audio: audio ? { path: audioPath, gain: audio.gain } : undefined
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
      const manifest: Manifest = {
        renderer: spec.delivery ? 'creative-2' : 'creative-1',
        frames,
        master: { key, provider: this.storage.provider, sha256: master.checksum, sizeBytes },
        seconds: master.duration
      };
      // Never replace a sealed manifest, even on concurrent render requests.
      await seal(manifest);
      return (await this.get(userId, id, version)).manifest!;
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
}
