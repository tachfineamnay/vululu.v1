import { ApiRequestError } from './api';

export const BUSY_RETRY_DEFAULTS = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 8000
} as const;

export const RENDER_POLL_DEFAULTS = {
  initialDelayMs: 1500,
  maxDelayMs: 4000,
  maxConsecutiveErrors: 5,
  maxUnchangedPolls: 120
} as const;

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.message === 'Aborted');
}

/**
 * Seules les réponses 429 temporaires (`creative_busy` ou `rate_limited`) sont
 * réessayées automatiquement. Toute erreur métier/auth/validation (400/401/403/404/409/422/500)
 * remonte immédiatement sans boucle.
 */
export function isRetryableBusyError(error: unknown): error is ApiRequestError {
  if (!(error instanceof ApiRequestError)) return false;
  if (error.status !== 429) return false;
  return !error.code || error.code === 'creative_busy' || error.code === 'rate_limited';
}

export function isJobRunningConflict(error: unknown): error is ApiRequestError {
  return error instanceof ApiRequestError && error.status === 409 && error.code === 'job_running';
}

export function isStateConflict(error: unknown): error is ApiRequestError {
  return error instanceof ApiRequestError && error.status === 409;
}

export function computeBusyRetryDelayMs(
  attempt: number,
  retryAfterSeconds?: number,
  options?: { baseDelayMs?: number; maxDelayMs?: number }
): number {
  const base = options?.baseDelayMs ?? BUSY_RETRY_DEFAULTS.baseDelayMs;
  const max = options?.maxDelayMs ?? BUSY_RETRY_DEFAULTS.maxDelayMs;
  const exponential = Math.min(max, base * 2 ** Math.max(0, attempt - 1));
  if (typeof retryAfterSeconds === 'number' && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(max, Math.max(exponential, Math.round(retryAfterSeconds * 1000)));
  }
  return exponential;
}

export function abortableWait(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new DOMException('Aborted', 'AbortError'));
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export type BusyRetryWaitingInfo = {
  attempt: number;
  maxRetries: number;
  delayMs: number;
  message: string;
};

/**
 * Exécute une requête sensible à la concurrence avec attente/reprise strictement bornée
 * en cas de 429 légitime (`creative_busy` / `rate_limited`).
 *
 * - Jamais de boucle infinie : au plus `maxRetries` reprises (3 par défaut).
 * - Annulation immédiate si `signal` est interrompu pendant l'attente.
 * - N'avale jamais les erreurs 4xx/5xx non-429.
 */
export async function runWithBoundedBusyRetry<T>(
  fn: () => Promise<T>,
  options?: {
    signal?: AbortSignal;
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    wait?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
    onWaiting?: (info: BusyRetryWaitingInfo) => void;
  }
): Promise<T> {
  const maxRetries = options?.maxRetries ?? BUSY_RETRY_DEFAULTS.maxRetries;
  const wait = options?.wait ?? abortableWait;
  let attempt = 0;

  while (true) {
    if (options?.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    try {
      return await fn();
    } catch (error) {
      if (isAbortError(error) || options?.signal?.aborted) {
        throw error;
      }
      if (!isRetryableBusyError(error) || attempt >= maxRetries) {
        throw error;
      }
      attempt += 1;
      const delayMs = computeBusyRetryDelayMs(attempt, error.retryAfterSeconds, {
        baseDelayMs: options?.baseDelayMs,
        maxDelayMs: options?.maxDelayMs
      });
      options?.onWaiting?.({
        attempt,
        maxRetries,
        delayMs,
        message: `Serveur de rendu occupé · nouvelle tentative automatique (${attempt}/${maxRetries})…`
      });
      await wait(delayMs, options?.signal);
    }
  }
}

/**
 * File locale légère (concurrence = 1 dans l'onglet) pour coordonner les aperçus serveur
 * (`useStudioPreview`, `useStudioVideoPreview`, `StudioCompare`, `ArtDirections`).
 *
 * Empêche un seul onglet de saturer les 2 slots natifs du serveur lors d'une ouverture ou
 * d'une édition, tout en annulant immédiatement les tâches obsolètes avant même l'appel réseau.
 */
export function createPreviewCoordinator() {
  let tail: Promise<void> = Promise.resolve();

  function schedule<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) {
      return Promise.reject(new DOMException('Aborted', 'AbortError'));
    }
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });

    return previous.then(async () => {
      try {
        if (signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        return await fn();
      } finally {
        release();
      }
    });
  }

  return { schedule };
}

