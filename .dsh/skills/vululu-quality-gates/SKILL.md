---
name: vululu-quality-gates
description: Vérifier une modification Vululu AI sans jamais fabriquer de PASS — matrice des tests et gates locaux (vitest, typecheck, lint strict, build, Prisma, E2E Playwright, scripts PowerShell, ci.ps1), sémantique des preuves, échecs connus et statut CI NOT_RUN.
whenToUse: Avant d'annoncer un lot terminé, de dire qu'une CI est verte ou de conclure qu'un secret, une migration ou une architecture est validé, et pour trier un échec de script qualité.
---

# Vululu AI — quality gates et preuves

**But** : choisir la bonne vérification, l'exécuter avec les bons prérequis et rapporter son résultat réel (PASS, SKIP motivé, MOCK, NOT_RUN, FAIL). Une étape non exécutée s'écrit **NOT_RUN**, jamais PASS (AGENTS.md §3/§6).

## Quand l'utiliser

- Avant de déclarer un lot/document terminé, ou de dire « CI verte ».
- Pour rejouer tout ou partie des gates après un diff (code, tests, scripts, docs).
- Pour interpréter un SKIP, un MOCK, un échec de script, ou un écart entre gate local et CI.

**Ne pas l'utiliser pour** : démarrer/arrêter la pile locale (`vululu-local-stack`), dérouler le protocole de lot, ADR et git (`vululu-lot-delivery`), modifier l'architecture (`vululu-architecture-change`), préparer staging/Coolify (`vululu-ops-readiness`).

## État vérifié (2026-11-04, HEAD `bb0bc3a`, branche `main`)

Statuts : **VÉRIFIÉ** = commande réellement exécutée ce jour ; **DOCUMENTÉ** = lu dans un rapport, non rejoué ; **NOT_RUN** = non exécuté.

| Élément | Constat | Statut |
|---|---|---|
| Outils / infra | Node `v24.21.0`, pnpm `10.6.1`, `node_modules` + client Prisma 6.19.3 ; PostgreSQL 55432 **arrêté**, ports 3100/3101 libres, Chromium Playwright présent, FFmpeg local hors PATH | VÉRIFIÉ |
| `check-secrets.ps1` (arbre) | `SECRET_SCAN_PASS`, 387 fichiers, 14,9 s, exit 0 | VÉRIFIÉ |
| `check-secrets.ps1 -History` | `SECRET_HISTORY_SCAN_FAIL: 6 detection(s)` (58 révisions), exit 1 — placeholder, voir §3 | VÉRIFIÉ |
| `check-architecture-boundaries.ps1` | `BOUNDARY_CHECK_PASS` : 20 fichiers / 93 imports Domain, 17 / 56 Application, exit 0 | VÉRIFIÉ |
| `check-migrations.ps1` | `MIGRATION_CHECK_PASS`, `MIGRATIONS=12`, exit 0 | VÉRIFIÉ |
| `check-tracked-files.ps1` | `TRACKED_CHECK_FAIL` : `FORBIDDEN_ENV_FILE infra/coolify/.env.coolify.example` (391 suivis / 269 scannés), exit 1 | VÉRIFIÉ |
| `verify-foundation-docs.ps1` | `FOUNDATION_CHECK_FAIL` : `FORBIDDEN_TRACKED_SECRET infra/coolify/.env.coolify.example`, `HASHES_OK=9`, exit 1 | VÉRIFIÉ |
| `prisma validate` + `git diff --check` | schéma valide (exit 0, sans connexion) ; diff suivi propre (exit 0) | VÉRIFIÉ |
| Vitest domaine | 11 fichiers / 82 tests PASS, 17,5 s, exit 0 | VÉRIFIÉ |
| Typecheck | **VÉRIFIÉ PASS** le 2026-11-04 (7 projets workspace, session architecture) | VÉRIFIÉ |
| Lint strict, build | PASS documentés (recette 2026-11-01) ; non rejoués ici | DOCUMENTÉ |
| API, V1, media, migrate status, E2E | non exécutés ce jour (infra arrêtée) | NOT_RUN |
| CI GitHub Actions | workflow défini, **jamais exécuté sur runner** | NOT_RUN |
| Campagnes historiques | 173 PASS/2 SKIP (2026-10-25) ; 188 PASS/2 SKIP + 3 E2E PASS (2026-11-01) | DOCUMENTÉ |

