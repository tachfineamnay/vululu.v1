import {
  composeGuide, creativeSpec, isVideoOutput, outputSize, productionFormats, readableInk,
  type CreativeDirectionInput, type CreativeSpec, type OutputKind, type ProductionFormat
} from '@vululu/contracts';
import { HttpError } from '../errors';

/**
 * Directions artistiques = brouillons CreativeRevision enrichis (ADR-0035).
 * Aucune nouvelle entité métier, aucune approbation implicite, aucune publication.
 */
export type DirectionDecision = 'retained' | 'rejected';
export type DirectionMode = 'generate' | 'refine' | 'alternative' | 'combine';
export type DirectionAsset = { versionId: string; kind: string; name: string };
export type DirectionRevision = {
  version: number; label: string | null; origin: string | null; provenance: unknown;
  spec: CreativeSpec; createdAt: string; approvedAt: string | null;
};
export type DirectionBrainstorm = {
  turnId: string; resultDigest: string | null;
  angles: Array<{ title: string; reasoning: string; premise: string }>;
};
export type DirectionInputs = {
  project: { id: string; title: string; objective: string; platform: string; format: string; usage: string; contextId: string };
  brand: { name: string; colorPrimary: string; colorSecondary: string };
  brief: { cta: string | null } | null;
  assets: DirectionAsset[];
  assetDecisionDigest: string | null;
  brainstorm: DirectionBrainstorm | null;
  head: { version: number; spec: CreativeSpec } | null;
};
export type DirectionDraft = {
  spec: CreativeSpec;
  label: string;
  origin: 'generated' | 'refined' | 'alternative' | 'combined';
  provenance: Record<string, unknown>;
};

export interface CreativeDirectionRepository {
  inputs(userId: string, projectId: string, brainstormTurnId?: string): Promise<DirectionInputs>;
  revision(userId: string, projectId: string, version: number): Promise<DirectionRevision | null>;
  list(userId: string, projectId: string): Promise<DirectionRevision[]>;
  appendDirections(userId: string, projectId: string, expectedVersion: number, drafts: DirectionDraft[], requestId: string): Promise<DirectionRevision[]>;
  decisions(userId: string, projectId: string): Promise<Record<string, DirectionDecision>>;
  recordDecision(userId: string, projectId: string, version: number, decision: DirectionDecision): Promise<void>;
}

const notFound = () => new HttpError(404, 'creative_not_found', 'Projet, révision ou ressource introuvable.');
const baseRequired = () => new HttpError(422, 'direction_base_required', 'Choisissez la direction à affiner ou à décliner.');
const combineRequired = () => new HttpError(422, 'direction_combine_required', 'Choisissez deux directions à combiner.');

