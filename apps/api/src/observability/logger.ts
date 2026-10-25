import crypto from 'node:crypto';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const REDACTED_KEYS = new Set([
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'cookie',
  'password',
  'secret',
  'csrf',
  'csrfToken',
  'presignedUrl',
  'signedUrl',
  'session',
  'credentials'
]);

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = REDACTED_KEYS.has(key.toLowerCase()) ? '[redacted]' : redact(item);
    }
    return result;
  }
  return value;
}

export function newTraceId(): string {
  return crypto.randomUUID();
}

export function sanitizeRequestId(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 128) || newTraceId();
}

/** Logs JSON structure, sans secret, sur stdout. */
export function logEvent(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
  const line = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...(redact(fields) as Record<string, unknown>)
  };
  try {
    process.stdout.write(JSON.stringify(line) + '\n');
  } catch {
    // Le logging ne doit jamais faire echouer une requete.
  }
}
