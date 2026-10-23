import { appendVersion, nextVersion } from './versions';
import { contentChecksum } from './checksum';
import { assertEntityId, EntityId, requireNonEmpty } from './identifiers';
import { deepFreeze } from './immutability';
import { assertProjectFormat, ProjectFormat, assertPlatform, Platform } from './project';
import { assertIsoTimestamp, IsoTimestamp } from './timestamp';

export interface BriefContent {
  readonly objective: string;
  readonly audience: string;
  readonly tone: string;
  readonly cta: string;
  readonly platform: Platform;
  readonly format: ProjectFormat;
}

export interface Brief {
  readonly id: EntityId;
  readonly projectId: EntityId;
  readonly currentVersion: number;
}

/** Révision immuable de brief : contenu figé + checksum du contenu. */
export interface BriefRevision extends BriefContent {
  readonly id: EntityId;
  readonly briefId: EntityId;
  readonly version: number;
  readonly checksum: string;
  readonly createdAt: IsoTimestamp;
}

export function snapshotBriefContent(content: BriefContent): BriefContent {
  return deepFreeze({
    objective: requireNonEmpty(content.objective, 'objective'),
    audience: requireNonEmpty(content.audience, 'audience'),
    tone: requireNonEmpty(content.tone, 'tone'),
    cta: requireNonEmpty(content.cta, 'cta'),
    platform: assertPlatform(content.platform),
    format: assertProjectFormat(content.format)
  });
}

export function briefChecksum(content: BriefContent): string {
  return contentChecksum(snapshotBriefContent(content));
}

/** Crée un brief et sa première révision (version 1). */
export function createBrief(input: {
  readonly id: EntityId;
  readonly projectId: EntityId;
  readonly revisionId: EntityId;
  readonly content: BriefContent;
  readonly createdAt: IsoTimestamp;
}): { readonly brief: Brief; readonly revisions: readonly BriefRevision[]; readonly revision: BriefRevision } {
  const content = snapshotBriefContent(input.content);
  const briefId = assertEntityId(input.id);
  const revision: BriefRevision = {
    id: assertEntityId(input.revisionId, 'revisionId'),
    briefId,
    version: 1,
    checksum: contentChecksum(content),
    ...content,
    createdAt: assertIsoTimestamp(input.createdAt, 'createdAt')
  };
  const appended = appendVersion([], revision);
  return deepFreeze({
    brief: { id: briefId, projectId: assertEntityId(input.projectId, 'projectId'), currentVersion: 1 },
    revisions: appended.versions,
    revision: appended.version
  });
}

/**
 * Ajoute une révision de brief. La version précédente reste intacte ; le brief
 * pointe sur la nouvelle version. Le checksum ne dépend que du contenu.
 */
export function reviseBrief(input: {
  readonly brief: Brief;
  readonly revisions: readonly BriefRevision[];
  readonly revisionId: EntityId;
  readonly content: BriefContent;
  readonly createdAt: IsoTimestamp;
}): { readonly brief: Brief; readonly revisions: readonly BriefRevision[]; readonly revision: BriefRevision } {
  const content = snapshotBriefContent(input.content);
  const revision: BriefRevision = {
    id: assertEntityId(input.revisionId, 'revisionId'),
    briefId: input.brief.id,
    version: nextVersion(input.revisions),
    checksum: contentChecksum(content),
    ...content,
    createdAt: assertIsoTimestamp(input.createdAt, 'createdAt')
  };
  const appended = appendVersion(input.revisions, revision);
  return deepFreeze({
    brief: { ...input.brief, currentVersion: revision.version },
    revisions: appended.versions,
    revision: appended.version
  });
}

export function latestBriefRevision(
  revisions: readonly BriefRevision[]
): BriefRevision | null {
  if (revisions.length === 0) {
    return null;
  }
  return revisions.reduce((latest, revision) =>
    revision.version > latest.version ? revision : latest
  );
}
