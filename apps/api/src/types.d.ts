import type { SessionUser } from '@vululu/contracts';

declare module 'fastify' {
  interface FastifyRequest {
    currentUser?: SessionUser;
  }
  interface FastifyInstance {
    authenticate: (
      request: import('fastify').FastifyRequest,
      reply: import('fastify').FastifyReply
    ) => Promise<void>;
  }
}

export {};
