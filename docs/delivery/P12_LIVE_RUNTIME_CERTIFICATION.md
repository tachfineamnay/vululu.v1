# P12 — Certification d'exécution réelle (Vululu V1)

- Date : 2026-11-21
- Branche de travail : `arena/260555fe-vululu-v1` (branche fournie par l'environnement)
- Commit de départ : `f5d515b` — la branche `campaign/vululu-completion` et le commit `26a3027`
  annoncés par la mission sont **absents** de ce clone.
- Commit de tête après corrections : voir `git log -1` sur la branche ci-dessus.

Ce document ne remplace pas les tests : il consigne ce qui a réellement tourné, avec les
commandes, les codes de sortie et les compteurs observés. Tout ce qui n'a pas pu être exécuté
est marqué `NOT_RUN` avec la cause.

## 1. Environnement réellement détecté

| Élément | Valeur observée |
| --- | --- |
| OS | Linux x86_64 (sandbox Arena) |
| Node.js | 22.22.3 (le dépôt déclare `engines.node >= 24`) |
| pnpm | 10.6.1 |
| PostgreSQL | 16.2 local, cluster `~/.local/pgdata`, port 55432 |
| Base | `vululu_v1_00_test` (jetable, locale) |
| FFmpeg / FFprobe | `~/.local/bin/ffmpeg`, `~/.local/bin/ffprobe` |
| Playwright | 1.64.1 + Chromium local `~/.local/browser/chromium` (v153.0.8010.0) |
| Docker / Compose | **ABSENT** (`docker: command not found`) |
| PowerShell 7 (`pwsh`) | **ABSENT** |

Conséquences :

- Les images Docker, le réseau interne, le worker et l'orchestration conteneurisés sont
  `NOT_RUN` : Docker n'existe pas dans cet environnement. Aucun service n'a été simulé en
  remplacement ; l'API et le Web ont été démarrés comme processus natifs.
- Les contrôles `scripts/*.ps1` (architecture, secrets, fichiers suivis, migrations) sont
  `NOT_RUN` faute de `pwsh`. Les invariants correspondants restent couverts par
  `tests/domain/purity.test.ts` et par la suite Vitest (voir §3).
- L'accès sortant est limité (`binaries.prisma.sh`, `cdn.playwright.dev`,
  `objects.githubusercontent.com` inaccessibles). Cela conditionne le §2 et les deux suites
  en échec du §3.

## 2. Base de données et migrations

- 35 migrations sont versionnées dans `packages/db/prisma/migrations` (la mission en annonce 40 :
  écart constaté, non corrigé).
- `prisma migrate status --schema packages/db/prisma/schema.prisma` :
  `35 migrations found in prisma/migrations` puis `Database schema is up to date!`.
- Migration ajoutée par cette campagne :
  `20261121180000_beta_feedback_ticket_kind` — la contrainte `ServiceTicket_kind_check`
  n'autorisait que `SUPPORT`/`ERASURE`, ce qui faisait échouer l'insertion `BETA_FEEDBACK`
  (`DriverAdapterError … violates check constraint`).
- Le CLI Prisma de cet environnement n'a pas d'engine natif (téléchargement bloqué) et son
  engine WASM découpe mal certains scripts (`;` dans les commentaires, blocs `$$`). La
  migration a donc été appliquée avec `psql -v ON_ERROR_STOP=1` puis enregistrée par
  `prisma migrate resolve --applied`, sur la base jetable uniquement. Aucun reset ni `seed`
  n'a été exécuté sur une base non identifiée.
- La base jetable a été vidée (`TRUNCATE "User" CASCADE`) avant la campagne finale, car les
  exécutions E2E y laissent des données métier qui rendent certains nettoyages de fixtures
  non rejouables (FK `MarketingRevision_projectId_fkey`).

## 3. Suites exécutées

| Suite | Commande | Résultat |
| --- | --- | --- |
| Typecheck | `pnpm -r typecheck` | 7/7 projets, exit 0 |
| ESLint | `pnpm lint` | exit 0 (0 erreur) — `prisma.config.js` déplacé hors dépôt |
| Vitest (unitaires + intégration + `tests/v1`) | `vitest run` | **595 tests : 564 passés, 7 échoués, 24 en attente** ; 86 fichiers, 2 en échec |
| Python (vérification artefacts C04) | `FFMPEG_PATH=… python3 scripts/arena/c04-verify.py` | `PASS: seven checksummed exports; two channels, one calendar item; moving H.264 + audible AAC.` |
| Gel commercial | `bash scripts/arena/beta01-freeze-check.sh` | 3 `PASS` (rendu refusé commerce actif / accepté gelé / audit enregistrable), transactions annulées |
| Playwright E2E (build production) | `playwright test e2e/` | **42 tests : 28 passés, 12 échoués, 2 ignorés** |

