import type { PrismaClient } from '@prisma/client';
import { prisma } from '@vululu/db';
import type { MessageRecord, MessageStore } from '@vululu/application';

function mapMessage(row: {
  id: string;
  projectId: string;
  role: string;
  content: string;
  createdAt: Date;
}): MessageRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    role: row.role === 'assistant' ? 'assistant' : 'user',
    content: row.content,
    createdAt: row.createdAt
  };
}

/** Paire user/assistant creee dans une seule transaction. */
export class PrismaMessageStore implements MessageStore {
  constructor(private readonly db: PrismaClient = prisma) {}

  async createPair(input: {
    projectId: string;
    userContent: string;
    assistantContent: string;
  }): Promise<{ userMessage: MessageRecord; assistantMessage: MessageRecord }> {
    return this.db.$transaction(async (tx) => {
      const userMessage = await tx.message.create({
        data: { projectId: input.projectId, role: 'user', content: input.userContent }
      });
      const assistantMessage = await tx.message.create({
        data: { projectId: input.projectId, role: 'assistant', content: input.assistantContent }
      });
      return {
        userMessage: mapMessage(userMessage),
        assistantMessage: mapMessage(assistantMessage)
      };
    });
  }
}
