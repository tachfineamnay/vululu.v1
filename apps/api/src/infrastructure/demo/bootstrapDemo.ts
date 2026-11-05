import type { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { createBrandContext, createContextRevision, createCampaign } from '@vululu/domain';
import { toJsonInput } from '../prisma/mappers';

const identity = {
  userId: 'v1-demo-user',
  contextId: 'v1-demo-context',
  projectId: 'v1-demo-project'
};
const campaignId = 'v1-demo-campaign';

/** Bootstrap explicite, atomique et répétable ; ne remet jamais les données à zéro. */
export async function bootstrapDemo(
  db: PrismaClient,
  config: Record<string, string | undefined>
): Promise<{ userId: string; contextId: string; projectId: string }> {
  if (config.DEMO_MODE !== '1') throw new Error('demo_mode_required');
  const email = (config.DEMO_EMAIL ?? '').trim().toLowerCase();
  const password = config.DEMO_PASSWORD ?? '';
  const minimum = config.RECETTE_ALLOW_SHORT_PASSWORDS === '1' ? 1 : 12;
  if (!z.email().safeParse(email).success || password.length < minimum || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('demo_credentials_invalid');
  }

  return db.$transaction(async (tx) => {
    const existing = await tx.user.findFirst({ where: { OR: [{ id: identity.userId }, { email }] } });
    if (existing) {
      const marker = await tx.auditEvent.findFirst({ where: {
        actorId: existing.id, targetId: existing.id, action: 'demo.bootstrap.created'
      } });
      if (existing.id !== identity.userId || existing.email !== email || existing.role !== 'user' || !marker) {
        throw new Error('demo_account_collision');
      }
    } else {
      await tx.user.create({ data: {
        id: identity.userId, email, passwordHash: await bcrypt.hash(password, 10),
        name: 'Exploration demo', role: 'user'
      } });
      await tx.auditEvent.create({ data: {
        actorId: identity.userId, action: 'demo.bootstrap.created',
        targetType: 'user', targetId: identity.userId, metadata: { mode: 'MOCK', seedVersion: 2 }
      } });
    }

    const existingContext = await tx.brandContext.findUnique({ where: { id: identity.contextId } });
    if (existingContext && existingContext.userId !== identity.userId) throw new Error('demo_resource_collision');
    if (!existingContext) {
      const context = createBrandContext({
        id: identity.contextId, userId: identity.userId, name: 'Atelier Aurore — marque fictive',
        description: 'Exemple fictif de studio de céramique. Ces informations servent uniquement à la démonstration.',
        audience: 'Amateurs de créations artisanales', tone: 'Chaleureux et précis'
      });
      const revision = createContextRevision({
        id: 'v1-demo-context-revision-1', context, revisions: [], createdAt: new Date().toISOString()
      }).version;
      await tx.brandContext.create({ data: {
        ...context,
        revisions: { create: { id: revision.id, version: revision.version, checksum: revision.checksum, data: toJsonInput(revision.snapshot) } }
      } });
    }

    const existingCampaign = await tx.campaign.findUnique({ where: { id: campaignId } });
    if (existingCampaign && existingCampaign.userId !== identity.userId) throw new Error('demo_resource_collision');
    if (!existingCampaign) {
      const campaign = createCampaign({
        id: campaignId, userId: identity.userId, name: 'Première collection — démo',
        description: 'Une opération fictive pour découvrir les regroupements de créations.',
        createdAt: new Date().toISOString()
      });
      await tx.campaign.create({ data: { ...campaign, createdAt: new Date(campaign.createdAt) } });
    }

    const existingProject = await tx.project.findUnique({ where: { id: identity.projectId } });
    if (existingProject && (existingProject.userId !== identity.userId || existingProject.contextId !== identity.contextId)) {
      throw new Error('demo_resource_collision');
    }
    if (!existingProject) {
      await tx.project.create({ data: {
        id: identity.projectId, userId: identity.userId, contextId: identity.contextId, campaignId,
        title: 'Découvrir Atelier Aurore — exemple démo', platform: 'Instagram', format: 'Video',
        objective: 'Présenter une marque fictive et explorer le workflow sans IA connectée.',
        sceneDurationSeconds: 2, status: 'draft'
      } });
    }
    return { ...identity };
  }, { isolationLevel: 'Serializable', timeout: 15000 });
}
