import { prisma } from '@vululu/db';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { content, projectInputSchema, type CalendarMutation, type Platform } from '@vululu/contracts';
import { writeContent, missing } from '../../application/calendarWrite';
import { z } from 'zod';
import { conflict } from '../../application/calendarPolicy';
const itemSchema = content.extend({ id: z.uuid(), version: z.int().positive() });

export const calendarStore = {
  offers: (userId: string) =>
    prisma.confirmedOffer.findMany({ where: { context: { userId } }, orderBy: { name: 'asc' } }),
  async confirm(userId: string, contextId: string, name: string) {
    if (!(await prisma.brandContext.findFirst({ where: { id: contextId, userId } }))) missing();
    return prisma.confirmedOffer.upsert({
      where: { contextId_name: { contextId, name } },
      update: {},
      create: { contextId, name }
    });
  },
  list: async (userId: string, start: Date, end: Date, archived: boolean) =>
    (
      await prisma.contentItem.findMany({
        where: { userId, archived, plannedAt: { gte: start, lt: end } },
        orderBy: [{ plannedAt: 'asc' }, { id: 'asc' }]
      })
    ).map((row) => itemSchema.parse({ ...row, plannedAt: row.plannedAt.toISOString() })),
  history: (userId: string, itemId: string) =>
    prisma.contentRevision.findMany({
      where: { itemId, item: { userId } },
      select: { version: true, snapshot: true, createdAt: true },
      orderBy: { version: 'desc' }
    }),
  async get(userId: string, id: string) {
    const row = await prisma.contentItem.findFirst({ where: { id, userId } });
    return row ? readItem(row) : missing();
  },
  save(userId: string, cmd: CalendarMutation) {
    return ownerTransaction(userId, (tx) => save(tx, userId, cmd));
  },
  startProject(userId: string, id: string, expectedVersion: number, platform: Platform) {
    return ownerTransaction(userId, async (tx) => {
      const row = await tx.contentItem.findFirst({ where: { id, userId }, include: { offer: true } });
      if (!row) return missing();
      const { id: itemId, version, ...data } = readItem(row);
      if (data.archived) return conflict('Restaurez ce contenu avant de créer un projet.');
      if (data.projectId) return { projectId: data.projectId, itemVersion: version }; // safe replay
      if (version !== expectedVersion) return conflict('Le contenu a changé. Rechargez-le avant de continuer.');
      if (!['IDEA', 'DRAFT'].includes(data.status)) return conflict('Revenez au brouillon pour créer un projet.');
      const chosen = data.variants.find((v) => v.platform === platform);
      const input = projectInputSchema.safeParse({ contextId: row.offer.contextId, title: data.title,
        objective: data.objective, platform, format: chosen?.format });
      if (!input.success) return conflict('Choisissez une plateforme et un format disponibles dans le brief marketing.');
      const project = await tx.project.create({ data: { ...input.data, userId, campaignId: data.campaignId } });
      const linked = await save(tx, userId, { id: itemId, expectedVersion: version, requestId: randomUUID(), data: { ...data, projectId: project.id } });
      return { projectId: project.id, itemVersion: linked.version };
    });
  }
};

function readItem(row: { plannedAt: Date }) {
  return itemSchema.parse({ ...row, plannedAt: row.plannedAt.toISOString() });
}
function ownerTransaction<T>(userId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(async (tx) => {
    // Serialize the owner's calendar edits and project handoffs, including repeated submissions.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    return fn(tx);
  });
}
async function save(tx: Prisma.TransactionClient, userId: string, cmd: CalendarMutation) {
  const { id, expectedVersion, requestId } = cmd;
  return writeContent(
    {
      async current() {
        const row = await tx.contentItem.findUnique({ where: { id } });
        if (row && row.userId !== userId) missing();
        return row && itemSchema.parse({ ...row, plannedAt: row.plannedAt.toISOString() });
      },
      async replay() {
        const row = await tx.contentRevision.findUnique({
          where: { itemId_requestId: { itemId: id, requestId } }
        });
        return row && { digest: row.digest, snapshot: itemSchema.parse(row.snapshot) };
      },
      async verifyLinks(data) {
        const offer = await tx.confirmedOffer.findFirst({ where: { id: data.offerId, context: { userId } } });
        if (!offer) missing();
        if (data.campaignId && !(await tx.campaign.findFirst({ where: { id: data.campaignId, userId } })))
          missing();
        if (
          data.projectId &&
          !(await tx.project.findFirst({
            where: {
              id: data.projectId,
              userId,
              contextId: offer.contextId,
              ...(data.campaignId ? { campaignId: data.campaignId } : {})
            }
          }))
        )
          missing();
      },
      async bookedPlatforms(plannedAt) {
        const peers = await tx.contentItem.findMany({
          where: { userId, plannedAt, archived: false, status: 'SCHEDULED', id: { not: id } },
          select: { variants: true }
        });
        return peers.flatMap((p) => content.shape.variants.parse(p.variants).map((v) => v.platform));
      },
      async append(snapshot, digest) {
        const { id: itemId, ...fields } = snapshot;
        const data = { ...fields, plannedAt: new Date(fields.plannedAt) };
        if (expectedVersion) await tx.contentItem.update({ where: { id: itemId, userId }, data });
        else await tx.contentItem.create({ data: { ...data, id: itemId, userId } });
        await tx.contentRevision.create({
          data: { itemId, version: snapshot.version, digest, requestId, snapshot }
        });
      }
    },
    cmd,
    Date.now()
  );
}
