import { DomainError } from './errors';
import { assertEntityId, EntityId, requireNonEmpty } from './identifiers';
import { deepFreeze } from './immutability';
import { assertIsoTimestamp, IsoTimestamp } from './timestamp';

export type Platform = 'TikTok' | 'Instagram' | 'LinkedIn';
export type ProjectFormat = 'Affiche' | 'Carrousel' | 'Video' | 'Reel' | 'Motion';

export type ProjectStatus =
  | 'draft'
  | 'brief_ready'
  | 'storyboard_ready'
  | 'producing'
  | 'review'
  | 'approved'
  | 'transferred'
  | 'failed';

export const PROJECT_STATUSES: readonly ProjectStatus[] = [
  'draft',
  'brief_ready',
  'storyboard_ready',
  'producing',
  'review',
  'approved',
  'transferred',
  'failed'
];

export interface Project {
  readonly id: EntityId;
  readonly userId: EntityId;
  readonly contextId: EntityId;
  readonly title: string;
  readonly platform: Platform;
  readonly format: ProjectFormat;
  readonly objective: string;
  readonly sceneDurationSeconds: number;
  readonly status: ProjectStatus;
  readonly createdAt: IsoTimestamp;
  readonly updatedAt: IsoTimestamp;
}

export function assertPlatform(value: string): Platform {
  if (value !== 'TikTok' && value !== 'Instagram' && value !== 'LinkedIn') {
    throw new DomainError('invalid_input', 'Unknown platform.', { platform: value });
  }
  return value;
}

export function assertProjectFormat(value: string): ProjectFormat {
  if (
    value !== 'Affiche' &&
    value !== 'Carrousel' &&
    value !== 'Video' &&
    value !== 'Reel' &&
    value !== 'Motion'
  ) {
    throw new DomainError('invalid_input', 'Unknown project format.', { format: value });
  }
  return value;
}

export function assertProjectStatus(value: string): ProjectStatus {
  if (!PROJECT_STATUSES.includes(value as ProjectStatus)) {
    throw new DomainError('invalid_input', 'Unknown project status.', { status: value });
  }
  return value as ProjectStatus;
}

export function assertSceneDurationSeconds(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 15) {
    throw new DomainError('invalid_input', 'Scene duration must be an integer between 1 and 15 seconds.', {
      durationSeconds: value
    });
  }
  return value;
}

export function createProject(input: {
  readonly id: EntityId;
  readonly userId: EntityId;
  readonly contextId: EntityId;
  readonly title: string;
  readonly platform: Platform;
  readonly format: ProjectFormat;
  readonly objective: string;
  readonly sceneDurationSeconds: number;
  readonly createdAt: IsoTimestamp;
}): Project {
  const createdAt = assertIsoTimestamp(input.createdAt, 'createdAt');
  return deepFreeze({
    id: assertEntityId(input.id),
    userId: assertEntityId(input.userId, 'userId'),
    contextId: assertEntityId(input.contextId, 'contextId'),
    title: requireNonEmpty(input.title, 'title'),
    platform: assertPlatform(input.platform),
    format: assertProjectFormat(input.format),
    objective: requireNonEmpty(input.objective, 'objective'),
    sceneDurationSeconds: assertSceneDurationSeconds(input.sceneDurationSeconds),
    status: 'draft',
    createdAt,
    updatedAt: createdAt
  });
}

/** Change uniquement l'état du projet ; l'identité et le contexte restent stables. */
export function withProjectStatus(
  project: Project,
  status: ProjectStatus,
  updatedAt: IsoTimestamp
): Project {
  return deepFreeze({
    ...project,
    status: assertProjectStatus(status),
    updatedAt: assertIsoTimestamp(updatedAt, 'updatedAt')
  });
}
