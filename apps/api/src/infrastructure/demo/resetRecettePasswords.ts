import type { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

/** Maintenance explicite de recette ; aucun effet lors d'un amorçage normal. */
export async function resetRecettePasswords(db: PrismaClient, config: Record<string, string | undefined>): Promise<number> {
  if (config.RECETTE_RESET_PASSWORDS !== '1') return 0;
  if (config.DEMO_MODE !== '1') throw new Error('recette_demo_required');
  const adminEmail = (config.V1_BOOTSTRAP_EMAIL ?? '').trim().toLowerCase();
  const demoEmail = (config.DEMO_EMAIL ?? '').trim().toLowerCase();
  const adminPassword = config.V1_BOOTSTRAP_PASSWORD ?? ''; const demoPassword = config.DEMO_PASSWORD ?? '';
  const minimum = config.RECETTE_ALLOW_SHORT_PASSWORDS === '1' ? 1 : 12;
  if (adminEmail === demoEmail || ![adminEmail, demoEmail].every((value) => z.email().safeParse(value).success)
    || ![adminPassword, demoPassword].every((value) => value.length >= minimum && Buffer.byteLength(value, 'utf8') <= 72)) throw new Error('recette_credentials_invalid');
  return db.$transaction(async (tx) => {
    const admin = await tx.user.findUnique({ where: { email: adminEmail } });
    const demo = await tx.user.findUnique({ where: { id: 'v1-demo-user' } });
    const marker = await tx.auditEvent.findFirst({ where: { actorId: 'v1-demo-user', targetId: 'v1-demo-user', action: 'demo.bootstrap.created' } });
    if (!admin || admin.role !== 'super_admin' || !demo || demo.email !== demoEmail || demo.role !== 'user' || !marker) throw new Error('recette_identity_invalid');
    await tx.user.update({ where: { id: admin.id }, data: { passwordHash: await bcrypt.hash(adminPassword, 10) } });
    await tx.user.update({ where: { id: demo.id }, data: { passwordHash: await bcrypt.hash(demoPassword, 10) } });
    const sessions = await tx.session.updateMany({ where: { userId: { in: [admin.id, demo.id] }, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: 'password_reset' } });
    await tx.auditEvent.create({ data: { action: 'recette.passwords_reset', targetType: 'users', metadata: { source: 'operator-env', userIds: [admin.id, demo.id], sessionsRevoked: sessions.count } } });
    return 2;
  }, { isolationLevel: 'Serializable', timeout: 15000 });
}
