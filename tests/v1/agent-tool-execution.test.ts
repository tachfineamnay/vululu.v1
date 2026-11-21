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
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prisma } from '@vululu/db';
import { approve, cancel, execute, proposeTx } from '../../apps/api/src/infrastructure/execution/broker';
import { tools, type Tool } from '../../apps/api/src/infrastructure/execution/registry';

/**
 * P12-06 — chaîne complète recommandation → validation → proposition → autorisation → réservation.
 * Ces cas portent sur l’AUTORITÉ serveur : l’agent ne peut pas choisir un outil réservé, un schéma
 * invalide, une ressource non confirmée, ni contourner l’approbation humaine.
 */

let user: string;
let other: string;
let project: string;
let context: string;
let version: string;
let store: string;

const PROPOSABLE: Tool = 'image.analyze@1';
const SIDE_EFFECT: Tool = 'creative.direction@1';

beforeEach(async () => {
  user = randomUUID();
  other = randomUUID();
  project = randomUUID();
  await prisma.user.createMany({
    data: [user, other].map((id) => ({ id, email: id + '@example.test', name: 'QA', passwordHash: 'unused', role: 'user' }))
  });
  context = (await prisma.brandContext.create({ data: { userId: user, name: 'Atelier QA', description: 'test' } })).id;
  await prisma.project.create({
    data: {
      id: project, userId: user, contextId: context, title: 'Projet QA', format: 'Post',
      platform: 'Instagram', objective: 'objectif', assetsConfirmationDigest: 'a'.repeat(64)
    }
  });
  const asset = await prisma.brandAsset.create({ data: { id: randomUUID(), userId: user, contextId: context, kind: 'image', name: 'photo' } });
  store = path.join(os.tmpdir(), 'qa-agent-' + randomUUID());
  await fs.mkdir(store, { recursive: true });
  const file = path.join(store, 'source.png');
  await fs.writeFile(file, Buffer.from('fake-png-bytes'));
  version = (await prisma.brandAssetVersion.create({
    data: {
      id: randomUUID(), assetId: asset.id, version: 1, state: 'ready', mimeType: 'image/png',
      name: 'photo v1', sha256: 'b'.repeat(64), sizeBytes: 14, license: 'internal',
      storageKey: 'qa/' + randomUUID() + '.png', storageProvider: 'local', metadata: { width: 64, height: 64 }
    }
  })).id;
  await prisma.projectAssetSelection.create({ data: { projectId: project, assetId: asset.id, assetVersionId: version } });
  await prisma.executionAccount.create({
    data: { userId: user, limitCents: 100, enabled: true, tools: Object.keys(tools) }
  });
});

afterEach(async () => {
  await prisma.executionOperation.deleteMany({ where: { accountId: { in: [user, other] } } });
  await prisma.executionAccount.deleteMany({ where: { userId: { in: [user, other] } } });
  await prisma.projectAssetSelection.deleteMany({ where: { projectId: project } });
  await prisma.brandAssetVersion.deleteMany({ where: { id: version } });
  await prisma.brandAsset.deleteMany({ where: { userId: user } });
  await prisma.executionOperation.deleteMany({ where: { projectId: project } });
  await prisma.auditEvent.deleteMany({ where: { OR: [{ actorId: { in: [user, other] } }, { targetId: project }] } });
  await prisma.project.deleteMany({ where: { id: project } });
  await prisma.brandContext.deleteMany({ where: { id: context } });
  await prisma.user.deleteMany({ where: { id: { in: [user, other] } } });
  await fs.rm(store, { recursive: true, force: true });
});

const agentProposal = (tool: Tool, params: unknown, key = randomUUID()) =>
  proposeTx(prisma, user, project, { key, tool, revision: 1 }, { agentTurnId: randomUUID(), step: 0, params });

