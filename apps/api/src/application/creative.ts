import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buffer } from 'node:stream/consumers';
import { creativeSpec, type CreativeSpec } from '@vululu/contracts';
import type { ArtifactStoragePort } from '@vululu/application';
import { creativeFrame, assembleMaster } from '@vululu/media';
import { HttpError } from '../errors';

const missing = () => new HttpError(404, 'creative_not_found', 'Projet, révision ou ressource introuvable.');
const hash = (v: Buffer | string) => createHash('sha256').update(v).digest('hex');
const sourceIds = (s: CreativeSpec) => [
  ...new Set(s.scenes.flatMap((scene) => scene.layers.flatMap((l) => (l.type === 'image' ? [l.versionId] : []))))
];
type ObjectRef = { provider: string; key: string; sha256: string; sizeBytes: number };
type Frame = ObjectRef & {
  sceneKey: string;
  fingerprint: string;
  sources: { id: string; sha256: string }[];
  seconds: number;
};
export type Manifest = { renderer: 'creative-1'; frames: Frame[]; master: ObjectRef; seconds: number };
type RevisionMeta = { version: number; approvedAt: Date | null; createdAt: Date };
type Revision = RevisionMeta & { spec: CreativeSpec; manifest: Manifest | null };
export interface CreativeRepository {
  project(userId: string, id: string): Promise<{ usage: string; contextId: string }>;
  sources(
    userId: string,
    contextId: string,
    usage: string,
    ids: string[]
  ): Promise<Map<string, { id: string; storageKey: string; storageProvider: string; sha256: string }>>;
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
    await this.repo.sources(userId, p.contextId, p.usage, sourceIds(spec));
    return this.repo.append(userId, id, expectedVersion, spec);
  }
  async restore(userId: string, id: string, version: number, expectedVersion: number) {
    const row = await this.get(userId, id, version);
    return this.save(userId, id, expectedVersion, creativeSpec.parse(row.spec));
  }
  async approve(userId: string, id: string, version: number, checksum: string) {
    const row = await this.get(userId, id, version);
    if (row.manifest?.master.sha256 !== checksum)
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
      contentType: sceneKey ? ('image/png' as const) : ('video/mp4' as const),
      openRead: async (range?: { start: number; end?: number }) => (await reader.get(ref.key, range)).stream
    };
  }
  private draw(
    spec: CreativeSpec,
    scene: CreativeSpec['scenes'][number],
    sources: Awaited<ReturnType<CreativeRepository['sources']>>
  ) {
    return creativeFrame(spec, scene, async (assetId) => {
      const a = sources.get(assetId)!;
      const b = await buffer((await this.reader({ provider: a.storageProvider }).get(a.storageKey)).stream);
      if (hash(b) !== a.sha256) throw new Error('creative_asset_integrity');
      return b;
    });
  }
  async preview(userId: string, id: string, spec: CreativeSpec) {
    const p = await this.repo.project(userId, id);
    return this.draw(spec, spec.scenes[0], await this.repo.sources(userId, p.contextId, p.usage, sourceIds(spec)));
  }
  async render(userId: string, id: string, version: number) {
    const row = await this.get(userId, id, version);
    if (row.manifest) return row.manifest;
    const spec = creativeSpec.parse(row.spec),
      p = await this.repo.project(userId, id),
      sources = await this.repo.sources(userId, p.contextId, p.usage, sourceIds(spec));
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
      for (const scene of spec.scenes) {
        const deps = scene.layers.flatMap((l) =>
          l.type === 'image' ? [{ id: l.versionId, sha256: sources.get(l.versionId)!.sha256 }] : []
        );
        const fingerprint = hash(
          JSON.stringify(['creative-1', spec.width, spec.height, spec.brand, scene.layers, deps])
        );
        const hit = cache?.find((f) => f.fingerprint === fingerprint);
        let bytes: Buffer, ref: ObjectRef;
        if (hit) {
          bytes = await buffer((await this.reader(hit).get(hit.key)).stream);
          if (hash(bytes) !== hit.sha256) throw new Error('creative_cache_integrity');
          ref = hit;
        } else {
          bytes = await this.draw(spec, scene, sources);
          ref = await persistFrame(bytes);
        }
        const file = path.join(dir, `${frames.length}.png`);
        await fs.writeFile(file, bytes);
        paths.push(file);
        frames.push({ ...ref, sceneKey: scene.key, fingerprint, sources: deps, seconds: scene.seconds });
      }
      const master = await assembleMaster({
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
        Math.abs(master.duration - master.expectedDurationSeconds) > 0.25
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
        renderer: 'creative-1',
        frames,
        master: { key, provider: this.storage.provider, sha256: master.checksum, sizeBytes },
        seconds: master.duration
      };
      // Never replace a sealed manifest, even on concurrent render requests.
      await this.repo.seal(userId, id, version, manifest);
      return (await this.get(userId, id, version)).manifest!;
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
}
