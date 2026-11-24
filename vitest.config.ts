import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Les composants du Studio vivent dans l'espace de travail web : on pointe React vers sa
// copie pour que les tests de rendu partagent exactement la même instance que l'application.
const webDep = (name: string) => fileURLToPath(new URL('./apps/web/node_modules/' + name, import.meta.url));
// DSH-04 — racine de travail média des tests : certains hôtes Windows interdisent à FFmpeg
// d'écrire sous %TEMP%. Le dossier .v1 est ignoré par git et reste inscriptible partout.
const mediaTemp = process.env.VULULU_MEDIA_TEMP ?? fileURLToPath(new URL('./.v1/tmp', import.meta.url));
// Sans configuration QA explicite, aucun test ne doit atteindre une base locale existante.
const qaDatabaseUrl = process.env.VULULU_QA_DATABASE_URL || 'postgresql://vululu@127.0.0.1:1/vululu_unconfigured_test';
const qaDatabase = new URL(qaDatabaseUrl);
if (!['postgres:', 'postgresql:'].includes(qaDatabase.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(qaDatabase.hostname) ||
    qaDatabase.port === '55432' || !/^\/vululu.*_test$/i.test(qaDatabase.pathname)) {
  throw new Error('VULULU_QA_DATABASE_URL doit désigner une base de test Vululu locale, hors port 55432.');
}

export default defineConfig({
  resolve: {
    alias: [
      { find: /^react$/, replacement: webDep('react') },
      { find: /^react\/jsx-runtime$/, replacement: webDep('react/jsx-runtime') },
      { find: /^react\/jsx-dev-runtime$/, replacement: webDep('react/jsx-dev-runtime') },
      { find: /^react-dom\/server$/, replacement: webDep('react-dom/server') }
    ]
  },
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    env: { VULULU_MEDIA_TEMP: mediaTemp, DATABASE_URL_TEST: qaDatabaseUrl, DATABASE_URL: qaDatabaseUrl },
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    fileParallelism: false,
    testTimeout: 180000,
    hookTimeout: 180000
  }
});
