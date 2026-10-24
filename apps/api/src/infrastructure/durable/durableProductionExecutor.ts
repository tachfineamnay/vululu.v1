import type { ProductionExecutorPort } from '@vululu/application';
import type { OutboxDispatcher } from './outboxDispatcher';

/**
 * Executeur durable cote API : il ne rend rien en HTTP.
 * Il declenche le dispatcher outbox et laisse le worker Hatchet executer
 * le pipeline. Un echec de dispatch ne marque jamais le JobRun en failed :
 * l outbox reste pending et sera reconciliee.
 */
export class DurableProductionExecutor implements ProductionExecutorPort {
  constructor(private readonly dispatcher: OutboxDispatcher) {}

  async start(input: {
    projectId: string;
    jobId: string;
    jobRunId: string;
    type: 'produce' | 'correction';
    targetSceneKey: string | null;
    instruction: string | null;
  }): Promise<void> {
    try {
      await this.dispatcher.dispatchRun(input.jobRunId);
    } catch {
      // Etat voulu : outbox pending, API 202, reconciliation ulterieure.
    }
  }
}
