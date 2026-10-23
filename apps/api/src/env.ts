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

const isLocal = selected.includes('127.0.0.1') || selected.includes('localhost');
if (!isLocal) {
  const host = selected.split('@').pop();
  throw new Error('V0 refuse une base non locale: ' + host);
}

const sessionSecret = process.env.SESSION_SECRET || 'dev-only-vululu-session-secret-change-me';
if (sessionSecret.length < 32) {
  throw new Error('SESSION_SECRET trop court pour V0.');
}

export const env = {
  repoRoot,
  port: Number(process.env.API_PORT || '3001'),
  databaseUrl: selected,
  sessionSecret,
  artifactRoot: path.resolve(repoRoot, process.env.ARTIFACT_DIR || 'data/artifacts'),
  demoEmail: process.env.V0_DEMO_EMAIL || 'demo@vululu.local'
};
