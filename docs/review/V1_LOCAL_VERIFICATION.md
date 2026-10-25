# Vérification locale du gate V1-01-H

**Campagne de gate local finale — preuves d'exécution réelles**

| Champ | Valeur |
|---|---|
| Date (ISO 8601) | 2026-10-25T14:24Z (session locale Africa/Casablanca) |
| Vérificateur | agent `verifier` — Phase F |
| Branche | `v1-01-g-architecture-certification` |
| **HEAD CAMPAGNE** | **`49ffc68f0ceecf5209788000a17250a3be0fd8ac`** (49ffc68) |
| Base de référence | `main` = `69c6549ec6d8dd69dbfa7c41c1f1b8a08edaec50` (ancêtre de HEAD) |
| Worktree | `C:\Users\hp\Desktop\vululu-ai-v1-00` |
| Statut global | 14 contrôles **PASS**, 0 FAIL, E2E **2/2 PASS** ; **GitHub Actions distant : NOT_RUN** |

> Ce rapport ne déclare JAMAIS un succès GitHub Actions : aucune exécution distante n'a été effectuée.
> Tous les résultats ci-dessous proviennent d'exécutions locales réelles, horodatées et journalisées.

## 1. Chaîne de commits de la mission (aucune réécriture)

```
bcf2c58  base certifiée (37 commits d'architecture V1-01-G)
49ea97d  fix(ci): rendre le gate GitHub Actions reel, portable et complet
c0358fa  docs(review): rapports Git, sécurité, diff et CI
33afe89  fix(ci): éviter l'auto-détection du scan des chemins personnels
4bd921b  fix(test): scoper le comptage de transferts du test IDOR/RBAC
49ffc68  fix(e2e): attendre les métadonnées vidéo avant de lire la durée   <-- HEAD FINAL
```

Deltas vérifiés : `33afe89` = 1 fichier (+2/−1) ; `4bd921b` = 1 fichier (+7/−1) ; `49ffc68` = 1 fichier (+10/−1). Aucun changement applicatif hors tests/CI/documentation.
`git status --porcelain` **vide** au départ et à la fin de la campagne (HEAD stable avant/après).

## 2. Environnement de vérification

