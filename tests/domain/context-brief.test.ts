import { describe, expect, it } from 'vitest';
import {
  briefChecksum,
  createBrandContext,
  createBrief,
  createContextRevision,
  latestBriefRevision,
  latestContextRevision,
  reviseBrief,
} from '../../packages/domain/src/index';
import { captureDomainError, T0, T1, T2, T3 } from './fixtures';

const contextInput = {
  id: 'context-1',
  userId: 'user-1',
  name: 'Vululu Test',
  website: 'https://example.com',
  description: 'Contexte de marque initial',
  audience: 'Createurs',
  tone: 'Direct',
  colorPrimary: '#6C5CE7',
  colorSecondary: '#00D2FF'
};

const briefContent = {
  objective: 'Faire connaitre le produit',
  audience: 'Createurs',
  tone: 'Direct',
  cta: 'Decouvrir',
  platform: 'Instagram' as const,
  format: 'Video' as const
};

describe('Context : révisions immuables scellées par checksum', () => {
  it('creates a frozen brand context with defaults', () => {
    const context = createBrandContext({ id: 'context-2', userId: 'user-1', name: 'Marque', description: 'Description' });
    expect(context.colorPrimary).toBe('#6C5CE7');
    expect(context.colorSecondary).toBe('#00D2FF');
    expect(context.website).toBeNull();
    expect(Object.isFrozen(context)).toBe(true);
  });

  it('appends immutable context revisions with real checksums', () => {
    const context = createBrandContext(contextInput);
    const first = createContextRevision({ id: 'ctx-rev-1', context, revisions: [], createdAt: T0 });
    expect(first.version.version).toBe(1);
    expect(first.version.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(first.version.snapshot.name).toBe('Vululu Test');
    expect(Object.isFrozen(first.version)).toBe(true);
    expect(Object.isFrozen(first.version.snapshot)).toBe(true);

    const updated = createBrandContext({ ...contextInput, description: 'Contexte revu' });
    const second = createContextRevision({
      id: 'ctx-rev-2',
      context: updated,
      revisions: first.versions,
      createdAt: T1
    });
    expect(second.version.version).toBe(2);
    expect(second.version.checksum).not.toBe(first.version.checksum);
    expect(first.version.snapshot.description).toBe('Contexte de marque initial');
    expect(first.versions).toHaveLength(1);
    expect(latestContextRevision(second.versions)?.version).toBe(2);
  });

  it('checksums the snapshot only, not ids or technical fields', () => {
    const left = createBrandContext({ ...contextInput, id: 'context-1' });
    const right = createBrandContext({ ...contextInput, id: 'context-2', userId: 'user-2' });
    const leftRevision = createContextRevision({ id: 'ctx-rev-l', context: left, revisions: [], createdAt: T0 });
    const rightRevision = createContextRevision({ id: 'ctx-rev-r', context: right, revisions: [], createdAt: T2 });
    expect(leftRevision.version.checksum).toBe(rightRevision.version.checksum);
  });

  it('rejects an invalid context', () => {
    expect(
      captureDomainError(() => createBrandContext({ id: 'id', userId: 'u', name: ' ', description: 'ok' })).code
    ).toBe('invalid_input');
  });
});

describe('Brief : révisions append-only et checksum de contenu', () => {
  it('creates a brief and its first immutable revision', () => {
    const created = createBrief({
      id: 'brief-1',
      projectId: 'project-1',
      revisionId: 'brief-rev-1',
      content: briefContent,
      createdAt: T0
    });
    expect(created.brief.currentVersion).toBe(1);
    expect(created.revision.version).toBe(1);
    expect(created.revision.checksum).toBe(briefChecksum(briefContent));
    expect(created.revision.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(created.revision)).toBe(true);
    expect(created.revisions).toHaveLength(1);
  });

  it('appends a second revision without modifying the first', () => {
    const created = createBrief({
      id: 'brief-1',
      projectId: 'project-1',
      revisionId: 'brief-rev-1',
      content: briefContent,
      createdAt: T0
    });
    const revised = reviseBrief({
      brief: created.brief,
      revisions: created.revisions,
      revisionId: 'brief-rev-2',
      content: { ...briefContent, objective: 'Faire connaitre le produit v2' },
      createdAt: T1
    });

    expect(revised.brief.currentVersion).toBe(2);
    expect(revised.revision.version).toBe(2);
    expect(revised.revisions).toHaveLength(2);
    expect(revised.revisions[0]).toBe(created.revisions[0]);
    expect(revised.revisions[0].objective).toBe('Faire connaitre le produit');
    expect(revised.revision.checksum).not.toBe(created.revision.checksum);
    expect(created.revisions).toHaveLength(1);
    expect(latestBriefRevision(revised.revisions)?.version).toBe(2);
  });

  it('gives the same checksum to identical content and a new version to every write', () => {
    const created = createBrief({
      id: 'brief-1',
      projectId: 'project-1',
      revisionId: 'brief-rev-1',
      content: briefContent,
      createdAt: T0
    });
    const revised = reviseBrief({
      brief: created.brief,
      revisions: created.revisions,
      revisionId: 'brief-rev-2',
      content: briefContent,
      createdAt: T2
    });
    expect(revised.revision.version).toBe(2);
    expect(revised.revision.checksum).toBe(created.revision.checksum);
  });

  it('rejects incomplete brief content', () => {
    expect(
      captureDomainError(() =>
        createBrief({
          id: 'brief-1',
          projectId: 'project-1',
          revisionId: 'brief-rev-1',
          content: { ...briefContent, cta: '   ' },
          createdAt: T3
        })
      ).code
    ).toBe('invalid_input');
  });

  it('validates the platform and format enums', () => {
    expect(
      captureDomainError(() =>
        createBrief({
          id: 'brief-1',
          projectId: 'project-1',
          revisionId: 'brief-rev-1',
          content: { ...briefContent, platform: 'Facebook' as never },
          createdAt: T0
        })
      ).code
    ).toBe('invalid_input');
  });
});
