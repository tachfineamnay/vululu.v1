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
    const domainContext: BrandContext = createBrandContext({
      id: this.ids.next(),
      userId: actor.id,
      name: input.name,
      description: input.description,
      website: input.website ?? null,
      audience: input.audience ?? null,
      tone: input.tone ?? null,
      colorPrimary: input.colorPrimary ?? '#6C5CE7',
      colorSecondary: input.colorSecondary ?? '#00D2FF'
    });

    const revision: ContextRevision = createContextRevision({
      id: this.ids.next(),
      context: domainContext,
      revisions: [],
      createdAt: this.clock.now().toISOString()
    }).version;

    const row = await this.contexts.createWithRevision(
      {
        userId: actor.id,
        name: domainContext.name,
        website: domainContext.website,
        description: domainContext.description,
        audience: domainContext.audience,
        tone: domainContext.tone,
        colorPrimary: domainContext.colorPrimary,
        colorSecondary: domainContext.colorSecondary
      },
      {
        version: revision.version,
        checksum: revision.checksum,
        data: revision.snapshot as unknown as Record<string, unknown>
      }
    );
    return toPublicContext(row);
  }
}