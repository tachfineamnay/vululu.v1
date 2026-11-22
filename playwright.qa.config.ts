import { defineConfig } from '@playwright/test';

/**
 * Recette QA : cible la pile déjà démarrée (web 3190, API 3191 derrière le proxy /api).
 *
 * Aucun webServer n'est déclaré ici : cette configuration ne lance jamais un second serveur
 * de développement. L'URL est volontairement bornée à la pile QA locale (surcharge explicite
 * QA_ALLOW_REMOTE=1 pour une cible distante de recette).
 */
const baseURL = process.env.QA_WEB_URL || 'http://127.0.0.1:3190';
const localQa = /^http:\/\/(127\.0\.0\.1|localhost):3190\/?$/.test(baseURL);
if (!localQa && process.env.QA_ALLOW_REMOTE !== '1') {
  throw new Error('QA_WEB_URL doit viser la pile QA http://127.0.0.1:3190 (QA_ALLOW_REMOTE=1 pour forcer).');
}

export default defineConfig({
  testDir: './e2e',
  timeout: 420_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 20_000,
    launchOptions: { executablePath: process.env.CHROMIUM_EXECUTABLE }
  }
});
