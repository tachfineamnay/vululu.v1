import { prisma } from '@vululu/db';
import { content, type CalendarMutation } from '@vululu/contracts';
import { writeContent, missing } from '../../application/calendarWrite';
import { z } from 'zod';
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
  async save(userId: string, cmd: CalendarMutation) {
    const { id, expectedVersion, requestId } = cmd;
    return prisma.$transaction(async (tx) => {
      // Serialize this owner's writes, including concurrent creates for the same slot.
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
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
    });
  }
};
