import { randomUUID } from 'node:crypto';
import { defineConfig } from '@playwright/test';

const baseURL = 'http://127.0.0.1:3100';
process.env.F04_BROWSER_ACCOUNT ||= randomUUID();
process.env.F04_BROWSER_PASSWORD ||= randomUUID();
const database = process.env.DATABASE_URL_TEST || 'postgresql://vululu@127.0.0.1:55432/vululu_v1_00_test?schema=public';
export default defineConfig({
  testDir: './tests/browser', testMatch: 'calendar-publishing.spec.ts', timeout: 90_000, workers: 1,
  expect: { timeout: 12_000 },
  use: { baseURL, launchOptions: { executablePath: process.env.CHROMIUM_EXECUTABLE }, trace: 'off' },
  projects: [{ name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }],
  webServer: [
    { command: 'pnpm exec tsx tests/helpers/calendar-publishing-server.mts', url: 'http://127.0.0.1:3101/api/health', timeout: 120_000,
      env: { APP_ENV: 'test', APP_ORIGIN: baseURL, DATABASE_URL: database, DATABASE_URL_TEST: database, V0_TEST_DB: '1',
        SESSION_SECRET: randomUUID(), SESSION_COOKIE_SECURE: '0', ARTIFACT_DIR: '/tmp/vululu-f04-browser-artifacts' } },
    { command: 'pnpm --filter @vululu/web build && pnpm --filter @vululu/web start --hostname 127.0.0.1', url: baseURL + '/login', timeout: 120_000,
      env: { API_INTERNAL_URL: 'http://127.0.0.1:3101', NEXT_TELEMETRY_DISABLED: '1' } }
  ]
});
