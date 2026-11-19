import { prisma } from '@vululu/db';
import { Prisma } from '@prisma/client';
import { assertAssetUsage, type AssetLicense, type PublicationUsage } from '@vululu/domain';
import { content, creativeSpec, type CreativeSpec } from '@vululu/contracts';
import { HttpError } from '../../errors';
import type { CreativeRepository, Manifest } from '../../application/creative';
const missing = () => new HttpError(404, 'creative_not_found', 'Projet, révision ou ressource introuvable.');
const readManifest = (v: Prisma.JsonValue) => v as unknown as Manifest | null;
export class PrismaCreativeRepository implements CreativeRepository {
  async project(userId: string, id: string) {
    const p = await prisma.project.findFirst({
      where: { id, userId },
      select: { id: true, usage: true, contextId: true }
    });
    if (!p) throw missing();
    return p;
  }
  async sources(userId: string, contextId: string, usage: string, ids: string[]) {
    const rows = await prisma.brandAssetVersion.findMany({
      where: {
        id: { in: ids },
        state: 'ready',
        mimeType: { in: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'audio/wav', 'audio/mpeg'] },
        asset: { userId, contextId }
      }
    });
    if (rows.length !== ids.length) throw missing();
    for (const row of rows) assertAssetUsage(row.license as AssetLicense, usage as PublicationUsage);
    return new Map(rows.map((row) => [row.id, row]));
  }
  async history(userId: string, id: string) {
    await this.project(userId, id);
    return prisma.creativeRevision.findMany({
      where: { projectId: id },
      orderBy: { version: 'desc' },
      select: { version: true, createdAt: true, approvedAt: true }
    });
  }
  async get(userId: string, id: string, version: number) {
    const row = await prisma.creativeRevision.findFirst({
      where: { projectId: id, version, project: { userId } }
    });
    if (!row) throw missing();
    return { ...row, spec: creativeSpec.parse(row.spec), manifest: readManifest(row.manifest) };
  }
  async append(userId: string, id: string, expectedVersion: number, spec: CreativeSpec) {
    await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM "Project" WHERE id=${id} AND "userId"=${userId} FOR UPDATE`;
      if (!locked.length) throw missing();
      const last = await tx.creativeRevision.findFirst({
        where: { projectId: id },
        orderBy: { version: 'desc' },
        select: { version: true }
      });
      if ((last?.version ?? 0) !== expectedVersion)
        throw new HttpError(409, 'creative_conflict', 'Révision dépassée. Rechargez avant de sauvegarder.');
      const link = spec.delivery?.calendar;
      if (link) {
        const rev = await tx.contentRevision.findFirst({
          where: { itemId: link.itemId, version: link.version, item: { userId, projectId: id } }
        });
        if (!rev) throw missing();
        const snapshot = content.parse(rev.snapshot);
        if (snapshot.projectId !== id || !snapshot.variants.some((v) => v.platform === spec.delivery!.platform))
          throw missing();
      }
      await tx.creativeRevision.create({
        data: {
          projectId: id,
          version: expectedVersion + 1,
          contentItemId: link?.itemId,
          contentVersion: link?.version,
          spec
        }
      });
    });
    return this.get(userId, id, expectedVersion + 1);
  }
  async approve(userId: string, id: string, version: number) {
    await prisma.creativeRevision.updateMany({
      where: { projectId: id, version, approvedAt: null, project: { userId } },
      data: { approvedAt: new Date() }
    });
  }
  async previous(userId: string, id: string, version: number) {
    const row = await prisma.creativeRevision.findFirst({
      where: { projectId: id, project: { userId }, version: { lt: version }, manifest: { not: Prisma.DbNull } },
      orderBy: { version: 'desc' },
      select: { manifest: true }
    });
    return row ? readManifest(row.manifest) : null;
  }
  async seal(userId: string, id: string, version: number, manifest: Manifest) {
    await prisma.creativeRevision.updateMany({
      where: { projectId: id, version, project: { userId }, manifest: { equals: Prisma.DbNull } },
      data: { manifest }
    });
  }
}
