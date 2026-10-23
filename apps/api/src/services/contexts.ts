import { prisma } from '@vululu/db';
import type { z } from 'zod';
import { contextInputSchema } from '@vululu/contracts';

type ContextInput = z.infer<typeof contextInputSchema>;

const contextSelect = {
  id: true,
  name: true,
  website: true,
  description: true,
  audience: true,
  tone: true,
  colorPrimary: true,
  colorSecondary: true,
  createdAt: true,
  updatedAt: true
} as const;

export async function listContexts(userId: string) {
  return prisma.brandContext.findMany({
    where: { userId },
    select: contextSelect,
    orderBy: { updatedAt: 'desc' }
  });
}

export async function createContext(userId: string, input: ContextInput) {
  return prisma.brandContext.create({
    select: contextSelect,
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