import { randomBytes } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { AesProviderCredentialCipher } from '../../apps/api/src/infrastructure/security/providerCredentialCipher';
import { logEvent } from '../../apps/api/src/observability/logger';
import { ProviderCredentialUseCases } from '@vululu/application';

it('chiffre de facon non deterministe et lie le secret au fournisseur', () => {
  const key = randomBytes(32).toString('base64'); const cipher = new AesProviderCredentialCipher(() => key); const value = 'fixture-key-é-' + randomBytes(8).toString('hex');
  const first = cipher.encrypt(value, 'provider-a'); const second = cipher.encrypt(value, 'provider-a');
  expect(first).not.toBe(second); expect(first).not.toContain(value); expect(cipher.decrypt(first, 'provider-a')).toBe(value);
  expect(() => cipher.decrypt(first, 'provider-b')).toThrow(/ne peut pas être lue/);
  const envelope = JSON.parse(first); envelope.tag = randomBytes(16).toString('base64');
  expect(() => cipher.decrypt(JSON.stringify(envelope), 'provider-a')).toThrow(/ne peut pas être lue/);
  expect(() => new AesProviderCredentialCipher(() => randomBytes(32).toString('base64')).decrypt(first, 'provider-a')).toThrow(/ne peut pas être lue/);
});
it.each([undefined, '', 'invalid-base64', 'a'.repeat(32), randomBytes(16).toString('base64')])('refuse une configuration de chiffrement invalide sans fallback en clair', (value) => {
  const cipher = new AesProviderCredentialCipher(() => value);
  expect(cipher.configured()).toBe(false); expect(() => cipher.encrypt('fixture-only', 'provider')).toThrow(/configuré côté serveur/);
});
it('redige les champs sensibles des journaux sans perdre la correlation', () => {
  const lines: string[] = []; const output = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => { lines.push(String(chunk)); return true; });
  try { logEvent('info', 'fixture.redaction', { actorId: 'fixture-actor', apiKey: 'fixture-private', csrfToken: 'fixture-csrf', nested: { encryptedValue: 'fixture-encrypted', PROVIDER_CREDENTIALS_ENCRYPTION_KEY: 'fixture-master' } }); }
  finally { output.mockRestore(); }
  const text = lines.join(''); expect(text).toContain('fixture-actor'); expect(text).not.toMatch(/fixture-private|fixture-encrypted|fixture-master|fixture-csrf/);
});
it('applique le RBAC dans le cas d usage avant toute lecture du fournisseur', async () => {
  const store = { findProvider: vi.fn(), save: vi.fn(), remove: vi.fn() };
  const useCases = new ProviderCredentialUseCases(store, { configured: () => true, encrypt: vi.fn() }, { record: vi.fn() });
  const actor = { id: 'fixture-demo', role: 'user' as const };
  await expect(useCases.status(actor, 'provider')).rejects.toMatchObject({ code: 'forbidden' });
  await expect(useCases.save(actor, 'provider', 'fixture-only')).rejects.toMatchObject({ code: 'forbidden' });
  await expect(useCases.remove(actor, 'provider')).rejects.toMatchObject({ code: 'forbidden' });
  expect(store.findProvider).not.toHaveBeenCalled(); expect(store.save).not.toHaveBeenCalled();
});