## 1. Matrice : que vérifier, avec quelle commande (depuis la racine ; « durée » = ordre de grandeur)

### A. Statique, rapide, sans service

| Vérification | Commande exacte | Prérequis | Durée | Attendu |
|---|---|---|---|---|
| Typecheck | `pnpm typecheck` | client Prisma | 25-60 s | exit 0 (7 projets workspace) |
| Lint (gate) | `pnpm lint` | — | 10-60 s | 0 erreur ; warnings de dette V0 tolérés |
| Lint strict | `$env:LINT_STRICT='1'; pnpm lint` | — | 10-60 s | 0 erreur / 0 warning (exigé par la CI) |
| Build | `pnpm build` | client Prisma, `DATABASE_URL` factice/test | 25-90 s | exit 0 (API tsc + next build) |
| Schéma Prisma | `pnpm exec prisma validate --schema packages/db/prisma/schema.prisma` | CLI Prisma | ~2 s | « is valid », exit 0 |
| Migrations (structure) | `pwsh -NoProfile -File scripts/check-migrations.ps1` | git | 3 s | `MIGRATION_CHECK_PASS`, 12 migrations |
| État des migrations | `$env:DATABASE_URL='postgresql://vululu@127.0.0.1:55432/vululu_v1_00_test?schema=public'; pnpm exec prisma migrate status --schema packages/db/prisma/schema.prisma` | PostgreSQL 55432 + base migrée | 3-5 s | « Database schema is up to date! » ; exit ≠ 0 si migration en attente |
| Frontières d'architecture | `pwsh -NoProfile -File scripts/check-architecture-boundaries.ps1` | git | 3-4 s | `BOUNDARY_CHECK_PASS` |
| Secrets — arbre | `pwsh -NoProfile -File scripts/check-secrets.ps1` | git | ~15 s | `SECRET_SCAN_PASS`, exit 0 |
| Secrets — arbre + historique | `pwsh -NoProfile -File scripts/check-secrets.ps1 -History` | clone **complet** (pas shallow) | ~25 s | exit 0 attendu ; aujourd'hui **FAIL connu §3** ; exit 2 = historique inexploitable, pas une détection |
| Fichiers suivis | `pwsh -NoProfile -File scripts/check-tracked-files.ps1` | git | ~7 s | `TRACKED_CHECK_PASS` ; aujourd'hui **FAIL connu §3** |
| Docs fondation | `pwsh -NoProfile -File scripts/verify-foundation-docs.ps1` | git | ~5 s | `FOUNDATION_CHECK_PASS`, `HASHES_OK=9` ; aujourd'hui **FAIL connu §3** |

### B. Suites Vitest (`pnpm test` = `vitest run`)

| Périmètre | Commande exacte | Prérequis | Durée | Attendu |
|---|---|---|---|---|
| Domaine seul | `pnpm exec vitest run tests/domain` | client Prisma ; **ni DB ni FFmpeg** | 15-25 s | 11 fichiers / 82 tests PASS (rejoué 2026-11-04) |
| API | `pnpm exec vitest run tests/api.test.ts` | PostgreSQL 55432, base `vululu_v1_00_test`, `SESSION_SECRET` ≥ 32, client Prisma, migrations appliquées par la suite | 1-2 min | exit 0, tout PASS |
| V1 | `pnpm exec vitest run tests/v1` | idem API (pas FFmpeg) | 1-3 min | exit 0 ; **2 SKIP** S3 si `E_S3_TEST` absent (voir §5) |
| Media (FFmpeg réel) | `pnpm exec vitest run tests/media.test.ts` | `FFMPEG_PATH` vers un binaire complet (libx264/AAC) | 45-60 s | 1 test PASS : 5 PNG 1080×1920 + MP4 h264/aac + QA |
| Toutes suites non-E2E | `pnpm test` | DB + FFmpeg + secret session | 2-4 min | tous PASS ; 2 SKIP S3 acceptés et motivés |

