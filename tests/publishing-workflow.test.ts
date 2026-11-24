import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequire = createRequire(new URL('../apps/api/package.json', import.meta.url));
const Fastify = apiRequire('fastify') as () => FastifyInstance;
const { Prisma } = apiRequire('@prisma/client') as { Prisma: { DbNull: unknown; JsonNull: unknown } };

const mockPrisma = vi.hoisted(() => ({
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
  contentItem: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    groupBy: vi.fn()
  },
  contentRevision: {
    findMany: vi.fn()
  },
  creativeRevision: {
    findFirst: vi.fn(),
    findMany: vi.fn()
  },
  publishingConnection: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    upsert: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn()
  },
  publicationRequest: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    groupBy: vi.fn(),
    count: vi.fn()
  },
  publicationEvent: {
    findUnique: vi.fn(),
    create: vi.fn()
  },
  executionOperation: {
    count: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn()
  },
  executionAccount: {
    findUnique: vi.fn()
  },
  resultPreference: {
    findUnique: vi.fn(),
    upsert: vi.fn()
  },
  resultEvent: {
    deleteMany: vi.fn()
  },
  postMeasure: {
    deleteMany: vi.fn()
  },
  confirmedOffer: {
    findMany: vi.fn()
  },
  campaign: {
    findMany: vi.fn()
  }
}));

const mockPropose = vi.hoisted(() => vi.fn());
const mockCancel = vi.hoisted(() => vi.fn());

vi.mock('@vululu/db', () => ({ prisma: mockPrisma }));
vi.mock('../apps/api/src/infrastructure/execution/broker', () => ({
  propose: mockPropose,
  cancel: mockCancel
}));
vi.mock('../apps/api/src/application/container', () => ({
  creativeStudio: { read: vi.fn() }
}));
vi.mock('../apps/api/src/infrastructure/security/rateLimiter', () => ({
  rateLimitPreHandler: () => async () => {}
}));

import { HttpError } from '../apps/api/src/errors';
import {
  hasRenderedManifest,
  isCompatibleArtifactFormat,
  preview
} from '../apps/api/src/infrastructure/publishing/delivery';
import {
  PostizProvider,
  type PublishingProvider
} from '../apps/api/src/infrastructure/publishing/provider';
import {
  cipher,
  command,
  prepare,
  reconcilePublication,
  resolveUnknownPublication,
  retryPreparation
} from '../apps/api/src/infrastructure/publishing/service';
import { publishingRoutes } from '../apps/api/src/routes/publishing';
import { resultsRoutes } from '../apps/api/src/routes/results';
import { missing, normalizePost, readPost } from '../apps/api/src/infrastructure/results/provider';
import { report } from '../apps/api/src/infrastructure/results/store';

const OWNER = 'user-a03';
const ITEM_ID = '11111111-1111-4111-8111-111111111111';
const CONN_ID = '22222222-2222-4222-8222-222222222222';
const REQ_ID = '33333333-3333-4333-8333-333333333333';
const PROJ_ID = '44444444-4444-4444-8444-444444444444';
const FUTURE = new Date(Date.now() + 7_200_000);
const PAST = new Date(Date.now() - 7_200_000);

function validSpec(overrides?: { kind?: 'square' | 'portrait' | 'story' | 'carousel' | 'short' | 'landscape'; platform?: 'LinkedIn' | 'Instagram' | 'Facebook' | 'TikTok' | 'Google Business Profile'; version?: number }) {
  const kind = overrides?.kind ?? 'square';
  const dims =
    kind === 'story' || kind === 'short'
      ? { width: 1080, height: 1920 }
      : kind === 'portrait'
        ? { width: 1080, height: 1350 }
        : kind === 'landscape'
          ? { width: 1920, height: 1080 }
          : { width: 1080, height: 1080 };
  return {
    schemaVersion: 1,
    ...dims,
    safeArea: 0.05,
    brand: { background: '#111111', accent: '#ffffff' },
    delivery: {
      kind,
      platform: overrides?.platform ?? 'LinkedIn',
      calendar: { itemId: ITEM_ID, version: overrides?.version ?? 1 }
    },
    scenes: [
      {
        key: 'SCENE-001',
        seconds: 4,
        layers: [
          {
            type: 'text',
            role: 'headline',
            text: 'Lancement',
            x: 0.1,
            y: 0.2,
            w: 0.8,
            h: 0.2,
            size: 48,
            bold: true,
            color: '#ffffff',
            opacity: 1
          }
        ]
      }
    ]
  };
}

function sampleItem(overrides?: Partial<{ status: string; archived: boolean; version: number; plannedAt: Date; format: string; platform: string }>) {
  const platform = overrides?.platform ?? 'LinkedIn';
  const format = overrides?.format ?? 'Affiche';
  return {
    id: ITEM_ID,
    userId: OWNER,
    projectId: PROJ_ID,
    version: overrides?.version ?? 1,
    status: overrides?.status ?? 'APPROVED',
    archived: overrides?.archived ?? false,
    plannedAt: overrides?.plannedAt ?? FUTURE,
    variants: [{ platform, format, caption: 'Annonce vérifiée', cta: 'Découvrir', hashtags: ['#vululu'] }]
  };
}

