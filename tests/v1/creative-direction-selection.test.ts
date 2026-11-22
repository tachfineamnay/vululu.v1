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
import os from 'node:os';
import path from 'node:path';
import { prisma } from '@vululu/db';
import { CreativeDirections } from '../../apps/api/src/application/creativeDirections';
import { CreativeStudio } from '../../apps/api/src/application/creative';
import { PrismaCreativeDirectionRepository } from '../../apps/api/src/infrastructure/prisma/creativeDirectionRepository';
import { PrismaCreativeRepository } from '../../apps/api/src/infrastructure/prisma/creativeRepository';
import { LocalFilesystemArtifactStorage } from '../../apps/api/src/infrastructure/storage/localArtifactStorage';

const DIGEST = 'a'.repeat(64);
const STALE = 'b'.repeat(64);

function spec(text: string) {
  return {
    schemaVersion: 1 as const,
    width: 1080,
    height: 1080,
    safeArea: 0.05,
    brand: { background: '#163148', accent: '#ffffff' },
    delivery: { kind: 'square' as const, platform: 'Instagram' as const },
    scenes: [{
      key: 'SCENE-001',
      seconds: 2,
      layers: [{
        type: 'text' as const, role: 'headline' as const, text,
        x: 0.1, y: 0.3, w: 0.8, h: 0.3, opacity: 1,
        size: 55, bold: true, color: '#ffffff'
      }]
    }]
  };
}

let user: string;
let other: string;
let project: string;
let context: string;
let directions: CreativeDirections;
let studio: CreativeStudio;

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
      platform: 'Instagram', objective: 'objectif', assetsConfirmationDigest: DIGEST
    }
  });
  for (const version of [1, 2, 3]) {
    await prisma.creativeRevision.create({
      data: {
        projectId: project, version, spec: spec('Direction ' + version),
        label: 'Direction ' + version, origin: 'generated',
        provenance: { schemaVersion: 1, requestId: randomUUID(), assetDecisionDigest: DIGEST }
      }
    });
  }
  directions = new CreativeDirections(new PrismaCreativeDirectionRepository());
  const storage = new LocalFilesystemArtifactStorage(path.join(os.tmpdir(), 'qa-creative-' + randomUUID()));
  studio = new CreativeStudio(new PrismaCreativeRepository(), storage, { local: storage });
});

afterEach(async () => {
  await prisma.auditEvent.deleteMany({ where: { targetId: project } });
  await prisma.creativeRevision.deleteMany({ where: { projectId: project } });
  await prisma.project.deleteMany({ where: { id: project } });
  await prisma.brandContext.deleteMany({ where: { id: context } });
  await prisma.user.deleteMany({ where: { id: { in: [user, other] } } });
});

describe('sélection explicite d une direction artistique', () => {
  it('choisit une direction et la conserve après relecture, sans toucher aux autres', async () => {
    const selected = await directions.select(user, project, { version: 2, expectedSelection: null });
    expect(selected.selectedVersion).toBe(2);
    expect(selected.previousVersion).toBeNull();
    const reread = await directions.list(user, project);
    expect(reread.selectedVersion).toBe(2);
    expect(reread.directions.map((row) => row.version).sort()).toEqual([1, 2, 3]);
    expect(await directions.decisions(user, project)).toEqual({});
  });

  it('refuse une direction rejetée et accepte une autre', async () => {
    await directions.decide(user, project, 1, 'rejected');
    await expect(directions.select(user, project, { version: 1, expectedSelection: null }))
      .rejects.toMatchObject({ statusCode: 409, code: 'direction_rejected' });
    await expect(directions.select(user, project, { version: 3, expectedSelection: null }))
      .resolves.toMatchObject({ selectedVersion: 3 });
  });

  it('ignore le projet d un autre propriétaire', async () => {
    await expect(directions.select(other, project, { version: 2, expectedSelection: null }))
      .rejects.toMatchObject({ statusCode: 404 });
    await expect(directions.selection(other, project)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('sérialise deux sélections concurrentes : une seule gagne', async () => {
    const results = await Promise.allSettled([
      directions.select(user, project, { version: 2, expectedSelection: null }),
      directions.select(user, project, { version: 3, expectedSelection: null })
    ]);
    const fulfilled = results.filter((row) => row.status === 'fulfilled');
    const refused = results.filter((row) => row.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(refused).toHaveLength(1);
    const failure = refused[0] as PromiseRejectedResult;
    expect(failure.reason).toMatchObject({ statusCode: 409 });
    const winner = (fulfilled[0] as PromiseFulfilledResult<{ selectedVersion: number }>).value.selectedVersion;
    expect((await directions.selection(user, project)).selectedVersion).toBe(winner);
  });

  it('refuse les ressources confirmées périmées', async () => {
    await prisma.project.update({ where: { id: project }, data: { assetsConfirmationDigest: STALE } });
    await expect(directions.select(user, project, { version: 2, expectedSelection: null }))
      .rejects.toMatchObject({ statusCode: 409, code: 'direction_stale' });
    expect((await directions.selection(user, project)).selectedVersion).toBeNull();
  });

  it('refuse une révision qui n est pas une direction', async () => {
    await prisma.creativeRevision.create({ data: { projectId: project, version: 4, spec: spec('Sauvegarde brute') } });
    await expect(directions.select(user, project, { version: 4, expectedSelection: null }))
      .rejects.toMatchObject({ statusCode: 409, code: 'direction_not_usable' });
  });

  it('éditer la direction choisie avance le pointeur et conserve l historique', async () => {
    await directions.select(user, project, { version: 2, expectedSelection: null });
    const edited = await studio.save(user, project, 2, spec('Composition éditée'));
    expect(edited.version).toBe(4);
    expect((await directions.selection(user, project)).selectedVersion).toBe(4);
    const rows = await prisma.creativeRevision.findMany({ where: { projectId: project }, orderBy: { version: 'asc' }, select: { version: true, label: true, spec: true } });
    expect(rows.map((row) => row.version)).toEqual([1, 2, 3, 4]);
    expect(rows[1].label).toBe('Direction 2');
    expect(rows[2].label).toBe('Direction 3');
    expect(JSON.stringify(rows[3].spec)).toContain('Composition éditée');
  });

  it('éditer une autre révision ne déplace pas la sélection', async () => {
    await directions.select(user, project, { version: 2, expectedSelection: null });
    const edited = await studio.save(user, project, 3, spec('Autre révision'));
    expect(edited.version).toBe(4);
    expect((await directions.selection(user, project)).selectedVersion).toBe(2);
  });

  it('refuse une base périmée sans écraser la tête', async () => {
    await directions.select(user, project, { version: 2, expectedSelection: null });
    await expect(studio.save(user, project, 1, spec('Base périmée'))).rejects.toMatchObject({
      statusCode: 409,
      code: 'creative_conflict'
    });
    expect(await prisma.creativeRevision.count({ where: { projectId: project } })).toBe(3);
  });
});
