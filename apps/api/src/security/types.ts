import type { preHandlerHookHandler } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    authSession?: {
      id: string;
      userId: string;
      csrfHash: string;
      expiresAt: Date;
    };
    traceId?: string;
    requestId?: string;
    startAt?: number;
  }
  interface FastifyInstance {
    requireRole: (role: string) => preHandlerHookHandler;
    requireSuperAdmin: preHandlerHookHandler;
  }
}

export {};
