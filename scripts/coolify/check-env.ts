import { env } from '../../apps/api/src/env';

function safeDatabase(value: string): string {
  try {
    const parsed = new URL(value);
    return parsed.hostname + '/' + parsed.pathname.replace(/^\//, '');
  } catch {
    return 'invalid';
  }
}

console.log(JSON.stringify({
  appEnv: env.appEnv,
  host: env.host,
  port: env.port,
  database: safeDatabase(env.databaseUrl),
  orchestrator: env.orchestratorMode,
  storage: env.artifactStorageBackend,
  trustProxy: env.trustProxy
}));
