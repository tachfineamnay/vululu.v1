import crypto from 'node:crypto';
import { ContextUseCases, ProjectUseCases, type Actor } from '@vululu/application';
import {
  PrismaContextRepository,
  PrismaProjectRepository
} from '../infrastructure';

const clock = { now: () => new Date() };
const ids = { next: () => crypto.randomUUID() };

const contextRepository = new PrismaContextRepository();
const projectRepository = new PrismaProjectRepository();

export const contexts = new ContextUseCases(contextRepository, clock, ids);
export const projects = new ProjectUseCases(projectRepository, contextRepository, clock, ids);

export function actorOf(user: { id: string; role: string } | undefined): Actor {
  if (!user) {
    throw new Error('actor_required');
  }
  return {
    id: user.id,
    role: user.role === 'super_admin' ? 'super_admin' : 'user'
  };
}
