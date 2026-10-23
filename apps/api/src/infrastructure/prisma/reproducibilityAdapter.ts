import { prisma } from '@vululu/db';
import type { ReproducibilityPort, ReproducibilitySnapshot } from '@vululu/application';

/**
 * Capture les references immuables necessaires a un run reproductible.
 * Aucune ecriture ici : la transaction de creation du JobRun est dans
 * PrismaJobRunRepository.createWithSteps.
 */
export class PrismaReproducibilityAdapter implements ReproducibilityPort {
  async capture(projectId: string, _userId: string): Promise<ReproducibilitySnapshot> {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        context: { include: { revisions: { orderBy: { version: 'desc' }, take: 1 } } },
        brief: { include: { revisions: { orderBy: { version: 'desc' }, take: 1 } } },
        scenes: {
          orderBy: { position: 'asc' },
          include: { versions: { orderBy: { version: 'desc' }, take: 1 } }
        },
        characters: {
          include: { versions: { orderBy: { version: 'desc' }, take: 1 } }
        }
      }
    });
    if (!project || !project.context) {
      throw new Error('project_or_context_not_found');
    }
    const contextRevision = project.context.revisions[0] ?? null;
    const briefRevision = project.brief?.revisions[0] ?? null;
    const contextData = {
      name: project.context.name,
      website: project.context.website,
      description: project.context.description,
      audience: project.context.audience,
      tone: project.context.tone,
      colorPrimary: project.context.colorPrimary,
      colorSecondary: project.context.colorSecondary
    };
    const briefData = project.brief
      ? {
          objective: project.brief.objective,
          audience: project.brief.audience,
          tone: project.brief.tone,
          cta: project.brief.cta,
          platform: project.brief.platform,
          format: project.brief.format
        }
      : {};
    return {
      schemaVersion: 1,
      capturedAt: new Date().toISOString(),
      project: {
        id: project.id,
        platform: project.platform,
        format: project.format,
        sceneDurationSeconds: project.sceneDurationSeconds,
        status: project.status
      },
      context: {
        revisionId: contextRevision?.id ?? null,
        checksum: contextRevision?.checksum ?? null,
        data: contextData
      },
      brief: {
        revisionId: briefRevision?.id ?? null,
        version: briefRevision?.version ?? project.brief?.version ?? null,
        checksum: briefRevision?.checksum ?? null,
        data: briefData
      },
      scenes: project.scenes.map((scene) => {
        const version = scene.versions[0] ?? null;
        return {
          sceneId: scene.id,
          sceneKey: scene.sceneKey,
          position: scene.position,
          durationSeconds: scene.durationSeconds,
          version: version?.version ?? 0,
          checksum: version?.checksum ?? ''
        };
      }),
      characters: project.characters.map((character) => {
        const version = character.versions[0] ?? null;
        return {
          characterId: character.id,
          characterKey: character.characterKey,
          version: version?.version ?? null,
          checksum: version?.checksum ?? null,
          name: character.name,
          description: character.description
        };
      }),
      providerPolicy: {
        provider: 'local-deterministic',
        model: 'scene-svg-v1',
        deterministic: true
      },
      render: {
        width: 1080,
        height: 1920,
        fps: 30,
        imageFormat: 'png',
        videoCodec: 'h264',
        audioCodec: 'aac',
        audioSilent: true
      }
    };
  }
}