export const studioPreviewCoordinator = createPreviewCoordinator();

export type RenderPollDecision =
  | { action: 'poll'; delayMs: number }
  | {
      action: 'stop';
      terminalState: 'idle' | 'succeeded' | 'failed' | 'cancelled' | 'offline' | 'stalled';
      retryable: boolean;
      reason: string | null;
    };

/**
 * Politique bornée de suivi du rendu Studio :
 * - arrêt immédiat sur état terminal (`idle`, `succeeded`, `failed`, `cancelled`) ou 401/403/404 ;
 * - backoff progressif (1,5 s -> 4 s) sur état actif inchangé ou erreur réseau/429 ;
 * - arrêt garanti après `maxConsecutiveErrors` erreurs consécutives ou `maxUnchangedPolls`
 *   cycles sans changement, avec état réessayable explicite (aucun polling infini).
 */
export function nextRenderPollDecision(input: {
  state?: string;
  unchangedPolls: number;
  consecutiveErrors: number;
  errorStatus?: number;
  retryAfterSeconds?: number;
  limits?: Partial<typeof RENDER_POLL_DEFAULTS>;
}): RenderPollDecision {
  const limits = { ...RENDER_POLL_DEFAULTS, ...input.limits };

  if (input.consecutiveErrors > 0) {
    if (input.errorStatus && [401, 403, 404].includes(input.errorStatus)) {
      return {
        action: 'stop',
        terminalState: 'offline',
        retryable: false,
        reason: 'Suivi indisponible pour cette révision. Rechargez la composition.'
      };
    }
    if (input.consecutiveErrors >= limits.maxConsecutiveErrors) {
      return {
        action: 'stop',
        terminalState: 'offline',
        retryable: true,
        reason:
          'Suivi interrompu après plusieurs tentatives. Le rendu serveur peut encore évoluer : actualisez le suivi.'
      };
    }
    const baseDelay = Math.min(
      limits.maxDelayMs,
      limits.initialDelayMs * 2 ** Math.min(input.consecutiveErrors - 1, 2)
    );
    const delayMs =
      input.retryAfterSeconds && input.retryAfterSeconds > 0
        ? Math.min(limits.maxDelayMs * 2, Math.max(baseDelay, input.retryAfterSeconds * 1000))
        : baseDelay;
    return { action: 'poll', delayMs };
  }

  if (
    input.state === 'idle' ||
    input.state === 'succeeded' ||
    input.state === 'failed' ||
    input.state === 'cancelled'
  ) {
    return {
      action: 'stop',
      terminalState: input.state,
      retryable: input.state === 'failed' || input.state === 'cancelled',
      reason: null
    };
  }

  if (input.unchangedPolls >= limits.maxUnchangedPolls) {
    return {
      action: 'stop',
      terminalState: 'stalled',
      retryable: true,
      reason:
        'Le suivi automatique a été mis en pause pour éviter les requêtes répétées. Actualisez le suivi pour vérifier l’état serveur.'
    };
  }

  const delayMs =
    input.unchangedPolls >= 8
      ? limits.maxDelayMs
      : input.unchangedPolls >= 3
        ? Math.min(limits.maxDelayMs, Math.round(limits.initialDelayMs * 1.6))
        : limits.initialDelayMs;
  return { action: 'poll', delayMs };
}
