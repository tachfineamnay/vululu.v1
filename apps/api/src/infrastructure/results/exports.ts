import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '@vululu/db';
// Count full, explicitly requested HTTP exports. Preview/range requests, aborted streams and
// error pages are not exports. This records a server-side finish, not a claim about a user's disk.
export function markExport(
  r: FastifyRequest,
  reply: FastifyReply,
  subject: string,
  version: number | null,
  detail: string,
) {
  const userId = r.currentUser?.id;
  if (!userId || r.method !== 'GET') return;
  reply.raw.once('finish', () => {
    if (reply.statusCode !== 200) return;
    void prisma.resultEvent
      .create({ data: { userId, kind: 'export', subject, version, detail } })
      .catch(() => r.log.warn('Export observation could not be recorded'));
  });
}
