import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from '@playwright/test';

const baseURL = 'http://127.0.0.1:3100';
process.env.F01_TEST_MAILBOX ||= join(mkdtempSync(join(tmpdir(), 'vululu-f01-')), 'mail.ndjson');
const browserSource = `2001:db8::${randomBytes(2).toString('hex')}:${randomBytes(2).toString('hex')}`;
const database = process.env.DATABASE_URL_TEST || 'postgresql://vululu@127.0.0.1:55432/vululu_v1_00_test?schema=public';

export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'customer-account.spec.ts',
  timeout: 120_000,
  workers: 1,
  use: { baseURL, extraHTTPHeaders: { 'x-forwarded-for': browserSource }, launchOptions: { executablePath: process.env.CHROMIUM_EXECUTABLE }, trace: 'off' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }
  ],
  globalTeardown: './tests/helpers/customer-account-teardown.ts',
  webServer: [
    { command: 'pnpm exec tsx tests/helpers/customer-account-server.mts', url: 'http://127.0.0.1:3101/api/health',
      timeout: 120_000, env: { APP_ENV: 'test', API_PORT: '3101', API_HOST: '127.0.0.1', APP_ORIGIN: baseURL,
        ACCOUNT_EMAIL_ORIGIN: baseURL, DATABASE_URL: database, DATABASE_URL_TEST: database, V0_TEST_DB: '1',
        F01_TEST_MAILBOX: process.env.F01_TEST_MAILBOX, TRUST_PROXY: 'true', SESSION_SECRET: randomUUID(), SESSION_COOKIE_SECURE: '0' } },
    { command: 'pnpm --filter @vululu/web build && pnpm --filter @vululu/web start --hostname 127.0.0.1', url: baseURL + '/login',
      timeout: 120_000, env: { API_INTERNAL_URL: 'http://127.0.0.1:3101', NEXT_TELEMETRY_DISABLED: '1' } }
  ]
});
