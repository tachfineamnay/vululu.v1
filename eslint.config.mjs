// ---------------------------------------------------------------------------
// Vululu AI — configuration ESLint flat (monorepo pnpm)
//
// Portée : tout le depot (apps, packages, tests, e2e, configs racine).
// Les dossiers generes ou locaux sont ignores explicitement pour eviter de
// linter des artefacts (Prisma client, build Next, medias, preuves locales).
//
// Deux niveaux :
//   pnpm lint                       -> gate CI V1-00 : 0 erreur, la dette
//                                      connue du prototype V0 est en warning.
//   LINT_STRICT=1 pnpm lint         -> mode strict : la dette repasse en erreur
//                                      (a activer apres correction par les lots
//                                      applicatifs proprietaires des fichiers).
//
// La dette listee ci-dessous est reelle et localisee : elle n'est jamais
// masquee par une exclusion de fichiers. Voir docs/reviews/V1_TECHNICAL_GAPS.md.
// ---------------------------------------------------------------------------

import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Mode strict : les regles de dette repassent en erreur (CI durcissable).
const strict = process.env.LINT_STRICT === '1';

// Niveau des regles dont le depot actuel contient encore des occurrences
// (prototype V0). Corriger les fichiers concernes puis passer LINT_STRICT=1.
const debt = strict ? 'error' : 'warn';

export default defineConfig([
  // Artefacts generes, dependances et donnees locales : jamais lintes.
  globalIgnores([
    '**/node_modules/**',
    '**/.pnpm-store/**',
    '**/.next/**',
    '**/dist/**',
    '**/build/**',
    '**/out/**',
    '**/coverage/**',
    '**/.turbo/**',
    'data/**',
    '.v0/**',
    '.v1/**',
    '**/test-results/**',
    '**/playwright-report/**',
    '**/blob-report/**',
    '**/*.tsbuildinfo',
    // Genere par Next.js : ne doit jamais etre edite ni linte.
    '**/next-env.d.ts',
    // Client Prisma genere.
    '**/generated/**'
  ]),

  // Regles ESLint de base pour tous les fichiers.
  js.configs.recommended,

  // Regles TypeScript recommandees, sans type-checking : pas de project
  // references necessaires, donc applicable aux tests/e2e sans tsconfig.
  ...tseslint.configs.recommended,

  // Regles communes a tous les fichiers source.
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx,mts,cts}'],
    rules: {
      // Variables non utilisees : regle centrale, dette V0 en mode gate.
      '@typescript-eslint/no-unused-vars': [
        debt,
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
          ignoreRestSiblings: true
        }
      ],
      // Type explicite exige dans le code source ; les tests/e2e sont exemptes
      // ci-dessous (payloads JSON non types).
      '@typescript-eslint/no-explicit-any': 'error',
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-var': 'error',
      'no-debugger': 'error',
      // Regles ajoutees a ESLint 10 recommended : dette V0 toleree en gate.
      'preserve-caught-error': debt,
      'no-useless-assignment': debt
    }
  },

  // Configs et scripts racine : environnement Node.
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: { ...globals.node }
    }
  },

  // Code navigateur Next.js.
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser }
    }
  },

  // Tests unitaires et E2E : les payloads JSON issus de l API sont par nature
  // non types ; any y est tolere mais signale.
  {
    files: ['tests/**/*.ts', 'e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      // Seule occurrence V0 dans tests/api.test.ts (variable affectee une fois).
      'prefer-const': debt
    }
  }
]);