function deliveryFor(project: DirectionInputs['project']): NonNullable<CreativeSpec['delivery']> {
  const studio = productionFormats[project.format as ProductionFormat]?.studio ?? null;
  if (!studio) throw new HttpError(409, 'direction_format_unsupported', 'Ce format utilise le pipeline vidéo historique, sans éditeur de direction artistique.');
  return { kind: studio as OutputKind, platform: project.platform as NonNullable<CreativeSpec['delivery']>['platform'] };
}
function palette(brand: DirectionInputs['brand'], variant: 'brand' | 'contrast') {
  return variant === 'contrast'
    ? { background: brand.colorSecondary, accent: brand.colorPrimary }
    : { background: brand.colorPrimary, accent: brand.colorSecondary };
}
function textLayer(role: 'headline' | 'body' | 'cta', text: string, box: { x: number; y: number; w: number; h: number }, size: number, plate: string, ink: string) {
  return { type: 'text' as const, role, text, ...box, size, minSize: Math.min(20, size), bold: role !== 'body', color: ink, plate, opacity: 1 };
}
/** Composition typographique honnête quand aucune ressource n'est confirmée : aucun visuel inventé. */
function typographic(inputs: DirectionInputs, delivery: NonNullable<CreativeSpec['delivery']>, variant: 'brand' | 'contrast', logo?: string): CreativeSpec {
  if (delivery.kind === 'carousel') throw new HttpError(422, 'direction_assets_insufficient', 'Un carrousel nécessite au moins deux photos confirmées.');
  const [width, height] = outputSize[delivery.kind];
  const brand = palette(inputs.brand, variant);
  const ink = readableInk(brand.background), accentInk = readableInk(brand.accent);
  const title = inputs.project.title.trim().slice(0, 120) || 'Votre création';
  const offer = (inputs.project.objective.trim() || inputs.project.title.trim()).slice(0, 220);
  const cta = (inputs.brief?.cta ?? 'Découvrir').trim().slice(0, 120);
  return creativeSpec.parse({
    schemaVersion: 1, width, height, brand, safeArea: 0.05, delivery,
    scenes: [{ key: 'SCENE-001', seconds: 2, layers: [
      ...(logo ? [{ type: 'image' as const, versionId: logo, x: 0.8, y: 0.07, w: 0.13, h: 0.1, fit: 'contain' as const, gravity: 'centre' as const, opacity: 1 }] : []),
      textLayer('body', inputs.brand.name, { x: 0.07, y: 0.1, w: 0.7, h: 0.08 }, 30, brand.background, ink),
      textLayer('headline', title, { x: 0.07, y: 0.26, w: 0.86, h: 0.3 }, 64, brand.background, ink),
      textLayer('body', offer, { x: 0.07, y: 0.58, w: 0.86, h: 0.16 }, 34, brand.background, ink),
      textLayer('cta', cta, { x: 0.07, y: 0.8, w: 0.7, h: 0.1 }, 36, brand.accent, accentInk)
    ] }]
  });
}
type ComposeOptions = {
  concept: 'editorial' | 'immersive'; paletteVariant: 'brand' | 'contrast'; label: string; origin: DirectionDraft['origin'];
  provenance: Record<string, unknown>;
};
function composeDraft(inputs: DirectionInputs, options: ComposeOptions): DirectionDraft {
  const delivery = deliveryFor(inputs.project);
  const photos = inputs.assets.filter((asset) => asset.kind === 'image').map((asset) => asset.versionId);
  const logo = inputs.assets.find((asset) => asset.kind === 'logo')?.versionId;
  const clip = isVideoOutput(delivery.kind) ? inputs.assets.find((asset) => asset.kind === 'video')?.versionId : undefined;
  const brand = palette(inputs.brand, options.paletteVariant);
  let spec: CreativeSpec;
  if (!photos.length && !clip) {
    spec = typographic(inputs, delivery, options.paletteVariant, logo);
  } else if (delivery.kind === 'carousel' && photos.length < 2) {
    throw new HttpError(422, 'direction_assets_insufficient', 'Un carrousel nécessite au moins deux photos confirmées.');
  } else {
    spec = composeGuide({
      concept: options.concept, delivery, brand, name: inputs.brand.name,
      title: inputs.project.title.trim().slice(0, 120) || 'Votre création',
      offer: (inputs.project.objective.trim() || inputs.project.title.trim()).slice(0, 220),
      cta: (inputs.brief?.cta ?? 'Découvrir').trim().slice(0, 120),
      photos, logo, clip, sceneDurationSeconds: 2
    });
  }
  return { spec, label: options.label, origin: options.origin, provenance: options.provenance };
}
/** Affinage : même structure, hiérarchie et plaques de texte retravaillées, rendu inchangé côté ressources. */
function refineDraft(inputs: DirectionInputs, base: DirectionRevision, requestId: string, mode: DirectionMode): DirectionDraft {
  const spec = structuredClone(base.spec) as CreativeSpec;
  let changed = false;
  for (const scene of spec.scenes) for (const layer of scene.layers) {
    if (layer.type !== 'text') continue;
    if (layer.plate) { layer.plate = layer.plate === spec.brand.background ? spec.brand.accent : spec.brand.background; layer.color = readableInk(layer.plate); changed = true; }
    if (layer.role === 'headline' && layer.size < 240) { layer.size = Math.min(240, layer.size + 4); changed = true; }
  }
  if (!changed) throw new HttpError(409, 'direction_unchanged', 'Aucun ajustement sûr disponible sur cette direction.');
  return {
    spec: creativeSpec.parse(spec),
    label: 'Affinage · ' + (base.label ?? 'v' + base.version),
    origin: 'refined',
    provenance: { schemaVersion: 1, requestId, mode, baseVersion: base.version, generatedAt: new Date().toISOString(), assetDecisionDigest: inputs.assetDecisionDigest }
  };
}
/** Combinaison : structure de la première direction, palette de la seconde, textes recolorés de façon lisible. */
function combineDraft(inputs: DirectionInputs, a: DirectionRevision, b: DirectionRevision, requestId: string): DirectionDraft {
  const spec = structuredClone(a.spec) as CreativeSpec;
  const remap = new Map([[a.spec.brand.background, b.spec.brand.background], [a.spec.brand.accent, b.spec.brand.accent]]);
  spec.brand = { background: b.spec.brand.background, accent: b.spec.brand.accent };
  for (const scene of spec.scenes) {
    if (scene.background && remap.get(scene.background)) scene.background = remap.get(scene.background)!;
    for (const layer of scene.layers) {
      if (layer.type !== 'text' || !layer.plate) continue;
      layer.plate = remap.get(layer.plate) ?? layer.plate;
      layer.color = readableInk(layer.plate);
    }
  }
  return {
    spec: creativeSpec.parse(spec),
    label: 'Combinaison v' + a.version + ' + v' + b.version,
    origin: 'combined',
    provenance: { schemaVersion: 1, requestId, mode: 'combine', combineFrom: [a.version, b.version], generatedAt: new Date().toISOString(), assetDecisionDigest: inputs.assetDecisionDigest }
  };
}
function uniqueLabels(drafts: DirectionDraft[]): DirectionDraft[] {
  const seen = new Set<string>();
  return drafts.map((draft, index) => {
    let label = draft.label.trim() || 'Direction ' + (index + 1);
    if (seen.has(label)) label += ' · variante ' + (index + 1);
    seen.add(label);
    return { ...draft, label };
  });
}

