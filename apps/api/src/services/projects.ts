import { prisma } from '@vululu/db';
import type { z } from 'zod';
import { briefInputSchema, projectInputSchema } from '@vululu/contracts';
import { HttpError } from '../errors';

type ProjectInput = z.infer<typeof projectInputSchema>;
type BriefInput = z.infer<typeof briefInputSchema>;

export async function assertProject(userId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId }
  });
  if (!project) {
    throw new HttpError(404, 'project_not_found', 'Projet introuvable.');
  }
  return project;
}

export async function listProjects(userId: string) {
  return prisma.project.findMany({
    where: { userId },
    include: { context: true },
    orderBy: { updatedAt: 'desc' }
  });
}

export async function createProject(userId: string, input: ProjectInput) {
  const context = await prisma.brandContext.findFirst({
    where: { id: input.contextId, userId }
  });
  if (!context) {
    throw new HttpError(404, 'context_not_found', 'Contexte introuvable.');
  }
  return prisma.project.create({
    data: {
      userId,
      contextId: input.contextId,
      title: input.title,
      platform: input.platform,
      format: input.format,
      objective: input.objective
    }
  });
}

export async function updateBrief(userId: string, projectId: string, input: BriefInput) {
  await assertProject(userId, projectId);
  const existing = await prisma.brief.findUnique({ where: { projectId } });
  const data = {
    objective: input.objective,
    audience: input.audience,
    tone: input.tone,
    cta: input.cta,
    platform: input.platform,
    format: input.format
  };
  const brief = existing
    ? await prisma.brief.update({
        where: { projectId },
        data: { ...data, version: existing.version + 1 }
      })
    : await prisma.brief.create({
        data: { projectId, ...data, version: 1 }
      });
  await prisma.project.update({ where: { id: projectId }, data: { status: 'brief_ready' } });
  return brief;
}

export async function getProjectBundle(userId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    include: {
      context: true,
      brief: true,
      messages: { orderBy: { createdAt: 'asc' } },
      scenes: {
        orderBy: { position: 'asc' },
        include: {
          versions: { orderBy: { version: 'desc' } }
        }
      },
      characters: true,
      artifacts: {
        include: {
          versions: {
            orderBy: { version: 'desc' },
            include: {
              approval: { include: { transfer: true } }
            }
          }
        }
      },
      jobs: { orderBy: { createdAt: 'desc' }, take: 1 }
    }
  });

  if (!project) {
    throw new HttpError(404, 'project_not_found', 'Projet introuvable.');
  }

  const masterArtifact = project.artifacts.find((artifact) => artifact.kind === 'master') || null;
  const masterVersions = masterArtifact ? masterArtifact.versions : [];
  const master = masterVersions.length > 0 ? masterVersions[0] : null;

  return {
    project: {
      id: project.id,
      title: project.title,
      status: project.status,
      platform: project.platform,
      format: project.format,
      objective: project.objective,
      contextId: project.contextId,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt
    },
    context: project.context,
    brief: project.brief,
    messages: project.messages,
    scenes: project.scenes,
    characters: project.characters,
    master,
    masterVersions,
    job: project.jobs.length > 0 ? project.jobs[0] : null
  };
}

const sceneTemplates = [
  {
    sceneKey: 'SCENE-001',
    title: 'Accroche',
    description: 'Une accroche visuelle forte qui capte l attention en moins de deux secondes.'
  },
  {
    sceneKey: 'SCENE-002',
    title: 'Probleme',
    description: 'Le probleme concret du client, montre avec un detail credible.'
  },
  {
    sceneKey: 'SCENE-003',
    title: 'Revelation produit',
    description: 'Le produit ou service au centre du plan, avec la promesse principale.'
  },
  {
    sceneKey: 'SCENE-004',
    title: 'Preuve et benefices',
    description: 'Un benefice mesurable, une preuve ou un detail de confiance.'
  },
  {
    sceneKey: 'SCENE-005',
    title: 'Appel a action',
    description: 'Une invitation claire a passer a l action, adaptee au reseau.'
  }
];

export async function generateStoryboard(userId: string, projectId: string) {
  const project = await assertProject(userId, projectId);
  const brief = await prisma.brief.findUnique({ where: { projectId } });
  if (!brief) {
    throw new HttpError(400, 'brief_required', 'Le brief doit etre enregistre avant le storyboard.');
  }

  await prisma.character.upsert({
    where: { projectId_characterKey: { projectId, characterKey: 'CHAR-001' } },
    update: {
      name: 'Personnage A',
      description: 'Personnage principal recurrent du projet.'
    },
    create: {
      projectId,
      characterKey: 'CHAR-001',
      name: 'Personnage A',
      description: 'Personnage principal recurrent du projet.'
    }
  });

  for (let index = 0; index < sceneTemplates.length; index += 1) {
    const template = sceneTemplates[index];
    await prisma.scene.upsert({
      where: { projectId_sceneKey: { projectId, sceneKey: template.sceneKey } },
      update: {
        position: index + 1,
        title: template.title,
        description: template.description,
        characterKey: 'CHAR-001'
      },
      create: {
        projectId,
        sceneKey: template.sceneKey,
        position: index + 1,
        title: template.title,
        description: template.description,
        characterKey: 'CHAR-001'
      }
    });
  }

  await prisma.project.update({ where: { id: projectId }, data: { status: 'storyboard_ready' } });

  return getProjectBundle(userId, projectId);
}

function buildVululuReply(bundle: Awaited<ReturnType<typeof getProjectBundle>>): string {
  if (!bundle.brief) {
    return 'Je peux preparer le brief. Renseigne l objectif, l audience, le ton et le CTA, puis clique sur Preparer le brief.';
  }
  if (bundle.scenes.length === 0) {
    return 'Brief enregistre. Je peux generer un storyboard de cinq scenes, avec des Scene ID stables.';
  }
  if (!bundle.master) {
    return 'Storyboard pret. Lance la production des cinq scenes : je genererai les PNG, le master MP4, puis le controle qualite.';
  }
  if (bundle.master.approval && bundle.master.approval.transfer) {
    return 'Le transfert Postiz mock est confirme. Le parcours V0 est complet. Tu peux encore corriger la scene 3 et creer une nouvelle version.';
  }
  if (bundle.master.approval) {
    return 'Le master exact est approuve. Je peux maintenant lancer le transfert Postiz mock.';
  }
  return 'Le master est pret et verifie. Tu peux me demander de corriger la scene 3, ou valider cette version exacte avant transfert.';
}

export async function addMessage(userId: string, projectId: string, content: string) {
  await assertProject(userId, projectId);
  const userMessage = await prisma.message.create({
    data: { projectId, role: 'user', content }
  });
  const bundle = await getProjectBundle(userId, projectId);
  const assistantMessage = await prisma.message.create({
    data: { projectId, role: 'assistant', content: buildVululuReply(bundle) }
  });
  return { userMessage, assistantMessage };
}
