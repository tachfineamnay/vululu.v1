import type { FastifyRequest } from 'fastify';

function allowedOrigins(): string[] {
  const configured = process.env.APP_ORIGIN || process.env.WEB_ORIGIN;
  const fallback = process.env.APP_ENV === 'production'
    ? ''
    : 'http://127.0.0.1:3100,http://localhost:3100';
  return (configured || fallback)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

/** Si Origin est absent, la requete est traitee comme non-navigateur. */
export function isAllowedOrigin(request: Pick<FastifyRequest, 'headers'>): boolean {
  const origin = request.headers.origin;
  if (!origin) return true;
  const allowed = allowedOrigins();
  if (allowed.length === 0) return true;
  return allowed.includes(origin);
}