import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  displayRequestState,
  evaluateRequestControls,
  formatKind,
  formatPlatformSupportSummary,
  isSafeHttpsUrl,
  isVideoKind,
  metricsBlockReason
} from '../apps/web/lib/publishingPresentation';
import { PublishingPanel } from '../apps/web/app/calendar/PublishingPanel';
import { SocialConnections } from '../apps/web/app/calendar/SocialConnections';
import { Editor } from '../apps/web/app/calendar/Editor';
import Results from '../apps/web/app/results/page';

const webRequire = createRequire(new URL('../apps/web/package.json', import.meta.url));
const { AppRouterContext } = webRequire('next/dist/shared/lib/app-router-context.shared-runtime');

vi.mock('../apps/web/components/WorkspacePreferences', () => ({
  useWorkspace: () => ({
    lang: 'fr',
    setLang: vi.fn(),
    t: (fr: string) => fr
  })
}));
vi.mock('../apps/web/components/StudioNav', () => ({
  default: () => <nav data-testid="studio-nav" />
}));

const FUTURE = new Date(Date.now() + 3_600_000).toISOString();
const PAST = new Date(Date.now() - 3_600_000).toISOString();

describe('Publishing & Results UI honesty, format labeling, and control gating', () => {
  it('never displays PUBLISHED as confirmed without a verified network receipt', () => {
    expect(displayRequestState('PUBLISHED', 'https://www.linkedin.com/feed/update/urn:li:share:1')).toBe(
      'Publication confirmée'
    );
    expect(displayRequestState('PUBLISHED', null)).toBe('Statut publié sans preuve réseau vérifiée');
    expect(displayRequestState('SUBMITTED', null)).toContain('publication non confirmée');
    expect(displayRequestState('UNKNOWN', null)).toContain('Issue inconnue');

    expect(isSafeHttpsUrl('https://www.facebook.com/post/123')).toBe(true);
    expect(isSafeHttpsUrl('http://insecure.example/1')).toBe(false);
    expect(isSafeHttpsUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeHttpsUrl('urn:li:share:123')).toBe(false);
  });

  it('labels all supported/unsupported formats clearly and treats both short and landscape as video', () => {
    expect(formatKind('square')).toBe('Post carré');
    expect(formatKind('portrait')).toBe('Post portrait');
    expect(formatKind('story')).toBe('Story');
    expect(formatKind('carousel')).toBe('Carrousel');
    expect(formatKind('short')).toBe('Vidéo courte / Reel');
    expect(formatKind('landscape')).toBe('Vidéo paysage');

    expect(isVideoKind('short')).toBe(true);
    expect(isVideoKind('landscape')).toBe(true);
    expect(isVideoKind('square')).toBe(false);
    expect(isVideoKind('carousel')).toBe(false);

    expect(formatPlatformSupportSummary(true, [])).toContain('Publication manuelle uniquement');
    expect(formatPlatformSupportSummary(false, ['square', 'portrait'])).toContain('désactivée par défaut');
    expect(formatPlatformSupportSummary(true, ['square'])).toContain('Post carré');
  });

  it('gates retry, cancel, withdraw-cancel, and reconcile controls on expiry, revocation, and directEnabled', () => {
    const baseRequest = {
      state: 'FAILED',
      reason: 'PROVIDER_UNAVAILABLE',
      remoteId: null,
      scheduledAt: FUTURE,
      connection: { revoked: false, expiresAt: FUTURE }
    };

    // Safe retry allowed only when directEnabled, authorized, active & non-expired
    expect(
      evaluateRequestControls(baseRequest, { directEnabled: true, scheduleAuthorized: true })
    ).toMatchObject({ canRetryReason: true, canRetryNow: true, expired: false });

    // Disabled by default -> retry blocked
    expect(
      evaluateRequestControls(baseRequest, { directEnabled: false, scheduleAuthorized: true })
    ).toMatchObject({ canRetryReason: true, canRetryNow: false });

    // Expired connection -> retry, cancel, and reconcile all blocked
    expect(
      evaluateRequestControls(
        { ...baseRequest, connection: { revoked: false, expiresAt: PAST } },
        { directEnabled: true, scheduleAuthorized: true }
      )
    ).toMatchObject({ expired: true, canRetryNow: false, canReconcileNow: false, canCancelNow: false });

    // UNKNOWN without remoteId still allows read-only reconciliation when active & enabled, never retry
    expect(
      evaluateRequestControls(
        {
          state: 'UNKNOWN',
          reason: 'RECEIPT_UNKNOWN',
          remoteId: null,
          scheduledAt: FUTURE,
          connection: { revoked: false, expiresAt: FUTURE }
        },
        { directEnabled: true, scheduleAuthorized: true }
      )
    ).toMatchObject({ canRetryReason: false, canRetryNow: false, canReconcileNow: true });

    // SUBMITTED with pending QUEUED cancel blocks duplicate cancel prep and enables withdrawing local cancel
    expect(
      evaluateRequestControls(
        {
          state: 'SUBMITTED',
          reason: null,
          remoteId: 'remote-1',
          scheduledAt: FUTURE,
          cancelOperationId: 'cancel-op-1',
          cancellation: 'QUEUED',
          connection: { revoked: false, expiresAt: FUTURE }
        },
        { directEnabled: true, scheduleAuthorized: true }
      )
    ).toMatchObject({ canCancelNow: false, canWithdrawCancel: true, canReconcileNow: true });
  });

  it('computes honest unavailable-metrics block reasons when analytics are disabled or connection is revoked/expired', () => {
    expect(metricsBlockReason(false, 'active')).toBe('analytics_disabled');
    expect(metricsBlockReason(true, 'revoked')).toBe('connection_revoked');
    expect(metricsBlockReason(true, 'expired')).toBe('connection_expired');
    expect(metricsBlockReason(true, 'active')).toBeNull();
  });

  it('renders PublishingPanel, SocialConnections, Editor (including legacy unsupported format), and Results cleanly', () => {
    const pubHtml = renderToStaticMarkup(<PublishingPanel id="11111111-1111-4111-8111-111111111111" />);
    expect(pubHtml).toContain('Publication et reçus');
    expect(pubHtml).toContain('seule une preuve réseau reçue confirme la diffusion');

    const connHtml = renderToStaticMarkup(<SocialConnections onChange={vi.fn()} />);
    expect(connHtml).toContain('Comptes de publication');

    const routerStub = {
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      push: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn()
    };
    const editorHtml = renderToStaticMarkup(
      <AppRouterContext.Provider value={routerStub}>
        <Editor
          initial={{
            id: '11111111-1111-4111-8111-111111111111',
            version: 1,
            title: 'Ancien contenu Motion',
            offerId: 'offer-1',
            audience: 'PME',
            objective: 'Test',
            projectId: null,
            campaignId: null,
            status: 'DRAFT',
            archived: false,
            plannedAt: FUTURE,
            timeZone: 'UTC',
            variants: [
              { platform: 'Instagram', format: 'Motion', caption: 'Texte', cta: 'Voir', hashtags: [] }
            ]
          }}
          offers={[{ id: 'offer-1', name: 'Offre A', contextId: 'ctx-1' }]}
          projects={[]}
          campaigns={[]}
          close={vi.fn()}
          saved={vi.fn()}
        />
      </AppRouterContext.Provider>
    );
    expect(editorHtml).toContain('Motion (non pris en charge · ancien choix)');
    expect(editorHtml).toContain('non pris en charge pour le rendu et la programmation directe');

    const resultsHtml = renderToStaticMarkup(<Results />);
    expect(resultsHtml).toContain('Résultats et prochaine semaine');
  });
});
