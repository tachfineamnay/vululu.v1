import { defineConfig } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL;
if (!baseURL || !/^https?:\/\//.test(baseURL)) {
  throw new Error('E2E_BASE_URL doit designer une instance de test deja demarree.');
}
const localSelfSigned = process.env.E2E_LOCAL_SELF_SIGNED === '1';
if (localSelfSigned && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseURL).hostname)) {
  throw new Error('E2E_LOCAL_SELF_SIGNED est reserve a localhost.');
}

/** Recette de l'instance cible : ne lance jamais un serveur de developpement. */
export default defineConfig({
  testDir: './e2e',
  timeout: 240000,
  expect: { timeout: 30000 },
  fullyParallel: false,
  workers: 1,
  // Une trace réseau peut conserver credentials/cookies sur une cible réelle.
  use: { baseURL, trace: 'off', screenshot: 'only-on-failure', ignoreHTTPSErrors: localSelfSigned }
});