Le périmètre est défini par `vitest.config.ts` : `include: ['tests/**/*.test.ts']` uniquement. `e2e/` n'est pas Vitest et `tests/domain/fixtures.ts` n'est pas un test. `fileParallelism: false`, `testTimeout`/`hookTimeout` = 180 s : les suites sont séquentielles et longues.

### C. E2E, recette et scripts PowerShell

| Vérification | Commande exacte | Prérequis | Durée | Attendu |
|---|---|---|---|---|
| E2E Playwright | `pnpm exec playwright test e2e/ --reporter=list` (ou `pnpm test:e2e`) | PostgreSQL + base **isolée** migrée + seedée, FFmpeg, Chromium, API 3101 + Web 3100 | 2-4 min | 3 tests PASS (v0 : 1 ; admin : 2) ; traces dans `test-results/` en cas d'échec |
| Recettes scriptées | `pwsh -NoProfile -File scripts/v1-acceptance.ps1` (option `-RunE2E`) ; `pwsh -NoProfile -File scripts/verify-v0.ps1 -ApiBase http://127.0.0.1:3101` | API 3101 + Web 3100 démarrés, identifiants démo, projet lisible/transféré MOCK | 20-40 s ; 10-30 s | `ACCEPTANCE_PASS` / `V0_VERIFY_PASS` ; sans `-RunE2E` : `E2E=NOT_RUN` ; transfert `postiz-mock` = **MOCK**, pas publication |
| Chaîne F | `pwsh -NoProfile -File scripts/verify-v1-01-f.ps1 -SkipTests` | gates docs OK, typecheck/lint strict/build | 1-2 min | `V1_01_F_GATE_PASS` ; aujourd'hui bloquée à l'étape docs (§3) ; `-SkipTests` affiche tests NOT_RUN |
| CI locale (miroir partiel) | `pwsh -NoProfile -File scripts/ci.ps1` + flags | voir flags ci-dessous | 1-5 min | `CI_RESULT=PASS` ; exit 0/1/2 |

`scripts/ci.ps1` : flags `-SkipLint`, `-SkipTypecheck`, `-SkipTests`, `-SkipBuild`, `-SkipSecrets`, `-TestSet all|domain|api|v1|media`, `-TestFiles <filtres>`. Il génère Prisma, puis lint (non strict), typecheck, tests (sous-ensemble), build, `check-secrets` (arbre) ; il résume PASS/SKIP/FAIL. Exit `0` = étapes exécutées vertes (SKIP non comptés), `1` = échec, `2` = préflight/usage.

Conditions E2E de référence : base isolée (jamais la démo), `DATABASE_URL`/`DATABASE_URL_TEST` exportées, `V0_TEST_DB=1` pour viser la base de test, `API_PORT=3101`, `FFMPEG_PATH`, Chromium installé, puis `prisma migrate deploy` + `pnpm exec tsx packages/db/prisma/seed.ts` (avec `V1_BOOTSTRAP_EMAIL`/`V1_BOOTSTRAP_PASSWORD`). Les specs E2E utilisent des identifiants de repli publics `demo@vululu.local` / `vululu-demo` via `V0_DEMO_*` : ils doivent correspondre au compte seedé. `CAPTURE_STUDIO=1` réécrit 5 PNG **suivis** dans `docs/reports/studio-v1-captures/` : vérifier `git status` après.

## 2. Sémantique des preuves

| Statut | Sens | Règle |
|---|---|---|
| **PASS** | commande réellement exécutée, exit attendu, sortie citée | jamais déduit d'une lecture de code |
| **SKIP** | test volontairement ignoré, **motif obligatoire** | jamais compté comme échec, jamais comme PASS |
| **MOCK** | fournisseur simulé (Postiz, providers IA, coûts) | « transféré MOCK » ≠ « publié » ; MOCK explicite dans tout rapport |
| **NOT_RUN** | étape non exécutée (services absents, `-Skip*`, CI non lancée) | toujours écrire le motif ; ne jamais convertir en PASS |
| **FAIL** | exit non attendu ou sortie en échec | peut être un échec connu qualifié (§3), jamais masqué |
| BLOCKED | impossible d'exécuter pour cause externe (réseau, service) | usage CI documenté ; ne pas confondre avec PASS |