function sampleConnection(overrides?: Partial<{ platform: string; revoked: boolean; expiresAt: Date; token: string }>) {
  const token = overrides?.token ?? 'fixture-api-token-secret';
  return {
    id: CONN_ID,
    ownerId: OWNER,
    provider: 'postiz',
    platform: overrides?.platform ?? 'LinkedIn',
    channel: 'chan-linkedin-1',
    displayName: 'Atelier LinkedIn',
    revoked: overrides?.revoked ?? false,
    expiresAt: overrides?.expiresAt ?? new Date(Date.now() + 86_400_000),
    tokenCipher: cipher.encrypt(token, CONN_ID + ':token'),
    hookCipher: ''
  };
}

function setupApprovedPreviewMocks(options?: {
  item?: ReturnType<typeof sampleItem>;
  rev?: { manifest: unknown; approvedAt: Date | null; spec: unknown } | null;
}) {
  const item = options?.item ?? sampleItem();
  mockPrisma.contentItem.findFirst.mockResolvedValue(item);
  mockPrisma.contentRevision.findMany.mockResolvedValue([
    {
      version: item.version,
      snapshot: {
        plannedAt: item.plannedAt.toISOString(),
        archived: item.archived,
        variants: item.variants
      }
    }
  ]);
  mockPrisma.creativeRevision.findFirst.mockResolvedValue(
    options?.rev === undefined
      ? { manifest: { master: { sha256: 'abc' } }, approvedAt: new Date(), spec: validSpec() }
      : options.rev
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('PUBLISHING_ENCRYPTION_KEY', randomBytes(32).toString('base64'));
  vi.stubEnv('POSTIZ_PUBLISH_ENABLED', '0');
  vi.stubEnv('POSTIZ_ANALYTICS_ENABLED', '0');
  mockPrisma.$transaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg === 'function') return (arg as (tx: typeof mockPrisma) => Promise<unknown>)(mockPrisma);
    if (Array.isArray(arg)) return Promise.all(arg);
    return [];
  });
  mockPrisma.resultEvent.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.postMeasure.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.$queryRaw.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('1. Approval gates & compatible artifact versions', () => {
  it('validates rendered manifest presence and calendar-to-artifact format compatibility', () => {
    expect(hasRenderedManifest({ master: {} })).toBe(true);
    expect(hasRenderedManifest(null)).toBe(false);
    expect(hasRenderedManifest(undefined)).toBe(false);
    expect(hasRenderedManifest(Prisma.DbNull)).toBe(false);
    expect(hasRenderedManifest(Prisma.JsonNull)).toBe(false);
    expect(hasRenderedManifest([])).toBe(false);

    expect(isCompatibleArtifactFormat('Affiche', 'square')).toBe(true);
    expect(isCompatibleArtifactFormat('Affiche', 'portrait')).toBe(true);
    expect(isCompatibleArtifactFormat('Story', 'story')).toBe(true);
    expect(isCompatibleArtifactFormat('Carrousel', 'carousel')).toBe(true);
    expect(isCompatibleArtifactFormat('Reel', 'short')).toBe(true);
    expect(isCompatibleArtifactFormat('Video', 'short')).toBe(true);
    expect(isCompatibleArtifactFormat('Video', 'landscape')).toBe(true);

    // Legacy unsupported format and cross-format mismatches must be rejected.
    expect(isCompatibleArtifactFormat('Motion', 'short')).toBe(false);
    expect(isCompatibleArtifactFormat('Affiche', 'short')).toBe(false);
    expect(isCompatibleArtifactFormat('Reel', 'square')).toBe(false);
    expect(isCompatibleArtifactFormat('Carrousel', 'portrait')).toBe(false);
  });

  it('rejects unapproved or unrendered creative revisions and drifted calendar versions', async () => {
    setupApprovedPreviewMocks({ rev: { manifest: Prisma.DbNull, approvedAt: new Date(), spec: validSpec() } });
    await expect(preview(OWNER, ITEM_ID, 1)).rejects.toMatchObject({ statusCode: 409, code: 'approved_revision_required' });

    setupApprovedPreviewMocks({ rev: { manifest: { ok: true }, approvedAt: null, spec: validSpec() } });
    await expect(preview(OWNER, ITEM_ID, 1)).rejects.toMatchObject({ statusCode: 409, code: 'approved_revision_required' });

    setupApprovedPreviewMocks({ rev: { manifest: { ok: true }, approvedAt: new Date(), spec: validSpec({ version: 99 }) } });
    await expect(preview(OWNER, ITEM_ID, 1)).rejects.toMatchObject({ statusCode: 409, code: 'calendar_changed' });
  });

  it('flags editorial approval, unsupported legacy formats, mismatched artifact formats, and manual-only targets', async () => {
    setupApprovedPreviewMocks({ item: sampleItem({ status: 'DRAFT' }) });
    const draft = await preview(OWNER, ITEM_ID, 1);
    expect(draft.issues).toContain('editorial_approval_required');

    setupApprovedPreviewMocks({ item: sampleItem({ format: 'Motion' }) });
    const unsupported = await preview(OWNER, ITEM_ID, 1);
    expect(unsupported.issues).toContain('unsupported_format');

    setupApprovedPreviewMocks({
      item: sampleItem({ format: 'Reel' }),
      rev: { manifest: { ok: true }, approvedAt: new Date(), spec: validSpec({ kind: 'square' }) }
    });
    const mismatched = await preview(OWNER, ITEM_ID, 1);
    expect(mismatched.issues).toContain('incompatible_artifact_format');

    setupApprovedPreviewMocks({ item: sampleItem({ status: 'APPROVED', format: 'Affiche' }) });
    const tiktok = await preview(OWNER, ITEM_ID, 1, 'TikTok');
    expect(tiktok.direct).toBe(false);
    expect(tiktok.directReason).toBe('platform_manual_only');
    expect(tiktok.supportedScheduledKinds).toEqual([]);

    setupApprovedPreviewMocks({
      item: sampleItem({ status: 'APPROVED', format: 'Story', platform: 'Instagram' }),
      rev: { manifest: { ok: true }, approvedAt: new Date(), spec: validSpec({ kind: 'story', platform: 'Instagram' }) }
    });
    const story = await preview(OWNER, ITEM_ID, 1, 'Instagram');
    expect(story.issues).toEqual([]);
    expect(story.direct).toBe(false);
    expect(story.directReason).toBe('format_not_supported_for_direct');
    expect(story.supportedScheduledKinds).toEqual(['square', 'portrait']);
  });
});

