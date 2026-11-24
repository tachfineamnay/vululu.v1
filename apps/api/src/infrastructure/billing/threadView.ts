/**
 * P12-08 — projection bornée d'un dossier d'assistance (module pur, testable sans base).
 *
 * La file ne charge que les `THREAD_ENTRY_LIMIT` messages les plus récents ; le total réel vient
 * de `_count`. Ce module garantit l'ordre chronologique rendu, le compteur exact et l'état de
 * troncature affiché, sans jamais prétendre avoir lu tout l'historique.
 */
export const THREAD_ENTRY_LIMIT = 20;
export const THREAD_PAGE_SIZE = 25;

export type ThreadEntryRow = { id: string; role: string; status: string; message: string | null; createdAt: Date };
export type ThreadSourceRow = {
  id: string;
  userId: string | null;
  kind: string;
  subject: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  user: { id: string; email: string; name?: string | null; status: string } | null;
  _count: { entries: number };
  /** Messages les plus récents, dans l'ordre décroissant fourni par la base. */
  entries: ThreadEntryRow[];
};

export function threadView(row: ThreadSourceRow) {
  const entries = [...row.entries].reverse();
  return {
    id: row.id,
    userId: row.userId,
    kind: row.kind,
    subject: row.subject,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    user: row.user,
    entries,
    entriesCount: row._count.entries,
    entriesTruncated: row._count.entries > entries.length,
    lastEntryRole: entries.length > 0 ? entries[entries.length - 1].role : null,
    lastEntryAt: entries.length > 0 ? entries[entries.length - 1].createdAt.toISOString() : null
  };
}
