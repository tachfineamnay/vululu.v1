import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '../../..');

dotenv.config({ path: path.join(repoRoot, '.env'), override: true });

const testMode = process.env.V0_TEST_DB === '1';
const selected = testMode
  ? (process.env.DATABASE_URL_TEST || process.env.DATABASE_URL || '')
  : (process.env.DATABASE_URL || '');

process.env.DATABASE_URL = selected;

if (!selected) {
  throw new Error('DATABASE_URL manquant pour l API.');
}

function isLocalDatabaseUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]';
  } catch {
    return false;
  }
}

if (!isLocalDatabaseUrl(selected)) {
  let host = 'invalide';
  try {
    host = new URL(selected).hostname;
  } catch {
    // Keep the generic host value.
  }
  throw new Error('V0 refuse une base non locale: ' + host);
}

const sessionSecret = process.env.SESSION_SECRET || '';
if (sessionSecret.length < 32) {
  throw new Error('SESSION_SECRET manquant ou trop court pour V0.');
}

export const env = {
  repoRoot,
  port: Number(process.env.API_PORT || '3001'),
  databaseUrl: selected,
  sessionSecret,
  artifactRoot: path.resolve(repoRoot, process.env.ARTIFACT_DIR || 'data/artifacts'),
  demoEmail: process.env.V0_DEMO_EMAIL || 'demo@vululu.local'
};