- Écrire les preuves d'un lot dans `docs/execution/V1_01_*_TEST_EVIDENCE.md`, une recette/campagne dans `docs/reports/`, un audit dans `docs/review/` ; format complet : skill `vululu-lot-delivery` §3, exemple réel : `docs/execution/V1_01_F_TEST_EVIDENCE.md`.
- Format minimal : commande exacte, date ISO 8601 + HEAD, résultat réel, limitation, artefacts (logs, captures, chemins ignorés). Exemple : `- Résultat : NOT_RUN (services arrêtés)`. Les chiffres historiques doivent être datés et attribués à leur rapport, jamais rejoués comme preuve du jour (§5).

## 3. Échecs connus au 2026-11-04 — convention de nommage, pas fuite

Les contrôles ci-dessous concernent le **même modèle d'environnement** `infra/coolify/.env.coolify.example`, fichier suivi documenté comme modèle sans secret (`docs/reports/VULULU_STAGING_ACCEPTANCE.md` §1).

| Commande | Exit | Message exact constaté | Cause |
|---|---|---|---|
| `scripts/check-tracked-files.ps1` | 1 | `TRACKED_CHECK_FAIL: 1 probleme(s).` puis `FAIL FORBIDDEN_ENV_FILE infra/coolify/.env.coolify.example` | prédicat n'accepte que `*.env.example` |
| `scripts/verify-foundation-docs.ps1` | 1 | `HASHES_OK=9`, `FOUNDATION_CHECK_FAIL: 1 probleme(s).` puis `FAIL FORBIDDEN_TRACKED_SECRET infra/coolify/.env.coolify.example` | même prédicat |
| `scripts/check-secrets.ps1` | 0 | `SECRET_SCAN_PASS` (387 fichiers) | le scan de contenu ignore par nom les `.env.*` autres que `.env.example` |
| `scripts/check-secrets.ps1 -History` | 1 | `SECRET_HISTORY_SCAN_FAIL: 6 detection(s)` + 6 × `HISTORY_FINDING pattern=assigned-secret ... file=infra/coolify/.env.coolify.example line=10` (58 révisions) | ligne 10 : `SESSION_SECRET` dont la valeur est un placeholder commençant par `CHANGE_ME` (26 caractères, jamais un secret réel) ; motif `assigned-secret` heuristique |

Conclusion de triage : **aucun secret réel, aucune rotation nécessaire**. C'est un échec de convention de nommage/placeholder, pas une fuite. Ne pas improviser de correctif dans un lot sans rapport :

- ne **pas supprimer** le fichier et ne **pas renommer sans décision** ; un renommage seul en `.env.example` ne suffirait pas : le scan arbre prendrait alors le fichier en compte et `SESSION_SECRET` avec sa valeur placeholder déclencherait `assigned-secret`. Il faut aligner les placeholders (le `.env.example` racine laisse les secrets vides), mettre à jour l'exception `.gitignore` et les références (runbook, Compose, rapports), puis rejouer les 3 gates **et** `-History` ;
- le job CI `security-architecture` appelle `check-secrets -History`, `verify-foundation-docs` et `check-tracked-files` : en l'état, un run distant serait rouge sur ces étapes. Or `scripts/ci.ps1` ne les exécute pas : « `ci.ps1` vert » ne prouve donc **pas** une CI verte ; nommer l'échec (« échec connu de convention »), sa cause et le lot de correction dédié, sans jamais écrire « aucun problème » ni « CI verte ».

## 4. Statut CI — définie mais NOT_RUN

`.github/workflows/ci.yml` (4 jobs bloquants, déclencheurs `push`/`pull_request`/`workflow_dispatch`, `permissions: contents: read`) existe et a été validé **statiquement** (`docs/review/V1_CI_WORKFLOW_REVIEW.md` §2/§18/§20), mais **n'a jamais été exécuté sur un runner GitHub** au 2026-11-04 ⇒ **NOT_RUN**. Ne jamais écrire « CI verte ».

