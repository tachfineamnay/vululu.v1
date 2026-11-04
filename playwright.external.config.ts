import { defineConfig } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL;
if (!baseURL || !/^https?:\/\//.test(baseURL)) {
  throw new Error('E2E_BASE_URL doit designer une instance de test deja demarree.');
}

/** Recette de l'instance cible : ne lance jamais un serveur de developpement. */
export default defineConfig({
  testDir: './e2e',
  timeout: 240000,
  expect: { timeout: 30000 },
  fullyParallel: false,
  workers: 1,
  use: { baseURL, trace: 'retain-on-failure' }
});
