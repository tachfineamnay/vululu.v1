import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

/**
 * DSH-01 — régression de la chaîne de migrations intégrée.
 *
 * Vérifie sur PostgreSQL jetable que la base porte *exactement* l'historique de
 * migrations du dépôt et que les objets des lots de la campagne de release
 * existent avec leurs défauts : confirmation d'assets (P02), métadonnées et
 * sélection de direction artistique (P04/P12-05), propositions outillées (P05),
 * progression de rendu (P09A), administration utilisateur (P11-A) et retour
 * BETA_FEEDBACK (BETA01).
 *
 * La base doit être locale et suffixée `_test` : aucune base distante, aucune
 * base de démonstration, aucun `db reset`/`db push`. Les lignes créées sont
 * supprimées en fin de test ; rien d'autre n'est modifié.
 */
const dbUrl = new URL(
  process.env.DATABASE_URL_TEST || 'postgresql://vululu@127.0.0.1:55432/vululu_v1_00_test?schema=public'
);
if (!['127.0.0.1', 'localhost'].includes(dbUrl.hostname) || !dbUrl.pathname.endsWith('_test')) {
  throw new Error('Disposable local test DB required');
}
process.env.DATABASE_URL = dbUrl.href;

const migrationsRoot = path.join(process.cwd(), 'packages', 'db', 'prisma', 'migrations');
const onDisk = readdirSync(migrationsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

type Db = typeof import('@vululu/db')['prisma'];
let db: Db;

type ColumnRow = { column_name: string; is_nullable: string; column_default: string | null };

async function columnMap(table: string): Promise<Map<string, ColumnRow>> {
  const rows = await db.$queryRaw<ColumnRow[]>`
    SELECT column_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table}`;
  return new Map(rows.map((row) => [row.column_name, row]));
}

const userId = `qa-${randomUUID()}`;
const projectId = `qa-${randomUUID()}`;
const contextId = `qa-${randomUUID()}`;
const operationId = `qa-${randomUUID()}`;
const ticketId = `qa-${randomUUID()}`;
const costId = `qa-${randomUUID()}`;

beforeAll(async () => {
  db = (await import('@vululu/db')).prisma;
});

afterAll(async () => {
  if (!db) return;
  await db.executionOperation.deleteMany({ where: { accountId: userId } });
  await db.executionAccount.deleteMany({ where: { userId } });
  await db.studioRender.deleteMany({ where: { projectId } });
  await db.creativeRevision.deleteMany({ where: { projectId } });
  await db.project.deleteMany({ where: { userId } });
  await db.brandContext.deleteMany({ where: { userId } });
  await db.costEvent.deleteMany({ where: { id: costId } });
  await db.ticketEntry.deleteMany({ where: { ticketId } });
  await db.serviceTicket.deleteMany({ where: { userId } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.$disconnect();
});

describe('migration chain', () => {
  it('applies every migration directory exactly once', async () => {
    const applied = await db.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM _prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    expect(applied).toHaveLength(onDisk.length);
    expect(applied.map((row) => row.migration_name).sort()).toEqual(onDisk);
  });

  it('leaves no failed or rolled back migration', async () => {
    const failed = await db.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) AS count FROM _prisma_migrations
      WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL`;
    expect(Number(failed[0].count)).toBe(0);
  });
});

describe('P02 / P12-05 project columns', () => {
  it('exposes assets confirmation and selected direction as nullable columns', async () => {
    const project = await columnMap('Project');
    for (const name of [
      'assetsConfirmedAt',
      'assetsConfirmationDigest',
      'assetsConfirmation',
      'selectedCreativeVersion',
      'selectedCreativeAt'
    ]) {
      expect(project.get(name), name).toBeDefined();
      expect(project.get(name)!.is_nullable, name).toBe('YES');
    }
  });
});

describe('P04 creative direction metadata', () => {
  it('stores label, origin and provenance', async () => {
    const revision = await columnMap('CreativeRevision');
    for (const name of ['label', 'origin', 'provenance']) {
      expect(revision.get(name), name).toBeDefined();
      expect(revision.get(name)!.is_nullable, name).toBe('YES');
    }
  });
});

describe('P05 execution operation metadata', () => {
  it('stores params, result, agent turn and step', async () => {
    const operation = await columnMap('ExecutionOperation');
    for (const name of ['params', 'result', 'agentTurnId', 'step']) {
      expect(operation.get(name), name).toBeDefined();
      expect(operation.get(name)!.is_nullable, name).toBe('YES');
    }
  });
});

describe('P09A studio render progress', () => {
  it('defaults progress to 0 and cancelRequested to false without touching rows', async () => {
    const render = await columnMap('StudioRender');
    expect(render.get('progress')!.is_nullable).toBe('NO');
    expect(render.get('progress')!.column_default).toContain('0');
    expect(render.get('cancelRequested')!.is_nullable).toBe('NO');
    expect(render.get('cancelRequested')!.column_default).toContain('false');
  });
});

describe('P11-A user administration', () => {
  it('defaults status to active, keeps suspendedAt nullable and indexes status', async () => {
    const user = await columnMap('User');
    expect(user.get('status')!.is_nullable).toBe('NO');
    expect(user.get('status')!.column_default).toContain('active');
    expect(user.get('suspendedAt')!.is_nullable).toBe('YES');
    const indexes = await db.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'User'`;
    expect(indexes.map((row) => row.indexname)).toContain('User_status_idx');
  });
});

describe('project-scoped writes across the new columns', () => {
  it('round-trips assets confirmation, direction selection, operation metadata and admin status', async () => {
    await db.user.create({
      data: { id: userId, email: `${userId}@qa.local`, passwordHash: 'x', name: 'QA', role: 'user' }
    });
    const created = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(created.status).toBe('active');
    expect(created.suspendedAt).toBeNull();

    await db.brandContext.create({
      data: { id: contextId, userId, name: 'QA', description: 'QA context' }
    });
    await db.project.create({
      data: {
        id: projectId,
        userId,
        contextId,
        title: 'QA project',
        platform: 'instagram',
        format: 'post',
        objective: 'awareness'
      }
    });
    await db.creativeRevision.create({ data: { projectId, version: 1, spec: { scenes: [] } } });
    const render = await db.studioRender.create({ data: { projectId, revision: 1, state: 'queued' } });
    expect(render.progress).toBe(0);
    expect(render.cancelRequested).toBe(false);

    await db.executionAccount.create({ data: { userId, limitCents: 1000, tools: [] } });
    await db.executionOperation.create({
      data: {
        id: operationId,
        accountId: userId,
        projectId,
        key: 'k1',
        digest: 'd1',
        tool: 'image.generate',
        revision: 1,
        state: 'PROPOSED',
        costState: 'RESERVED',
        maxCents: 100,
        correlationId: `corr-${userId}`
      }
    });

    const selected = await db.project.update({
      where: { id: projectId },
      data: {
        selectedCreativeVersion: 1,
        selectedCreativeAt: new Date(),
        assetsConfirmedAt: new Date(),
        assetsConfirmationDigest: 'digest',
        assetsConfirmation: { assets: [] }
      }
    });
    expect(selected.selectedCreativeVersion).toBe(1);
    expect(selected.assetsConfirmationDigest).toBe('digest');

    const revision = await db.creativeRevision.update({
      where: { projectId_version: { projectId, version: 1 } },
      data: { label: 'Direction A', origin: 'assistant', provenance: { model: 'local' } }
    });
    expect(revision.label).toBe('Direction A');

    const operation = await db.executionOperation.update({
      where: { id: operationId },
      data: { params: { prompt: 'x' }, result: { assetId: 'a1' }, agentTurnId: 'turn1', step: 2 }
    });
    expect(operation.step).toBe(2);
    expect(operation.params).toEqual({ prompt: 'x' });

    const progress = await db.studioRender.update({
      where: { id: render.id },
      data: { progress: 42, cancelRequested: true }
    });
    expect(progress.progress).toBe(42);
    expect(progress.cancelRequested).toBe(true);

    const suspended = await db.user.update({
      where: { id: userId },
      data: { status: 'suspended', suspendedAt: new Date() }
    });
    expect(suspended.status).toBe('suspended');
    expect(suspended.suspendedAt).not.toBeNull();

    const cost = await db.costEvent.create({
      data: { id: costId, projectId, provider: 'replicate', units: 2, amountCents: 7 }
    });
    expect(cost.amountCents).toBe(7);

    // DSH-02B — la contrainte d'origine n'autorisait que marketing/creative : tout tour
    // brainstorming ou agent échouait en 23514 sur une base construite par migrate deploy.
    for (const kind of ['brainstorm', 'agent']) {
      const turn = await db.assistantTurn.create({
        data: { id: `qa-${randomUUID()}`, projectId, kind, revision: 1, request: { kind }, snapshot: {}, inputDigest: 'd' }
      });
      expect(turn.kind).toBe(kind);
    }
    let assistantSqlState: string | undefined;
    try {
      await db.$executeRaw`INSERT INTO "AssistantTurn" (id,"projectId",kind,revision,request,snapshot,"inputDigest")
        VALUES (${randomUUID()}, ${projectId}, 'nope', 1, '{}'::jsonb, '{}'::jsonb, 'd')`;
    } catch (error) {
      const failure = error as { code?: string; meta?: { code?: string } };
      assistantSqlState = failure.meta?.code ?? failure.code;
    }
    expect(assistantSqlState).toBe('23514');
  });
});

describe('BETA_FEEDBACK ticket kind', () => {
  it('accepts BETA_FEEDBACK and still rejects an unknown kind', async () => {
    const ticket = await db.serviceTicket.create({
      data: { id: ticketId, userId, kind: 'BETA_FEEDBACK', subject: 'QA feedback' }
    });
    expect(ticket.kind).toBe('BETA_FEEDBACK');
    expect(ticket.status).toBe('OPEN');

    // Prisma enveloppe l'erreur PostgreSQL : le code SQLSTATE est dans `meta.code`.
    let sqlState: string | undefined;
    try {
      await db.$executeRaw`INSERT INTO "ServiceTicket" (id,"userId",kind,subject) VALUES (${randomUUID()}, ${userId}, 'NOPE', 'invalid')`;
    } catch (error) {
      const failure = error as { code?: string; meta?: { code?: string } };
      sqlState = failure.meta?.code ?? failure.code;
    }
    expect(sqlState).toBe('23514');
  });
});
