export const kindLabels: Record<string, string> = {
  square: 'Post carré',
  portrait: 'Post portrait',
  story: 'Story',
  carousel: 'Carrousel',
  short: 'Vidéo courte / Reel',
  landscape: 'Vidéo paysage'
};

export const formatKind = (kind: string): string => kindLabels[kind] ?? kind;

export const isVideoKind = (kind: string): boolean => kind === 'short' || kind === 'landscape';

export const isSafeHttpsUrl = (value: string | null | undefined): value is string =>
  Boolean(value && /^https:\/\/[^\s]{1,500}$/u.test(value));

export const requestStates: Record<string, string> = {
  PREPARED: 'Demande préparée',
  SENDING: 'Envoi en cours',
  SUBMITTED: 'Soumission acceptée · publication non confirmée',
  CANCELLING: 'Annulation en cours',
  CANCELLED: 'Annulée',
  PUBLISHED: 'Publication confirmée',
  FAILED: 'Échec',
  UNKNOWN: 'Issue inconnue · vérifier auprès du fournisseur'
};

export const safeRetryReasons = new Set([
  'TOKEN_EXPIRED',
  'CHANNEL_MISMATCH',
  'DISABLED',
  'PROVIDER_UNAVAILABLE',
  'MANUAL_CONFIRMED_ABSENT'
]);

/**
 * Un statut PUBLISHED sans preuve réseau vérifiée ne doit jamais être présenté comme confirmé.
 */
export function displayRequestState(state: string, networkReceipt: string | null | undefined): string {
  if (state === 'PUBLISHED' && !networkReceipt) {
    return 'Statut publié sans preuve réseau vérifiée';
  }
  return requestStates[state] ?? state;
}

export type RequestActionGuards = {
  expired: boolean;
  canRetryReason: boolean;
  canRetryNow: boolean;
  canReconcileNow: boolean;
  canCancelNow: boolean;
  canWithdrawCancel: boolean;
};

export function evaluateRequestControls(
  request: {
    state: string;
    reason: string | null;
    remoteId: string | null;
    scheduledAt: string | null;
    cancellation?: string;
    cancelOperationId?: string;
    connection: { revoked: boolean; expiresAt?: string };
  },
  context: { directEnabled: boolean; scheduleAuthorized: boolean; nowMs?: number }
): RequestActionGuards {
  const now = context.nowMs ?? Date.now();
  const revoked = request.connection.revoked;
  const expired = Boolean(request.connection.expiresAt && Date.parse(request.connection.expiresAt) <= now);
  const canRetryReason = request.state === 'FAILED' && safeRetryReasons.has(request.reason ?? '');
  const canRetryNow =
    canRetryReason && context.directEnabled && context.scheduleAuthorized && !revoked && !expired;
  const canReconcileNow =
    context.directEnabled &&
    !revoked &&
    !expired &&
    (request.state === 'UNKNOWN' || (request.state === 'SUBMITTED' && Boolean(request.remoteId)));
  const futureSchedule = !request.scheduledAt || Date.parse(request.scheduledAt) > now;
  const cancelInProgress = ['QUEUED', 'CLAIMED'].includes(request.cancellation ?? '');
  const canCancelNow =
    request.state === 'SUBMITTED' &&
    context.directEnabled &&
    !revoked &&
    !expired &&
    Boolean(request.remoteId) &&
    futureSchedule &&
    !cancelInProgress;
  const canWithdrawCancel =
    Boolean(request.cancelOperationId) && ['PROPOSED', 'QUEUED'].includes(request.cancellation ?? '');
  return {
    expired,
    canRetryReason,
    canRetryNow,
    canReconcileNow,
    canCancelNow,
    canWithdrawCancel
  };
}

export function formatPlatformSupportSummary(
  enabled: boolean,
  scheduled: readonly string[] | undefined
): string {
  if (!scheduled?.length) {
    return 'Publication manuelle uniquement (aucun format en programmation directe)';
  }
  const labels = scheduled.map((k) => formatKind(k)).join(', ');
  if (!enabled) {
    return `Publication manuelle (programmation directe désactivée par défaut ; formats compatibles une fois activée : ${labels})`;
  }
  return `Programmation directe : ${labels} · autres formats en kit manuel`;
}

export function metricsBlockReason(
  metricsEnabled: boolean,
  connectionStatus?: 'active' | 'expired' | 'revoked'
): 'analytics_disabled' | 'connection_revoked' | 'connection_expired' | null {
  if (!metricsEnabled) return 'analytics_disabled';
  if (connectionStatus === 'revoked') return 'connection_revoked';
  if (connectionStatus === 'expired') return 'connection_expired';
  return null;
}