| Job CI | Contenu | Reproduction locale | Limite du gate local |
|---|---|---|---|
| `quality` | install figée, `db:generate`, `LINT_STRICT=1 pnpm lint`, typecheck, build | mêmes commandes à la main | `ci.ps1` fait lint **non strict**, typecheck, build ; pas de contrôle lockfile |
| `unit-integration` | PostgreSQL 17 éphémère (base `vululu_v1_00_test`, port 55432) + FFmpeg, `migrate deploy`+`status`, `vitest run tests/domain tests/api.test.ts tests/v1 tests/media.test.ts` | démarrer PG local puis mêmes commandes | `ci.ps1` seulement si PG/FFmpeg/secret présents |
| `e2e` | PostgreSQL + FFmpeg + seed + Chromium + `playwright test e2e/`, API 3101 / Web 3100 | mêmes commandes avec base isolée | jamais exécuté par `ci.ps1` |
| `security-architecture` | `fetch-depth: 0`, `check-secrets -History`, lockfile, frontières, pureté domaine, `prisma validate`, migrations, docs, fichiers suivis | les scripts seuls, un par un | `ci.ps1` ne fait que `check-secrets` (arbre) |

Hors gate local **et** distant : S3 réel, Hatchet réel, TLS/IAM/SSE, redémarrage moteur, charge multi-workers (`docs/review/V1_CI_WORKFLOW_REVIEW.md` §16) ⇒ NOT_RUN. La CI cible `ubuntu-latest` ; le poste local est Windows/PowerShell 7 : chemins, FFmpeg et ports diffèrent. « Gate complet local » = enchaîner install → `db:generate` → lint strict → typecheck → build → PostgreSQL + `migrate deploy/status` → 4 suites vitest → E2E → scripts statiques → `check-secrets -History`. Tout ce qui n'a pas tourné se déclare NOT_RUN.

## 5. Tests conditionnels : S3, Hatchet, captures — et résultats historiques

