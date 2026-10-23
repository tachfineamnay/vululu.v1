import type { FastifyInstance } from 'fastify';
import { prisma } from '@vululu/db';

export async function registerAuth(app: FastifyInstance): Promise<void> {
  app.decorate('authenticate', async (request, reply) => {
    const userId = request.session.get('userId');
    if (!userId) {
      return reply.code(401).send({ error: 'unauthorized', message: 'Session requise.' });
    }
    const user = await prisma.user.findUnique({ where: { id: String(userId) } });
    if (!user) {
      request.session.delete();
      return reply.code(401).send({ error: 'unauthorized', message: 'Session invalide.' });
    }
    request.currentUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    };
  });
}
