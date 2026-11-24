import { HttpError } from '../../errors';

export const DEFAULT_MAX_CONCURRENT_CREATIVE_SLOTS = 2;
export const DEFAULT_CREATIVE_BUSY_RETRY_AFTER_SECONDS = 2;

/**
 * Borne stricte de concurrence pour le travail natif (Sharp/FFmpeg/ZIP) dans l'API.
 *
 * Ce n'est pas un verrou à supprimer : il protège le processus contre la saturation
 * CPU/RAM lors de rafales d'aperçus ou d'exports simultanés, et renvoie 429
 * `creative_busy` avec un `Retry-After` explicite pour une reprise bornée côté UI.
 */
export class CreativeRenderSlot {
  private active = 0;

  constructor(
    readonly maxConcurrent = DEFAULT_MAX_CONCURRENT_CREATIVE_SLOTS,
    readonly retryAfterSeconds = DEFAULT_CREATIVE_BUSY_RETRY_AFTER_SECONDS
  ) {}

  get inFlight(): number {
    return this.active;
  }

  async run<T>(fn: () => Promise<T>, options?: { aborted?: () => boolean }): Promise<T> {
    if (options?.aborted?.()) {
      throw new HttpError(499, 'client_aborted', 'Requête annulée par le client.');
    }
    if (this.active >= this.maxConcurrent) {
      throw new HttpError(429, 'creative_busy', 'Rendu en cours, réessayez.', {
        retryAfterSeconds: this.retryAfterSeconds
      });
    }
    this.active += 1;
    try {
      return await fn();
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'media_text_overflow') {
        throw new HttpError(422, 'creative_text_overflow', error.message);
      }
      throw error;
    } finally {
      this.active -= 1;
    }
  }
}
