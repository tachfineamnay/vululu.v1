# T00C — finalisation locale de la récupération

Date : 2026-11-24 ; base : `ef98855`. La sauvegarde `stash@{0}` est conservée. Les PR #30, #31, #32 et #33 sont présentes dans l’ascendance (`git merge-base --is-ancestor` pour `4068a2a`, `9890171`, `1cdbc5f`, `9c26e80`, code 0). Les six résolutions sont décrites dans `CODEX_T00B_RECOVERY.md`.

## Configuration PostgreSQL des tests

Le test A02 avait figé le port historique `55432` dans `vi.hoisted`, en écrasant la configuration fournie. Les autres suites avaient souvent un repli historique identique. La configuration Vitest fournit désormais `DATABASE_URL_TEST` et `DATABASE_URL` depuis `VULULU_QA_DATABASE_URL` uniquement ; sans celle-ci, une URL factice sur le port 1 évite de cibler une base existante. L’URL QA doit être PostgreSQL locale, nommée `vululu…_test`, et ne peut utiliser `55432`. L’identité et l’isolement du serveur doivent encore être vérifiés avant toute utilisation. Aucun serveur ni aucune base n’ont été modifiés.

`docker version --format '{{.Server.Version}}'` : code 1, accès refusé au pipe `dockerDesktopLinuxEngine`. Aucun outil Docker MCP local disponible ; mapping courant `3193` non vérifiable. Aucun test PostgreSQL réel revendiqué.

## Vérifications

- `pnpm typecheck` : code 0, sept projets.
- `pnpm lint` : code 0.
- `pwsh -NoProfile -File scripts/check-secrets.ps1` : code 0.
- `pnpm exec vitest run tests/render-concurrency-recovery.test.ts tests/studio-concurrency-ui.test.tsx tests/studio-preview-retry.test.ts tests/v1/result-payload.test.ts tests/publishing-workflow.test.ts tests/publishing-results-ui.test.tsx tests/v1/admin-support-hardening.test.ts tests/admin-support-ui.test.tsx tests/studio-canvas-order.test.tsx` avec `TEMP` et `TMP` dans `.v1/tmp` : 9 fichiers, 77 tests réussis, code 0 ; tests A02/A03/A04 avec dépendances simulées, pas une preuve de base réelle.
- La configuration finale a été vérifiée par une nouvelle exécution A02 ciblée et par une tentative de démarrage avec `VULULU_QA_DATABASE_URL` sur le port interdit : le démarrage est refusé comme attendu.
- `pnpm exec vitest run tests/qa-db-config.test.ts` avec des variables de base héritées fictives sur `55432` : 1 test réussi ; les variables effectives désignent l’adresse de non-connexion.
- `git ls-files -u` : vide ; recherche de marqueurs dans les fichiers de travail : vide ; `git diff --check` et `git diff --cached --check` à exécuter avant commit.

Les tests sur PostgreSQL réel et les tests média dépendants de FFmpeg sont **NOT_RUN** : accès Docker refusé, mapping non vérifié, `ffmpeg`/`ffprobe` absents du PATH. Aucun push, déploiement, opération Lumira ou appel payant.
