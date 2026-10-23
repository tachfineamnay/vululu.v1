import type { PrismaClient } from '@prisma/client';
import { prisma } from '@vululu/db';
import { ApplicationError } from '@vululu/application';
import type {
  BriefContentRecord,
  BriefWithRevisions,
  CharacterRecord,
  MasterVersionView,
  MessageRecord,
  ProjectBundleQueryPort,
  ProjectBundleRecord,
  SceneWithVersionsRecord
} from '@vululu/application';

/**
 * Modele de lecture du bundle projet.
 *
 * Cette couche est volontairement separee des ecritures : elle reproduit
 * exactement la forme JSON historique de GET /api/projects/:id, sans exposer
 * Prisma aux routes ni aux use cases.
 */
export class PrismaProjectBundleQuery implements ProjectBundleQueryPort {
  constructor(private readonly db: PrismaClient = prisma) {}

  async getOwnedBundle(userId: string, projectId: string): Promise<ProjectBundleRecord> {
    const project = await this.db.project.findFirst({
      where: { id: projectId, userId },
      include: {
        context: true,
        brief: { include: { revisions: { orderBy: { version: 'asc' } } } },
        messages: { orderBy: { createdAt: 'asc' } },
        scenes: {
          orderBy: { position: 'asc' },
          include: { versions: { orderBy: { version: 'desc' } } }
        },
        characters: true,
        artifacts: {
          include: {
            versions: {
              orderBy: { version: 'desc' },
              include: { approval: { include: { transfer: true } } }
            }
          }
        },
        jobs: { orderBy: { createdAt: 'desc' }, take: 1 }
      }
    });
    if (!project) {
      throw new ApplicationError('project_not_found', 'Projet introuvable.', 404);
    }

    const masterArtifact = project.artifacts.find((artifact) => artifact.kind === 'master') ?? null;
    const masterVersions: MasterVersionView[] = (masterArtifact?.versions ?? []).map((version) => ({
      id: version.id,
      artifactId: version.artifactId,
      version: version.version,
      masterPath: version.masterPath,
      checksum: version.checksum,
      qaStatus: version.qaStatus,
      qaReport: version.qaReport as unknown,
      createdAt: version.createdAt,
      approval: version.approval
        ? {
            id: version.approval.id,
            artifactVersionId: version.approval.artifactVersionId,
            approvedBy: version.approval.approvedBy,
            checksum: version.approval.checksum,
            invalidatedAt: version.approval.invalidatedAt,
            createdAt: version.approval.createdAt,
            transfer: version.approval.transfer
              ? {
                  id: version.approval.transfer.id,
                  approvalId: version.approval.transfer.approvalId,
                  status: version.approval.transfer.status,
                  provider: version.approval.transfer.provider,
                  externalId: version.approval.transfer.externalId
                }
              : null
          }
        : null
    }));

    const brief: BriefWithRevisions | null = project.brief
      ? {
          id: project.brief.id,
          projectId: project.brief.projectId,
          objective: project.brief.objective,
          audience: project.brief.audience,
          tone: project.brief.tone,
          cta: project.brief.cta,
          platform: project.brief.platform,
          format: project.brief.format,
          version: project.brief.version,
          createdAt: project.brief.createdAt,
          updatedAt: project.brief.updatedAt,
          revisions: project.brief.revisions.map((revision) => ({
            id: revision.id,
            briefId: revision.briefId,
            version: revision.version,
            objective: revision.objective,
            audience: revision.audience,
            tone: revision.tone,
            cta: revision.cta,
            platform: revision.platform as BriefContentRecord['platform'],
            format: revision.format as BriefContentRecord['format'],
            checksum: revision.checksum,
            createdAt: revision.createdAt
          }))
        }
      : null;

    const messages: MessageRecord[] = project.messages.map((message) => ({
      id: message.id,
      projectId: message.projectId,
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content,
      createdAt: message.createdAt
    }));

    const scenes: SceneWithVersionsRecord[] = project.scenes.map((scene) => ({
      id: scene.id,
      projectId: scene.projectId,
      sceneKey: scene.sceneKey,
      position: scene.position,
      title: scene.title,
      description: scene.description,
      durationSeconds: scene.durationSeconds,
      characterKey: scene.characterKey,
      createdAt: scene.createdAt,
      versions: scene.versions.map((version) => ({
        id: version.id,
        sceneId: version.sceneId,
        version: version.version,
        imagePath: version.imagePath,
        prompt: version.prompt,
        checksum: version.checksum,
        createdAt: version.createdAt
      }))
    }));

    const characters: CharacterRecord[] = project.characters.map((character) => ({
      id: character.id,
      projectId: character.projectId,
      characterKey: character.characterKey,
      name: character.name,
      description: character.description,
      createdAt: character.createdAt
    }));

    const job = project.jobs[0] ?? null;
    return {
      project: {
        id: project.id,
        title: project.title,
        status: project.status,
        platform: project.platform,
        format: project.format,
        objective: project.objective,
        sceneDurationSeconds: project.sceneDurationSeconds,
        contextId: project.contextId,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt
      },
      context: {
        id: project.context.id,
        name: project.context.name,
        website: project.context.website,
        description: project.context.description,
        audience: project.context.audience,
        tone: project.context.tone,
        colorPrimary: project.context.colorPrimary,
        colorSecondary: project.context.colorSecondary,
        createdAt: project.context.createdAt,
        updatedAt: project.context.updatedAt
      },
      brief,
      messages,
      scenes,
      characters,
      master: masterVersions[0] ?? null,
      masterVersions,
      job: job
        ? {
            id: job.id,
            projectId: job.projectId,
            type: job.type,
            status: job.status,
            step: job.step,
            progress: job.progress,
            error: job.error,
            createdAt: job.createdAt,
            updatedAt: job.updatedAt
          }
        : null
    };
  }
}