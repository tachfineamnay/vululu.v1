import { createHash } from 'node:crypto';
import { mediaRequest } from '@vululu/contracts';
// Parse JSONB back into the versioned schema's canonical field order at both boundaries.
export function mediaApprovalDigest(
  g: {
    projectId: string;
    tool: string;
    revision: number;
    id: string;
    provider: string;
    model: string;
    parameters: unknown;
    referenceSha: string | null;
  },
  maxCents: number
) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        g.projectId,
        g.tool,
        g.revision,
        g.id,
        g.provider,
        g.model,
        mediaRequest.parse(g.parameters),
        g.referenceSha,
        maxCents
      ])
    )
    .digest('hex');
}
