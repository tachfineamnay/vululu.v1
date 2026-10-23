import {
  createBrandContext,
  createContextRevision,
  type BrandContext,
  type ContextRevision
} from '@vululu/domain';
import type {
  Actor,
  Clock,
  ContextRecord,
  ContextRepository,
  IdGenerator
} from '../ports';

export type PublicContext = Omit<ContextRecord, 'userId'>;

export type ContextInput = {
  name: string;
  website?: string;
  description: string;
  audience?: string;
  tone?: string;
  colorPrimary?: string;
  colorSecondary?: string;
};

function toPublicContext(context: ContextRecord): PublicContext {
  return {
    id: context.id,
    name: context.name,
    website: context.website,
    description: context.description,
    audience: context.audience,
    tone: context.tone,
    colorPrimary: context.colorPrimary,
    colorSecondary: context.colorSecondary
  };
}

/**
 * Use cases de contexte : creation + revision initiale immuable.
 * Aucun acces Prisma/HTTP ici ; seuls les ports sont utilises.
 */
export class ContextUseCases {
  constructor(
    private readonly contexts: ContextRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator
  ) {}

  async list(actor: Actor): Promise<PublicContext[]> {
    const rows = await this.contexts.listOwned(actor.id);
    return rows.map(toPublicContext);
  }

  async create(actor: Actor, input: ContextInput): Promise<PublicContext> {
    const row = await this.contexts.create({
      userId: actor.id,
      name: input.name,
      website: input.website ?? null,
      description: input.description,
      audience: input.audience ?? null,
      tone: input.tone ?? null,
      colorPrimary: input.colorPrimary ?? '#6C5CE7',
      colorSecondary: input.colorSecondary ?? '#00D2FF'
    });

    const domainContext: BrandContext = createBrandContext({
      id: row.id,
      userId: row.userId,
      name: row.name,
      description: row.description,
      website: row.website,
      audience: row.audience,
      tone: row.tone,
      colorPrimary: row.colorPrimary,
      colorSecondary: row.colorSecondary
    });

    const revision: ContextRevision = createContextRevision({
      id: this.ids.next(),
      context: domainContext,
      revisions: [],
      createdAt: this.clock.now().toISOString()
    }).version;

    await this.contexts.addRevision(
      row.id,
      revision.version,
      revision.checksum,
      revision.snapshot as unknown as Record<string, unknown>
    );
    return toPublicContext(row);
  }
}
