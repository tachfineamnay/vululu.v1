import { prisma } from '@vululu/db';
import type { z } from 'zod';
import { contextInputSchema } from '@vululu/contracts';
import { HttpError } from '../errors';

type ContextInput = z.infer<typeof contextInputSchema>;

export async function listContexts(userId: string) {
  return prisma.brandContext.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' }
  });
}

export async function getContext(userId: string, contextId: string) {
  const context = await prisma.brandContext.findFirst({
    where: { id: contextId, userId }
  });
  if (!context) {
    throw new HttpError(404, 'context_not_found', 'Contexte introuvable.');
  }
  return context;
}

export async function createContext(userId: string, input: ContextInput) {
  return prisma.brandContext.create({
    data: {
      userId,
      name: input.name,
      website: input.website || null,
      description: input.description,
      audience: input.audience || null,
      tone: input.tone || null,
      colorPrimary: input.colorPrimary || '#6C5CE7',
      colorSecondary: input.colorSecondary || '#00D2FF'
    }
  });
}
