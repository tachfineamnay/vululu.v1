import { AppendResult, appendVersion, nextVersion } from './versions';
import { contentChecksum } from './checksum';
import { assertEntityId, EntityId, requireNonEmpty } from './identifiers';
import { deepFreeze } from './immutability';
import { assertIsoTimestamp, IsoTimestamp } from './timestamp';

export interface ContextSnapshot {
  readonly name: string;
  readonly website: string | null;
  readonly description: string;
  readonly audience: string | null;
  readonly tone: string | null;
  readonly colorPrimary: string;
  readonly colorSecondary: string;
}

export interface BrandContext extends ContextSnapshot {
  readonly id: EntityId;
  readonly userId: EntityId;
}

/** Révision immuable d'un contexte : snapshot complet + checksum du snapshot. */
export interface ContextRevision {
  readonly id: EntityId;
  readonly contextId: EntityId;
  readonly version: number;
  readonly checksum: string;
  readonly snapshot: ContextSnapshot;
  readonly createdAt: IsoTimestamp;
}

export function createBrandContext(input: {
  readonly id: EntityId;
  readonly userId: EntityId;
  readonly name: string;
  readonly description: string;
  readonly website?: string | null;
  readonly audience?: string | null;
  readonly tone?: string | null;
  readonly colorPrimary?: string;
  readonly colorSecondary?: string;
}): BrandContext {
  return deepFreeze({
    id: assertEntityId(input.id),
    userId: assertEntityId(input.userId, 'userId'),
    name: requireNonEmpty(input.name, 'name'),
    website: input.website ?? null,
    description: requireNonEmpty(input.description, 'description'),
    audience: input.audience ?? null,
    tone: input.tone ?? null,
    colorPrimary: requireNonEmpty(input.colorPrimary ?? '#6C5CE7', 'colorPrimary'),
    colorSecondary: requireNonEmpty(input.colorSecondary ?? '#00D2FF', 'colorSecondary')
  });
}

/** Extrait le snapshot canonique du contexte (les champs techniques id/userId sont exclus). */
export function snapshotContext(context: BrandContext): ContextSnapshot {
  return deepFreeze({
    name: context.name,
    website: context.website,
    description: context.description,
    audience: context.audience,
    tone: context.tone,
    colorPrimary: context.colorPrimary,
    colorSecondary: context.colorSecondary
  });
}

export function contextChecksum(context: BrandContext | ContextSnapshot): string {
  const snapshot =
    'userId' in context ? snapshotContext(context as BrandContext) : deepFreeze({ ...context });
  return contentChecksum(snapshot);
}

/**
 * Crée la révision suivante du contexte. Le snapshot est figé et scellé par
 * checksum ; les révisions précédentes ne sont jamais modifiées.
 */
export function createContextRevision(input: {
  readonly id: EntityId;
  readonly context: BrandContext;
  readonly revisions: readonly ContextRevision[];
  readonly createdAt: IsoTimestamp;
}): AppendResult<ContextRevision> {
  const snapshot = snapshotContext(input.context);
  const revision: ContextRevision = {
    id: assertEntityId(input.id),
    contextId: input.context.id,
    version: nextVersion(input.revisions),
    checksum: contentChecksum(snapshot),
    snapshot,
    createdAt: assertIsoTimestamp(input.createdAt, 'createdAt')
  };
  return appendVersion(input.revisions, revision);
}

export function latestContextRevision(
  revisions: readonly ContextRevision[]
): ContextRevision | null {
  if (revisions.length === 0) {
    return null;
  }
  return revisions.reduce((latest, revision) =>
    revision.version > latest.version ? revision : latest
  );
}
