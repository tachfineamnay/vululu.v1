import {
  createBrief,
  reviseBrief,
  snapshotBriefContent,
  type BriefRevision as DomainBriefRevision
} from '@vululu/domain';
import { ApplicationError } from '../errors';
import type {
  Actor,
  AuditPort,
  BriefContentRecord,
  BriefInput,
  BriefStore,
  BriefWithRevisions,
  Clock,
  IdGenerator,
  ProjectRepository
} from '../ports';

function toDomainRevision(revision: BriefWithRevisions['revisions'][number]): DomainBriefRevision {
  return {
    id: revision.id,
    briefId: revision.briefId,
    version: revision.version,
    objective: revision.objective,
    audience: revision.audience,
    tone: revision.tone,
    cta: revision.cta,
    platform: revision.platform as DomainBriefRevision['platform'],
    format: revision.format as DomainBriefRevision['format'],
    checksum: revision.checksum,
    createdAt: revision.createdAt.toISOString()
  };
}

/**
 * Use case brief : validation Domain, calcul de checksum, revision append-only.
 * La persistance atomique est garantie par BriefStore.saveRevision.
 */
export class BriefUseCases {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly briefs: BriefStore,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly audit: AuditPort
  ) {}

  async update(actor: Actor, projectId: string, input: BriefInput): Promise<BriefWithRevisions> {
    const project = await this.projects.findOwned(projectId, actor.id);
    if (!project) {
      throw new ApplicationError('project_not_found', 'Projet introuvable.', 404);
    }
    if (project.status === 'producing') {
      throw new ApplicationError('project_busy', 'Le brief ne peut pas etre modifie pendant une production.', 409);
    }
    const content = snapshotBriefContent(input) as BriefContentRecord;
    const existing = await this.briefs.findWithRevisions(projectId);
    const createdAt = this.clock.now().toISOString();
    let briefId: string;
    let revisionId: string;
    let version: number;
    let checksum: string;
    if (existing) {
      const revised = reviseBrief({
        brief: { id: existing.id, projectId, currentVersion: existing.version },
        revisions: existing.revisions.map(toDomainRevision),
        revisionId: this.ids.next(),
        content,
        createdAt
      });
      briefId = existing.id;
      revisionId = revised.revision.id;
      version = revised.revision.version;
      checksum = revised.revision.checksum;
    } else {
      const created = createBrief({
        id: this.ids.next(),
        projectId,
        revisionId: this.ids.next(),
        content,
        createdAt
      });
      briefId = created.brief.id;
      revisionId = created.revision.id;
      version = created.revision.version;
      checksum = created.revision.checksum;
    }
    const result = await this.briefs.saveRevision({
      userId: actor.id,
      projectId,
      briefId,
      revisionId,
      version,
      content,
      checksum,
      createdAt: new Date(createdAt),
      projectStatus: 'brief_ready'
    });
    await this.audit.record({
      actorId: actor.id,
      action: 'brief.updated',
      targetType: 'project',
      targetId: projectId,
      metadata: { version, checksum }
    });
    return result;
  }
}
