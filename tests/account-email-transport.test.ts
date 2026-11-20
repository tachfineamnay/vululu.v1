import { afterEach, expect, it, vi } from 'vitest';
import { accountEmailOrigin, configuredAccountMail } from '../apps/api/src/infrastructure/email/accountMail';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it('uses the fixed Resend API, a configured sender, and a bounded request', async () => {
  vi.stubEnv('ACCOUNT_EMAIL_RESEND_API_KEY', 'test-fixture');
  vi.stubEnv('ACCOUNT_EMAIL_FROM', 'Vululu <hello@example.test>');
  const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetch);
  const transport = configuredAccountMail()!;
  const message = { to: 'customer@example.test', subject: 'Test mail', text: 'Test message' };
  await transport.send(message);
  expect(fetch).toHaveBeenCalledWith('https://api.resend.com/emails', expect.objectContaining({
    method: 'POST', redirect: 'error', signal: expect.any(AbortSignal),
    headers: { Authorization: 'Bearer test-fixture', 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Vululu <hello@example.test>', ...message })
  }));
  fetch.mockResolvedValueOnce(new Response('Provider details', { status: 503 }));
  await expect(transport.send(message)).rejects.toThrow('Account email rejected');
});

it('keeps email features disabled without credentials and requires a canonical HTTPS origin in production', () => {
  vi.stubEnv('ACCOUNT_EMAIL_RESEND_API_KEY', '');
  vi.stubEnv('ACCOUNT_EMAIL_FROM', '');
  expect(configuredAccountMail()).toBeNull();
  vi.stubEnv('ACCOUNT_EMAIL_FROM', 'hello@example.test');
  expect(() => configuredAccountMail()).toThrow();
  vi.stubEnv('APP_ENV', 'production');
  for (const invalid of ['', 'http://example.test', 'https://example.test/links', 'https://user@example.test']) {
    vi.stubEnv('ACCOUNT_EMAIL_ORIGIN', invalid);
    expect(() => accountEmailOrigin()).toThrow();
  }
  vi.stubEnv('ACCOUNT_EMAIL_ORIGIN', 'https://example.test/');
  expect(accountEmailOrigin()).toBe('https://example.test');
});