describe('2. Idempotent schedule/cancel operations & duplicate submission protection', () => {
  it('reuses PREPARED schedule operation idempotently, rotates key after local withdrawal, and rejects duplicate prep on active/unknown/failed rows', async () => {
    const conn = sampleConnection();
    setupApprovedPreviewMocks();
    mockPrisma.publishingConnection.findFirst.mockResolvedValue(conn);
    mockPrisma.publicationRequest.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: REQ_ID,
        projectId: PROJ_ID,
        revision: 1,
        itemId: ITEM_ID,
        itemVersion: 1,
        connectionId: CONN_ID,
        submitKey: 'sub-key-1',
        cancelKey: 'can-key-1',
        state: 'PREPARED',
        remoteId: null,
        scheduledAt: FUTURE,
        connection: conn
      });
    mockPrisma.publicationRequest.upsert.mockResolvedValue({
      id: REQ_ID,
      projectId: PROJ_ID,
      revision: 1,
      itemId: ITEM_ID,
      itemVersion: 1,
      connectionId: CONN_ID,
      submitKey: 'sub-key-1',
      cancelKey: 'can-key-1',
      state: 'PREPARED'
    });
    mockPrisma.executionOperation.count.mockResolvedValue(0);
    mockPropose.mockResolvedValue({ id: 'op-1', digest: 'dig-1', state: 'PROPOSED' });

    const first = await prepare(OWNER, ITEM_ID, 1, CONN_ID);
    expect(first).toEqual({ id: REQ_ID, operationId: 'op-1', digest: 'dig-1', state: 'PROPOSED' });

    // Existing UNKNOWN row must block blind re-preparation to prevent duplicate publishing.
    mockPrisma.publicationRequest.findFirst.mockReset();
    mockPrisma.publicationRequest.findFirst.mockResolvedValueOnce(null);
    mockPrisma.publicationRequest.upsert.mockResolvedValueOnce({
      id: REQ_ID,
      projectId: PROJ_ID,
      revision: 1,
      itemId: ITEM_ID,
      itemVersion: 1,
      connectionId: CONN_ID,
      submitKey: 'sub-key-1',
      cancelKey: 'can-key-1',
      state: 'UNKNOWN'
    });
    await expect(prepare(OWNER, ITEM_ID, 1, CONN_ID)).rejects.toMatchObject({
      statusCode: 409,
      code: 'publication_outcome_unknown'
    });

    // Existing SUBMITTED row must reject duplicate preparation.
    mockPrisma.publicationRequest.findFirst.mockResolvedValueOnce(null);
    mockPrisma.publicationRequest.upsert.mockResolvedValueOnce({
      id: REQ_ID,
      projectId: PROJ_ID,
      revision: 1,
      itemId: ITEM_ID,
      itemVersion: 1,
      connectionId: CONN_ID,
      submitKey: 'sub-key-1',
      cancelKey: 'can-key-1',
      state: 'SUBMITTED'
    });
    await expect(prepare(OWNER, ITEM_ID, 1, CONN_ID)).rejects.toMatchObject({
      statusCode: 409,
      code: 'existing_publication'
    });

    // Existing FAILED row must direct through retryPreparation, not blind prepare.
    mockPrisma.publicationRequest.findFirst.mockResolvedValueOnce(null);
    mockPrisma.publicationRequest.upsert.mockResolvedValueOnce({
      id: REQ_ID,
      projectId: PROJ_ID,
      revision: 1,
      itemId: ITEM_ID,
      itemVersion: 1,
      connectionId: CONN_ID,
      submitKey: 'sub-key-1',
      cancelKey: 'can-key-1',
      state: 'FAILED'
    });
    await expect(prepare(OWNER, ITEM_ID, 1, CONN_ID)).rejects.toMatchObject({
      statusCode: 409,
      code: 'retry_required'
    });
  });

  it('preserves idempotent cancellation and rotates cancelKey if a prior local cancel was withdrawn', async () => {
    const conn = sampleConnection();
    const submittedRow = {
      id: REQ_ID,
      projectId: PROJ_ID,
      revision: 1,
      itemId: ITEM_ID,
      itemVersion: 1,
      connectionId: CONN_ID,
      submitKey: 'sub-key-1',
      cancelKey: 'can-key-1',
      state: 'SUBMITTED',
      remoteId: 'remote-123',
      scheduledAt: FUTURE,
      connection: conn
    };

    // Idempotent active cancel
    mockPrisma.publicationRequest.findFirst.mockResolvedValueOnce(submittedRow);
    mockPrisma.executionOperation.count.mockResolvedValueOnce(0);
    mockPropose.mockResolvedValueOnce({ id: 'cancel-op-1', digest: 'cdig-1', state: 'PROPOSED' });
    const first = await command(OWNER, REQ_ID, true);
    expect(first).toEqual({ id: REQ_ID, operationId: 'cancel-op-1', digest: 'cdig-1', state: 'PROPOSED' });
    expect(mockPropose).toHaveBeenCalledWith(OWNER, PROJ_ID, {
      key: 'can-key-1',
      tool: 'postiz.cancel@1',
      revision: 1
    });

    // After withdrawing the local cancel operation (state CANCELLED), cancelKey rotates cleanly
    mockPrisma.publicationRequest.findFirst.mockResolvedValueOnce(submittedRow);
    mockPrisma.executionOperation.count.mockResolvedValueOnce(1);
    mockPrisma.publicationRequest.update.mockResolvedValueOnce({
      ...submittedRow,
      cancelKey: 'can-key-rotated'
    });
    mockPropose.mockResolvedValueOnce({ id: 'cancel-op-2', digest: 'cdig-2', state: 'PROPOSED' });
    const rotated = await command(OWNER, REQ_ID, true);
    expect(rotated.operationId).toBe('cancel-op-2');
    expect(mockPropose).toHaveBeenLastCalledWith(OWNER, PROJ_ID, {
      key: 'can-key-rotated',
      tool: 'postiz.cancel@1',
      revision: 1
    });

    // Rejects cancellation when schedule already passed or connection expired/revoked
    mockPrisma.publicationRequest.findFirst.mockResolvedValueOnce({ ...submittedRow, scheduledAt: PAST });
    await expect(command(OWNER, REQ_ID, true)).rejects.toMatchObject({ statusCode: 409, code: 'schedule_already_passed' });

    mockPrisma.publicationRequest.findFirst.mockResolvedValueOnce({
      ...submittedRow,
      connection: { ...conn, expiresAt: PAST }
    });
    await expect(command(OWNER, REQ_ID, true)).rejects.toMatchObject({ statusCode: 409, code: 'token_expired' });

    mockPrisma.publicationRequest.findFirst.mockResolvedValueOnce({
      ...submittedRow,
      connection: { ...conn, revoked: true }
    });
    await expect(command(OWNER, REQ_ID, true)).rejects.toMatchObject({ statusCode: 409, code: 'connection_revoked' });
  });
});

