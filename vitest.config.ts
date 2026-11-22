import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Les composants du Studio vivent dans l'espace de travail web : on pointe React vers sa
// copie pour que les tests de rendu partagent exactement la même instance que l'application.
const webDep = (name: string) => fileURLToPath(new URL('./apps/web/node_modules/' + name, import.meta.url));

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
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    fileParallelism: false,
    testTimeout: 180000,
    hookTimeout: 180000
  }
});
