/**
 * Erreurs de domaine pures.
 *
 * Les codes sont stables et destinés à être mappés par la couche Application
 * vers des réponses HTTP ou MCP. Le Domain ne connaît ni HTTP ni Fastify.
 */
export type DomainErrorCode =
  | 'invalid_input'
  | 'invalid_id'
  | 'invalid_checksum'
  | 'invalid_transition'
  | 'version_conflict'
  | 'scene_not_found'
  | 'scene_version_required'
  | 'character_not_found'
  | 'artifact_version_mismatch'
  | 'artifact_version_stale'
  | 'checksum_mismatch'
  | 'approval_required'
  | 'approval_invalidated'
  | 'approval_version_mismatch'
  | 'invitation_expired'
  | 'invitation_used'
  | 'invitation_revoked'
  | 'agent_config_not_found'
  | 'agent_config_stale'
  | 'no_route'
  | 'budget_exceeded';

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(
    code: DomainErrorCode,
    message: string,
    details: Readonly<Record<string, unknown>> = {}
  ) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
