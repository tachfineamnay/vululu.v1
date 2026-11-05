import { env } from '../../apps/api/src/env';
import { AesProviderCredentialCipher } from '../../apps/api/src/infrastructure/security/providerCredentialCipher';

function safeDatabase(value: string): string {
  try {
    const parsed = new URL(value);
    return parsed.hostname + '/' + parsed.pathname.replace(/^\//, '');
  } catch {
    return 'invalid';
  }
}

const credentialsEncryptionConfigured = new AesProviderCredentialCipher().configured();
console.log(JSON.stringify({
  appEnv: env.appEnv,
  host: env.host,
  port: env.port,
  database: safeDatabase(env.databaseUrl),
  orchestrator: env.orchestratorMode,
  storage: env.artifactStorageBackend,
  trustProxy: env.trustProxy,
  credentialsEncryptionConfigured
}));
if (process.argv.includes('--require-credentials') && !credentialsEncryptionConfigured) process.exitCode = 1;
