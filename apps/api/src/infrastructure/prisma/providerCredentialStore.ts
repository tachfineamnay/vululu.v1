import { prisma } from '@vululu/db';
import type { PrismaClient } from '@prisma/client';
import type { ProviderCredentialStore } from '@vululu/application';

export class PrismaProviderCredentialStore implements ProviderCredentialStore {
  constructor(private readonly db: PrismaClient = prisma) {}
  async findProvider(key: string) {
    const provider = await this.db.provider.findUnique({ where: { key }, select: { id: true, credential: { select: { updatedAt: true } } } });
    return provider ? { id: provider.id, credentialsUpdatedAt: provider.credential?.updatedAt ?? null } : null;
  }
  async save(providerId: string, encryptedValue: string, actorId: string) {
    const row = await this.db.providerCredential.upsert({ where: { providerId }, create: { providerId, encryptedValue, updatedBy: actorId }, update: { encryptedValue, updatedBy: actorId }, select: { updatedAt: true } });
    return row.updatedAt;
  }
  async remove(providerId: string) { await this.db.providerCredential.deleteMany({ where: { providerId } }); }
}
