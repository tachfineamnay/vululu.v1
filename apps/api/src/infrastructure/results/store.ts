import { prisma } from '@vululu/db';
import { Prisma } from '@prisma/client';
import { missing, unavailable } from './provider';
const day = 86400000;
export function monday(now: Date) {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
}
export async function reminder(userId: string, now = new Date()) {
  const pref = await prisma.resultPreference.findUnique({
    where: { userId },
    select: { reminders: true, dismissedWeek: true },
  });
  return {
    enabled: !!pref?.reminders,
    due: !!pref?.reminders && pref.dismissedWeek !== monday(now).toISOString().slice(0, 10),
  };
}
type Entry = { key: string; kind: string; subject: string; version: number | null; detail: string; at: Date };
export async function history(userId: string, before?: { at: string; key: string }, now = new Date()) {
  const page = await prisma.$queryRaw<Entry[]>`
    SELECT key,kind,subject,version,detail,at FROM result_history
    WHERE "userId"=${userId} AND at>=${new Date(+now - 180 * day)}
      ${before ? Prisma.sql`AND (at,key)<(${new Date(before.at)},${before.key})` : Prisma.empty}
    ORDER BY at DESC,key DESC LIMIT 51`;
  const rows = page.slice(0, 50),
    last = rows.at(-1);
  return { rows, next: page.length > 50 && last ? { at: last.at.toISOString(), key: last.key } : null };
}
export async function report(userId: string, now = new Date()) {
  const from = new Date(+now - 30 * day),
    week = monday(now);
  const [usage] = await prisma.$queryRaw<
    { firstApproved: Date | null; activeDays: number; usable: number }[]
  >`
    SELECT min(at) FILTER (WHERE kind='approved') AS "firstApproved",
      count(DISTINCT at::date) FILTER (WHERE at>=${week})::int AS "activeDays",
      (SELECT count(*) FROM "CreativeRevision" r JOIN "Project" p ON p.id=r."projectId"
       WHERE p."userId"=${userId} AND r."approvedAt">=${from} AND r.manifest IS NOT NULL)::int +
      (SELECT count(*) FROM "Approval" a JOIN "ArtifactVersion" v ON v.id=a."artifactVersionId"
       JOIN "Artifact" t ON t.id=v."artifactId" JOIN "Project" p ON p.id=t."projectId"
       WHERE p."userId"=${userId} AND a."createdAt">=${from}
         AND a."invalidatedAt" IS NULL AND a.checksum=v.checksum)::int AS usable
    FROM result_history WHERE "userId"=${userId}`;
  const [cost] = await prisma.$queryRaw<{ cents: number | null; pending: boolean | null }[]>`
    SELECT sum("reportedCents") FILTER (WHERE "costState" IN ('RECONCILED','REPORTED'))::float8 cents,
      bool_or("costState" IN ('UNKNOWN','RESERVED') OR
              ("costState" IN ('REPORTED','RECONCILED') AND "reportedCents" IS NULL)) pending
    FROM "ExecutionOperation" WHERE "accountId"=${userId} AND "createdAt">=${from}`;
  const pref = await prisma.resultPreference.findUnique({ where: { userId } });
  const publications = await prisma.publicationRequest.findMany({
    where: {
      state: 'PUBLISHED',
      networkReceipt: { not: null },
      connection: { ownerId: userId },
      creative: { project: { userId } },
    },
    orderBy: { id: 'asc' },
    take: 50,
    select: {
      id: true,
      revision: true,
      projectId: true,
      measure: true,
      connection: { select: { revoked: true, expiresAt: true } },
      creative: { select: { project: { select: { title: true } } } },
    },
  });
  const offers = await prisma.confirmedOffer.findMany({
    where: { context: { userId } },
    orderBy: { id: 'asc' },
    take: 25,
    select: {
      id: true,
      name: true,
      contextId: true,
      items: {
        where: { userId, archived: false, plannedAt: { lt: now } },
        orderBy: [{ plannedAt: 'desc' }, { id: 'asc' }],
        take: 1,
        select: { title: true, project: { select: { id: true, userId: true, contextId: true } } },
      },
    },
  });
  return {
    usage: {
      ...usage,
      firstExport: pref?.firstExport ?? null,
      firstPublication: pref?.firstPublication ?? null,
      centsPerUsable:
        !usage.usable || cost.pending || cost.cents === null
          ? null
          : Math.round((cost.cents / usage.usable) * 100) / 100,
    },
    publications: publications.map(({ measure: m, connection, ...p }) => ({
      ...p,
      observation:
        m &&
        process.env.POSTIZ_ANALYTICS_ENABLED === '1' &&
        !connection.revoked &&
        connection.expiresAt > now &&
        m.retrievedAt >= from
          ? {
              source: m.source,
              retrievedAt: m.retrievedAt,
              metrics: {
                ...missing(),
                impressions: m.impressions === null ? unavailable : Number(m.impressions),
                engagement: m.engagement === null ? unavailable : Number(m.engagement),
                clicks: m.clicks === null ? unavailable : Number(m.clicks),
              },
            }
          : null,
    })),
    offers: offers.map((o) => ({
      id: o.id,
      name: o.name,
      previous: o.items[0]?.title ?? null,
      project:
        o.items[0]?.project?.userId === userId && o.items[0].project.contextId === o.contextId
          ? o.items[0].project.id
          : null,
    })),
    reminder: await reminder(userId, now),
  };
}
export const purge = (now = new Date()) =>
  prisma.$transaction([
    prisma.resultEvent.deleteMany({ where: { at: { lt: new Date(+now - 180 * day) } } }),
    prisma.postMeasure.deleteMany({
      where: {
        OR: [
          { retrievedAt: { lt: new Date(+now - 30 * day) } },
          { request: { connection: { revoked: true } } },
        ],
      },
    }),
  ]);
