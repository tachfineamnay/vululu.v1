import type { PrismaClient } from '@vululu/db';
import { briefChecksum } from '../../packages/domain/src/brief';
export { briefChecksum } from '../../packages/domain/src/brief';

/** Précondition explicite des fixtures de pipeline : simule la relecture humaine, sans désactiver le garde serveur. */
export async function confirmFixtureBrief(db: PrismaClient, projectId: string) {
  // L’infrastructure n’est chargée qu’après la sélection explicite de la DB par chaque fixture.
  const { PrismaBriefStore } = await import('../../apps/api/src/infrastructure/prisma/briefStore');
  const project = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  const brief = await db.brief.findUniqueOrThrow({ where: { projectId }, include: { revisions: true } });
  const content = { objective: brief.objective, audience: brief.audience, tone: brief.tone, cta: brief.cta, platform: brief.platform as 'Instagram', format: brief.format as 'Video' };
  const checksum = briefChecksum(content);
  if (!brief.revisions.length) await db.briefRevision.create({ data: { ...content, briefId: brief.id, version: brief.version, checksum } });
  const result = await new PrismaBriefStore(db).confirmOwned({ projectId, userId: project.userId, version: brief.version, checksum, confirmedAt: new Date() });
  // Les scènes de ces fixtures sont construites explicitement pour ce brief.
  await db.project.update({ where: { id: projectId }, data: { storyboardBriefVersion: brief.version } });
  return result;
}