describe('3. Expired connections & unavailable providers handled explicitly', () => {
  it('keeps Postiz disabled by default and distinguishes safe read-only GET outages from ambiguous POST write outages', async () => {
    const disabledProvider = new PostizProvider(vi.fn());
    await expect(disabledProvider.integrations('secret-token', AbortSignal.timeout(1000))).rejects.toMatchObject({
      reason: 'DISABLED',
      ambiguous: false
    });

    vi.stubEnv('POSTIZ_PUBLISH_ENABLED', '1');
    const getUnavailable = new PostizProvider(async () => new Response('down', { status: 503 }));
    await expect(getUnavailable.integrations('secret-token', AbortSignal.timeout(1000))).rejects.toMatchObject({
      reason: 'PROVIDER_UNAVAILABLE',
      ambiguous: false
    });

    const getRateLimited = new PostizProvider(async () => new Response('slow down', { status: 429 }));
    await expect(getRateLimited.integrations('secret-token', AbortSignal.timeout(1000))).rejects.toMatchObject({
      reason: 'PROVIDER_UNAVAILABLE',
      ambiguous: false
    });

    let step = 0;
    const postOutage = new PostizProvider(async (url, init) => {
      step++;
      const target = String(url);
      if (target.endsWith('/integrations')) return Response.json([{ id: 'chan-1', identifier: 'linkedin', name: 'A' }]);
      if (target.endsWith('/upload')) return Response.json({ id: 'm1', path: 'https://example.test/1.jpg' });
      if (target.endsWith('/posts') && init?.method === 'POST') return new Response('gateway timeout', { status: 504 });
      throw new Error('unexpected step ' + step);
    });
    await expect(
      postOutage.schedule(
        'secret-token',
        {
          channel: 'chan-1',
          platform: 'LinkedIn',
          caption: 'Test',
          when: FUTURE.toISOString(),
          files: [{ name: '1.jpg', mime: 'image/jpeg', bytes: Buffer.from([1, 2, 3]) }]
        },
        AbortSignal.timeout(1000)
      )
    ).rejects.toMatchObject({
      reason: 'PROVIDER_UNAVAILABLE',
      ambiguous: true
    });
  });

  it('returns explicit connection_revoked and token_expired errors on prepare and retryPreparation instead of 404', async () => {
    mockPrisma.publishingConnection.findFirst.mockResolvedValueOnce(sampleConnection({ revoked: true }));
    await expect(prepare(OWNER, ITEM_ID, 1, CONN_ID)).rejects.toMatchObject({ statusCode: 409, code: 'connection_revoked' });

    mockPrisma.publishingConnection.findFirst.mockResolvedValueOnce(sampleConnection({ expiresAt: PAST }));
    await expect(prepare(OWNER, ITEM_ID, 1, CONN_ID)).rejects.toMatchObject({ statusCode: 409, code: 'token_expired' });

    // retryPreparation explicitly surfaces expired/revoked connections rather than 404 connection_not_found
    mockPrisma.publicationRequest.findFirst.mockResolvedValueOnce({
      id: REQ_ID,
      state: 'FAILED',
      reason: 'TOKEN_EXPIRED',
      submitKey: 'sub-1',
      itemId: ITEM_ID,
      revision: 1,
      connectionId: CONN_ID,
      connection: { platform: 'LinkedIn', revoked: false, expiresAt: PAST }
    });
    await expect(retryPreparation(OWNER, REQ_ID)).rejects.toMatchObject({ statusCode: 409, code: 'token_expired' });

    mockPrisma.publicationRequest.findFirst.mockResolvedValueOnce({
      id: REQ_ID,
      state: 'FAILED',
      reason: 'PROVIDER_UNAVAILABLE',
      submitKey: 'sub-1',
      itemId: ITEM_ID,
      revision: 1,
      connectionId: CONN_ID,
      connection: { platform: 'LinkedIn', revoked: true, expiresAt: FUTURE }
    });
    await expect(retryPreparation(OWNER, REQ_ID)).rejects.toMatchObject({ statusCode: 409, code: 'connection_revoked' });

    // Never retries UNKNOWN
    mockPrisma.publicationRequest.findFirst.mockResolvedValueOnce({
      id: REQ_ID,
      state: 'UNKNOWN',
      reason: 'RECEIPT_UNKNOWN',
      submitKey: 'sub-1',
      itemId: ITEM_ID,
      revision: 1,
      connectionId: CONN_ID,
      connection: { platform: 'LinkedIn', revoked: false, expiresAt: FUTURE }
    });
    await expect(retryPreparation(OWNER, REQ_ID)).rejects.toMatchObject({ statusCode: 409, code: 'unsafe_retry' });
  });
});

