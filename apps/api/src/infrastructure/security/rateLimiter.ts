import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '@vululu/db';
import { logEvent } from '../../observability/logger';

export type RateLimitPolicy = {
  name: string;
  limit: number;
  windowSeconds: number;
  failClosed?: boolean;
};

export type RateLimitResult = {
  allowed: boolean;
  count: number;
  remaining: number;
  retryAfterSeconds: number;
};

function enabled(): boolean {
  return process.env.RATE_LIMIT_ENABLED !== '0';
}

function failClosedDefault(): boolean {
  return process.env.RATE_LIMIT_FAIL_MODE === 'closed';
}

export async function consumeRateLimit(key: string, policy: RateLimitPolicy): Promise<RateLimitResult> {
  if (!enabled()) {
    return { allowed: true, count: 0, remaining: policy.limit, retryAfterSeconds: 0 };
  }
  const now = new Date();
  const expiresAt = new Date(now.getTime() + policy.windowSeconds * 1000);
  const sql = 'INSERT INTO "RateLimitCounter" ("key", "count", "windowStart", "expiresAt", "updatedAt") ' +
    'VALUES ($1, 1, $2, $3, $2) ' +
    'ON CONFLICT ("key") DO UPDATE SET ' +
    '"count" = CASE WHEN "RateLimitCounter"."expiresAt" <= $2 THEN 1 ELSE "RateLimitCounter"."count" + 1 END, ' +
    '"windowStart" = CASE WHEN "RateLimitCounter"."expiresAt" <= $2 THEN $2 ELSE "RateLimitCounter"."windowStart" END, ' +
    '"expiresAt" = CASE WHEN "RateLimitCounter"."expiresAt" <= $2 THEN $3 ELSE "RateLimitCounter"."expiresAt" END, ' +
    '"updatedAt" = $2 RETURNING "count", "expiresAt"';
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ count: number; expiresAt: Date }>>(
      sql,
      key,
      now,
      expiresAt
    );
    const row = rows[0];
    const count = row?.count ?? 1;
    const retryAfter = Math.max(1, Math.ceil(((row?.expiresAt ?? expiresAt).getTime() - now.getTime()) / 1000));
    return {
      allowed: count <= policy.limit,
      count,
      remaining: Math.max(0, policy.limit - count),
      retryAfterSeconds: retryAfter
    };
  } catch (error) {
    const failClosed = policy.failClosed ?? failClosedDefault();
    logEvent('error', 'rate_limit.backend_error', {
      policy: policy.name,
      failClosed,
      error: error instanceof Error ? error.message : 'unknown'
    });
    if (failClosed) {
      return { allowed: false, count: policy.limit + 1, remaining: 0, retryAfterSeconds: 1 };
    }
    return { allowed: true, count: 0, remaining: policy.limit, retryAfterSeconds: 0 };
  }
}

export function rateLimitPreHandler(
  policy: RateLimitPolicy,
  keyOf: (request: FastifyRequest) => string
) {
  return async function rateLimit(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const result = await consumeRateLimit(keyOf(request), policy);
    if (!result.allowed) {
      void reply
        .code(429)
        .header('Retry-After', String(result.retryAfterSeconds))
        .send({ error: 'rate_limited', message: 'Trop de requetes. Reessayez plus tard.' });
    }
  };
}

export const RATE_LIMITS = {
  login: { name: 'login', limit: Number(process.env.RATE_LIMIT_LOGIN || '100'), windowSeconds: 60, failClosed: true },
  activation: { name: 'activation', limit: Number(process.env.RATE_LIMIT_ACTIVATION || '50'), windowSeconds: 300, failClosed: true },
  storyboard: { name: 'storyboard', limit: Number(process.env.RATE_LIMIT_STORYBOARD || '20'), windowSeconds: 60 },
  productionStart: { name: 'production_start', limit: Number(process.env.RATE_LIMIT_PRODUCTION_START || '10'), windowSeconds: 60 },
  productionApprove: { name: 'production_approve', limit: Number(process.env.RATE_LIMIT_APPROVE || '20'), windowSeconds: 60 },
  routing: { name: 'routing', limit: Number(process.env.RATE_LIMIT_ROUTING || '60'), windowSeconds: 60 },
  mutation: { name: 'mutation', limit: Number(process.env.RATE_LIMIT_MUTATION || '120'), windowSeconds: 60 }
};