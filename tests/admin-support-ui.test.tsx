import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  availabilityBadge,
  providerRegistryBadge,
  pythonServiceBadge,
  validateResolveIncidentInput,
  type AdminProvider,
  type AdminPythonStatus
} from '../apps/web/lib/admin';
import { ServiceCases } from '../apps/web/components/ServiceCases';
import { resolveSupportSession } from '../apps/web/lib/supportGate';

describe('VULULU A04 — Admin & Support UI Honesty & Validation', () => {
  it('never renders configured external providers as healthy/verified without probing', () => {
    expect(availabilityBadge({ availability: 'configured', healthState: 'unverified' })).toEqual({
      status: 'unverified',
      label: 'Configuré · Non vérifié'
    });
    expect(availabilityBadge({ availability: 'local', healthState: 'healthy' })).toEqual({
      status: 'healthy',
      label: 'Sain (local)'
    });
    expect(availabilityBadge({ availability: 'disabled', healthState: 'unavailable' })).toEqual({
      status: 'unavailable',
      label: 'Indisponible (désactivé)'
    });
    expect(availabilityBadge({ availability: 'missing_credential', healthState: 'unavailable' })).toEqual({
      status: 'unavailable',
      label: 'Indisponible (identifiant manquant)'
    });

    const baseProvider = {
      id: 'p1',
      key: 'openai',
      name: 'OpenAI',
      active: true,
      createdAt: '2026-11-24T00:00:00.000Z'
    } as AdminProvider;

    expect(
      providerRegistryBadge({ ...baseProvider, active: false, credentials: { configured: true, writable: true, updatedAt: null } })
    ).toMatchObject({
      status: 'unavailable',
      label: 'Indisponible (désactivé)'
    });
    expect(
      providerRegistryBadge({ ...baseProvider, active: true, credentials: { configured: false, writable: true, updatedAt: null } })
    ).toMatchObject({
      status: 'unavailable',
      label: 'Indisponible (non configuré)'
    });
    expect(
      providerRegistryBadge({ ...baseProvider, active: true, credentials: { configured: true, writable: true, updatedAt: null } })
    ).toMatchObject({
      status: 'unverified',
      label: 'Configuré · Non vérifié'
    });

    const basePython: AdminPythonStatus = {
      configured: false,
      reachable: false,
      ready: false,
      service: null,
      version: null,
      ffmpeg: false,
      pillow: false,
      checkedAt: '2026-11-24T00:00:00.000Z',
      error: null
    };
    expect(pythonServiceBadge(basePython)).toMatchObject({ status: 'unavailable' });
    expect(pythonServiceBadge({ ...basePython, configured: true, reachable: false })).toMatchObject({
      status: 'unavailable'
    });
    expect(pythonServiceBadge({ ...basePython, configured: true, reachable: true, ready: false })).toMatchObject({
      status: 'unavailable'
    });
    expect(
      pythonServiceBadge({ ...basePython, configured: true, reachable: true, ready: true, healthState: 'healthy' })
    ).toMatchObject({
      status: 'healthy'
    });
  });

  it('strictly validates UNKNOWN incident resolution cents and UUID evidence', () => {
    const validUuid = '123e4567-e89b-42d3-a456-426614174000';

    // Empty / whitespace cents must NEVER silently coerce to 0
    expect(validateResolveIncidentInput({ cents: '', evidence: validUuid, maxCents: 100 })).toMatchObject({ ok: false });
    expect(validateResolveIncidentInput({ cents: '   ', evidence: validUuid, maxCents: 100 })).toMatchObject({ ok: false });

    // Negative, float, or above ceiling rejected
    expect(validateResolveIncidentInput({ cents: '-1', evidence: validUuid, maxCents: 100 })).toMatchObject({ ok: false });
    expect(validateResolveIncidentInput({ cents: '12.5', evidence: validUuid, maxCents: 100 })).toMatchObject({ ok: false });
    expect(validateResolveIncidentInput({ cents: '101', evidence: validUuid, maxCents: 100 })).toMatchObject({ ok: false });

    // Invalid evidence UUID rejected
    expect(validateResolveIncidentInput({ cents: '50', evidence: 'not-a-uuid', maxCents: 100 })).toMatchObject({ ok: false });

    // Exact valid input succeeds (including explicit "0")
    expect(validateResolveIncidentInput({ cents: '0', evidence: '  ' + validUuid + ' ', maxCents: 100 })).toEqual({
      ok: true,
      cents: 0,
      evidence: validUuid
    });
    expect(validateResolveIncidentInput({ cents: '100', evidence: validUuid, maxCents: 100 })).toEqual({
      ok: true,
      cents: 100,
      evidence: validUuid
    });
  });

  it('renders ServiceCases safely when user.name is absent and surfaces entriesTruncated warning', () => {
    const html = renderToStaticMarkup(
      <ServiceCases
        mode="support"
        items={[
          {
            id: 'case-1',
            userId: 'user-1',
            kind: 'SUPPORT',
            status: 'OPEN',
            subject: 'Question facturation',
            createdAt: '2026-11-24T08:00:00.000Z',
            updatedAt: '2026-11-24T09:00:00.000Z',
            user: { email: 'client@vululu.test', name: null, status: 'active' },
            entries: [
              {
                id: 'e-1',
                role: 'customer',
                message: 'Bonjour support',
                status: 'OPEN',
                createdAt: '2026-11-24T08:00:00.000Z'
              }
            ],
            entriesCount: 65,
            entriesTruncated: true
          }
        ]}
        reload={async () => {}}
      />
    );
    expect(html).toContain('client@vululu.test');
    expect(html).not.toContain('(null)');
    expect(html).toContain('Question facturation');
    expect(html).toContain('Bonjour support');
    expect(html).toContain('65');
  });

  it('enforces server-side RBAC for /support (401 unauthenticated, 403 for user, ok for support & super_admin)', async () => {
    const fetcher = vi.fn();

    // Unauthenticated -> unauthenticated
    fetcher.mockResolvedValueOnce({ status: 401, ok: false });
    await expect(resolveSupportSession('', 'http://127.0.0.1:3101', fetcher as unknown as typeof fetch)).resolves.toEqual({
      kind: 'unauthenticated'
    });

    // Regular user -> forbidden
    fetcher.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({ user: { id: 'u1', email: 'u@vululu.test', name: 'User', role: 'user' } })
    });
    await expect(
      resolveSupportSession('vululu_session=abc', 'http://127.0.0.1:3101', fetcher as unknown as typeof fetch)
    ).resolves.toMatchObject({ kind: 'forbidden' });

    // Support role -> ok
    fetcher.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({ user: { id: 'u2', email: 's@vululu.test', name: 'Support', role: 'support' } })
    });
    await expect(
      resolveSupportSession('vululu_session=abc', 'http://127.0.0.1:3101', fetcher as unknown as typeof fetch)
    ).resolves.toMatchObject({ kind: 'ok', user: { role: 'support' } });

    // Super admin role -> ok
    fetcher.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: async () => ({ user: { id: 'u3', email: 'a@vululu.test', name: 'Admin', role: 'super_admin' } })
    });
    await expect(
      resolveSupportSession('vululu_session=abc', 'http://127.0.0.1:3101', fetcher as unknown as typeof fetch)
    ).resolves.toMatchObject({ kind: 'ok', user: { role: 'super_admin' } });

    // API unreachable -> unavailable
    fetcher.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(
      resolveSupportSession('vululu_session=abc', 'http://127.0.0.1:3101', fetcher as unknown as typeof fetch)
    ).resolves.toMatchObject({ kind: 'unavailable' });
  });
});
