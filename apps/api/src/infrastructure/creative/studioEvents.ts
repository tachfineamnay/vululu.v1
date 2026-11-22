import { prisma } from '@vululu/db';
import { logEvent } from '../../observability/logger';

/**
 * Journal d'atelier alimente par le moteur de rendu. Le curseur est derive de maniere
 * atomique (upsert + increment) pour que le flux SSE de routes/studio.ts reste coherent
 * meme avec plusieurs workers. Une panne du journal ne fait jamais echouer un rendu.
 */
export async function appendStudioEvent(
  projectId: string,
  input: { kind: string; entity: string; state: string }
): Promise<void> {
  try {
    const [row] = await prisma.$queryRaw<{ cursor: number }[]>`
      INSERT INTO "StudioClock" ("projectId", "cursor") VALUES (${projectId}, 1)
      ON CONFLICT ("projectId") DO UPDATE SET "cursor" = "StudioClock"."cursor" + 1
      RETURNING "cursor"`;
    await prisma.studioEvent.create({
      data: { projectId, cursor: row.cursor, kind: input.kind, entity: input.entity, state: input.state }
    });
  } catch (error) {
    logEvent('warn', 'studio.event_write_failed', {
      projectId,
      kind: input.kind,
      error: error instanceof Error ? error.message : 'unknown'
    });
  }
}
