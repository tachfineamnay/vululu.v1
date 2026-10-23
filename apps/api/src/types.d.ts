import type { FastifyReply, FastifyRequest } from 'fastify';
import type { SessionUser } from '@vululu/contracts';

declare module 'fastify' {
  interface FastifyRequest {
    currentUser?: SessionUser;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export {};