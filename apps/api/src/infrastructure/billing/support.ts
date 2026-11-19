import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@vululu/db';
import { Prisma } from '@prisma/client';
import { audit, fail, lock, account } from './service';
export async function reauth(userId: string, password: string) {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
  if (!(await bcrypt.compare(password, u.passwordHash))) return fail(403, 'reauth_required');
}
export const threads = (where: Prisma.ServiceTicketWhereInput) =>
  prisma.serviceTicket.findMany({
    where,
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    take: 100,
    include: { entries: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
  });
export async function openTicket(
  userId: string,
  kind: 'SUPPORT' | 'ERASURE',
  subject: string,
  message: string,
) {
  return prisma.$transaction(async (tx) => {
    await lock(tx, userId);
    if (
      kind === 'ERASURE' &&
      (await tx.serviceTicket.count({ where: { userId, kind, status: { not: 'CLOSED' } } }))
    )
      return fail(409, 'erasure_already_requested');
    if ((await tx.serviceTicket.count({ where: { userId, status: { not: 'CLOSED' } } })) >= 20)
      return fail(409, 'open_ticket_limit');
    const t = await tx.serviceTicket.create({
      data: {
        id: randomUUID(),
        userId,
        kind,
        subject,
        entries: { create: { id: randomUUID(), role: 'customer', status: 'OPEN', message } },
      },
    });
    await audit(tx, userId, 'ticket.opened', t.id, { kind });
    return t;
  });
}
export async function replyTicket(
  actor: string,
  id: string,
  role: 'support' | 'customer',
  status: string,
  expected: string,
  message: string,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "ServiceTicket" WHERE id=${id} FOR UPDATE`;
    const t = await tx.serviceTicket.findFirst({
      where: { id, ...(role === 'customer' ? { userId: actor } : { kind: 'SUPPORT' }) },
    });
    if (!t) return fail(404, 'ticket_not_found');
    if (t.status !== expected || t.status === 'CLOSED') return fail(409, 'ticket_changed');
    if (role === 'customer' && status !== t.status && status !== 'CLOSED')
      return fail(403, 'ticket_status_forbidden');
    if (role === 'support' && status === 'OPEN' && t.status !== 'OPEN')
      return fail(409, 'invalid_transition');
    await tx.serviceTicket.update({ where: { id }, data: { status, updatedAt: new Date() } });
    await tx.ticketEntry.create({ data: { id: randomUUID(), ticketId: id, role, status, message } });
    await audit(tx, actor, 'ticket.updated', id, { status });
    return { status };
  });
}
// Refuse destructive automation where external objects, paid work or non-cascading records need review.
export async function erase(actor: string, id: string, evidence: string) {
  return prisma.$transaction(async (tx) => {
    const t = await tx.serviceTicket.findFirst({ where: { id, kind: 'ERASURE', status: { not: 'CLOSED' } } });
    if (!t) return fail(404, 'erasure_not_found');
    const userId = t.userId;
    await lock(tx, userId);
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "ServiceTicket" WHERE id=${id} FOR UPDATE`;
    if (!(await tx.serviceTicket.count({ where: { id, status: { not: 'CLOSED' } } })))
      return fail(409, 'erasure_cancelled');
    const u = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (u.role !== 'user' || actor === userId) return fail(403, 'protected_account');
    await tx.$queryRaw`SELECT id FROM "Project" WHERE "userId"=${userId} FOR UPDATE`;
    const blocked =
      (await tx.creativeRevision.count({ where: { project: { userId } } })) ||
      (await tx.artifact.count({ where: { project: { userId } } })) ||
      (await tx.productionJob.count({ where: { project: { userId } } })) ||
      (await tx.jobRun.count({ where: { project: { userId } } })) ||
      (await tx.scene.count({ where: { project: { userId } } })) ||
      (await tx.character.count({ where: { project: { userId } } })) ||
      (await tx.marketingRevision.count({ where: { project: { userId } } })) ||
      (await tx.brandAsset.count({ where: { userId } })) ||
      (await tx.publishingConnection.count({ where: { ownerId: userId } })) ||
      (await tx.executionAccount.count({ where: { userId } })) ||
      (await tx.billingOrder.count({
        where: {
          userId,
          OR: [
            { refundReview: true },
            { state: { in: ['PENDING', 'FAILED', 'PARTIAL_REVIEW'] } },
            { state: 'PAID', expiresAt: { gt: new Date() } },
            { usage: { some: { state: 'HELD' } } },
          ],
        },
      }));
    if (blocked) {
      await tx.serviceTicket.update({
        where: { id },
        data: { status: 'IN_PROGRESS', updatedAt: new Date() },
      });
      await tx.ticketEntry.create({
        data: {
          id: randomUUID(),
          ticketId: id,
          role: 'admin',
          status: 'IN_PROGRESS',
          message: 'Vérification manuelle des données, paiements ou stockages requise. Compte non supprimé.',
        },
      });
      await audit(tx, actor, 'erasure.held', id, { evidence });
      return { deleted: false, reason: 'manual_review_required' };
    }
    await tx.contentItem.deleteMany({ where: { userId } });
    await tx.project.deleteMany({ where: { userId } });
    await tx.invitation.deleteMany({ where: { email: u.email } });
    await tx.auditEvent.updateMany({
      where: {
        OR: [{ actorId: userId }, { targetId: userId }, { metadata: { path: ['email'], equals: u.email } }],
      },
      data: { metadata: Prisma.DbNull },
    });
    await tx.user.delete({ where: { id: userId } });
    await audit(tx, actor, 'erasure.completed', userId, { evidence });
    return { deleted: true };
  });
}
export async function exportPage(userId: string, section: string, after: string) {
  const limit = 100,
    more = { ...(after ? { id: { gt: after } } : {}) },
    page = { take: limit + 1, orderBy: { id: 'asc' } as const };
  let rows: { id: string }[];
  switch (section) {
    case 'profile': {
      const u = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { id: true, email: true, name: true, createdAt: true },
      });
      rows = [u];
      break;
    }
    case 'projects':
      rows = await prisma.project.findMany({
        where: { userId, ...more },
        ...page,
        select: { id: true, title: true, objective: true, contextId: true, status: true, createdAt: true },
      });
      break;
    case 'contexts':
      rows = await prisma.brandContext.findMany({
        where: { userId, ...more },
        ...page,
        select: { id: true, name: true, description: true, website: true, audience: true, tone: true },
      });
      break;
    case 'campaigns':
      rows = await prisma.campaign.findMany({
        where: { userId, ...more },
        ...page,
        select: { id: true, name: true, description: true },
      });
      break;
    case 'calendar':
      rows = await prisma.contentItem.findMany({ where: { userId, ...more }, ...page });
      break;
    case 'tickets':
      rows = await prisma.serviceTicket.findMany({
        where: { userId, ...more },
        ...page,
        include: { entries: true },
      });
      break;
    case 'messages':
      rows = await prisma.message.findMany({
        where: { project: { userId }, ...more },
        ...page,
        select: { id: true, projectId: true, role: true, content: true, createdAt: true },
      });
      break;
    case 'briefs':
      rows = await prisma.brief.findMany({ where: { project: { userId }, ...more }, ...page });
      break;
    case 'assets':
      rows = await prisma.brandAssetVersion.findMany({
        where: { asset: { userId }, ...more },
        ...page,
        select: {
          id: true,
          assetId: true,
          version: true,
          name: true,
          license: true,
          provenance: true,
          mimeType: true,
          sha256: true,
        },
      });
      break;
    case 'billing':
      return { section, data: await account(userId), next: null };
    default:
      return fail(400, 'unknown_export_section');
  }
  return { section, data: rows.slice(0, limit), next: rows.length > limit ? rows[limit - 1].id : null };
}
