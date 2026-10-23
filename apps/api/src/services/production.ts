import { prisma } from '@vululu/db';
import { assembleMaster, renderScene, runQa } from '@vululu/media';
import type { Prisma } from '@prisma/client';
import { env } from '../env';
import { HttpError } from '../errors';
import { assertProject } from './projects';

async function latestScenes(projectId: string) {
  return prisma.scene.findMany({
    where: { projectId },
    orderBy: { position: 'asc' },
    include: {
      versions: { orderBy: { version: 'desc' }, take: 1 }
    }
  });
}

async function latestMaster(projectId: string) {
  const artifact = await prisma.artifact.findUnique({
    where: { projectId_kind: { projectId, kind: 'master' } },
    include: {
      versions: {
        orderBy: { version: 'desc' },
        take: 1,
        include: { approval: { include: { transfer: true } } }
      }
    }
  });
  if (!artifact || artifact.versions.length === 0) {
    return null;
  }
  return artifact.versions[0];
}

async function nextMasterVersion(projectId: string): Promise<number> {
  const artifact = await prisma.artifact.findUnique({
    where: { projectId_kind: { projectId, kind: 'master' } },
    include: { versions: { orderBy: { version: 'desc' }, take: 1 } }
  });
  if (!artifact || artifact.versions.length === 0) {
    return 1;
  }
  return artifact.versions[0].version + 1;
}

async function invalidateProjectApprovals(projectId: string): Promise<void> {
  const versions = await prisma.artifactVersion.findMany({
    where: { artifact: { projectId } },
    select: { id: true }
  });
  if (versions.length === 0) {
    return;
  }
  await prisma.approval.updateMany({
    where: {
      artifactVersionId: { in: versions.map((version) => version.id) },
      invalidatedAt: null
    },
    data: { invalidatedAt: new Date() }
  });
}

async function assertNoRunningJob(projectId: string) {
  const running = await prisma.productionJob.findFirst({
    where: { projectId, status: { in: ['queued', 'running'] } }
  });
  if (running) {
    throw new HttpError(409, 'job_running', 'Une production est deja en cours.');
  }
}

export async function startProduction(userId: string, projectId: string) {
  await assertProject(userId, projectId);
  await assertNoRunningJob(projectId);
  const scenes = await prisma.scene.count({ where: { projectId } });
  const brief = await prisma.brief.findUnique({ where: { projectId } });
  if (scenes !== 5) {
    throw new HttpError(400, 'storyboard_required', 'Le storyboard de cinq scenes est requis.');
  }
  if (!brief) {
    throw new HttpError(400, 'brief_required', 'Le brief est requis.');
  }

  const job = await prisma.productionJob.create({
    data: { projectId, type: 'produce', status: 'queued', step: 'queued', progress: 0 }
  });
  await prisma.project.update({ where: { id: projectId }, data: { status: 'producing' } });
  void runProduction(projectId, job.id);
  return job;
}

