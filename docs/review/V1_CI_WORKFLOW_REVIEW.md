# Revue CI GitHub Actions — Phase D (V1-01-H)

| Champ | Valeur |
| --- | --- |
| Date | 2026-10-25 |
| Auteur | ci-engineer (équipe certification V1-01-H) |
| Branche de travail | v1-01-g-architecture-certification |
| HEAD certifié | bcf2c582a7e0277b193de0dc78dd766f319c2e5c |
| Fichier CI | .github/workflows/ci.yml |
| Statut du workflow distant | NOT_RUN (aucune exécution GitHub Actions à ce jour, aucun push autorisé) |
| Statut des vérifications locales | PASS pour le YAML, les scripts et les contrôles statiques (détail §17) |
| Portée | .github/workflows/**, scripts/**, engines de package.json, ce document |

> **Aucun succès fictif.** Ce document ne déclare jamais GitHub Actions « PASS » :
> le workflow est *préparé et validé localement*. Son statut réel restera
> NOT_RUN jusqu'au premier run distant, dont la date et l'URL devront être
> ajoutées ici après exécution. Les contrôles qui ne peuvent être exécutés que
> sur le runner (installation pnpm, lint strict, typecheck, build, tests, E2E)
> sont marqués NOT_RUN localement (§18).

## 1. Objet

Remplacer le workflow `ci.yml` hérité de V1-00 (8 jobs, E2E neutralisé) par un
gate **réellement bloquant** de 4 jobs obligatoires sur `push`, `pull_request`
et `workflow_dispatch`, qui reproduit sur `ubuntu-latest` les contrôles exécutés
localement, sans exclusion silencieuse :

1. `quality` — lint strict, typecheck, build.
2. `unit-integration` — PostgreSQL 17 éphémère + FFmpeg, migrations, tests
   domaine / API / V1 / média.
3. `e2e` — Playwright Chromium sur base éphémère migrée et seedée, API 3101 +
   Web 3100, **sans** `continue-on-error` ni gate `workflow_dispatch`.
4. `security-architecture` — secrets (arbre **et** historique Git), lockfile,
   frontières Domain/Application, migrations, documentation, fichiers suivis.

## 2. Verdict

| Élément | Statut |
| --- | --- |
| Matrice 4 jobs obligatoires | DONE — `.github/workflows/ci.yml` (361 lignes) |
| E2E bloquant (sans gate ni continue-on-error) | DONE |
| Scan de secrets historique fiable (fetch-depth: 0) | DONE — `scripts/check-secrets.ps1 -History` |
| Frontières Domain/Application statique + test de pureté | DONE — `scripts/check-architecture-boundaries.ps1` + `tests/domain/purity.test.ts` |
| Validation lockfile / dépendances | DONE (install figée + git diff --exit-code) |
| Validation migrations (12 dossiers, migration.sql, prisma validate) | DONE |
| Vérification documentaire + fichiers suivis interdits | DONE |
| Job Hatchet/S3 réels | HORS GATE — NOT_RUN justifié (§16) |
| Exécution GitHub Actions réelle | NOT_RUN (§18/§19) |

## 3. État initial audité (.github/workflows/ci.yml, 341 lignes, 8 jobs)

Anomalies constatées dans la version héritée :

1. **E2E neutralisé** : `if: github.event_name == 'workflow_dispatch' && inputs.e2e == true`
   + `continue-on-error: true` (lignes 260-263 de l'ancien fichier). Le seul job
   qui exécute la verticale utilisateur ne pouvait donc jamais bloquer une PR ;
   il n'avait jamais été lancé sur un runner.
2. **Scan de secrets incomplet** : job `secrets` avec `actions/checkout@v4` par
   défaut (fetch-depth: 1) et `scripts/check-secrets.ps1` limité à l'arbre de
   travail (git ls-files --cached --others --exclude-standard) : aucun scan de
   l'historique, donc un secret commité puis retiré restait invisible.
3. **Aucun contrôle des frontières** Domain/Application dans la CI : le test
   `tests/domain/purity.test.ts` existait mais aucun contrôle équivalent pour
   `packages/application` n'était exécuté.
4. **Aucune validation du lockfile** : `pnpm install --frozen-lockfile` détecte
   un lockfile désynchronisé, mais rien ne vérifiait que l'installation ne
   modifiait pas `pnpm-lock.yaml`.
5. **Aucune validation structurelle des migrations** (12 dossiers au jalon,
   présence de `migration.sql`, `prisma validate`).
6. **Aucun contrôle des fichiers suivis** (.env, node_modules, data/, .v0, .v1,
   *.sqlite, *.log, test-results, chemins Windows absolus).
7. **Fragmentation** : 8 jobs dont 5 ne faisaient qu'installer pnpm/Node et
   lancer une commande ; le coût d'installation était payé 8 fois.

## 4. Matrice avant / après

| Ancien job (8) | Nouveau job (4) | Contenu conservé | Contenu ajouté |
| --- | --- | --- | --- |
| `lint` | `quality` | checkout@v4, pnpm 10.6.1, Node 24 cache pnpm, install figée, LINT_STRICT=1 pnpm lint | — |
| `typecheck` | `quality` | pnpm db:generate, pnpm typecheck | regroupé (1 seule installation) |
| `build` | `quality` | pnpm build (API tsc + Web next build) | regroupé (1 seule installation) |
| `domain-tests` | `unit-integration` | tests/domain | joué après migrations, FFmpeg disponible |
| `database-tests` | `unit-integration` | PostgreSQL 17, migrations, tests/api.test.ts, tests/v1 | prisma migrate status + tests/media.test.ts + SESSION_SECRET éphémère |
| `media-tests` | `unit-integration` | FFmpeg apt, tests/media.test.ts | fusionné avec la base (un seul service PG) |
| `secrets` | `security-architecture` | check-secrets.ps1 (arbre) | **historique Git** (-History), fetch-depth: 0 |
| `e2e` (gated + continue-on-error) | `e2e` | Playwright, API 3101/Web 3100, seed | **bloquant** sur push/PR/dispatch, FFmpeg installé, secret éphémère, migrations + seed, traces archivées en échec |
| — | `security-architecture` | — | lockfile, frontières Domain/Application, migrations, docs, fichiers suivis |

Couverture : 8 jobs → 4 jobs, **aucun contrôle supprimé**, 5 familles de
contrôles ajoutées, 1 contrôle dégradé (E2E) promu en gate bloquant.

## 5. Déclencheurs, permissions, concurrence

    on:
      push:
      pull_request:
      workflow_dispatch:

    permissions:
      contents: read

    concurrency:
      group: ci-${{ github.workflow }}-${{ github.ref }}
      cancel-in-progress: true

- Les 4 jobs s'exécutent sur les trois déclencheurs ; `workflow_dispatch` ne
  porte **aucun input** et ne conditionne aucun job.
- `permissions: contents: read` inchangé : lecture seule, aucun push, aucune
  publication, aucun déploiement.
- `concurrency` inchangé : une exécution par workflow + réf.
- `env` global : CI=true, NEXT_TELEMETRY_DISABLED=1.
- Versions épinglées : Node **24**, pnpm **10.6.1** (`pnpm/action-setup@v4`),
  conformes à `packageManager` et au poste de référence (Node v24.21.0,
  pnpm 10.6.1). `package.json` déclare désormais
  `engines.node: ">=24.0.0"` (seule modification hors CI/scripts).

## 6. Job quality (timeout 20 min)

Étapes : checkout → pnpm 10.6.1 → Node 24 (cache pnpm) →
`pnpm install --frozen-lockfile` → `pnpm db:generate` →
`LINT_STRICT=1 pnpm lint` → `pnpm typecheck` → `pnpm build`.

- Aucune base de données : `db:generate` n'ouvre pas de connexion (URL factice
  codée dans le script de `package.json`).
- `LINT_STRICT=1` repasse en erreur la dette V0 localisée
  (`eslint.config.mjs:25`) : la CI ne peut donc pas « oublier » un warning.
- DATABASE_URL / DATABASE_URL_TEST sont définies (URL de la base de test) pour
  couvrir tout import de `apps/api/src/env.ts` pendant le build.

## 7. Job unit-integration (timeout 30 min)

Service PostgreSQL 17 éphémère : `POSTGRES_USER: vululu`,
`POSTGRES_HOST_AUTH_METHOD: trust`, `POSTGRES_DB: vululu_v1_00_test`,
ports 55432:5432, healthcheck `pg_isready`.

Étapes : checkout → pnpm/Node → install figée → installation **FFmpeg**
(`sudo apt-get install -y --no-install-recommends ffmpeg`) →
`pnpm db:generate` → SESSION_SECRET éphémère (`openssl rand -hex 24`) →
attente TCP PostgreSQL sur 55432 → `prisma migrate deploy` →
`prisma migrate status` → tests :

    pnpm exec vitest run tests/domain tests/api.test.ts tests/v1 tests/media.test.ts

- La base est la **base de test isolée** codée en dur par les tests
  (postgresql://vululu@127.0.0.1:55432/vululu_v1_00_test), jamais la base de
  démonstration. DATABASE_URL et DATABASE_URL_TEST du job sont identiques.
- Pourquoi 55432 : les suites `tests/api.test.ts` et `tests/v1/*` codent cette
  URL (ex. `tests/api.test.ts:4`) et posent `V0_TEST_DB=1` avant d'importer
  `apps/api/src/env.ts` ; le service doit donc être publié sur 55432:5432.
- FFmpeg est requis ici car `tests/media.test.ts` rend réellement PNG + MP4 et
  `packages/media/src/index.ts:61-67` exige `FFMPEG_PATH` (binaire complet
  libx264/AAC, fourni par le paquet Ubuntu).
- `prisma migrate status` après `deploy` échoue si une migration est en
  attente ou en échec : contrôle de l'état réel de la base.
- SESSION_SECRET généré par run et injecté via `$GITHUB_ENV` ;
  `apps/api/src/env.ts:49-52` exige ≥ 32 caractères. Aucun secret de dépôt,
  aucun `.env` attendu sur le runner.

## 8. Job e2e (timeout 40 min) — E2E bloquant

Même service PostgreSQL 17 éphémère, même port 55432. Étapes : checkout →
pnpm/Node → install figée → FFmpeg apt → `pnpm db:generate` → SESSION_SECRET
éphémère → attente PG → `prisma migrate deploy` → `prisma migrate status` →
**seed** (`pnpm exec tsx packages/db/prisma/seed.ts`) →
`pnpm exec playwright install --with-deps chromium` →
`pnpm exec playwright test e2e/v0.spec.ts --reporter=list`.

Variables (job `env`) et justifications vérifiées dans le code :

| Variable | Valeur | Justification |
| --- | --- | --- |
| APP_ENV | local | valeurs admises par `apps/api/src/env.ts:10-13` |
| API_PORT | 3101 | **seule** variable de port lue par `env.ts:56` (défaut 3001) |
| V1_API_PORT | 3101 | conservée pour compatibilité documentaire ; **non lue** par le code |
| V1_WEB_PORT | 3100 | port du serveur Web local (`@vululu/web dev`) |
| FFMPEG_PATH | /usr/bin/ffmpeg | requis par `packages/media/src/index.ts:61-67` |
| DATABASE_URL / DATABASE_URL_TEST | base de test 55432 | `env.ts:18-23` : sans V0_TEST_DB, DATABASE_URL fait foi |
| V0_DEMO_EMAIL / V0_DEMO_PASSWORD | démo locale | login du scénario `e2e/v0.spec.ts:6-7` (valeurs publiques du dépôt, pas des secrets) |
| V1_BOOTSTRAP_EMAIL / V1_BOOTSTRAP_PASSWORD | mêmes valeurs | seed `packages/db/prisma/seed.ts:8-20` (upsert du compte super_admin) |
| SESSION_SECRET | généré par run | openssl rand -hex 24 (48 caractères hex) |
| NEXT_TELEMETRY_DISABLED | 1 | pas de télémétrie en CI |

Stratégie E2E :

- **Base jetable uniquement** : le service Docker du runner est détruit avec le
  job ; aucune donnée de démonstration n'est touchée.
- **Migrations puis seed** avant de démarrer les serveurs : le scénario se
  connecte avec le compte de démonstration et crée ses propres données.
- **Aucun serveur lancé manuellement** : la CI s'appuie sur le `webServer` déjà
  présent dans `playwright.config.ts:13-26` (API `pnpm --filter @vululu/api dev`
  sur `/api/health`, Web `pnpm --filter @vululu/web dev` sur 3100, attente HTTP
  avec timeout 120 s, reuseExistingServer: true). C'est le mode de référence
  déjà validé localement ; le dupliquer dans le YAML créerait deux sources de
  vérité.
- **Aucun continue-on-error, aucun `if: workflow_dispatch`** : un échec E2E fait
  échouer le workflow.
- **Traces** : en cas d'échec, `test-results/` est archivé
  (`actions/upload-artifact@v4`, `if: failure()`, rétention 7 jours) pour
  diagnostiquer le premier run distant.
- `apps/web/next.config.ts:9` réécrit `/api/*` vers 127.0.0.1:3101 : la
  cohérence API_PORT=3101 est obligatoire (le défaut 3001 casserait l'E2E).

## 9. Job security-architecture (timeout 15 min)

Checkout `fetch-depth: 0` (historique complet, indispensable au scan
historique), pnpm/Node, `pnpm install --frozen-lockfile`, puis :

| # | Contrôle | Commande | Effet si échec |
| --- | --- | --- | --- |
| 1 | Secrets arbre + historique | `pwsh -File scripts/check-secrets.ps1 -History` | exit 1 (détection) ou 2 (historique inexploitable = shallow) |
| 2 | Lockfile | `git diff --exit-code -- pnpm-lock.yaml` + test -z "$(git status --porcelain -- pnpm-lock.yaml)" | lockfile modifié par l'install |
| 3 | Frontières statiques | `pwsh -File scripts/check-architecture-boundaries.ps1` | import interdit / échappement de package |
| 4 | Pureté Domain Core | `pnpm exec vitest run tests/domain/purity.test.ts` | violation de l'invariant (miroir dynamique) |
| 5 | Schéma Prisma | `pnpm exec prisma validate --schema packages/db/prisma/schema.prisma` | schéma invalide |
| 6 | Migrations | `pwsh -File scripts/check-migrations.ps1` | dossier / migration.sql / format / nombre invalide |
| 7 | Documentation et socle | `pwsh -File scripts/verify-foundation-docs.ps1` | document / hash / structure manquant |
| 8 | Fichiers suivis | `pwsh -File scripts/check-tracked-files.ps1` | fichier interdit suivi ou chemin personnel absolu hors docs |

Aucun de ces contrôles n'écrit dans le dépôt ; ils sont rejouables à l'identique
sous Windows (PowerShell 7) et sous Linux (pwsh fourni par l'image
`ubuntu-latest`).

`scripts/ci.ps1` (runner CI local existant, 459 lignes) n'a volontairement
**pas** été modifié pendant cette phase : la campagne de vérification lourde du
vérificateur s'exécutait en parallèle. Les 5 nouveaux contrôles sont des scripts
autonomes (exécutables individuellement, cf. §17) ; leur intégration au runner
local est un lot suivant, sans impact sur le gate GitHub.

## 10. Dépendances système attendues sur le runner

| Dépendance | Fourniture | Preuve / risque |
| --- | --- | --- |
| Node.js 24 | `actions/setup-node@v4` | poste de référence v24.21.0 ; engines.node >= 24 |
| pnpm 10.6.1 | `pnpm/action-setup@v4` | packageManager identique |
| PostgreSQL 17 | service Docker postgres:17 | healthcheck pg_isready, auth trust |
| FFmpeg complet (libx264, AAC) | apt-get install ffmpeg | requis par tests média et production E2E |
| Chromium + libs | playwright install --with-deps chromium | Playwright 1.64.1 |
| PowerShell 7 | préinstallé sur ubuntu-latest | scripts #requires -Version 7.0 |
| Git complet | actions/checkout | fetch-depth: 0 pour le scan historique |
| bash / coreutils | image runner | run: multi-lignes, seq, openssl, sudo |

## 11. Scan de secrets historique — conception et limites

`scripts/check-secrets.ps1` (211 lignes) conserve le scan de l'arbre de travail
et ajoute `-History` :

- **Portée** : `git rev-list HEAD` — toutes les révisions atteignables depuis
  le commit testé, donc exactement l'historique qui deviendra public après
  merge/push. Mesuré localement : **39 révisions**.
- **Méthode** : une seule invocation `git grep -I -n -i -E -e <motifs combinés>`
  par lot de 100 révisions (11 motifs combinés en une alternance POSIX ERE),
  puis qualification du motif par regex .NET côté PowerShell. Le contenu des
  lignes trouvées n'est **jamais** affiché : seuls pattern, commit, file et line
  sortent.
- **Sûreté** : un clone shallow est refusé (code 2,
  `SECRET_HISTORY_SCAN_BLOCKED`) au lieu de produire un faux PASS ; une sortie
  `git grep` illisible est également refusée.
- **Motifs** : clés privées, AWS, GitHub, OpenAI, Anthropic, Google, Slack, JWT,
  affectations secret/token/password/api_key longues. Les `.env` locaux ignorés
  ne sont ni affichés ni copiés.
- **Performance mesurée** : scan complet (arbre 309 fichiers + historique
  39 révisions) en **11,0 s** sur le poste de référence (Windows) — compatible
  avec le timeout de 15 min du job.

## 12. Frontières Domain/Application — règles et testabilité

`scripts/check-architecture-boundaries.ps1` (174 lignes) :

1. `packages/domain/src` : imports **relatifs uniquement** (aucun package
   externe, aucun builtin node), confinement à `packages/domain/src`,
   `package.json` sans `dependencies` (miroir statique de
   `tests/domain/purity.test.ts`, exécuté aussi en CI).
2. `packages/application/src` : imports relatifs confinés au package ; node:*
   autorisés **sauf** I/O directe (fs, http, https, net, dgram, child_process,
   tls, dns, cluster, worker_threads, v8) ; packages workspace autorisés
   (@vululu/domain, @vululu/contracts) ; tout le reste est refusé (donc apps/*,
   @vululu/db, Prisma, Fastify, Next, AWS SDK, Hatchet, Postiz, sharp).
3. Sortie machine : DOMAIN_FILES, DOMAIN_IMPORTS, APPLICATION_FILES,
   APPLICATION_IMPORTS, BOUNDARY_CHECK_PASS|FAIL + une ligne FAIL par
   violation ; code de sortie 0/1.
4. Testabilité : paramètre `-Root` permettant d'exécuter le contrôle sur un
   répertoire de test. Test négatif local réalisé sur copie temporaire
   (hors dépôt) : injection d'un import Prisma dans
   `packages/domain/src/errors.ts` et d'un import ../../apps/... dans
   `packages/application/src/ports.ts` → 2 violations détectées, exit 1.

Résultat local sur le dépôt : 20 fichiers Domain / 93 imports, 16 fichiers
Application / 53 imports, **PASS**.

## 13. Validation du lockfile et des dépendances

- `pnpm install --frozen-lockfile` échoue si `pnpm-lock.yaml` est
  désynchronisé de `package.json` / `pnpm-workspace.yaml`.
- `git diff --exit-code -- pnpm-lock.yaml` + `git status --porcelain` :
  garantit que l'installation figée **ne modifie pas** le lockfile versionné.
- Aucun nouveau package n'a été ajouté par cette phase :
  `git diff --exit-code -- pnpm-lock.yaml` local = exit 0 avant/après les
  modifications CI (le fichier n'a pas été touché).
- Les actions GitHub sont épinglées par tag majeur (@v4) conformément à
  l'existant ; un épinglage par SHA complet est recommandé en lot de
  durcissement (§19, R1).

## 14. Validation des migrations

`scripts/check-migrations.ps1` (97 lignes) vérifie, sans base : présence du
dossier `packages/db/prisma/migrations` et de `schema.prisma`, provider
PostgreSQL, nombre ≥ 12 (référence du jalon V1-01-G, paramétrable), format
horodatage 14 chiffres + snake_case, absence de doublon d'horodatage, présence
d'un `migration.sql` non vide par dossier. `prisma validate` est exécuté en
étape séparée du job.

Preuves locales : 12 migrations, PASS ; `prisma validate` PASS ;
`prisma migrate status` sur la base de test locale = « Database schema is up to
date! » (12 migrations trouvées, exit 0, lecture seule). Test négatif local :
suppression d'un dossier + `migration.sql` vidé → 2 violations détectées,
exit 1.

## 15. Documentation et fichiers suivis

- `scripts/verify-foundation-docs.ps1` (inchangé) : hashes des documents
  fondateurs (9 hashes OK localement), ~200 fichiers obligatoires, absence de
  secrets suivis. PASS local.
- `scripts/check-tracked-files.ps1` (104 lignes) sur `git ls-files` :
  - chemins interdits : .env (sauf .env.example), node_modules/, data/, .v0/,
    .v1/, test-results/, playwright-report/, blob-report/, secrets/,
    credentials/, *.sqlite|sqlite3|db|log, *.pem|key|p12|pfx|crt|cer ;
  - contenu : aucun chemin Windows personnel (X:/Users/..., X:/Desktop/...)
    hors `docs/` ; les chemins de machine historiques tolérés dans la
    documentation le restent ; fichiers binaires et gros fichiers ignorés.
- Preuve locale : 309 fichiers suivis, 209 fichiers texte scannés, PASS.
  Aucun fichier interdit n'est suivi au HEAD certifié.

## 16. Position Hatchet / S3 réels — hors gate de base (NOT_RUN)

Un job « services réels » Hatchet + S3 n'est **pas** inclus, conformément à la
consigne de ne pas bloquer le gate Git avec des validations de production :

- Docker Desktop est indisponible sur le poste de certification et un service
  Hatchet réel nécessite un conteneur + token ; un S3 réel nécessite endpoint,
  credentials et bucket. Les simuler (mock) ne prouverait rien de réel.
- Les tests existants couvrent les adaptateurs avec des configurations locales
  ou mockées : `poc/hatchet/*` (docker-compose dédié, non exécuté en CI
  standard) et `apps/api/src/infrastructure/storage/*` (backend local par
  défaut, S3 si configuré).
- Statut : **NOT_RUN**, jalon dédié (infrastructure réelle), documenté ici et
  dans le registre de dette technique. Aucun job factice, aucun faux PASS n'a
  été créé pour « couvrir » artificiellement Hatchet/S3.

## 17. Preuves des vérifications locales (2026-10-25)

| # | Commande | Résultat | Exit |
| --- | --- | --- | --- |
| 1 | parseur YAML Python (PyYAML 6.0.3) + validateur structurel | yaml_parsed: true, 4 jobs, 0 erreur | 0 |
| 2 | validateur structurel — scripts référencés | 5 scripts existants | 0 |
| 3 | validateur structurel — commandes pnpm | 9 commandes, scripts/outils présents | 0 |
| 4 | validateur structurel — anti-triche | 0 continue-on-error, 0 input dispatch, actions attendues | 0 |
| 5 | pwsh -File scripts/check-secrets.ps1 | SECRET_SCAN_PASS (309 fichiers) | 0 |
| 6 | pwsh -File scripts/check-secrets.ps1 -History | SECRET_HISTORY_SCAN_PASS (39 révisions), 11,0 s | 0 |
| 7 | pwsh -File scripts/verify-foundation-docs.ps1 | HASHES_OK=9, FOUNDATION_CHECK_PASS | 0 |
| 8 | pwsh -File scripts/check-architecture-boundaries.ps1 | BOUNDARY_CHECK_PASS (20/93, 16/53) | 0 |
| 9 | test négatif frontières (copie temporaire) | 2 violations détectées | 1 (attendu) |
| 10 | pwsh -File scripts/check-migrations.ps1 | MIGRATIONS=12, MIGRATION_CHECK_PASS | 0 |
| 11 | test négatif migrations (copie temporaire) | 2 violations détectées | 1 (attendu) |
| 12 | pwsh -File scripts/check-tracked-files.ps1 | TRACKED_FILES=309, TRACKED_CONTENT_SCANNED=209, PASS | 0 |
| 13 | pnpm exec prisma validate --schema packages/db/prisma/schema.prisma | « The schema ... is valid » | 0 |
| 14 | prisma migrate status (base de test locale, lecture seule) | 12 migrations, « Database schema is up to date! » | 0 |
| 15 | git diff --exit-code -- pnpm-lock.yaml | aucun changement de lockfile | 0 |
| 16 | extrait d'attente PG + openssl rand -hex 24 via git bash | connexion TCP OK, secret 48 hex | 0 |
| 17 | node -e "JSON.parse(package.json)" (engines) | engines = node >=24.0.0 | 0 |
| 18 | scan portabilité des 5 scripts référencés par la CI | 0 invocation Windows-only (seules extensions .exe dans les filtres binaires) ; 0 chemin absolu de machine | 0 |

## 18. Ce qui reste NOT_RUN avant le premier run distant

| Contrôle | Statut local | Raison |
| --- | --- | --- |
| pnpm install --frozen-lockfile sur runner | NOT_RUN | exécution réservée au runner / à la campagne du vérificateur ; lockfile local déjà cohérent |
| LINT_STRICT=1 pnpm lint | NOT_RUN | campagne lourde confiée au vérificateur (consigne de séquencement) |
| pnpm typecheck | NOT_RUN | idem |
| pnpm build (dont next build) | NOT_RUN | idem |
| pnpm exec vitest run ... (suites) | NOT_RUN | idem ; tests/domain/purity.test.ts inclus dans la campagne |
| E2E Playwright complet | NOT_RUN | nécessite la stack complète (API+Web+Chromium) ; validé localement en V1-00 (46-56 s) |
| Tout job GitHub Actions | NOT_RUN | aucun push autorisé ; aucune exécution distante à ce jour |
| Hatchet/S3 réels | NOT_RUN | hors gate de base (§16) |

## 19. Risques résiduels du premier run distant

| # | Risque | Probabilité | Impact | Mitigation / décision |
| --- | --- | --- | --- | --- |
| R1 | Actions épinglées par tag majeur (@v4), pas par SHA | moyenne | supply chain | durcissement ultérieur (SHA + Dependabot) ; tags officiels ici |
| R2 | ubuntu-latest est mobile (24.04 → 26.04) | moyenne | dérive d'environnement | épingler ubuntu-24.04 lors d'un lot dédié ; Node/pnpm déjà explicites |
| R3 | Premier démarrage next dev lent ; webServer timeout 120 s | faible | E2E flaky | traces archivées ; playwright.config.ts non modifié (hors périmètre) ; ajuster dans un lot dédié si observé |
| R4 | next build sur Linux avec cache froid / casse des chemins | faible | build rouge | incident réel à corriger (c'est le but du gate) ; aucun contournement prévu |
| R5 | Lint strict : dette résiduelle non détectée localement | faible | quality rouge | campagne du vérificateur ; la CI doit rester stricte |
| R6 | Téléchargement des moteurs Prisma / navigateurs Chromium (réseau runner) | faible | job rouge | réessai ; pas de cache ajouté (aucun package) |
| R7 | E2E : dépendance à FFMPEG_PATH exact /usr/bin/ffmpeg | faible | média rouge | paquet apt Ubuntu installé à cet emplacement, vérifié par -version dans le job |
| R8 | Base E2E : état résiduel si le job est relancé sur le même runner | très faible | E2E flaky | service éphémère par job ; données du scénario horodatées |
| R9 | Scan historique : clone incomplet si fetch-depth régresse | faible | faux PASS évité | le script refuse explicitement un clone shallow (exit 2) |
| R10 | Durée du job 4 (scan historique) | faible | timeout | mesuré 11,0 s localement, marge très large vs 15 min |
| R11 | V1_API_PORT présente dans l'env mais non lue par le code | certaine (documentée) | aucun (API_PORT fait foi) | commentaire dans le YAML + §8 |
| R12 | Un .env serait commité un jour et écraserait l'env du job (dotenv override: true) | très faible | secrets/instabilité | check-tracked-files.ps1 refuse un .env suivi ; .env absent du runner |
| R13 | prisma migrate status dépend de l'état de la base migrée | faible | unit-integration rouge | migrations appliquées juste avant ; status = contrôle réel |
| R14 | 4 jobs parallèles, aucun needs (durée = max des jobs) | certaine | coût runner | assumé : jobs indépendants, pas de dépendance de données |

## 20. Runbook du premier run distant

1. Le Lead pousse la branche et ouvre la PR (opérations Git réservées au Lead).
2. Vérifier que le workflow CI se déclenche sur pull_request (et push).
3. Contrôler les 4 jobs ; pour chaque échec, télécharger les traces E2E si
   présentes, corriger la cause racine (jamais de continue-on-error).
4. Une fois les 4 jobs verts : mettre à jour ce document (§2, §18) avec la date
   ISO 8601, l'URL du run et le verdict **PASS** — et seulement à ce moment.
5. Si un job reste impossible à exécuter pour une raison externe (réseau,
   service GitHub), le déclarer **BLOCKED** avec la raison exacte, pas PASS.

Critères d'acceptation du premier run : quality, unit-integration, e2e et
security-architecture tous verts sur une même exécution, sans warning d'étape
ignorée.

## 21. Fichiers modifiés / créés dans cette phase

| Fichier | Nature | Lignes |
| --- | --- | --- |
| .github/workflows/ci.yml | réécriture complète (4 jobs obligatoires) | 361 |
| scripts/check-secrets.ps1 | ajout du mode -History + portabilité Linux | 211 |
| scripts/check-architecture-boundaries.ps1 | nouveau contrôle statique | 174 |
| scripts/check-migrations.ps1 | nouveau contrôle structurel | 97 |
| scripts/check-tracked-files.ps1 | nouveau contrôle d'hygiène | 104 |
| package.json | ajout engines.node >= 24.0.0 uniquement | +3 |
| docs/review/V1_CI_WORKFLOW_REVIEW.md | ce document | — |

Non modifiés (périmètre interdit) : apps/, packages/, tests/, e2e/,
pnpm-lock.yaml, playwright.config.ts, vitest.config.ts, eslint.config.mjs.
Aucun fichier temporaire n'a été créé dans le dépôt (preuves et scripts de
validation jetables dans %TEMP%\vululu-v1-evidence).

> Note d'honnêteté : apps/web/next-env.d.ts apparaît modifié dans l'arbre de
> travail au moment de la rédaction ; ce n'est **pas** une modification de
> ci-engineer (fichier généré par une commande de build/concurrence). Le Lead
> décide de sa conservation ou de son rétablissement.

## 22. Références

- .github/workflows/ci.yml (workflow livré)
- scripts/check-secrets.ps1, scripts/check-architecture-boundaries.ps1,
  scripts/check-migrations.ps1, scripts/check-tracked-files.ps1,
  scripts/verify-foundation-docs.ps1
- tests/domain/purity.test.ts, tests/api.test.ts, tests/v1/*, tests/media.test.ts,
  e2e/v0.spec.ts
- playwright.config.ts:13-26, apps/api/src/env.ts:10-23,49-56,60,
  apps/web/next.config.ts:9, packages/media/src/index.ts:61-67,
  packages/db/prisma/seed.ts
- ADR-0001 (monolithe modulaire et Domain Core), ADR-0006 (Application Layer),
  docs/certification/V1_DEPLOYMENT_READINESS.md,
  docs/certification/V1_TECHNICAL_DEBT_REGISTER.md