describe('4. Ambiguous provider outcomes visible & recoverable without duplicate publishing', () => {
  it('finds a unique submission via read-only GET /posts and refuses ambiguous multiple matches', async () => {
    vi.stubEnv('POSTIZ_PUBLISH_ENABLED', '1');
    const when = new Date('2026-12-01T10:00:00.000Z');

    const uniqueProvider = new PostizProvider(async () =>
      Response.json({
        posts: [
          {
            id: 'post-unique',
            state: 'PUBLISHED',
            publishDate: '2026-12-01T10:00:10.000Z',
            releaseURL: 'https://www.linkedin.com/feed/update/urn:li:share:1',
            integration: { id: 'chan-linkedin-1', providerIdentifier: 'linkedin' }
          }
        ]
      })
    );
    const unique = await uniqueProvider.findSubmission('secret-token', 'chan-linkedin-1', 'LinkedIn', when, AbortSignal.timeout(1000));
    expect(unique).toEqual({
      status: 'unique',
      id: 'post-unique',
      post: { status: 'PUBLISHED', receipt: 'https://www.linkedin.com/feed/update/urn:li:share:1' }
    });

    const dupProvider = new PostizProvider(async () =>
      Response.json({
        posts: [
          { id: 'p1', state: 'QUEUE', publishDate: when.toISOString(), integration: { id: 'chan-linkedin-1', providerIdentifier: 'linkedin' } },
          { id: 'p2', state: 'QUEUE', publishDate: when.toISOString(), integration: { id: 'chan-linkedin-1', providerIdentifier: 'linkedin' } }
        ]
      })
    );
    const ambiguous = await dupProvider.findSubmission('secret-token', 'chan-linkedin-1', 'LinkedIn', when, AbortSignal.timeout(1000));
    expect(ambiguous).toEqual({ status: 'ambiguous', count: 2 });
  });

  it('reconciles UNKNOWN with lost remoteId via read-only lookup and recovers UNKNOWN cancellation back to SUBMITTED when QUEUE', async () => {
    const conn = sampleConnection();
    const unknownWithoutReceipt = {
      id: REQ_ID,
      projectId: PROJ_ID,
      itemId: ITEM_ID,
      revision: 1,
      submitKey: 'sub-1',
      cancelKey: 'can-1',
      state: 'UNKNOWN',
      reason: 'RECEIPT_UNKNOWN',
      remoteId: null,
      networkReceipt: null,
      scheduledAt: FUTURE,
      connection: conn
    };

    const scheduleSpy = vi.fn();
    const provider: PublishingProvider = {
      schedule: scheduleSpy,
      cancel: vi.fn(),
      findSubmission: vi.fn(async () => ({
        status: 'unique' as const,
        id: 'recovered-post-id',
        post: { status: 'PUBLISHED' as const, receipt: 'https://www.linkedin.com/feed/update/urn:li:share:42' }
      }))
    };

    mockPrisma.publicationRequest.findFirst.mockResolvedValueOnce(unknownWithoutReceipt);
    mockPrisma.publicationRequest.updateMany.mockResolvedValueOnce({ count: 1 });
    const recovered = await reconcilePublication(OWNER, REQ_ID, provider);
    expect(scheduleSpy).not.toHaveBeenCalled();
    expect(recovered).toEqual({
      state: 'PUBLISHED',
      outcome: 'published_verified',
      remoteId: 'recovered-post-id',
      networkReceipt: 'https://www.linkedin.com/feed/update/urn:li:share:42'
    });

    // Ambiguous cancellation (UNKNOWN with remoteId) recovers cleanly back to SUBMITTED when Postiz confirms QUEUE
    mockPrisma.publicationRequest.findFirst.mockResolvedValueOnce({
      ...unknownWithoutReceipt,
      remoteId: 'remote-queued-1'
    });
    mockPrisma.publicationRequest.updateMany.mockResolvedValueOnce({ count: 1 });
    const queuedRes = await reconcilePublication(OWNER, REQ_ID, {
      schedule: scheduleSpy,
      cancel: vi.fn(),
      status: vi.fn(async () => ({ status: 'QUEUE' as const }))
    });
    expect(queuedRes).toEqual({
      state: 'SUBMITTED',
      outcome: 'recovered_queued',
      remoteId: 'remote-queued-1',
      networkReceipt: null
    });
    expect(scheduleSpy).not.toHaveBeenCalled();

    // PUBLISHED without receipt must NOT be marked PUBLISHED
    mockPrisma.publicationRequest.findFirst.mockResolvedValueOnce({
      ...unknownWithoutReceipt,
      state: 'SUBMITTED',
      remoteId: 'remote-no-receipt'
    });
    const noReceipt = await reconcilePublication(OWNER, REQ_ID, {
      schedule: scheduleSpy,
      cancel: vi.fn(),
      status: vi.fn(async () => ({ status: 'PUBLISHED' as const }))
    });
    expect(noReceipt).toEqual({
      state: 'SUBMITTED',
      outcome: 'missing_network_receipt',
      remoteId: 'remote-no-receipt',
      networkReceipt: null
    });
  });

  it('allows explicit human resolution of UNKNOWN without duplicating or forging verified receipts', async () => {
    const unknownRow = {
      id: REQ_ID,
      projectId: PROJ_ID,
      submitKey: 'sub-1',
      cancelKey: 'can-1',
      state: 'UNKNOWN',
      connection: { ownerId: OWNER }
    };

    mockPrisma.publicationRequest.findFirst.mockResolvedValueOnce(unknownRow);
    mockPrisma.publicationRequest.updateMany.mockResolvedValueOnce({ count: 1 });
    const absent = await resolveUnknownPublication(OWNER, REQ_ID, 'confirmed_absent');
    expect(absent).toEqual({ id: REQ_ID, state: 'FAILED', reason: 'MANUAL_CONFIRMED_ABSENT' });

    mockPrisma.publicationRequest.findFirst.mockResolvedValueOnce(unknownRow);
    mockPrisma.publicationRequest.updateMany.mockResolvedValueOnce({ count: 1 });
    const external = await resolveUnknownPublication(OWNER, REQ_ID, 'confirmed_external');
    expect(external).toEqual({ id: REQ_ID, state: 'CANCELLED', reason: 'RESOLVED_EXTERNALLY' });

    // Refuses non-UNKNOWN rows
    mockPrisma.publicationRequest.findFirst.mockResolvedValueOnce({ ...unknownRow, state: 'SUBMITTED' });
    await expect(resolveUnknownPublication(OWNER, REQ_ID, 'confirmed_absent')).rejects.toMatchObject({
      statusCode: 409,
      code: 'not_unknown'
    });
  });
});

