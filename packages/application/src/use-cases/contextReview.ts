import { createBrandContext, createContextRevision, snapshotContext, contextChecksum } from '@vululu/domain';
import type { Actor, AuditPort, Clock, IdGenerator } from '../ports';
import type { ContextAnalyzerPort, ContextReviewStore } from '../contextReviewPorts';
import type { ContextInput } from './contexts';
import { ApplicationError, assertOwned } from '../errors';

export class ContextReviewUseCases {
  constructor(private readonly store: ContextReviewStore, private readonly analyzer: ContextAnalyzerPort,
    private readonly audit: AuditPort, private readonly clock: Clock, private readonly ids: IdGenerator) {}
  async get(actor: Actor, contextId: string) {
    const record = assertOwned(await this.store.getOwned(contextId, actor.id), 'context_not_found', 'Contexte introuvable.');
    return { context: { id: record.context.id, ...snapshotContext(record.context) }, version: record.revisions.at(-1)?.version ?? 0, revisions: record.revisions };
  }
  async propose(actor: Actor, contextId: string) {
    const record = await this.get(actor, contextId);
    const { id: _id, ...snapshot } = record.context;
    const proposal = await this.analyzer.propose(snapshot);
    await this.audit.record({ actorId: actor.id, action: 'context.proposal_mock_created', targetType: 'context', targetId: contextId, metadata: { provider: proposal.provider, sourceChecksum: contextChecksum(snapshot), sourceVersion: record.version, websiteFetched: false } });
    return { ...proposal, sourceVersion: record.version, sourceChecksum: contextChecksum(snapshot) };
  }
  async save(actor: Actor, contextId: string, input: { content: ContextInput; confirmed: boolean; expectedVersion: number }) {
    if (input.confirmed !== true || !Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) throw new ApplicationError('context_confirmation_required', 'Relisez et confirmez la fiche avant enregistrement.', 400);
    const record = assertOwned(await this.store.getOwned(contextId, actor.id), 'context_not_found', 'Contexte introuvable.');
    const context = createBrandContext({ ...input.content, id: contextId, userId: actor.id });
    const revision = createContextRevision({ id: this.ids.next(), context, revisions: record.revisions, createdAt: this.clock.now().toISOString() }).version;
    const result = await this.store.saveOwned({ contextId, userId: actor.id, expectedVersion: input.expectedVersion, content: snapshotContext(context), revision });
    if (result.changed) await this.audit.record({ actorId: actor.id, action: 'context.revision_confirmed', targetType: 'context', targetId: contextId, metadata: { version: revision.version, checksum: revision.checksum, confirmed: true } });
    return this.get(actor, contextId);
  }
}
