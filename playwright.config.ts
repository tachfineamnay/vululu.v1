import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 240000,
  expect: { timeout: 30000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure'
  },
  webServer: [
    {
      command: 'pnpm --filter @vululu/api dev',
      url: 'http://127.0.0.1:3001/api/health',
      reuseExistingServer: true,
      timeout: 120000
    },
    {
      command: 'pnpm --filter @vululu/web dev',
      url: 'http://127.0.0.1:3000',
      reuseExistingServer: true,
      timeout: 120000
    }
  ]
});