export class CreativeDirections {
  constructor(private readonly repository: CreativeDirectionRepository) {}

  async list(userId: string, projectId: string) {
    return { directions: await this.repository.list(userId, projectId), decisions: await this.repository.decisions(userId, projectId) };
  }

  /** Convertit le brainstorming (pistes) et les ressources confirmées en directions versionnées. */
  async create(userId: string, projectId: string, input: CreativeDirectionInput) {
    const inputs = await this.repository.inputs(userId, projectId, input.brainstormTurnId);
    const angles = inputs.brainstorm?.angles ?? [];
    const angle = (index: number) => angles[index] ?? null;
    const angleLabel = (index: number, fallback: string) => angle(index)?.title ?? fallback;
    const provenance = (extra: Record<string, unknown>) => ({
      schemaVersion: 1, requestId: input.requestId, mode: input.mode,
      brainstormTurnId: inputs.brainstorm?.turnId ?? null,
      brainstormDigest: inputs.brainstorm?.resultDigest ?? null,
      assetDecisionDigest: inputs.assetDecisionDigest,
      generatedAt: new Date().toISOString(), ...extra
    });
    let drafts: DirectionDraft[];
    if (input.mode === 'generate') {
      const count = Math.min(3, Math.max(2, angles.length || 2));
      const presets = [
        { concept: 'editorial' as const, paletteVariant: 'brand' as const, label: angleLabel(0, 'Éditorial') },
        { concept: 'immersive' as const, paletteVariant: 'brand' as const, label: angleLabel(1, 'Immersif') },
        { concept: 'editorial' as const, paletteVariant: 'contrast' as const, label: angleLabel(2, 'Contraste') }
      ];
      drafts = presets.slice(0, count).map((preset, index) => composeDraft(inputs, {
        ...preset, origin: 'generated',
        provenance: provenance({ concept: preset.concept, palette: preset.paletteVariant, angleIndex: angle(index) ? index : null })
      }));
    } else if (input.mode === 'alternative') {
      const baseVersion = input.baseVersion ?? inputs.head?.version ?? 0;
      if (!baseVersion) throw baseRequired();
      const count = 2;
      const presets = [
        { concept: 'editorial' as const, paletteVariant: 'contrast' as const, label: 'Variante · ' + angleLabel(0, 'Contraste') },
        { concept: 'immersive' as const, paletteVariant: 'contrast' as const, label: 'Variante · ' + angleLabel(1, 'Immersif') }
      ];
      drafts = presets.slice(0, count).map((preset, index) => composeDraft(inputs, {
        ...preset, origin: 'alternative',
        provenance: provenance({ concept: preset.concept, palette: preset.paletteVariant, baseVersion, angleIndex: angle(index) ? index : null })
      }));
    } else if (input.mode === 'refine') {
      const version = input.baseVersion ?? inputs.head?.version ?? 0;
      if (!version) throw baseRequired();
      const base = await this.repository.revision(userId, projectId, version);
      if (!base) throw notFound();
      drafts = [refineDraft(inputs, base, input.requestId, input.mode)];
    } else {
      const versions = input.combineFrom ?? [];
      if (versions.length < 2) throw combineRequired();
      const a = await this.repository.revision(userId, projectId, versions[0]);
      const b = await this.repository.revision(userId, projectId, versions[1]);
      if (!a || !b) throw notFound();
      drafts = [combineDraft(inputs, a, b, input.requestId)];
    }
    const created = await this.repository.appendDirections(userId, projectId, inputs.head?.version ?? 0, uniqueLabels(drafts), input.requestId);
    return { ...(await this.list(userId, projectId)), created: created.map((direction) => direction.version) };
  }

  async decide(userId: string, projectId: string, version: number, decision: DirectionDecision) {
    const revision = await this.repository.revision(userId, projectId, version);
    if (!revision) throw notFound();
    await this.repository.recordDecision(userId, projectId, version, decision);
    return { decisions: await this.repository.decisions(userId, projectId) };
  }
}