async function runProduction(projectId: string, jobId: string): Promise<void> {
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        context: true,
        brief: true,
        scenes: {
          orderBy: { position: 'asc' },
          include: { versions: { orderBy: { version: 'desc' }, take: 1 } }
        }
      }
    });
    if (!project || !project.context || !project.brief) {
      throw new Error('Projet, contexte ou brief absent.');
    }

    await prisma.productionJob.update({
      where: { id: jobId },
      data: { status: 'running', step: 'preparation', progress: 5 }
    });

    const rendered: Array<{ versionId: string; output: Awaited<ReturnType<typeof renderScene>> }> = [];

    for (let index = 0; index < project.scenes.length; index += 1) {
      const scene = project.scenes[index];
      const version = (scene.versions.length > 0 ? scene.versions[0].version : 0) + 1;
      const output = await renderScene({
        projectId,
        artifactRoot: env.artifactRoot,
        sceneKey: scene.sceneKey,
        position: scene.position,
        title: scene.title,
        description: scene.description,
        brandName: project.context.name,
        colorPrimary: project.context.colorPrimary,
        colorSecondary: project.context.colorSecondary,
        version
      });
      const sceneVersion = await prisma.sceneVersion.create({
        data: {
          sceneId: scene.id,
          version,
          imagePath: output.relativePath,
          prompt: scene.sceneKey + ' - ' + scene.title,
          checksum: output.checksum
        }
      });
      rendered.push({ versionId: sceneVersion.id, output });
      const progress = 10 + Math.round(((index + 1) / project.scenes.length) * 60);
      await prisma.productionJob.update({
        where: { id: jobId },
        data: { step: 'scene:' + scene.sceneKey, progress }
      });
    }

    const masterVersion = await nextMasterVersion(projectId);
    const master = await assembleMaster({
      projectId,
      artifactRoot: env.artifactRoot,
      version: masterVersion,
      scenePaths: rendered.map((item) => item.output.absolutePath),
      sceneDurationsSeconds: project.scenes.map((scene) => scene.durationSeconds)
    });

    await prisma.productionJob.update({
      where: { id: jobId },
      data: { step: 'qa', progress: 85 }
    });

    const artifact = await prisma.artifact.upsert({
      where: { projectId_kind: { projectId, kind: 'master' } },
      update: {},
      create: { projectId, kind: 'master' }
    });
    const artifactVersion = await prisma.artifactVersion.create({
      data: {
        artifactId: artifact.id,
        version: masterVersion,
        masterPath: master.relativePath,
        checksum: master.checksum,
        qaStatus: 'PENDING'
      }
    });
    await invalidateProjectApprovals(projectId);
    const qa = await runQa(rendered.map((item) => item.output), master);
    await prisma.artifactVersion.update({
      where: { id: artifactVersion.id },
      data: {
        qaStatus: qa.status,
        qaReport: qa as unknown as Prisma.InputJsonValue
      }
    });
    await prisma.productionJob.update({
      where: { id: jobId },
      data: { status: 'succeeded', step: 'done', progress: 100 }
    });
    await prisma.project.update({ where: { id: projectId }, data: { status: 'review' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur de production inconnue.';
    await prisma.productionJob.update({
      where: { id: jobId },
      data: { status: 'failed', step: 'failed', error: message }
    });
    await prisma.project.update({ where: { id: projectId }, data: { status: 'failed' } });
  }
}

export async function startCorrection(userId: string, projectId: string, sceneKey: string, instruction: string) {
  await assertProject(userId, projectId);
  await assertNoRunningJob(projectId);
  const scene = await prisma.scene.findUnique({
    where: { projectId_sceneKey: { projectId, sceneKey } }
  });
  if (!scene) {
    throw new HttpError(404, 'scene_not_found', 'Scene introuvable: ' + sceneKey);
  }
  const master = await latestMaster(projectId);
  if (!master) {
    throw new HttpError(400, 'master_required', 'Un master doit exister avant correction.');
  }
  const job = await prisma.productionJob.create({
    data: { projectId, type: 'correction', status: 'queued', step: 'queued', progress: 0 }
  });
  await prisma.project.update({ where: { id: projectId }, data: { status: 'producing' } });
  void runCorrection(projectId, job.id, sceneKey, instruction);
  return job;
}

async function runCorrection(projectId: string, jobId: string, sceneKey: string, instruction: string): Promise<void> {
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        context: true,
        brief: true,
        scenes: {
          orderBy: { position: 'asc' },
          include: { versions: { orderBy: { version: 'desc' }, take: 1 } }
        }
      }
    });
    if (!project || !project.context) {
      throw new Error('Projet ou contexte absent.');
    }
    const target = project.scenes.find((scene) => scene.sceneKey === sceneKey);
    if (!target) {
      throw new Error('Scene cible absente.');
    }
    if (target.versions.length === 0) {
      throw new Error('Aucune version existante pour la scene cible.');
    }

    await prisma.productionJob.update({
      where: { id: jobId },
      data: { status: 'running', step: 'correction:' + sceneKey, progress: 10 }
    });

    const version = target.versions[0].version + 1;
    const output = await renderScene({
      projectId,
      artifactRoot: env.artifactRoot,
      sceneKey: target.sceneKey,
      position: target.position,
      title: target.title,
      description: target.description,
      brandName: project.context.name,
      colorPrimary: project.context.colorPrimary,
      colorSecondary: project.context.colorSecondary,
      version,
      instruction
    });
    await prisma.sceneVersion.create({
      data: {
        sceneId: target.id,
        version,
        imagePath: output.relativePath,
        prompt: 'Correction: ' + instruction,
        checksum: output.checksum
      }
    });

    await prisma.productionJob.update({
      where: { id: jobId },
      data: { step: 'master', progress: 60 }
    });

    const refreshed = await latestScenes(projectId);
    if (refreshed.some((scene) => scene.versions.length === 0)) {
      throw new Error('Une scene ne possede pas de version.');
    }

    const masterVersion = await nextMasterVersion(projectId);
    const master = await assembleMaster({
      projectId,
      artifactRoot: env.artifactRoot,
      version: masterVersion,
      scenePaths: refreshed.map((scene) => env.artifactRoot + '/' + scene.versions[0].imagePath),
      sceneDurationsSeconds: refreshed.map((scene) => scene.durationSeconds)
    });

    await prisma.productionJob.update({
      where: { id: jobId },
      data: { step: 'qa', progress: 85 }
    });

    const artifact = await prisma.artifact.upsert({
      where: { projectId_kind: { projectId, kind: 'master' } },
      update: {},
      create: { projectId, kind: 'master' }
    });
    const artifactVersion = await prisma.artifactVersion.create({
      data: {
        artifactId: artifact.id,
        version: masterVersion,
        masterPath: master.relativePath,
        checksum: master.checksum,
        qaStatus: 'PENDING'
      }
    });
    await invalidateProjectApprovals(projectId);
    const sceneFiles = refreshed.map((scene) => ({
      relativePath: scene.versions[0].imagePath,
      absolutePath: env.artifactRoot + '/' + scene.versions[0].imagePath,
      checksum: scene.versions[0].checksum,
      width: 1080,
      height: 1920
    }));
    const qa = await runQa(sceneFiles, master);
    await prisma.artifactVersion.update({
      where: { id: artifactVersion.id },
      data: {
        qaStatus: qa.status,
        qaReport: qa as unknown as Prisma.InputJsonValue
      }
    });
    await prisma.productionJob.update({
      where: { id: jobId },
      data: { status: 'succeeded', step: 'done', progress: 100 }
    });
    await prisma.project.update({ where: { id: projectId }, data: { status: 'review' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur de correction inconnue.';
    await prisma.productionJob.update({
      where: { id: jobId },
      data: { status: 'failed', step: 'failed', error: message }
    });
    await prisma.project.update({ where: { id: projectId }, data: { status: 'failed' } });
  }
}

export async function approveMaster(userId: string, projectId: string, artifactVersionId: string, checksum: string) {
  await assertProject(userId, projectId);
  const master = await latestMaster(projectId);
  if (!master) {
    throw new HttpError(400, 'master_required', 'Aucun master a approuver.');
  }
  if (master.id !== artifactVersionId) {
    throw new HttpError(409, 'master_stale', 'Cette version n est plus le master courant.');
  }
  if (master.checksum !== checksum) {
    throw new HttpError(400, 'checksum_mismatch', 'Le checksum ne correspond pas au master.');
  }
  const approval = await prisma.approval.upsert({
    where: { artifactVersionId: master.id },
    update: { approvedBy: userId, checksum, invalidatedAt: null },
    create: { artifactVersionId: master.id, approvedBy: userId, checksum }
  });
  await prisma.project.update({ where: { id: projectId }, data: { status: 'approved' } });
  return approval;
}

export async function transferToPostiz(userId: string, projectId: string) {
  await assertProject(userId, projectId);
  const master = await latestMaster(projectId);
  if (!master) {
    throw new HttpError(400, 'master_required', 'Aucun master a transferer.');
  }
  if (!master.approval) {
    throw new HttpError(400, 'approval_required', 'Le master doit etre approuve avant transfert.');
  }
  if (master.approval.invalidatedAt) {
    throw new HttpError(409, 'approval_invalidated', 'Cette approbation a ete invalidee par un nouveau master.');
  }
  if (master.approval.transfer) {
    return master.approval.transfer;
  }
  const transfer = await prisma.transfer.create({
    data: {
      approvalId: master.approval.id,
      status: 'submitted',
      provider: 'postiz-mock',
      externalId: 'postiz-mock-' + Date.now().toString()
    }
  });
  await prisma.project.update({ where: { id: projectId }, data: { status: 'transferred' } });
  setTimeout(async () => {
    try {
      await prisma.transfer.update({ where: { id: transfer.id }, data: { status: 'acknowledged' } });
    } catch {
      // The mock transfer is best-effort only.
    }
  }, 400);
  return transfer;
}

export async function getQa(userId: string, projectId: string) {
  await assertProject(userId, projectId);
  const master = await latestMaster(projectId);
  if (!master) {
    return { status: 'NOT_RUN', report: null, version: null };
  }
  return { status: master.qaStatus, report: master.qaReport, version: master.version };
}
