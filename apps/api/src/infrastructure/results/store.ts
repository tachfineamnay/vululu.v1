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
      -- Un coût estimé réglé reste à rapprocher : le total confirmé est incomplet.
      bool_or("costState" IN ('UNKNOWN','RESERVED') OR
              ("costState" = 'ESTIMATED' AND "state" = 'SUCCEEDED') OR
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
  // P10 — activité observée : contenus, programmations, publications confirmées et créations
  // approuvées. Aucune mesure réseau n'est inventée ni déduite d'une simple soumission.
  const [contentStates, requestStates, creatives, campaignRows, campaignContent] = await Promise.all([
    prisma.contentItem.groupBy({ by: ['status'], where: { userId, archived: false }, _count: { _all: true } }),
    prisma.publicationRequest.groupBy({
      by: ['state'],
      where: { connection: { ownerId: userId }, creative: { project: { userId } } },
      _count: { _all: true }
    }),
    prisma.creativeRevision.findMany({
      where: { project: { userId }, approvedAt: { not: null }, manifest: { not: Prisma.DbNull } },
      orderBy: [{ approvedAt: 'desc' }, { projectId: 'asc' }, { version: 'desc' }],
      take: 20,
      select: {
        projectId: true,
        version: true,
        approvedAt: true,
        project: { select: { title: true, campaignId: true, campaign: { select: { name: true } } } }
      }
    }),
    prisma.campaign.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, name: true, _count: { select: { projects: true } } }
    }),
    prisma.contentItem.groupBy({ by: ['campaignId', 'status'], where: { userId }, _count: { _all: true } })
  ]);
  const stateCount = (rows: { status?: string | null; state?: string | null; _count: { _all: number } }[], key: string) =>
    rows.find((row) => (row.status ?? row.state) === key)?._count._all ?? 0;
  const confirmedPublications = await prisma.publicationRequest.count({
    where: {
      state: 'PUBLISHED',
      networkReceipt: { not: null },
      connection: { ownerId: userId },
      creative: { project: { userId } }
    }
  });
  const content = {
    created: contentStates.reduce((sum, row) => sum + row._count._all, 0),
    draft: stateCount(contentStates, 'IDEA') + stateCount(contentStates, 'DRAFT'),
    approved: stateCount(contentStates, 'APPROVED'),
    scheduled: stateCount(contentStates, 'SCHEDULED'),
    published: stateCount(contentStates, 'PUBLISHED'),
    failed: stateCount(contentStates, 'FAILED'),
    states: Object.fromEntries(contentStates.map((row) => [row.status, row._count._all])),
    publications: {
      prepared: stateCount(requestStates, 'PREPARED'),
      sending: stateCount(requestStates, 'SENDING'),
      submitted: stateCount(requestStates, 'SUBMITTED'),
      published: stateCount(requestStates, 'PUBLISHED'),
      publishedConfirmed: confirmedPublications,
      failed: stateCount(requestStates, 'FAILED'),
      unknown: stateCount(requestStates, 'UNKNOWN'),
      cancelled: stateCount(requestStates, 'CANCELLED'),
      states: Object.fromEntries(requestStates.map((row) => [row.state, row._count._all]))
    },
    sources: {
      content: 'ContentItem',
      publications: 'PublicationRequest',
      metrics: 'Postiz · LinkedIn',
      metricsEnabled: process.env.POSTIZ_ANALYTICS_ENABLED === '1',
      observedAt: now.toISOString()
    }
  };
  const campaignSummaries = campaignRows.map((campaign) => {
    const states = campaignContent.filter((row) => row.campaignId === campaign.id);
    return {
      id: campaign.id,
      name: campaign.name,
      projects: campaign._count.projects,
      content: states.reduce((sum, row) => sum + row._count._all, 0),
      approved: stateCount(states, 'APPROVED'),
      scheduled: stateCount(states, 'SCHEDULED'),
      published: stateCount(states, 'PUBLISHED')
    };
  });
  const suggestions: string[] = [];
  if (!content.publications.publishedConfirmed)
    suggestions.push('Aucune publication confirmée par le réseau pour l’instant : préparez un lot manuel ou une programmation, puis vérifiez le tableau de publication.');
  else
    suggestions.push(content.publications.publishedConfirmed + ' publication(s) confirmée(s) : consultez les mesures disponibles (source et date affichées) avant toute conclusion.');
  if (content.approved > content.scheduled)
    suggestions.push((content.approved - content.scheduled) + ' contenu(s) approuvé(s) ne sont pas encore programmés : ouvrez le calendrier pour les planifier.');
  if (content.publications.unknown || content.publications.sending)
    suggestions.push('Des envois sont en cours ou en état incertain : vérifiez le tableau de publication avant de relancer quoi que ce soit.');
  if (content.failed)
    suggestions.push(content.failed + ' contenu(s) en échec : corrigez la cause affichée puis relancez la préparation.');
  if (!creatives.length)
    suggestions.push('Aucune création approuvée : terminez une direction artistique et approuvez une version exacte avant de publier.');
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
    content,
    campaigns: campaignSummaries,
    creatives: creatives.map((row) => ({
      projectId: row.projectId,
      projectTitle: row.project.title,
      version: row.version,
      approvedAt: row.approvedAt,
      campaignId: row.project.campaignId,
      campaignName: row.project.campaign?.name ?? null
    })),
    suggestions,
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