- **S3** : 2 tests dans `tests/v1/v1-01-e-storage.test.ts`, sous `describe.skipIf(!S3_ENABLED)` ; `S3_ENABLED = process.env.E_S3_TEST === '1'`. Prérequis : `E_S3_TEST=1` + `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (serveur local : `pwsh -NoProfile -File scripts/preprod/gen-certs.ps1` puis `scripts/preprod/start-s3.ps1`, rclone 127.0.0.1:9443 TLS). Sans ces variables : **2 SKIP motivés**, jamais PASS.
- **Hatchet réel** : exige `ORCHESTRATOR_MODE=hatchet` + worker + moteur (dockerd/WSL) ; le redémarrage du moteur et la reprise complète restent **NOT_RUN**. Les tests V1 durable couvrent l'outbox avec Prisma, pas un moteur Hatchet réel : ne pas déclarer la durabilité validée.

Résultats **HISTORIQUES**, non rejoués — ne jamais les citer comme preuve du jour :

| Campagne | Date | Résultat | Référence |
|---|---|---|---|
| Certification V1 | 2026-10-25 | 173 PASS, 2 SKIP S3, 21 fichiers ; E2E 2 runs PASS | `docs/certification/V1_FINAL_CERTIFICATION.md` §3 ; `docs/review/V1_LOCAL_VERIFICATION.md` §3/§4 |
| Recette locale V1 | 2026-11-01 | 188 PASS, 2 SKIP ; 3/3 E2E PASS (`CAPTURE_STUDIO=1`) | `docs/reports/VULULU_STAGING_ACCEPTANCE.md` §10 |
| Analyse puis rejeu (ce skill) | 2026-11-04 | 82 PASS domaine (11 fichiers) ; indicateurs statiques §État ; API/V1/media/E2E/build NOT_RUN | `docs/reports/ANALYSE_EXISTANT_2026-11-04.md` §6 ; session quality-gates |

## 6. Bases de données : jamais la base de démonstration

- **Base de test de référence** : `vululu_v1_00_test` sur `127.0.0.1:55432` (PostgreSQL portable 17). Les suites API/V1 codent cette URL et posent `V0_TEST_DB=1` + `DATABASE_URL_TEST`/`DATABASE_URL` avant d'importer `apps/api/src/env.ts` ; en mode test, `DATABASE_URL_TEST` est prioritaire. Chaque suite applique elle-même `prisma migrate deploy` (idempotent).
- **CI** : service `postgres:17` éphémère, `POSTGRES_DB=vululu_v1_00_test`, port hôte 55432, auth trust, base détruite avec le job. **Recette/acceptance** : base dédiée créée puis migrée (ex. `vululu_m07_acceptance_20261101202047` le 2026-11-01) ; jamais la base de démonstration.
- `vululu_v1_00` = base de **démonstration** du poste : ne pas la cibler pour des tests, un E2E ou des migrations destructives. Les scripts racine `db:migrate` et `db:seed` pointent cette base (setup dev) ⇒ pour la base test/acceptance, passer `DATABASE_URL` explicitement.
- `scripts/v1-db.ps1 status` (`pnpm db:status`) ne vérifie que la base de démo et son nombre de projets ; il ne prouve pas l'état de la base test.
- `data/`, `test-results/`, `playwright-report/`, `blob-report/`, `.v0/`, `.v1/` sont ignorés par Git : ne pas les committer, ne pas les citer comme preuves versionnées, ne pas supprimer `.v0/pgdata` ni les bases historiques (preuves locales).

## 7. Pièges connus

1. **Périmètre Vitest étroit et séquentiel** : seuls `tests/**/*.test.ts` sont collectés (`e2e/` est Playwright) ; `fileParallelism: false`, timeouts 180 s ; ne pas paralléliser plusieurs suites sur la même base.
2. **E2E réutilise les serveurs** : `workers: 1`, `fullyParallel: false`, `reuseExistingServer: true` ; un serveur périmé sur 3100/3101 est réutilisé sans redémarrage (résultat trompeur). Identifier le propriétaire du port (wslrelay ≠ Vululu) et arrêter le stale avant.
3. **FFmpeg hors PATH** : `FFMPEG_PATH` obligatoire (media + E2E), binaire complet libx264/AAC ; vérifier `Test-Path` ; binaire local sous `.v0/ffmpeg/`.
4. **`API_PORT` fait foi, pas `V1_API_PORT`** : `apps/api/src/env.ts` lit `API_PORT` (défaut 3001) ; Web codé en dur 3100 ; le proxy `apps/web/app/api/[...path]/route.ts` lit `API_INTERNAL_URL` à la requête (défaut dev `http://127.0.0.1:3101`). Avec un autre port API, E2E et proxy cassent.
5. **`.env` peut fausser** : `dotenv override: false` ⇒ une variable déjà exportée gagne ; ne jamais lire/afficher `.env`. Pour un run de test, exporter explicitement `DATABASE_URL`/`DATABASE_URL_TEST`/`V0_TEST_DB=1` et vérifier le nom de la base ciblée (métadonnée, pas la valeur complète).
6. **Prisma generate** : après tout changement de `schema.prisma`, `pnpm db:generate` avant typecheck/tests/build ; sous Windows un serveur dev verrouille la DLL (`EPERM`). `scripts/ci.ps1` ne réutilise un client que s'il est plus récent que le schéma, sinon FAIL (pas de faux vert).
7. **Arbre ≠ historique (secrets)** : le scan arbre ignore les `.env.*` (sauf `.env.example`) et `_inbox/` ; `-History` scanne toutes les révisions et refuse un clone shallow (exit 2). Un PASS arbre ne vaut pas PASS historique (cas §3).
8. **`pnpm verify` périmé** : `scripts/verify-v0.ps1` a pour défaut `-ApiBase http://127.0.0.1:3001` ; en V1 passer `-ApiBase http://127.0.0.1:3101`. Son PASS valide une verticale démo avec transfert `postiz-mock` (MOCK), pas une publication.
9. **`-Skip*` ≠ PASS** : `verify-v1-01-f.ps1 -SkipTests` affiche tests NOT_RUN et peut finir `V1_01_F_GATE_PASS` ; reporter NOT_RUN, ne jamais écrire « tests PASS ».
10. **Exit codes et untracked** : `ci.ps1` 2 = préflight (Node/pnpm/node_modules/env), `check-secrets` 2 = historique inexploitable, pas une détection ; `git diff --check` ne couvre pas l'untracked, scanner les nouveaux fichiers (`check-secrets` les inclut).
11. **Migrations et propreté** : `check-migrations.ps1` est structurel (12 dossiers) ; seul `prisma migrate status` avec `DATABASE_URL` prouve la base à jour, ne pas lancer `migrate deploy` sur la démo ; après un run, aucun service sur 3100/3101/55432/9443 et `test-results/`/`playwright-report/` ignorés (captures suivies seulement si `CAPTURE_STUDIO=1`).

