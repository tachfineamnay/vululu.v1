import { z } from 'zod';
import { prisma } from '@vululu/db';
import { evaluateAssetDecision } from '@vululu/application';
import { creativeDirectionInput } from '@vululu/contracts';
import { CreativeStudio } from '../../application/creative';
import { CreativeDirections } from '../../application/creativeDirections';
import { PrismaCreativeRepository } from '../prisma/creativeRepository';
import { PrismaCreativeDirectionRepository } from '../prisma/creativeDirectionRepository';
import { readAssetDecisionRow } from '../prisma/assetDecisionRepository';
import { runPythonCapability } from '../python/adapter';
import { runImageEdit } from '../imageEditing/service';
import { runAudioJob } from '../audio/service';
import { createArtifactStorage, createArtifactStorageRegistry } from '../storage/storageFactory';
import type { EnginePort } from './registry';
import { dispatchPublication } from '../publishing/service';
import { PostizProvider } from '../publishing/provider';
import { generateAssistantClaim } from '../assistant/service';
import { generateClaim } from '../marketing/service';
import { dispatchMedia } from '../mediaGeneration/service';
import { recover } from './broker';
// Closed dispatch table. External media and publishing are reached only through a reserved claim.
export function studioEngine(creativeStudio: CreativeStudio): EnginePort {
  return {
    async invoke(job, signal) {
      signal.throwIfAborted();
      switch (job.tool) {
        case 'media.image@1':
        case 'media.video@1':
          return dispatchMedia(job, signal);
        case 'assistant.draft@1':
          return generateAssistantClaim(job, signal);
        case 'marketing.plan@1':
          return generateClaim(job, signal);
        case 'postiz.schedule@1':
        case 'postiz.cancel@1':
          return dispatchPublication(job, creativeStudio, new PostizProvider(), signal);
        case 'studio.inspect@1':
          await creativeStudio.get(job.accountId, job.projectId, job.revision);
          return { costCents: 0 };
        case 'studio.render@1':
          await creativeStudio.render(job.accountId, job.projectId, job.revision);
          return { costCents: 0 };
        case 'sandbox.generate@1':
        case 'sandbox.publish@1':
          return { costCents: job.maxCents }; // synthetic units only; never publishes
        case 'project.summary@1': {
          const project = await prisma.project.findFirst({
            where: { id: job.projectId, userId: job.accountId },
            select: { id: true, title: true, objective: true, platform: true, format: true, status: true, assetsConfirmationDigest: true }
          });
          if (!project) return { failed: { code: 'execution_project_missing', message: 'Projet introuvable.' } };
          return { costCents: 0, result: { projectId: project.id, title: project.title, objective: project.objective,
            platform: project.platform, format: project.format, status: project.status,
            assetDecisionDigest: project.assetsConfirmationDigest ?? null } };
        }
        case 'assets.list@1': {
          const decision = await confirmedDecision(job);
          if (!decision) return { failed: { code: 'assets_required', message: 'Ressources non confirmées.' } };
          return { costCents: 0, result: { decision: decision.noAssets ? 'none' : 'assets', digest: decision.digest,
            items: (decision.snapshot?.items ?? []).map((item) => ({ versionId: item.versionId, name: item.name, kind: item.kind, sha256: item.sha256, license: item.license })) } };
        }
        case 'assets.inspect@1': {
          const decision = await confirmedDecision(job);
          if (!decision) return { failed: { code: 'assets_required', message: 'Ressources non confirmées.' } };
          const input = z.strictObject({ versionId: z.string().min(1).max(128) }).parse(job.params);
          const item = decision.snapshot?.items.find((candidate) => candidate.versionId === input.versionId);
          if (!item) return { failed: { code: 'asset_version_not_confirmed', message: 'Ressource hors sélection confirmée.' } };
          return { costCents: 0, result: { versionId: item.versionId, name: item.name, kind: item.kind, mimeType: item.mimeType, sha256: item.sha256, license: item.license, provenance: item.provenance } };
        }
        case 'creative.direction@1': {
          const input = creativeDirectionInput.parse(job.params);
          const created = await new CreativeDirections(new PrismaCreativeDirectionRepository()).create(job.accountId, job.projectId, input);
          return { costCents: 0, result: { created: created.created ?? [], count: created.directions.length } };
        }
        case 'image.analyze@1':
        case 'image.segment@1':
        case 'audio.analyze@1':
          return runPythonCapability({ id: job.id, accountId: job.accountId, projectId: job.projectId,
            tool: job.tool, maxCents: job.maxCents, params: job.params });
        case 'audio.transcribe@1':
        case 'audio.tts@1':
          return runAudioJob({ id: job.id, accountId: job.accountId, projectId: job.projectId,
            tool: job.tool, maxCents: job.maxCents, params: job.params }, signal);
        case 'media.image.edit@1':
          return runImageEdit({ id: job.id, accountId: job.accountId, projectId: job.projectId,
            maxCents: job.maxCents, params: job.params }, signal);
        default:
          throw new Error('unregistered_tool');
      }
    }
  };
}
async function confirmedDecision(job: { projectId: string; accountId: string }) {
  const row = await readAssetDecisionRow(prisma, job.projectId, job.accountId);
  if (!row) return null;
  const state = evaluateAssetDecision(row);
  return state.confirmed ? state : null;
}
export const engine = studioEngine(
  new CreativeStudio(new PrismaCreativeRepository(), createArtifactStorage(), createArtifactStorageRegistry())
);
export const workflowName = 'vululu-secure-execution-v1';
// QUEUED is the transactional outbox. Retry the notification, never the claimed effect.
export async function notifyQueued(send: (id: string) => Promise<string>) {
  await recover();
  const now = new Date();
  const rows = await prisma.executionOperation.findMany({
    where: { state: { in: ['QUEUED', 'POLLING'] }, notifyAfter: { lte: now } },
    orderBy: { notifyAfter: 'asc' },
    select: { id: true, correlationId: true },
    take: 20
  });
  for (const { id, correlationId } of rows) {
    const lease = await prisma.executionOperation.updateMany({
      where: { id, state: { in: ['QUEUED', 'POLLING'] }, notifyAfter: { lte: now } },
      data: { notifyAfter: new Date(Date.now() + 60000) }
    });
    if (lease.count) {
      const workflowRunId = await send(id);
      await prisma.auditEvent.create({
        data: {
          targetType: 'execution',
          targetId: id,
          traceId: correlationId,
          action: 'execution.notified',
          metadata: { workflowRunId }
        }
      });
    }
  }
}