Détail des 7 échecs Vitest — **environnement, pas code applicatif** :

- `tests/v1/campaign-migration.test.ts` (7 échecs) et `tests/v1/production-plan.test.ts`
  (suite interrompue) lancent `prisma migrate deploy` sur un schéma neuf. Sans engine natif,
  le CLI WASM échoue (`request to https://binaries.prisma.sh/... failed`,
  `syntax error at or near "seules"`). Ces deux suites sont vertes en CI avec PostgreSQL 17
  et l'engine natif ; elles restent `NOT_RUN` ici.

Détail des 12 échecs Playwright — **dette de tests, pas régressions produit** :

- `e2e/studio-audit.spec.ts` (1), `e2e/studio-correction-drafts.spec.ts` (9),
  `e2e/studio-creation-view.spec.ts` (2), `e2e/v0.spec.ts` (1).
- Ces scénarios pilotent l'ancienne surface Studio V0 : ils naviguent vers des projets fictifs
  (`/projects/projet-1`, `/projects/projet-test`) avec des routes `/api/...` mockées pour un
  contrat de données qui n'existe plus, et attendent des test-ids supprimés
  (`catalog-page`, `nav-catalog`, `format-Video`, `studio-inspector`). Les éléments
  `correct-input`, `scene-*`, `advanced-production` existent encore, mais uniquement dans un
  projet réel chargé par `ProjectStudio`.
- Les parcours correspondants sont couverts par des scénarios qui passent sur le build
  production : `project-journey`, `creative-core`, `creation-delivery`, `agentic-studio`,
  `multiformat`, `contexts-design`, `assets`.
- Recommandation : remplacer ces 4 fichiers par des scénarios branchés sur l'API réelle plutôt
  que sur des payloads V0. Ils n'ont pas été réécrits ici pour ne pas fabriquer une couverture
  fictive.

Deux tests E2E sont ignorés par construction : `non-demo fr/en` (exige
`APP_ENV=production` et `DEMO_MODE≠1`) et le test Hatchet de `execution-broker`.

## 4. Corrections livrées

| Commit | Objet |
| --- | --- |
| `fix(api): filtrer le catalogue d'outils selon la politique du compte` | `/api/execution/tools` exposait des outils que le scope rejette ensuite ; `catalogForAccount()` + 3 tests |
| `fix(media): borner la collecte stdout/stderr des processus enfants` | fenêtre glissante 1 Mio, erreur explicite sur code non nul + test dédié |
| `feat(db): autoriser le type BETA_FEEDBACK sur ServiceTicket` | migration de contrainte + application vérifiée |
| `fix(web): importer AUDIENCE_UNSPECIFIED, exposer l'export de scène` | typecheck cassé, téléchargement par scène, `ALLOWED_DEV_ORIGINS` |
| `test(v1): aligner 2 suites sur le comportement serveur réel` | inscription publique 503, nettoyage `StudioRender` par `projectId` |
| `test(e2e): aligner les scenarios Playwright sur l'UI et les routes actuelles` | libellés, rendu asynchrone + checksum, `export=1`, formats LinkedIn, thème bleu |

## 5. Ce qui reste ouvert

1. 4 fichiers E2E obsolètes (12 tests) — dette de tests décrite au §3.
2. 2 suites Vitest dépendantes de `prisma migrate deploy` — bloquées par l'absence d'engine
   natif (environnement).
3. Docker / Compose : `NOT_RUN` (binaire absent) — la parité image/réseau/orchestrateur n'est
   pas certifiée par cette campagne.
4. `pwsh` absent : `scripts/*.ps1` `NOT_RUN`.
5. Écart de périmètre migrations : 35 versionnées vs 40 annoncées par la mission.
6. `prisma.config.js` (adaptateur `@prisma/adapter-pg`, non versionné) est nécessaire dans cet
   environnement hors-ligne pour `migrate deploy` ; il doit rester hors du dépôt et être
   retiré avant `pnpm lint`.

Paiements : gel commercial vérifié (§3). Aucun changement d'offre, aucune publication
externe, aucun appel fournisseur payant, aucune fusion vers `main`, aucun déploiement.

## 6. Décision

- **GO** pour la poursuite de la bêta interne sur ce périmètre : l'application démarre, sert
  l'API et le Web réels, applique ses 35 migrations, exécute 564 tests Vitest, 28 scénarios
  Playwright et les parcours de livraison média avec FFmpeg réel.
- **NO-GO** pour un déploiement en production : les 12 tests E2E obsolètes doivent être
  remplacés, la pile Docker n'a pas été exercée dans cet environnement, et l'écart
  35/40 migrations doit être tranché.