## 8. Checklist « avant d'annoncer terminé »

- [ ] `git status --short` et `git diff` relus ; périmètre respecté ; aucun `.env`, secret, fichier ignoré ou généré ajouté.
- [ ] Client Prisma généré ; typecheck exécuté ; lint strict si code modifié ; suites pertinentes rejouées et citées (domaine, api, v1, media, build, E2E selon la zone).
- [ ] Statuts réels : PASS / SKIP (motif) / MOCK / NOT_RUN (motif) / FAIL ; échecs connus §3 qualifiés, pas masqués ; base ciblée isolée, démonstration non modifiée.
- [ ] Preuves écrites au bon endroit (date, HEAD, commande, résultat, limitation, artefacts), chiffres historiques datés ; CI GitHub non déclarée verte (`NOT_RUN`) et, si « gate complet » revendiqué, lister ce qui a réellement tourné (§4).
- [ ] Aucun service laissé actif ; artefacts locaux ignorés non commités ; rollback décrit (`vululu-lot-delivery`) ; si un gate reste rouge : échec connu nommé, cause racine, lot de correction — aucun PASS de complaisance.

## Références

- Configuration : `vitest.config.ts`, `playwright.config.ts`, `package.json` (scripts), `.github/workflows/ci.yml`.
- Scripts : `scripts/ci.ps1`, `scripts/check-secrets.ps1`, `scripts/check-architecture-boundaries.ps1`, `scripts/check-migrations.ps1`, `scripts/check-tracked-files.ps1`, `scripts/verify-foundation-docs.ps1`, `scripts/verify-v0.ps1`, `scripts/v1-acceptance.ps1`, `scripts/verify-v1-01-f.ps1`, `scripts/v1-db.ps1`, `scripts/preprod/gen-certs.ps1`, `scripts/preprod/start-s3.ps1`.
- Code env : `apps/api/src/env.ts`, `apps/api/src/envPolicy.ts`, `apps/web/app/api/[...path]/route.ts`, `packages/media/src/index.ts`, `packages/db/prisma/seed.ts`.
- Docs : `docs/review/V1_CI_WORKFLOW_REVIEW.md` §2/§9/§11/§16/§18/§20 ; `docs/review/V1_LOCAL_VERIFICATION.md` §3/§4/§7/§9 ; `docs/certification/V1_FINAL_CERTIFICATION.md` §3 ; `docs/certification/V1_INVARIANTS_AND_EVIDENCE.md` §2/§4 ; `docs/reports/VULULU_STAGING_ACCEPTANCE.md` §1/§3/§4/§10 ; `docs/reports/ANALYSE_EXISTANT_2026-11-04.md` §6/§7 ; `docs/execution/V1_01_F_TEST_EVIDENCE.md` (format) ; `docs/execution/V1_01_F_LINT_CI_QUALITY.md`.
- Règles : `AGENTS.md` §3/§6/§10 ; format de preuve complet : skill `vululu-lot-delivery` §3. Skills liés : `vululu-project-orientation`, `vululu-local-stack`, `vululu-lot-delivery`, `vululu-architecture-change`, `vululu-ops-readiness`.
