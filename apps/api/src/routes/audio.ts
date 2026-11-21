import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@vululu/db';
import { rateLimitPreHandler } from '../infrastructure/security/rateLimiter';
import { audioCapabilities } from '../infrastructure/audio/providers';
import {
  applyAudioResult,
  audioHistory,
  audioTranscribeTool,
  audioTtsTool,
  prepareAudioJob
} from '../infrastructure/audio/service';

/**
 * P09B — transcription et voix off : préparation sans dépense, autorisation humaine,
 * exécution worker, application à une nouvelle révision. Aucune clé fournisseur côté client.
 */
export async function audioRoutes(app: FastifyInstance) {
  const auth = {
    preHandler: [
      app.authenticate,
      rateLimitPreHandler({ name: 'audio', limit: 30, windowSeconds: 60, failClosed: true },
        (r) => 'audio:' + r.currentUser!.id)
    ]
  };
  const project = z.object({ project: z.string().min(1).max(128) });
  const operation = project.extend({ id: z.uuid() });
  // Autorisation par compte lue en base : la disponibilité fournisseur ne suffit pas à exécuter.
  app.get('/api/audio/capabilities', { preHandler: [app.authenticate] }, async (r) => {
    const policy = await prisma.executionAccount.findUnique({
      where: { userId: r.currentUser!.id },
      select: { enabled: true, tools: true }
    });
    const caps = audioCapabilities();
    const authorized = (tool: string) => Boolean(policy?.enabled && policy.tools.includes(tool));
    return {
      transcription: { ...caps.transcription, accountAuthorized: authorized(audioTranscribeTool) },
      tts: { ...caps.tts, accountAuthorized: authorized(audioTtsTool) }
    };
  });
  app.post('/api/projects/:project/audio/transcriptions', auth, (r) =>
    prepareAudioJob(r.currentUser!.id, project.parse(r.params).project, audioTranscribeTool, r.body));
  app.post('/api/projects/:project/audio/voiceovers', auth, (r) =>
    prepareAudioJob(r.currentUser!.id, project.parse(r.params).project, audioTtsTool, r.body));
  app.get('/api/projects/:project/audio/jobs', auth, (r) =>
    audioHistory(r.currentUser!.id, project.parse(r.params).project));
  // Application d'un résultat réussi : nouvelle révision, jamais un écrasement.
  app.post('/api/projects/:project/audio/jobs/:id/apply', auth, (r) => {
    const params = operation.parse(r.params);
    return applyAudioResult(r.currentUser!.id, params.project, params.id, r.body);
  });
}
