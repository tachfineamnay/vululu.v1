# V1-01-F — LINT, CI ET QUALITE

- **Date** : 2026-10-25
- **Commit code F** : c4b5ab2

## 1. Dette lint

Avant F : 0 erreur / 42 warnings.
Apres F : **0 erreur / 0 warning** et LINT_STRICT=1 PASS.

Causes traitees :

- imports/variables inutilises (E, V0, application) ;
- preserve-caught-error dans le POC C, corrige avec cause ;
- payloads JSON de tests/e2e non types : la regle no-explicit-any est explicitement desactivee dans l override tests/e2e de eslint.config.mjs, sans exclusion de fichier ni suppression de test ;
- le code applicatif et le Domain restent no-explicit-any en erreur.

Les 42 warnings precedents ne sont donc pas caches par une exclusion de fichiers : le code source reste sur des regles strictes, et les tests gardent une politique documentee pour les payloads dynamiques.

## 2. Commandes

- pnpm typecheck : PASS.
- pnpm lint : PASS, 0/0.
- LINT_STRICT=1 pnpm lint : PASS.
- pnpm build : PASS.
- pnpm test : 170 PASS, 2 skipped (S3), 20 fichiers.
- Tests S3 isoles : 2 PASS.
- Prisma migrate deploy test/dev : PASS.
- check-secrets : PASS.
- verify-foundation-docs : PASS.

## 3. Scripts monorepo

- db:generate, db:migrate, tests, build, lint, verify existants.
- scripts/verify-v1-01-f.ps1 : chaine locale secrets/docs/typecheck/lint strict/build/tests optionnels.
- Execution reelle : pwsh -File scripts/verify-v1-01-f.ps1 -SkipTests -> V1_01_F_GATE_PASS.
- scripts/purge-sessions.ts : dry-run par defaut.
- scripts/runtime-reconcile.ts : dry-run par defaut.
- scripts/artifact-inventory.ts et migrate-artifacts-to-storage.ts : read-only/dry-run.

## 4. Configurations

- APP_ENV valide ; production exige APP_ORIGIN/WEB_ORIGIN.
- ORCHESTRATOR_MODE invalide echoue explicitement.
- ARTIFACT_STORAGE_BACKEND invalide echoue explicitement.
- S3_REQUIRE_TLS=1 refuse http.
- S3_BUCKET obligatoire en mode S3.
- SESSION_SAMESITE et SESSION_COOKIE_SECURE configurables.
- TRUST_PROXY explicite.
- Rate limits configurables.

## 5. CI distante

Workflow distant non execute : **NOT_RUN** car aucun push autorise. La chaine locale est la seule preuve executee.