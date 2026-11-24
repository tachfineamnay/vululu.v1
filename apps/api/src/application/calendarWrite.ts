import { createHash } from 'node:crypto';
import { content, type CalendarItem, type CalendarMutation, type Content } from '@vululu/contracts';
import { HttpError } from '../errors';
import { checkEdit, conflict } from './calendarPolicy';

/** The adapter supplies these operations in a single, owner-serialized transaction. */
export interface CalendarWriteTransaction {
  current(): Promise<CalendarItem | null>;
  replay(): Promise<{ digest: string; snapshot: CalendarItem } | null>;
  verifyLinks(data: Content): Promise<void>;
  bookedPlatforms(date: Date): Promise<string[]>;
  append(snapshot: CalendarItem, digest: string): Promise<void>;
}
export function missing(): never {
  throw new HttpError(404, 'not_found', 'Ressource introuvable.');
}
export async function writeContent(tx: CalendarWriteTransaction, cmd: CalendarMutation, now: number) {
  const { id, expectedVersion, data } = cmd;
  const digest = createHash('sha256').update(JSON.stringify(cmd)).digest('hex');
  const previous = await tx.current();
  if (!previous && expectedVersion > 0) missing();
  if (previous) {
    const replay = await tx.replay();
    if (replay) {
      if (replay.digest !== digest) conflict('Identifiant de requête déjà utilisé.');
      return replay.snapshot;
    }
  }
  if ((previous?.version ?? 0) !== expectedVersion)
    conflict('Version dépassée. Rechargez le calendrier avant de réessayer.');
  // Normalise les valeurs par défaut du contrat (hashtags, etc.) AVANT l'écriture : la réponse
  // de création et le rejeu idempotent renvoient ainsi exactement la même forme.
  const normalized = content.parse(data);
  checkEdit(previous, normalized, now);
  await tx.verifyLinks(normalized);
  if (!normalized.archived && normalized.status === 'SCHEDULED') {
    const booked = new Set(await tx.bookedPlatforms(new Date(normalized.plannedAt)));
    if (normalized.variants.some((v) => booked.has(v.platform)))
      conflict('Une publication est déjà planifiée sur cette plateforme à cette minute.');
  }
  const snapshot = { ...normalized, id, version: expectedVersion + 1 };
  await tx.append(snapshot, digest);
  return snapshot;
}
