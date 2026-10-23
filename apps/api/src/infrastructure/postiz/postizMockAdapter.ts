import type { PrismaClient } from '@prisma/client';
import { prisma } from '@vululu/db';
import type { PostizPort, TransferRecord } from '@vululu/application';
import { toTransferRecord } from '../prisma/mappers';

export const POSTIZ_MOCK_PROVIDER = 'postiz-mock';

/**
 * Adaptateur MOCK de Postiz (ADR-0005, gap G-08).
 *
 * - aucun appel reseau, aucun compte externe, aucune publication ;
 * - idempotent par approvalId : deux transferts de la meme approbation
 *   renvoient le meme TransferRecord et ne creent qu'une ligne Transfer ;
 * - le transfert n'est possible que pour une approbation valide (non
 *   invalidee) et pour le checksum exact de la version approuvee ;
 * - statut `submitted` uniquement : ce mock ne pretend PAS que Postiz a
 *   acquitte (acknowledged) ni publie. Un vrai adaptateur devra implementer
 *   les etats pending/submitted/acknowledged/failed et l'idempotency key
 *   cote API Postiz.
 */
export class PostizMockAdapter implements PostizPort {
  constructor(private readonly db: PrismaClient = prisma) {}

  /**
   * @param input.approvalId identifiant de l'approbation exacte a transferer
   * @param input.checksum checksum de la version approuvee (controle exact)
   * @param input.artifactVersionId version exacte de l'artefact approuve
   */
  async transfer(input: {
    approvalId: string;
    checksum: string;
    artifactVersionId: string;
  }): Promise<TransferRecord> {
    const existing = await this.db.transfer.findUnique({
      where: { approvalId: input.approvalId }
    });
    if (existing) {
      return toTransferRecord(existing);
    }

    const approval = await this.db.approval.findUnique({
      where: { artifactVersionId: input.artifactVersionId }
    });
    if (!approval || approval.id !== input.approvalId) {
      throw new Error('approbation_requise: aucun transfert sans approbation exacte.');
    }
    if (approval.invalidatedAt !== null) {
      throw new Error('approbation_invalidee: un nouveau master a invalide cette approbation.');
    }
    if (approval.checksum !== input.checksum) {
      throw new Error('checksum_divergent: le checksum ne correspond pas a la version approuvee.');
    }

    try {
      const row = await this.db.transfer.create({
        data: {
          approvalId: approval.id,
          status: 'submitted',
          provider: POSTIZ_MOCK_PROVIDER,
          externalId: null
        }
      });
      return toTransferRecord(row);
    } catch (error) {
      // Course concurrente : approvalId est unique, on renvoie la ligne gagnante.
      if (isUniqueViolation(error)) {
        const winner = await this.db.transfer.findUnique({
          where: { approvalId: input.approvalId }
        });
        if (winner) {
          return toTransferRecord(winner);
        }
      }
      throw error;
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