describe('chaîne d exécution outillée : autorité serveur', () => {
  it('refuse un outil réservé à l’utilisateur même si l’agent le recommande', async () => {
    await expect(
      agentProposal('media.image.edit@1', {
        requestId: randomUUID(), prompt: 'rends le fond bleu', aspectRatio: '1:1',
        rightsConfirmed: true, preserveSubject: true
      })
    ).rejects.toMatchObject({ statusCode: 403, code: 'tool_not_proposable' });
    expect(await prisma.executionOperation.count({ where: { accountId: user } })).toBe(0);
  });

  it('refuse des paramètres non conformes au schéma de l’outil', async () => {
    await expect(agentProposal(PROPOSABLE, { versionId: 'x', unexpected: true }))
      .rejects.toMatchObject({ statusCode: 422, code: 'agent_params_invalid' });
    await expect(agentProposal(PROPOSABLE, {})).rejects.toMatchObject({ statusCode: 422 });
    expect(await prisma.executionOperation.count({ where: { accountId: user } })).toBe(0);
  });

  it('refuse une ressource absente de la sélection confirmée', async () => {
    await expect(agentProposal(PROPOSABLE, { versionId: randomUUID() }))
      .rejects.toMatchObject({ statusCode: 422, code: 'asset_not_confirmed' });
    expect(await prisma.executionOperation.count({ where: { accountId: user } })).toBe(0);
  });

  it('accepte une recommandation conforme et conserve les paramètres validés', async () => {
    const operation = await agentProposal(PROPOSABLE, { versionId: version });
    expect(operation).toMatchObject({ tool: PROPOSABLE, accountId: user, projectId: project });
    expect(operation.params).toEqual({ versionId: version });
  });

  it('idempotence : même clé et mêmes paramètres rendent la même opération, une clé réutilisée avec d’autres paramètres est refusée', async () => {
    const key = randomUUID();
    const first = await agentProposal(PROPOSABLE, { versionId: version }, key);
    const second = await agentProposal(PROPOSABLE, { versionId: version }, key);
    expect(second.id).toBe(first.id);
    await expect(agentProposal(PROPOSABLE, { versionId: randomUUID() }, key))
      .rejects.toMatchObject({ statusCode: 409, code: 'key_payload_conflict' });
    expect(await prisma.executionOperation.count({ where: { accountId: user } })).toBe(1);
  });

  it('refuse un outil non autorisé pour ce compte', async () => {
    await prisma.executionAccount.update({ where: { userId: user }, data: { tools: [] } });
    await expect(agentProposal(PROPOSABLE, { versionId: version }))
      .rejects.toMatchObject({ statusCode: 403, code: 'tool_disabled' });
  });

  it('refuse la recommandation sur le projet d’un autre propriétaire', async () => {
    await expect(
      proposeTx(prisma, other, project, { key: randomUUID(), tool: PROPOSABLE, revision: 1 },
        { agentTurnId: randomUUID(), step: 0, params: { versionId: version } })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('exige une autorisation humaine pour un outil à effet de bord', async () => {
    const operation = await agentProposal(SIDE_EFFECT, { requestId: randomUUID(), mode: 'generate' });
    expect(operation).toMatchObject({ state: 'PROPOSED', approvedBy: null });
    // Sans autorisation, le worker ne peut pas réclamer ni exécuter.
    const invocations: number[] = [];
    await execute(operation.id, { async invoke() { invocations.push(1); return { costCents: 0, costBasis: 'none' as const }; } });
    expect(invocations).toHaveLength(0);
    await expect(approve(other, operation.id, operation.digest)).rejects.toMatchObject({ statusCode: 404 });
    await expect(approve(user, operation.id, '0'.repeat(64))).rejects.toMatchObject({ statusCode: 409, code: 'approval_mismatch' });
    const approved = await approve(user, operation.id, operation.digest);
    expect(approved).toMatchObject({ state: 'QUEUED', approvedBy: user });
    // Autoriser deux fois la même opération ne réserve pas deux fois.
    await approve(user, operation.id, operation.digest);
    expect((await prisma.executionAccount.findUniqueOrThrow({ where: { userId: user } })).reservedCents)
      .toBe(tools[SIDE_EFFECT].maxCents);
  });

  it('annule une proposition sans consommer de budget, puis refuse de l’exécuter', async () => {
    const operation = await agentProposal(SIDE_EFFECT, { requestId: randomUUID(), mode: 'generate' });
    await cancel(user, operation.id);
    const row = await prisma.executionOperation.findUniqueOrThrow({ where: { id: operation.id } });
    expect(row).toMatchObject({ state: 'CANCELLED', costState: 'RELEASED' });
    const invocations: number[] = [];
    await execute(operation.id, { async invoke() { invocations.push(1); return { costCents: 0, costBasis: 'none' as const }; } });
    expect(invocations).toHaveLength(0);
  });
});
