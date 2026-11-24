import type { Prisma } from '@prisma/client';

export const normalizeAccountEmail = (email: string) => email.trim().toLowerCase();

/** Serialize changes to account ownership and credentials for this mailbox. */
export async function lockAccountEmail(tx: Prisma.TransactionClient, email: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${normalizeAccountEmail(email)}, 61701))`;
}

export function findAccountsForEmail(tx: Prisma.TransactionClient, email: string) {
  // SQL equality treats '_' and '%' literally, unlike ILIKE-based matching.
  return tx.$queryRaw<{ id: string; email: string; role: string; status: string }[]>`
    SELECT "id", "email", "role", "status" FROM "User" WHERE lower("email") = ${normalizeAccountEmail(email)} LIMIT 2
  `;
}
