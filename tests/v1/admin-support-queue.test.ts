import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  const url = new URL(process.env.DATABASE_URL_TEST || 'postgresql://vululu@127.0.0.1:55432/vululu_v1_00_test');
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !url.pathname.endsWith('_test'))
    throw Error('disposable local DB required');
  process.env.DATABASE_URL = url.href;
  process.env.SESSION_SECRET = crypto.randomUUID();
  process.env.APP_ENV = 'test';
});

import { randomUUID } from 'node:crypto';
import { prisma } from '@vululu/db';
import { threads, threadsPage, THREAD_ENTRY_LIMIT, THREAD_PAGE_SIZE } from '../../apps/api/src/infrastructure/billing/support';

/**
 * P12-08 — file d'assistance bornée : page de 25 dossiers, 20 messages récents par dossier,
 * total exact avec le même filtre, isolation par propriétaire et compteur de messages réel.
 */

let owner: string;
let other: string;
const ticketIds: string[] = [];

async function ticket(userId: string, entries: number, subject: string) {
  const id = randomUUID();
  ticketIds.push(id);
  await prisma.serviceTicket.create({
    data: {
      id, userId, kind: 'SUPPORT', subject, status: 'OPEN',
      entries: { create: Array.from({ length: entries }, (_, index) => ({
        id: randomUUID(), role: index % 2 === 0 ? 'customer' : 'support', status: 'OPEN',
        message: 'message ' + index,
        createdAt: new Date(Date.UTC(2026, 0, 1, 12, index))
      })) }
    }
  });
  return id;
}

beforeEach(async () => {
  owner = randomUUID();
  other = randomUUID();
  await prisma.user.createMany({
    data: [owner, other].map((id) => ({ id, email: id + '@example.test', name: 'QA', passwordHash: 'unused', role: 'user' }))
  });
});

afterEach(async () => {
  await prisma.ticketEntry.deleteMany({ where: { ticketId: { in: ticketIds } } });
  await prisma.serviceTicket.deleteMany({ where: { id: { in: ticketIds } } });
  await prisma.auditEvent.deleteMany({ where: { actorId: { in: [owner, other] } } });
  await prisma.user.deleteMany({ where: { id: { in: [owner, other] } } });
  ticketIds.length = 0;
});

describe('file d assistance bornée', () => {
  it('limite chaque dossier aux messages les plus récents et garde le total réel', async () => {
    const id = await ticket(owner, 40, 'Historique long');
    const [row] = await threads({ id });
    expect(row.entries).toHaveLength(THREAD_ENTRY_LIMIT);
    expect(row.entriesCount).toBe(40);
    expect(row.entriesTruncated).toBe(true);
    expect(row.lastEntryRole).toBe('support');
    expect(row.entries.map((entry) => entry.message)).toContain('message 39');
  });

  it('pagine par curseur stable et renvoie le total du filtre', async () => {
    for (let index = 0; index < THREAD_PAGE_SIZE + 3; index += 1) await ticket(owner, 1, 'Sujet ' + index);
    const first = await threadsPage({ userId: owner }, { pageSize: THREAD_PAGE_SIZE });
    expect(first.items).toHaveLength(THREAD_PAGE_SIZE);
    expect(first.total).toBe(THREAD_PAGE_SIZE + 3);
    expect(first.nextCursor).not.toBeNull();
    const second = await threadsPage({ userId: owner }, { cursor: first.nextCursor!, pageSize: THREAD_PAGE_SIZE });
    expect(second.items).toHaveLength(3);
    expect(second.nextCursor).toBeNull();
    const ids = new Set([...first.items, ...second.items].map((row) => row.id));
    expect(ids.size).toBe(THREAD_PAGE_SIZE + 3);
  });

  it('isole les dossiers par propriétaire et compte avec le même filtre', async () => {
    await ticket(owner, 2, 'Chez moi');
    await ticket(other, 1, 'Chez l autre');
    const mine = await threadsPage({ userId: owner });
    expect(mine.total).toBe(1);
    expect(mine.items.every((row) => row.userId === owner)).toBe(true);
    const all = await threadsPage({ kind: { in: ['SUPPORT', 'BETA_FEEDBACK'] } });
    expect(all.total).toBe(2);
  });

  it('borne la page à 50 dossiers même si le client demande plus', async () => {
    const page = await threadsPage({ userId: owner }, { pageSize: 999 });
    expect(page.pageSize).toBe(50);
    expect(page.entryLimit).toBe(THREAD_ENTRY_LIMIT);
  });
});