| Élément | Valeur constatée |
|---|---|
| OS | Microsoft Windows 11 Famille, version 10.0.26100 (build 26100), AMD64 |
| PowerShell | 7.6.8 |
| Node.js | v24.21.0 |
| pnpm | 10.6.1 (lockfile figé) |
| Git | 2.48.1.windows.1 |
| PostgreSQL | 17.2 (x86_64-windows), local `127.0.0.1:55432` |
| Base de test isolée | `vululu_v1_00_test` (utilisée pour tests d'intégration et E2E) |
| Base de démonstration | `vululu_v1_00` — **jamais écrite** (preuve §7) |
| FFmpeg | 9.0.2-essentials (via `FFMPEG_PATH` du `.env`, valeur jamais exposée) |
| Playwright | @playwright/test 1.64.1, Chromium installé |
| Python | 3.11.9 (validation YAML) |
| Docker | non utilisé (indisponible) |
| `.env` | **jamais modifié**, jamais affiché ; seules des métadonnées booléennes ont été utilisées |

## 3. Contrôles de la campagne finale (HEAD 49ffc68)

Commandes exécutées depuis la racine du worktree. Journaux bruts hors dépôt :
`$env:TEMP\vululu-v1-evidence\phase2\FINAL_49ffc68\L-*.log` (+ `results.txt`).

| # | Contrôle | Commande exacte | Durée | Exit | Statut | Preuve |
|---|---|---|---|---|---|---|
| 1 | Installation déterministe | `pnpm install --frozen-lockfile` | 5,2 s | 0 | **PASS** | `L-01-install.log` ; `pnpm-lock.yaml` intact (`git status --porcelain -- pnpm-lock.yaml` vide) |
| 2 | Client Prisma | `pnpm db:generate` | 8,1 s | 0 | **PASS** | `L-02-db-generate.log` : Prisma Client v6.19.3 généré |
| 3 | Typecheck monorepo | `pnpm typecheck` | 24,8 s | 0 | **PASS** | `L-03-typecheck.log` : 7 projets workspace « Done » |
| 4 | Lint strict | `$env:LINT_STRICT='1'; pnpm lint` | 8,1 s | 0 | **PASS** | `L-04-lint.log` : sortie vide = 0 erreur / 0 warning |
| 5 | Build production | `pnpm build` | 24,5 s | 0 | **PASS** | `L-05-build.log` : API (tsc) + Next.js 16.4.2, 6 routes |
| 6 | Tests domaine | `pnpm exec vitest run tests/domain` | 12,8 s | 0 | **PASS** | `L-06-vitest-domain.log` : 11 fichiers / 82 tests passed |
| 7 | Migrations PostgreSQL | `$env:DATABASE_URL='postgresql://vululu@127.0.0.1:55432/vululu_v1_00_test?schema=public'; $env:DATABASE_URL_TEST=idem; pnpm exec prisma migrate deploy --schema packages/db/prisma/schema.prisma` puis `... migrate status ...` | 4,2 s / 3,4 s | 0 / 0 | **PASS** | `L-07-migrate-deploy.log` (12 migrations, « No pending migrations to apply »), `L-07-migrate-status.log` (« Database schema is up to date! »), `L-07c-db-migrations-applied.json` |
| 8 | Tests API + V1 | `pnpm exec vitest run tests/api.test.ts tests/v1` (DATABASE_URL/DATABASE_URL_TEST/V0_TEST_DB forcés sur la base de test) | 76,0 s | 0 | **PASS** | `L-08-vitest-api-v1.log` : 9 fichiers / 90 passed / 2 skipped / 0 failed |
| 9 | Tests média (FFmpeg réel) | `$env:FFMPEG_PATH=<valeur FFMPEG_PATH du .env>; pnpm exec vitest run tests/media.test.ts` | 53,2 s | 0 | **PASS** | `L-09-vitest-media.log` : 1 fichier / 1 test passed (5 PNG 1080×1920, 2 masters MP4 h264/aac, QA) |
| 10 | Docs fondation | `pwsh -NoProfile -File scripts/verify-foundation-docs.ps1` | 2,6 s | 0 | **PASS** | `L-10-verify-foundation-docs.log` : HASHES_OK=9, FOUNDATION_CHECK_PASS |
| 11a | Secrets — arbre de travail | `pwsh -NoProfile -File scripts/check-secrets.ps1` | 12,3 s | 0 | **PASS** | `L-11a-check-secrets-worktree.log` : SCAN_FILES=313, SECRET_SCAN_PASS |
| 11b | Secrets — arbre + historique Git | `pwsh -NoProfile -File scripts/check-secrets.ps1 -History` | 23,9 s | 0 | **PASS** | `L-11b-check-secrets-history.log` : HISTORY_SCAN_REVS=44, SECRET_HISTORY_SCAN_PASS |
| 12a | Frontières architecture | `pwsh -NoProfile -File scripts/check-architecture-boundaries.ps1` | 2,7 s | 0 | **PASS** | `L-121-check-architecture-boundaries.log` : BOUNDARY_CHECK_PASS (Domain 20 fichiers/93 imports, Application 16/53) |
| 12b | Structure migrations | `pwsh -NoProfile -File scripts/check-migrations.ps1` | 2,1 s | 0 | **PASS** | `L-122-check-migrations.log` : MIGRATIONS=12, MIGRATION_CHECK_PASS |
| 12c | Fichiers suivis / chemins personnels | `pwsh -NoProfile -File scripts/check-tracked-files.ps1` | 3,4 s | 0 | **PASS** | `L-123-check-tracked-files.log` : TRACKED_FILES=316, TRACKED_CONTENT_SCANNED=212, TRACKED_CHECK_PASS |
| 13 | Validation statique du workflow CI | `python validate_ci.py <(git show HEAD:.github/workflows/ci.yml)` (PyYAML) | 2,4 s | 0 | **PASS** (statique) | `L-13-workflow-validation.json` : YAML_PARSE=OK, TRIGGERS_OK, JOBS_OK, PERMISSIONS_OK, NO_CONTINUE_ON_ERROR, FETCH_DEPTH0, ALL_STEPS_OK |
| 14a | Seed base de test | `pnpm exec tsx packages/db/prisma/seed.ts` (V0_TEST_DB=1) | 1,7 s | 0 | **PASS** | `L-14b-seed.log` : « Seeded bootstrap super_admin: demo@vululu.local » |
| 14b | E2E Playwright — run 1 (froid) | `pnpm exec playwright test e2e/v0.spec.ts --reporter=list` | 108,4 s | 0 | **PASS** | `L-14d-e2e-run1.log` : « 1 passed (1.8m) », verticale V0 complète |
| 14c | E2E Playwright — run 2 (chaud) | idem, exécution consécutive | 125,7 s | 0 | **PASS** | `L-14d-e2e-run2.log` : « 1 passed (2.0m) » |

**Total : 21 exécutions de contrôles, 21 PASS, 0 FAIL.** Aucun serveur laissé actif après la campagne.

## 4. Comptage exact des tests

| Suite | Fichiers | Tests collectés | PASS | FAIL | SKIP |
|---|---|---|---|---|---|
| `tests/domain` | 11 | 82 | 82 | 0 | 0 |
| `tests/api.test.ts` + `tests/v1` | 9 | 92 | 90 | 0 | 2 |
| `tests/media.test.ts` | 1 | 1 | 1 | 0 | 0 |
| **Total suites vitest** | **21** | **175** | **173** | **0** | **2** |
| E2E Playwright `e2e/v0.spec.ts` | 1 | 1 | 1 (×2 runs) | 0 | 0 |

Les 2 tests SKIP sont explicites et documentés : `tests/v1/v1-01-e-storage.test.ts` ligne 383,
`describe.skipIf(S3_ENABLED)` avec `S3_ENABLED = process.env.E_S3_TEST === '1'` — aucun endpoint
S3-compatible n'est configuré localement. Le stockage local reste couvert (6 tests). Ce ne sont ni
des échecs ni de la flakiness.

Aucune flakiness résiduelle observée après les correctifs : 2 runs E2E consécutifs PASS,
et le test IDOR corrigé PASS sur une base de test non vierge.

## 5. Migrations Prisma — 12/12 validées

`prisma migrate deploy` : 12 migrations trouvées, aucune en attente ; `migrate status` :
schéma à jour. Vérification indépendante en base (`_prisma_migrations`) :
total=12, appliquées=12, annulées=0, inachevées=0.

```
20261022184734_init
20261023082309_scene_durations_approval_invalidation
20261023085719_brief_revisions
20261023124017_v1_00_foundation
20261023160509_v1_01_a_snapshot_versioning
20261023170000_v1_01_a1_active_run_index
20261023173000_v1_01_a1_run_integrity
20261023183000_v1_01_b_agentic_capabilities
20261024180000_v1_01_d_durable_orchestration
20261024190000_v1_01_d_active_run_scope
20261025100000_v1_01_e_artifact_storage
20261025120000_v1_01_f_hardening
```

## 6. Validation statique du workflow GitHub Actions (distant : NOT_RUN)

Fichier `.github/workflows/ci.yml` au HEAD 49ffc68 (361 lignes, 14,4 Ko), validé par parsing YAML
réel (PyYAML) puis contrôles structurels automatisés (`validate_ci.py`) :

- **YAML** : parsing OK ;
- **4 jobs bloquants** : `quality`, `unit-integration`, `e2e`, `security-architecture` ;
- **déclencheurs** : `push`, `pull_request`, `workflow_dispatch` ;
- **permissions** : `contents: read` (moindre privilège) ;
- **aucun `continue-on-error`** (aucune clé dans le YAML, seulement une mention en commentaire) ;
- **aucun job conditionné par un input** (`workflow_dispatch` ne gate aucun job) ;
- `security-architecture` : `actions/checkout@v4` avec `fetch-depth: 0` (scan historique) ;
- services PostgreSQL 17 dans `unit-integration` et `e2e` ; FFmpeg installé dans les jobs qui en ont besoin ;
- étapes présentes : install figée, `db:generate`, lint strict, typecheck, build, `migrate deploy`+`status`,
  vitest (domain+api+v1+media), seed, Playwright Chromium + archive des traces, scan secrets `-History`,
  validation lockfile, frontières architecture, pureté du domaine, `prisma validate`, structure des
  migrations, docs fondation, fichiers suivis ;
- actions épinglées en `@v4` (`checkout`, `setup-node`, `pnpm/action-setup`, `upload-artifact`).

**Statut GitHub Actions : NOT_RUN.** Ces vérifications prouvent la cohérence statique du workflow,
pas son exécution sur un runner GitHub. Aucun run distant n'a été lancé (pas de push).

## 7. E2E Playwright local — preuve d'exécution et d'isolation des bases

Recette exacte (aucune modification de `.env`, `.env` chargé par l'application avec `override: true`) :

```powershell
$env:V0_TEST_DB='1'
$env:DATABASE_URL='postgresql://vululu@127.0.0.1:55432/vululu_v1_00_test?schema=public'
$env:DATABASE_URL_TEST=$env:DATABASE_URL
$env:API_PORT='3101'
$env:V1_BOOTSTRAP_EMAIL='demo@vululu.local'; $env:V1_BOOTSTRAP_PASSWORD='<secret local e2e>'
$env:V0_DEMO_EMAIL='demo@vululu.local';      $env:V0_DEMO_PASSWORD='<secret local e2e>'
$env:FFMPEG_PATH='<valeur FFMPEG_PATH du .env>'
pnpm exec tsx packages/db/prisma/seed.ts
pnpm exec playwright test e2e/v0.spec.ts --reporter=list
```

- Ports 3100/3101 **libres avant** chaque run (vérifié) ; Playwright démarre API (`tsx watch`, port 3101)
  et Web (`next dev -p 3100`) via `webServer`, puis les arrête ;
- **run 1 (froid)** : EXIT=0, 108,4 s — « 1 passed (1.8m) » ; **run 2 (chaud, consécutif)** :
  EXIT=0, 125,7 s — « 1 passed (2.0m) ». Les deux runs couvrent la verticale V0 complète :
  contexte → projet → brief → storyboard 5 scènes → production (rendu FFmpeg réel + QA) → approbation
  → correction Scene 3 (master v2, invalidation d'approbation) → transfert idempotent (Postiz mock,
  « acknowledged ») → contrôle IDOR → déconnexion ;
- Après la campagne : **aucun serveur** en écoute sur 3100/3101, **aucun processus orphelin** du
  worktree certification ; `test-results/` est créé et **ignoré par Git** (`git check-ignore` OK).

**Preuve d'isolation (comptages SQL read-only, base test vs base démo)** — la base de test a augmenté
(campagnes de tests et E2E), la base de démonstration est **strictement identique** du début à la fin
de la mission :

| Table | Démo 2026-10-25T13:39Z | Démo 2026-10-25T14:23Z (après tous les E2E) |
|---|---|---|
| user | 3 | 3 |
| brandContext | 28 | 28 |
| project | 36 | 36 |
| scene | 160 | 160 |
| sceneVersion | 249 | 249 |
| transfer | 44 | 44 |
| productionJob | 71 | 71 |
| jobRun | 64 | 64 |
| stepRun | 240 | 240 |
| auditEvent | 285 | 285 |

La base de test `vululu_v1_00_test` a, elle, augmenté (ex. brandContext 70→91, project 68→87,
transfer 0→7), ce qui prouve que l'E2E a bien écrit **uniquement** dans la base isolée.

## 8. Incidents de la mission, causes racines et corrections

Quatre incidents réels ont été rencontrés et corrigés ; aucun n'a été masqué.

### (i) Serveur API orphelin verrouillant le moteur Prisma — campagne baseline (bcf2c58)

- **Symptôme** : `pnpm db:generate` EXIT=1, `EPERM: operation not permitted, rename '...query_engine-windows.dll.node.tmp13880' -> '...query_engine-windows.dll.node'`.
- **Cause racine** : un serveur API du worktree de certification (session antérieure, démarré 2026-10-25T11:26:36, PID 7252/8688, port 3101) avait chargé la DLL Prisma ; le rename était impossible sous Windows.
- **Correction** : arrêt du serveur orphelin après autorisation du Lead (aucun changement de code) ; ports libérés ; retry PASS (51,9 s). Preuve : `00-orphan-api-server.txt`, `02-db-generate.log`.

### (ii) Auto-détection de `scripts/check-tracked-files.ps1` — HEAD c0358fa

- **Symptôme** : EXIT=1, `FAIL PERSONAL_ABSOLUTE_PATH scripts/check-tracked-files.ps1 lines=1`.
- **Cause racine** : le commentaire d'aide du script contenait l'exemple littéral `X:/Users/...`, qui correspondait à son propre motif de détection de chemins personnels.
- **Correction** : commit `33afe89` — reformulation du commentaire (`+2/−1`, aucun changement de logique) ; PASS ensuite (TRACKED_FILES=316, TRACKED_CONTENT_SCANNED=212).

### (iii) Comptage global de transferts dans le test IDOR/RBAC — HEAD 33afe89

- **Symptôme** : campagne F8 FAIL, `tests/v1/auth-security.test.ts:744` : `expected 1 to be +0` (`prisma.transfer.count()`).
- **Cause racine** : le test exigeait une table `Transfer` globalement vide ; un E2E de diagnostic avait laissé 1 transfert dans la base de test isolée (comportement attendu de l'E2E). Aucune régression applicative.
- **Correction** : commit `4bd921b` — comptage scopé à l'artefact cible `{ where: { approval: { artifactVersionId: masterVersionA.id } } }` (`+7/−1`). Intention de sécurité préservée (404 inter-utilisateurs toujours exigés, aucun transfert pour l'artefact cible) ; F8 PASS sur base de test **non vierge**.

### (iv) Course sur les métadonnées vidéo E2E — HEAD 4bd921b

- **Symptôme** : 2e exécution E2E consécutive FAIL : `e2e/v0.spec.ts:101` `expect(videoDuration).toBeGreaterThanOrEqual(9)` → `Received: NaN`.
- **Cause racine** : `HTMLVideoElement.duration` vaut `NaN` tant que les métadonnées ne sont pas chargées (`readyState < 1`) ; le test lisait la durée juste après `toBeVisible()`, sans attendre `loadedmetadata`. Taux observé : 3 PASS / 1 FAIL sur 4bd921b.
- **Correction** : commit `49ffc68` — attente `expect.poll` sur `readyState >= 1` (timeout 30 s) avant lecture (`+10/−1`) ; assertion métier inchangée (durée 9–11 s) ; **2 runs consécutifs PASS** sur 49ffc68 (froid 108,4 s / chaud 125,7 s). Preuves : `L-14d-e2e-run1.log`, `L-14d-e2e-run2.log` ; trace du FAIL transitoire conservée dans `test-results/` (ignoré par Git).

## 9. Limites, éléments NOT_RUN et points P3

| Élément | Statut | Justification |
|---|---|---|
| GitHub Actions (jobs quality/unit-integration/e2e/security-architecture) | **NOT_RUN** | Aucun run distant exécuté (aucun push) ; workflow validé statiquement uniquement. |
| Replay des 12 migrations depuis une base vide | **NOT_RUN** (local) | Pas de psql/Docker disponibles pour créer une base ; la base de test locale était déjà migrée 12/12. Couvert par la CI sur service PostgreSQL vierge. |
| Tests S3-compatible (2 cas) | **SKIP** | `E_S3_TEST=1` non défini ; aucun endpoint S3 local. |
| E2E sur Chromium uniquement | Limite | `playwright.config.ts` n'active qu'un projet Chromium ; Firefox/WebKit non couverts localement. |
| P3 — `apps/web/next-env.d.ts` volatil | Documenté | Fichier suivi réécrit par `next build` (variante prod) puis restauré par `next dev` (variante dev = contenu HEAD). Après la campagne (E2E en dernier), `git status` est vide ; le Lead gère l'état avant commit. |
| P3 — Durées locales variables | Documenté | Mesures locales dépendantes de la charge machine (ex. lint strict : 530,9 s sous contention en tout début de mission vs 8,1 s machine au repos). Non représentatives de la CI. |
| P3 — Base de test locale non réinitialisée | Documenté | Elle accumule les données des campagnes successives (par conception : base isolée). L'isolation vis-à-vis de la base de démo est prouvée (§7). |
| P3 — `pnpm install` : « Ignored build scripts » | Sans impact | `@hatchet-dev/typescript-sdk` et `protobufjs` ; Prisma est bien généré (`onlyBuiltDependencies`), Hatchet n'est pas requis par les suites locales (fallback outbox testé). |
| P3 — Résidu `.v0/test-media-1792760595009` | Sans impact | Créé le 2026-10-23 par une session antérieure, ignoré par Git, hors périmètre ; non supprimé. |

## 10. État final du dépôt

- **HEAD avant et après campagne** : `49ffc68f0ceecf5209788000a17250a3be0fd8ac` (inchangé) ;
- **`git status --porcelain` vide** à la fin des exécutions (aucun fichier non suivi hors ce rapport) ;
- Aucun serveur en écoute sur 3100/3101 ; aucun processus Node orphelin du worktree certification ;
- `test-results/` ignoré par Git ; `playwright-report/` absent ;
- Ce document `docs/review/V1_LOCAL_VERIFICATION.md` est le **seul fichier produit** par la campagne
  (le Lead le committera en docs-only, sans modification de code).

## 11. Conclusion

- **Gate local : PASS** sur HEAD `49ffc68f0ceecf5209788000a17250a3be0fd8ac` — 14 contrôles PASS,
  173 tests vitest PASS (2 SKIP documentés), 2 runs E2E consécutifs PASS, 12 migrations validées,
  scan de secrets arbre + historique PASS, frontières d'architecture PASS.
- **GitHub Actions distant : NOT_RUN** — la preuve d'exécution CI devra être produite après le push
  et le déclenchement du workflow (ce rapport ne prétend pas le contraire).
- Tous les incidents rencontrés ont une cause racine identifiée et une correction vérifiée par
  ré-exécution sur le HEAD final.
