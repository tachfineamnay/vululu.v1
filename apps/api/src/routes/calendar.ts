import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { calendarMutation, confirmOffer, platformSchema } from '@vululu/contracts';
import { calendarStore as store } from '../infrastructure/prisma/calendarStore';

const windowQuery = z
  .object({ start: z.iso.datetime(), end: z.iso.datetime(), archived: z.enum(['true', 'false']).default('false') })
  .refine((q) => {
    const width = Date.parse(q.end) - Date.parse(q.start);
    return width > 0 && width <= 43 * 86400000;
  });
export async function calendarRoutes(app: FastifyInstance) {
  const auth = { preHandler: [app.authenticate] };
  app.get('/api/calendar/offers', auth, (r) => store.offers(r.currentUser!.id));
  app.post('/api/calendar/offers', auth, (r) => {
    const { contextId, name } = confirmOffer.parse(r.body);
    return store.confirm(r.currentUser!.id, contextId, name);
  });
  app.get('/api/calendar', auth, (r) => {
    const q = windowQuery.parse(r.query);
    return store.list(r.currentUser!.id, new Date(q.start), new Date(q.end), q.archived === 'true');
  });
  app.post('/api/calendar', auth, (r) => store.save(r.currentUser!.id, calendarMutation.parse(r.body)));
  const item = z.object({ id: z.uuid() });
  app.get('/api/calendar/:id', auth, (r) => store.get(r.currentUser!.id, item.parse(r.params).id));
  app.post('/api/calendar/:id/project', auth, (r) => {
    const { expectedVersion, platform } = z.object({ expectedVersion: z.int().positive(), platform: platformSchema }).strict().parse(r.body);
    return store.startProject(r.currentUser!.id, item.parse(r.params).id, expectedVersion, platform);
  });
  app.get('/api/calendar/:id/history', auth, (r) =>
    store.history(r.currentUser!.id, z.object({ id: z.uuid() }).parse(r.params).id)
  );
}
