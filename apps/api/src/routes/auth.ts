import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { prisma } from '@vululu/db';
import { loginSchema } from '@vululu/contracts';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/auth/login', async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user) {
      return reply.code(401).send({ error: 'invalid_credentials', message: 'Email ou mot de passe incorrect.' });
    }
    const valid = await bcrypt.compare(body.password, user.passwordHash);
    if (!valid) {
      return reply.code(401).send({ error: 'invalid_credentials', message: 'Email ou mot de passe incorrect.' });
    }
    request.session.set('userId', user.id);
    return {
      user: { id: user.id, email: user.email, name: user.name, role: user.role }
    };
  });

  app.post('/api/auth/logout', async (request) => {
    request.session.delete();
    return { ok: true };
  });

  app.get('/api/auth/me', { preHandler: [app.authenticate] }, async (request) => {
    return { user: request.currentUser };
  });
}
