import crypto from 'node:crypto';
import { Pool } from 'pg';

export const pool = new Pool({
  connectionString:
    process.env.POC_DATABASE_URL ??
    'postgresql://vululu@127.0.0.1:55432/vululu_hatchet_poc?sslmode=disable',
  max: 5
});

export type PipelineInput = {
  runId: string;
  projectId: string;
  sceneDurationSeconds: number;
  crashAfterEffect?: boolean;
  failMode?: 'transient' | 'permanent' | 'none';
  budgetCents?: number;
};

export type RouteView = {
  selectedModelId: string;
  fallbackModelId: string | null;
  provider: string;
  model: string;
  estimatedCents: number;
  decision: Record<string, unknown>;
};

export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export async function seedSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS poc_run (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      status TEXT NOT NULL,
      snapshot JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS poc_step (
      run_id TEXT NOT NULL,
      step_key TEXT NOT NULL,
      status TEXT NOT NULL,
      attempt INTEGER NOT NULL DEFAULT 0,
      output JSONB,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (run_id, step_key)
    );
    CREATE TABLE IF NOT EXISTS poc_effect (
      idempotency_key TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS poc_approval (
      run_id TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      status TEXT NOT NULL,
      approved_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS poc_cost (
      idempotency_key TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      units INTEGER NOT NULL,
      amount_cents INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS poc_run_one_active_per_project
      ON poc_run(project_id)
      WHERE status IN ('running', 'waiting_approval');
  `);
}

export async function beginRun(input: PipelineInput): Promise<Record<string, unknown>> {
  const snapshot = {
    schemaVersion: 1,
    runId: input.runId,
    projectId: input.projectId,
    sceneDurationSeconds: input.sceneDurationSeconds,
    budgetCents: input.budgetCents ?? 10,
    capturedAt: new Date().toISOString()
  };
  try {
    await pool.query(
      'INSERT INTO poc_run (id, project_id, status, snapshot) VALUES ($1, $2, $3, $4)',
      [input.runId, input.projectId, 'running', JSON.stringify(snapshot)]
    );
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '23505') {
      throw new Error('run_already_active_for_project', { cause: error });
    }
    throw error;
  }
  await step(input.runId, 'prepare', 'succeeded', 1, snapshot);
  return snapshot;
}

export async function step(
  runId: string,
  key: string,
  status: string,
  attempt: number,
  output?: unknown
): Promise<void> {
  await pool.query(
    `INSERT INTO poc_step (run_id, step_key, status, attempt, output, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (run_id, step_key)
     DO UPDATE SET status = EXCLUDED.status, attempt = EXCLUDED.attempt,
                   output = EXCLUDED.output, updated_at = now()`,
    [runId, key, status, attempt, output === undefined ? null : JSON.stringify(output)]
  );
}

export async function setRunStatus(runId: string, status: string): Promise<void> {
  await pool.query('UPDATE poc_run SET status = $2, updated_at = now() WHERE id = $1', [runId, status]);
}

/** Effet metier idempotent : une cle, une seule ligne, même sous retries. */
export async function effectOnce(
  idempotencyKey: string,
  kind: string,
  payload: Record<string, unknown>
): Promise<{ created: boolean; payload: Record<string, unknown> }> {
  const inserted = await pool.query(
    `INSERT INTO poc_effect (idempotency_key, kind, payload)
     VALUES ($1, $2, $3)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING payload`,
    [idempotencyKey, kind, JSON.stringify(payload)]
  );
  if (inserted.rowCount === 1) {
    return { created: true, payload };
  }
  const existing = await pool.query('SELECT payload FROM poc_effect WHERE idempotency_key = $1', [
    idempotencyKey
  ]);
  return { created: false, payload: existing.rows[0].payload as Record<string, unknown> };
}

export async function effectCount(runId: string, prefix: string): Promise<number> {
  const result = await pool.query(
    'SELECT count(*)::int AS count FROM poc_effect WHERE idempotency_key LIKE $1',
    [prefix + '%']
  );
  return result.rows[0].count as number;
}

export async function setApprovalPending(runId: string, checksum: string): Promise<void> {
  await pool.query(
    `INSERT INTO poc_approval (run_id, checksum, status, updated_at)
     VALUES ($1, $2, 'pending', now())
     ON CONFLICT (run_id) DO UPDATE SET checksum = EXCLUDED.checksum, updated_at = now()`,
    [runId, checksum]
  );
}

export async function approve(runId: string, checksum: string): Promise<boolean> {
  const result = await pool.query(
    `UPDATE poc_approval SET status = 'approved', approved_at = now(), updated_at = now()
     WHERE run_id = $1 AND checksum = $2 AND status = 'pending'
     RETURNING run_id`,
    [runId, checksum]
  );
  return result.rowCount === 1;
}

export async function getApproval(runId: string): Promise<Record<string, unknown> | null> {
  const result = await pool.query('SELECT * FROM poc_approval WHERE run_id = $1', [runId]);
  return (result.rows[0] as Record<string, unknown> | undefined) ?? null;
}

/** Cout idempotent : la cle evite une double comptabilisation lors d'un retry. */
export async function costOnce(
  key: string,
  provider: string,
  units: number,
  amountCents: number
): Promise<void> {
  await pool.query(
    `INSERT INTO poc_cost (idempotency_key, provider, units, amount_cents)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [key, provider, units, amountCents]
  );
}