describe('5. Verified receipts, unavailable metrics, and zero MOCK analytics', () => {
  it('returns per-platform analytics source and explicit unavailable reasons without fabricating metrics', async () => {
    const expired = await readPost(
      'post-fb-1',
      'token',
      async () => new Response('unauthorized', { status: 401 }),
      'Facebook'
    );
    expect(expired).toEqual({
      source: 'Postiz · Facebook',
      retrievedAt: null,
      metrics: missing(),
      unavailableReason: 'token_expired'
    });

    const outage = await readPost(
      'post-ig-1',
      'token',
      async () => new Response('error', { status: 503 }),
      'Instagram'
    );
    expect(outage).toEqual({
      source: 'Postiz · Instagram',
      retrievedAt: null,
      metrics: missing(),
      unavailableReason: 'provider_unavailable'
    });

    const invalid = await readPost(
      'post-li-1',
      'token',
      async () => new Response('not-json', { status: 200 }),
      'LinkedIn'
    );
    expect(invalid.unavailableReason).toBe('invalid_response');
    expect(invalid.retrievedAt).toBeNull();

    // Multi-point series or negative metrics are never guessed or summed.
    expect(
      normalizePost([
        { label: 'Impressions', data: [{ total: 10, date: '2026-11-01' }, { total: 20, date: '2026-11-02' }] },
        { label: 'Clicks', data: [{ total: -5, date: '2026-11-01' }] }
      ])
    ).toEqual(missing());
  });

  it('keeps direct cancel disabled by default and exposes verified receipts & honest unavailable reasons via HTTP routes', async () => {
    const app = Fastify();
    app.setErrorHandler((error, _req, reply) => {
      if (error instanceof HttpError) {
        return reply.status(error.statusCode).send({ code: error.code, message: error.message });
      }
      return reply.status(500).send({ code: 'internal_error', message: error.message });
    });
    app.decorate('authenticate', async (req: { currentUser?: { id: string; role: string } }) => {
      req.currentUser = { id: OWNER, role: 'USER' };
    });
    app.decorate('requireSuperAdmin', async () => {});
    await app.register(publishingRoutes);
    await app.register(resultsRoutes);

    try {
      // Publishing cancel preparation stays disabled by default (POSTIZ_PUBLISH_ENABLED !== '1')
      const cancelDisabled = await app.inject({
        method: 'POST',
        url: `/api/publishing/${REQ_ID}/prepare-cancel`,
        payload: {}
      });
      expect(cancelDisabled.statusCode).toBe(409);
      expect(cancelDisabled.json().code).toBe('direct_disabled');

      // Reconcile maps DISABLED to explicit 409 direct_disabled when publishing is off by default
      mockPrisma.publicationRequest.findFirst.mockResolvedValueOnce({
        id: REQ_ID,
        projectId: PROJ_ID,
        itemId: ITEM_ID,
        revision: 1,
        submitKey: 'sub-1',
        cancelKey: 'can-1',
        state: 'SUBMITTED',
        remoteId: 'remote-1',
        networkReceipt: null,
        scheduledAt: FUTURE,
        connection: sampleConnection()
      });
      const reconcileDisabled = await app.inject({
        method: 'POST',
        url: `/api/publishing/${REQ_ID}/reconcile`,
        payload: {}
      });
      expect(reconcileDisabled.statusCode).toBe(409);
      expect(reconcileDisabled.json().code).toBe('direct_disabled');

      // GET /api/calendar/:id/publishing filters out revisions without rendered manifest or drifted calendar version
      // and exposes connection.expiresAt, cancelOperationId, and effective UNKNOWN state
      mockPrisma.contentItem.findFirst.mockResolvedValueOnce(sampleItem());
      mockPrisma.contentRevision.findMany.mockResolvedValueOnce([
        { version: 1, snapshot: { plannedAt: FUTURE.toISOString(), archived: false, variants: sampleItem().variants } }
      ]);
      mockPrisma.creativeRevision.findMany.mockResolvedValueOnce([
        { version: 3, manifest: { ok: true }, spec: validSpec({ version: 1 }) },
        { version: 2, manifest: Prisma.DbNull, spec: validSpec({ version: 1 }) },
        { version: 1, manifest: { ok: true }, spec: validSpec({ version: 99 }) }
      ]);
      mockPrisma.publicationRequest.findMany.mockResolvedValueOnce([
        {
          id: REQ_ID,
          submitKey: 'sub-k',
          cancelKey: 'can-k',
          revision: 3,
          itemVersion: 1,
          scheduledAt: FUTURE,
          connection: {
            platform: 'LinkedIn',
            channel: 'chan-1',
            displayName: 'Atelier',
            revoked: false,
            expiresAt: PAST
          },
          state: 'CANCELLING',
          remoteId: 'remote-1',
          networkReceipt: null,
          reason: null
        }
      ]);
      mockPrisma.executionOperation.findMany.mockResolvedValueOnce([
        { id: 'op-sub', key: 'sub-k', state: 'SUCCEEDED' },
        { id: 'op-can', key: 'can-k', state: 'UNKNOWN' }
      ]);
      mockPrisma.executionAccount.findUnique.mockResolvedValueOnce({ enabled: true, tools: ['postiz.schedule@1'] });
      mockPrisma.publishingConnection.findMany.mockResolvedValueOnce([]);

      const panelRes = await app.inject({ method: 'GET', url: `/api/calendar/${ITEM_ID}/publishing` });
      expect(panelRes.statusCode).toBe(200);
      expect(panelRes.json().revisions).toEqual([{ revision: 3, platform: 'LinkedIn', kind: 'square' }]);
      expect(panelRes.json().requests[0]).toMatchObject({
        state: 'UNKNOWN',
        cancelOperationId: 'op-can',
        connection: { expiresAt: PAST.toISOString() }
      });

      // GET /api/publishing/:id computes the exact same effective UNKNOWN state as the list endpoint
      mockPrisma.publicationRequest.findFirst.mockResolvedValueOnce({
        id: REQ_ID,
        itemId: ITEM_ID,
        itemVersion: 1,
        revision: 3,
        submitKey: 'sub-k',
        cancelKey: 'can-k',
        scheduledAt: FUTURE,
        state: 'CANCELLING',
        reason: null,
        remoteId: 'remote-1',
        networkReceipt: null,
        connection: {
          platform: 'LinkedIn',
          channel: 'chan-1',
          displayName: 'Atelier',
          revoked: false,
          expiresAt: PAST
        },
        events: []
      });
      mockPrisma.executionOperation.findMany.mockResolvedValueOnce([
        { id: 'op-sub', key: 'sub-k', state: 'SUCCEEDED', digest: 'd1', maxCents: 0, reportedCents: 0 },
        { id: 'op-can', key: 'can-k', state: 'UNKNOWN', digest: 'd2', maxCents: 0, reportedCents: null }
      ]);
      const detailRes = await app.inject({ method: 'GET', url: `/api/publishing/${REQ_ID}` });
      expect(detailRes.statusCode).toBe(200);
      expect(detailRes.json().state).toBe('UNKNOWN');

      // POST /api/publishing/:id/resolve-unknown recovers UNKNOWN cleanly via HTTP
      mockPrisma.publicationRequest.findFirst.mockResolvedValueOnce({
        id: REQ_ID,
        projectId: PROJ_ID,
        submitKey: 'sub-k',
        cancelKey: 'can-k',
        state: 'UNKNOWN',
        connection: { ownerId: OWNER }
      });
      mockPrisma.publicationRequest.updateMany.mockResolvedValueOnce({ count: 1 });
      const resolveRes = await app.inject({
        method: 'POST',
        url: `/api/publishing/${REQ_ID}/resolve-unknown`,
        payload: { resolution: 'confirmed_absent' }
      });
      expect(resolveRes.statusCode).toBe(200);
      expect(resolveRes.json()).toEqual({ id: REQ_ID, state: 'FAILED', reason: 'MANUAL_CONFIRMED_ABSENT' });

      // Metrics endpoint stays disabled by default and returns explicit analytics_disabled reason + platform source
      mockPrisma.publicationRequest.findFirst.mockResolvedValueOnce({
        id: REQ_ID,
        remoteId: 'remote-fb-1',
        networkReceipt: 'https://www.facebook.com/post/1',
        connection: sampleConnection({ platform: 'Facebook' })
      });
      const metricsDisabled = await app.inject({
        method: 'POST',
        url: `/api/results/publications/${REQ_ID}/metrics`,
        payload: {}
      });
      expect(metricsDisabled.statusCode).toBe(200);
      expect(metricsDisabled.json()).toEqual({
        source: 'Postiz · Facebook',
        retrievedAt: null,
        metrics: missing(),
        unavailableReason: 'analytics_disabled'
      });

      // Expired connection returns explicit connection_expired when analytics enabled
      vi.stubEnv('POSTIZ_ANALYTICS_ENABLED', '1');
      mockPrisma.publicationRequest.findFirst.mockResolvedValueOnce({
        id: REQ_ID,
        remoteId: 'remote-fb-1',
        networkReceipt: 'https://www.facebook.com/post/1',
        connection: sampleConnection({ platform: 'Facebook', expiresAt: PAST })
      });
      const metricsExpired = await app.inject({
        method: 'POST',
        url: `/api/results/publications/${REQ_ID}/metrics`,
        payload: {}
      });
      expect(metricsExpired.json()).toMatchObject({
        source: 'Postiz · Facebook',
        retrievedAt: null,
        unavailableReason: 'connection_expired'
      });

      // Results report exposes verified receipts separately from pending/unknown items and never includes MOCK analytics
      vi.stubEnv('POSTIZ_ANALYTICS_ENABLED', '0');
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ firstApproved: null, activeDays: 1, usable: 1 }])
        .mockResolvedValueOnce([{ cents: 0, pending: false }]);
      mockPrisma.resultPreference.findUnique.mockResolvedValueOnce(null);
      mockPrisma.publicationRequest.findMany
        .mockResolvedValueOnce([
          {
            id: REQ_ID,
            itemId: ITEM_ID,
            revision: 1,
            projectId: PROJ_ID,
            remoteId: 'remote-fb-1',
            networkReceipt: 'https://www.facebook.com/post/1',
            scheduledAt: FUTURE,
            measure: null,
            connection: {
              platform: 'Facebook',
              channel: 'chan-fb',
              displayName: 'Atelier FB',
              revoked: false,
              expiresAt: FUTURE
            },
            creative: { project: { title: 'Campagne Hiver' } }
          }
        ])
        .mockResolvedValueOnce([
          {
            id: randomUUID(),
            itemId: ITEM_ID,
            revision: 2,
            projectId: PROJ_ID,
            state: 'UNKNOWN',
            reason: 'RECEIPT_UNKNOWN',
            remoteId: null,
            scheduledAt: FUTURE,
            connection: {
              platform: 'LinkedIn',
              channel: 'chan-li',
              displayName: 'Atelier LI',
              revoked: false,
              expiresAt: PAST
            },
            creative: { project: { title: 'Campagne Hiver' } }
          }
        ]);
      mockPrisma.confirmedOffer.findMany.mockResolvedValueOnce([]);
      mockPrisma.contentItem.groupBy.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      mockPrisma.publicationRequest.groupBy.mockResolvedValueOnce([]);
      mockPrisma.creativeRevision.findMany.mockResolvedValueOnce([]);
      mockPrisma.campaign.findMany.mockResolvedValueOnce([]);
      mockPrisma.publicationRequest.count.mockResolvedValueOnce(1);

      const summary = await report(OWNER);
      expect(summary.content.sources.mockAnalyticsIncluded).toBe(false);
      expect(summary.content.sources.analyticsMode).toBe('disabled');
      expect(summary.publications[0]).toMatchObject({
        platform: 'Facebook',
        remoteId: 'remote-fb-1',
        networkReceipt: 'https://www.facebook.com/post/1',
        connectionStatus: 'active',
        metricsStatus: 'analytics_disabled',
        observation: null
      });
      expect(summary.pendingPublications[0]).toMatchObject({
        state: 'UNKNOWN',
        platform: 'LinkedIn',
        connectionStatus: 'expired'
      });
    } finally {
      await app.close();
    }
  });
});
