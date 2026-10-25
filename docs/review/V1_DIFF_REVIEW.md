# V1 — Revue du diff et du périmètre de la PR (Phase C)

- **Date** : 2026-10-25T13:10Z
- **Agent** : git-auditor (équipe certification V1-01-H)
- **Worktree** : `C:\Users\hp\Desktop\vululu-ai-v1-00`
- **Branche revue** : `v1-01-g-architecture-certification`
- **HEAD revu** : `bcf2c582a7e0277b193de0dc78dd766f319c2e5c`
- **Base de comparaison** : `main` = `69c6549ec6d8dd69dbfa7c41c1f1b8a08edaec50` (ancêtre de HEAD → diff `main...HEAD` ≡ `main..HEAD`)
- **Méthode** : lecture seule (`git diff`, `git ls-tree`, `git ls-files`, `git grep`, lectures de fichiers). Aucun build, test, install ni migration exécutés par cet audit (périmètre du vérificateur).
- **Rapport associé** : [V1_GIT_HISTORY_AUDIT.md](V1_GIT_HISTORY_AUDIT.md) (Phase A).

> **Verdict Phase C : contenu de PR FAVORABLE au push (READY_FOR_PUSH_REVIEW), sous conditions.**
> Aucune anomalie bloquante : pas de secret, pas de binaire ajouté, pas de suppression destructive, pas de migration manquante, pas de fichier nécessaire non suivi, historique linéaire. Conditions : CI distante à exécuter après push (NOT_RUN), E2E NOT_RUN, exclure les modifications non commitées apparues pendant l'audit, et respecter l'ARRÊT OBLIGATOIRE avant push.

---

## 1. Statistiques globales

Commandes :

```powershell
git diff --shortstat main...HEAD
git diff --name-status main...HEAD
git diff --numstat main...HEAD
git diff --stat main...HEAD
```

Résultats (conformes au contexte fourni par le Lead) :

| Indicateur | Valeur |
|---|---|
| Fichiers modifiés | **287** |
| Ajouts | **+38 963 lignes** |
| Suppressions | **−42 lignes** |
| Fichiers ajoutés (A) | **280** |
| Fichiers modifiés (M) | **7** |
| Fichiers supprimés (D) | **0** |
| Renommages (R) / copies (C) | **0** |
| Fichiers binaires dans le diff | **0** (aucune ligne numstat `-`) |
| Fichiers suivis dans HEAD | **309** (dont 29 déjà présents dans main ⇒ 280 ajoutés) |
| Paquets de l'espace de travail | **7** : `@vululu/api`, `@vululu/web`, `@vululu/domain`, `@vululu/application`, `@vululu/contracts`, `@vululu/db`, `@vululu/media` |

## 2. Classification par module

| Module | Fichiers | Ajouts | Suppressions |
|---|---:|---:|---:|
| `apps/api` | 68 | 7 432 | 0 |
| `apps/web` | 13 | 1 838 | 0 |
| `packages/domain` | 22 | 2 569 | 0 |
| `packages/application` | 18 | 3 119 | 0 |
| `packages/contracts` | 3 | 92 | 0 |
| `packages/db` (schéma + 12 migrations + seed) | 18 | 1 451 | 0 |
| `packages/media` | 3 | 372 | 0 |
| `poc/hatchet` (POC isolé) | 15 | 2 486 | 0 |
| `tests` (`tests/**`) | 22 | 5 693 | 0 |
| `e2e` | 1 | 178 | 0 |
| `docs` (toutes sous-sections) | 80 | 7 288 | 2 |
| `scripts` (PowerShell) | 13 | 1 517 | 32 |
| `.github` (workflow CI) | 1 | 341 | 0 |
| Configs racine + lockfile (`pnpm-lock.yaml`, `package.json`, `eslint.config.mjs`, `playwright.config.ts`, `vitest.config.ts`, `tsconfig.base.json`, `pnpm-workspace.yaml`, `.env.example`, `.gitignore`, `README.md`) | 10 | 4 587 | 8 |
| **Total** | **287** | **38 963** | **42** |

Détail `docs` (80 fichiers, +7 288 / −2) :

| Sous-section `docs/` | Fichiers | Ajouts | Suppressions |
|---|---:|---:|---:|
| `execution` (preuves par lot) | 52 | 4 218 | 0 |
| `certification` | 8 | 652 | 0 |
| `reviews` | 4 | 748 | 0 |
| `adr` (ADR-0006 → ADR-0013) | 9 | 348 | 1 |
| `foundations` | 3 | 500 | 0 |
| `v2` (documentation de garde-fou uniquement) | 1 | 112 | 0 |
| `backlog` | 1 | 98 | 0 |
| Racine `docs/` (`10_ACCEPTANCE_TESTS.md`, `README.md`) | 2 | 612 | 1 |

## 3. Fichiers ajoutés, modifiés, supprimés, renommés, binaires

### 3.1 Fichiers supprimés par la PR

**Aucun** (`--diff-filter=D` = vide ; la PR ne supprime aucun fichier par rapport à main). Les 42 lignes de suppression proviennent exclusivement des 7 fichiers modifiés ci-dessous.

### 3.2 Fichiers modifiés (7) — justification des 42 lignes supprimées

```powershell
git diff --numstat main...HEAD -- .env.example .gitignore README.md docs/README.md docs/adr/README.md scripts/check-secrets.ps1 scripts/verify-foundation-docs.ps1
```

| Fichier | + / − | Nature du changement |
|---|---|---|
| `.env.example` | +15 / −1 | Remplacement de l'ancienne `DATABASE_URL` par les URLs locales de test (port 55432) ; ajout des variables V0/V1 locales. **Valeurs vides ou placeholders** (aucun secret réel). |
| `.gitignore` | +9 / −1 | Ajout des exclusions runtime V0 `.v1/`, `.v0/`, `test-results/`, `playwright-report/`, `blob-report/`, `*.tsbuildinfo` ; dernière ligne réécrite sans newline final. |
| `README.md` | +11 / −6 | Mise à jour du statut (V0 livré/audité), du tableau de roadmap et des instructions de démarrage. |
| `docs/README.md` | +2 / −1 | Catalogue d'acceptation « produit en Mission 01 » + index de `docs/reviews/`. |
| `docs/adr/README.md` | +9 / −1 | Ajout des ADR-0006 à ADR-0013 ; dernière ligne réécrite sans newline final. |
| `scripts/check-secrets.ps1` | +10 / −8 | Scan recentré sur `git ls-files --cached --others --exclude-standard` (fichiers suivis + non ignorés), exclusion explicite du `.env` local, liste d'exclusions runtime élargie. |
| `scripts/verify-foundation-docs.ps1` | +139 / −24 | Extension de la liste des fichiers obligatoires à tous les lots V0/V1-00/A1/B/C/D/E/F/G + contrôle des secrets suivis par nom (`git ls-files`), en conservant la vérification des empreintes SHA-256. |
| **Total** | **+195 / −42** | **Aucune ligne de code applicatif supprimée.** |

### 3.3 Renommages et binaires

- **Renommages** : 0 (`--summary` vide).
- **Binaires ajoutés/mofifiés** : 0. Les 3 fichiers `.docx` du corpus (`docs/source/*.docx`, 125 Ko au total, marqués `binary` dans `.gitattributes`) sont **préexistants dans main** et hors diff de la PR.
- **Aucun mode exécutable ajouté** : les 309 entrées de HEAD sont en `100644`.

## 4. Plus gros fichiers et plus gros blobs

Top 15 des fichiers ajoutés (numstat, lignes ajoutées) :

| # | Lignes | Fichier |
|---:|---:|---|
| 1 | 4 325 | `pnpm-lock.yaml` |
| 2 | 1 704 | `poc/hatchet/package-lock.json` |
| 3 | 1 023 | `packages/application/src/ports.ts` |
| 4 | 755 | `tests/v1/auth-security.test.ts` |
| 5 | 714 | `tests/v1/infrastructure.test.ts` |
| 6 | 692 | `apps/web/app/globals.css` |
| 7 | 610 | `docs/10_ACCEPTANCE_TESTS.md` |
| 8 | 605 | `packages/application/src/use-cases/durableProduction.ts` |
| 9 | 568 | `tests/v1/v1-01-application.test.ts` |
| 10 | 558 | `packages/db/prisma/schema.prisma` |
| 11 | 553 | `apps/api/src/infrastructure/durable/durableProductionStore.ts` |
| 12 | 468 | `scripts/v1-acceptance.ps1` |
| 13 | 464 | `apps/web/components/ProjectStudio.tsx` |
| 14 | 459 | `scripts/ci.ps1` |
| 15 | 453 | `tests/v1/v1-01-e-storage.test.ts` |

Top 15 des blobs de HEAD (`git ls-tree -r -l HEAD`) :

| # | Octets | Fichier |
|---:|---:|---|
| 1 | 139 451 | `pnpm-lock.yaml` |
| 2 | 58 718 | `poc/hatchet/package-lock.json` |
| 3 | 42 518 | `docs/source/VULULUIA_CDC_V1_2.docx` |
| 4 | 41 757 | `docs/source/VULULUIA_PRD_V1_2.docx` |
| 5 | 40 331 | `docs/source/VULULUIA_NOTE_V2_PROPOSITIONS.docx` |
| 6 | 33 848 | `docs/10_ACCEPTANCE_TESTS.md` |
| 7 | 29 715 | `tests/v1/auth-security.test.ts` |
| 8 | 27 460 | `tests/v1/infrastructure.test.ts` |
| 9 | 26 786 | `packages/application/src/ports.ts` |
| 10 | 22 387 | `packages/application/src/use-cases/durableProduction.ts` |
| 11 | 20 542 | `apps/api/src/infrastructure/durable/durableProductionStore.ts` |
| 12 | 19 692 | `apps/web/components/ProjectStudio.tsx` |
| 13 | 19 202 | `tests/v1/v1-01-application.test.ts` |
| 14 | 18 450 | `docs/INAUGURATION_REPORT.md` |
| 15 | 18 154 | `tests/v1/v1-01-e-storage.test.ts` |

- **Aucun blob > 200 Ko** ; plus gros blob = 139 451 octets (`pnpm-lock.yaml`). Volume total suivi : 1 683 629 octets.
- Aucun LFS nécessaire (`git lfs ls-files` vide).

## 5. Préservation V0 et absence de données utilisateur

Mesures : arbre V0 = `ddda015` (96 fichiers), HEAD = 309 fichiers, main = 29 fichiers.

| Contrôle | Résultat |
|---|---|
| Fichiers V0 encore présents dans HEAD | **92 / 96** |
| Fichiers V0 supprimés depuis `ddda015` | **4** : `apps/api/src/paths.ts`, `apps/api/src/services/contexts.ts`, `apps/api/src/services/production.ts`, `apps/api/src/services/projects.ts` |
| Fichiers d'origine V0 modifiés par les lots V1 | **26** (dont `apps/api/src/routes/*`, `apps/web/app/page.tsx`, `packages/db/prisma/schema.prisma`, `packages/media/src/index.ts`, `tests/api.test.ts`, `e2e/v0.spec.ts`, configs racine) |
| Fichiers ajoutés après V0 | **217** |
| Suppressions visibles dans le diff vs main | **0** (voir section 3.1) |
| Données utilisateur suivies | **aucune** (`.v0/` et `.v1/` ignorés, `git ls-files` ne retourne aucun fichier sous `.v0`, `.v1`, `data`, `test-results`, `node_modules`) |

Précision : le commit `b1824c1` (`refactor(v1-01-a1): remove legacy workflow…`) retire **8 fichiers** au total, dont 4 introduits par la verticale V0 (ci-dessus) et 4 introduits plus tard par les lots A/A1 (`apps/api/src/infrastructure/legacy/legacyWorkflowAdapter.ts`, `apps/api/src/infrastructure/prisma/jobRunRepository.ts`, `apps/api/src/infrastructure/prisma/reproducibilityAdapter.ts`, `packages/application/src/use-cases/project-workflow.ts`). Ces suppressions sont **internes à la branche** (fichiers ajoutés puis retirés entre main et HEAD) : elles n'apparaissent pas dans `git diff main...HEAD`, uniquement dans l'historique. Elles sont cohérentes avec l'ADR-0007 (consolidation applicative) et ne détruisent aucune donnée. Le dossier `.v1` (runtime local, POC Hatchet) et `.v0` (runtime V0, PostgreSQL local) restent ignorés et non suivis.

## 6. Migrations Prisma (12) et cohérence avec le schéma

Commandes : `git ls-files packages/db/prisma/migrations`, lecteur statique de `schema.prisma` et des `migration.sql`.

| # | Migration | Commit d'ajout | Contenu |
|---:|---|---|---|
| 1 | `20261022184734_init` | `0693b8f` | 13 `CREATE TABLE`, 13 `ALTER TABLE` (FK) |
| 2 | `20261023082309_scene_durations_approval_invalidation` | `3a6d54f` | 3 `ALTER TABLE` |
| 3 | `20261023085719_brief_revisions` | `de92e24` | 1 `CREATE TABLE`, 1 `ALTER TABLE` |
| 4 | `20261023124017_v1_00_foundation` | `a7f4b8d` | 8 `CREATE TABLE`, 6 `ALTER TABLE` |
| 5 | `20261023160509_v1_01_a_snapshot_versioning` | `5dffb0e` | 1 `ALTER TABLE` + 3 `UPDATE` de backfill (snapshot → outputs, checksums) |
| 6 | `20261023170000_v1_01_a1_active_run_index` | `b1824c1` | index unique partiel (aucun DDL destructif) |
| 7 | `20261023173000_v1_01_a1_run_integrity` | `b1824c1` | 2 `ALTER TABLE` |
| 8 | `20261023183000_v1_01_b_agentic_capabilities` | `759c9a3` | 5 `CREATE TABLE`, 2 `ALTER TABLE` |
| 9 | `20261024180000_v1_01_d_durable_orchestration` | `1110240` | 4 `CREATE TABLE`, 3 `ALTER TABLE` |
| 10 | `20261024190000_v1_01_d_active_run_scope` | `1110240` | `DROP INDEX IF EXISTS` + `CREATE UNIQUE INDEX` (recréation d'index, aucune donnée détruite) |
| 11 | `20261025100000_v1_01_e_artifact_storage` | `4595d03` | 1 `CREATE TABLE`, 3 `ALTER TABLE` |
| 12 | `20261025120000_v1_01_f_hardening` | `c4b5ab2` | 2 `CREATE TABLE` (`RateLimitCounter`, `WorkerHeartbeat`), 4 `ALTER TABLE` |

Contrôles :

| Contrôle | Résultat |
|---|---|
| Dossiers de migration | **12 / 12** |
| Chaque dossier contient `migration.sql` | **OUI** (12/12) ; `migration_lock.toml` présent (`provider = "postgresql"`) |
| Modèles du schéma Prisma | 34 |
| Tables créées par les migrations | 34 |
| Modèles non couverts par une migration | **0** |
| Tables créées hors schéma | **0** |
| Instructions destructives (`DROP TABLE`, `DELETE`, `TRUNCATE`) | **0** |
| `UPDATE` de données | 3 (backfill non destructif, migration 5) |
| Migration ajoutée par le lot G (`0e79c08`) | **aucune** (conforme au handoff : « aucune migration nouvelle en G ») |
| Dernière modification de `schema.prisma` | commit `c4b5ab2` (= dernière migration F) ; le commit G `0e79c08` ne touche ni schéma ni migration ⇒ aucun changement de schéma sans migration |
| Exécution réelle des migrations | **NOT_RUN** par l'auditeur (périmètre vérificateur ; preuve locale revendiquée par `docs/certification/V1_FINAL_CERTIFICATION.md` : 12 migrations, up to date) |

## 7. Fichiers nécessaires mais non suivis

| Contrôle | Résultat |
|---|---|
| `pwsh -NoProfile -File scripts/verify-foundation-docs.ps1` | **PASS** : `HASHES_OK=9` (empreintes SHA-256 du corpus) et `FOUNDATION_CHECK_PASS: documents, structure et hygiene OK.` — la liste de ~160 fichiers obligatoires (dont tous les livrables V0/V1, scripts CI, POC, docs de certification) est présente. |
| `pwsh -NoProfile -File scripts/check-secrets.ps1` (version HEAD) | **PASS** : `SECRET_SCAN_PASS: aucun secret detecte.` (309 fichiers) |
| Configs référencées | toutes suivies : `eslint.config.mjs`, `playwright.config.ts`, `vitest.config.ts`, `tsconfig.base.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `package.json` racine + 7 paquets, `apps/api/tsconfig.json`, `apps/web/tsconfig.json`, `apps/web/next.config.ts` |
| Fichiers référencés par le workflow CI (`.github/workflows/ci.yml`, 341 lignes) | tous suivis : `scripts/verify-foundation-docs.ps1`, `scripts/check-secrets.ps1`, `packages/db/prisma/schema.prisma`, `packages/db/prisma/seed.ts`, `e2e/v0.spec.ts`, `pnpm-lock.yaml`, `tests/api.test.ts`, `tests/v1`, `tests/domain`, `tests/media.test.ts` |
| Socle de données | `packages/db/prisma/schema.prisma`, `seed.ts` et les 12 `migration.sql` suivis |
| Fichiers sous dossiers ignorés dans `git ls-files` | **0** (`node_modules`, `test-results`, `.v0`, `.v1`, `data`, `dist`, `coverage`) |
| Dépendance aux dossiers ignorés | le runtime résout `ARTIFACT_DIR` (défaut `data/artifacts`) et crée les répertoires à la demande (`fsp.mkdir(..., { recursive: true })` dans `localArtifactStorage` et `packages/media`) ; les tests média écrivent dans `.v0/test-media-*` (temporaire, hors CI) ; les scripts `.ps1` utilisent `.v0`/`.v1` (outillage dev uniquement). **Aucune donnée suivie n'est requise.** |
| Cohérence `pnpm-lock.yaml` / `--frozen-lockfile` | **NOT_RUN** (installation hors périmètre ; vérificateur) |

## 8. Portabilité

Commande exacte (lecture seule) :

```powershell
git grep -I -n -E 'C:/Users|[A-Za-z]:\\Users|[A-Za-z]:\\Program|[A-Za-z]:\\Windows' HEAD -- . ':(exclude)docs'
```

| Contrôle | Résultat |
|---|---|
| Chemins de type Windows (`C:/`, `C:\`, `\Users`) hors `docs/` | **0 occurrence** |
| Scan élargi `C:/`, `C:\\`, `/mnt/host`, `Desktop/` hors docs | 8 occurrences, toutes **non applicatives** : `poc/hatchet/scripts/start-sidecar.ps1` (lignes 7–9, chemins WSL fixes du harnais POC) et `tests/v1/v1-01-d-durable.test.ts` (`C:/fake/…` synthétiques d'un adaptateur de stockage de test) |
| Chemins absolus dans `docs/` | 6 occurrences **documentaires** (worktrees de référence dans `INAUGURATION_REPORT`, `certification/V1_GIT_REVIEW_HANDOFF`, `execution/V1_00_*`) |
| Dépendance du runtime aux scripts `.ps1` | `git grep -I -n "\.ps1" HEAD -- apps packages` → **0** ; les scripts `.ps1` sont invoqués uniquement par la CI (`ubuntu-latest` + `pwsh`) et les commandes de confort `verify` / `db:status` |
| Fins de ligne | `git ls-files --eol` : 306 fichiers `lf` (text/auto), 3 binaires `-text` (docx) ; **aucun CRLF** |
| Modes de fichier | 100 % `100644` (aucun exécutable) |
| Diff « propre » (`git diff --check`) | exit 2 : 1 seule alerte « trailing whitespace » `docs/execution/V1_00_ACCEPTANCE_REPORT.md:54` ; aucun conflit de fin de ligne détecté |

Conclusion portabilité : **PASS** pour le code et la configuration applicative. Seule réserve : le script de harnais POC `poc/hatchet/scripts/start-sidecar.ps1` contient des chemins WSL absolus propres au poste de référence (P3, outil POC non requis par le runtime ni par la CI).

## 9. Périmètre de la PR et cohérence avec le titre proposé

### 9.1 Ce que main recevra

| Ensemble | Fichiers | Lignes ajoutées |
|---|---:|---:|
| Applications (`apps/api` + `apps/web`) | 81 | 9 270 |
| Paquets (`domain`, `application`, `contracts`, `db`, `media`) | 64 | 7 603 |
| Tests (`tests/`) + E2E | 23 | 5 871 |
| POC Hatchet isolé (`poc/hatchet`) | 15 | 2 486 |
| Documentation (`docs/`, dont 8 ADR et 52 documents d'exécution) | 80 | 7 288 |
| Scripts d'exploitation/CI (`scripts/`) | 13 | 1 517 |
| Workflow GitHub Actions | 1 | 341 |
| Configs racine + lockfile | 10 | 4 587 |
| **Total** | **287** | **38 963** |

### 9.2 Cohérence avec le titre proposé « V1 Foundation — Domain, Agentic Core, Durable Workflows & Media Storage »

| Thème du titre | Couverture dans le diff | Verdict |
|---|---|---|
| **Domain** | `packages/domain` (22 fichiers) + `tests/domain` (12 fichiers) : domaine pur, machine à états, identifiants stables, invariants | couvert |
| **Agentic Core** | lot B (`759c9a3`) : registre de capacités, routeur/fallback, contrats, use cases, routes admin, tests | couvert |
| **Durable Workflows** | lot C (POC Hatchet) + lot D (outbox, machine à états, reprise, migrations, ADR-0009/0010) + tests `v1-01-d` | couvert |
| **Media Storage** | lot E (stockage interchangeable local/S3, artefacts immuables, provenance) + `packages/media` + migrations E + tests storage | couvert |
| **« Foundation »** | lots V1-00/A/A1 (sessions + RBAC, Domain Core, ports, use cases, snapshots), F (durcissement), G (certification), CI | couvert |

Évaluation : le titre est **cohérent avec l'essentiel du contenu**. Deux nuances de périmètre à mentionner dans le corps de PR (P3) :
1. la PR inclut aussi la **verticale V0** (8 commits, ~67 fichiers nets V0 sur 309) car `main` ne contenait encore aucune application exécutable : plus précisément 67 fichiers introduits par V0 (dont 63 encore présents dans HEAD) — c'est nécessaire, mais absent du titre ;
2. le titre n'annonce ni le durcissement sécurité/observabilité (F), ni les documents de certification (G), ni la CI.

Aucun contenu V2 implémenté : recherche insensible à la casse sur `memory bank / semantic memory / embedding / monetization / subscription tier` dans `apps packages tests e2e poc scripts` → **0 résultat**. `docs/v2/` ne contient que la documentation de garde-fou/addendum.

Aucun fichier manifestement hors sujet dans les 287 : les seuls ajouts non liés au code sont les preuves `docs/execution` (52 fichiers) et les rapports de revue, conformes à la méthode de lots du dépôt.

## 10. Risques et points de revue humaine

| ID | Risque / point de revue | Gravité | Détail / recommandation |
|---|---|---|---|
| P1-06 | **CI GitHub Actions jamais exécutée** | P1 | Aucune preuve distante : lint, typecheck, tests DB, tests média, build, scan secrets = **NOT_RUN** côté GitHub. À exécuter immédiatement après push ; ne jamais déclarer PASS sans exécution réelle. |
| E2E | **E2E Playwright NOT_RUN et non bloquant** | P1 | Job `e2e` conditionné à `workflow_dispatch` + `continue-on-error: true` ⇒ ne peut pas produire un faux vert ; statut réel = NOT_RUN. |
| INFRA | **Docker/Linux, Hatchet redémarrage, S3 production, restauration binaire** | P1 | Hors périmètre de la PR mais bloquants pour un déploiement (verdict `DEPLOYMENT_NOT_READY` documenté) ; ne pas merger en croyant à une certification production. |
| REVUE | **Volume de revue : 287 fichiers / 38 963 lignes / 309 fichiers suivis** | P1 (process) | Revue humaine ciblée recommandée : `packages/application/src/ports.ts`, `durableProduction.ts`, `apps/api/src/infrastructure/durable/*`, `packages/db/prisma/schema.prisma` + 12 migrations, workflow CI, scripts de gate. |
| LOCK | **Lockfiles : `pnpm-lock.yaml` (4 325 lignes) + `poc/hatchet/package-lock.json` (npm, 1 704 lignes)** | P2 | Deux gestionnaires de paquets : le POC est hors workspace pnpm (`pnpm-workspace.yaml` = `apps/*` + `packages/*`) et hors CI ; cohérence `--frozen-lockfile` non vérifiée par l'auditeur (vérificateur). |
| POC | **POC `poc/hatchet` embarqué** (15 fichiers) avec chemins WSL codés en dur | P3 | Hors runtime et hors CI ; documenté comme isolé (commit `88921e7`). À exclure de toute extension applicative sans ADR. |
| ETAT | **Modifications non commitées apparues pendant l'audit** (agents parallèles) | P2 | `.github/workflows/ci.yml`, `apps/web/next-env.d.ts`, `scripts/check-secrets.ps1` modifiés + 3 scripts non suivis ; ne doivent pas entrer dans le commit de certification sans revue explicite (voir Phase A, section 2.1). |
| DOC | **README statut pré-merge** (« prototype V0 non mergé dans main ») | P3 | Devenu partiellement inexact dès la fusion de la PR ; mise à jour doc post-merge recommandée. |
| WS | **Whitespace / fin de fichier** | P3 | 1 ligne à espace final (`V1_00_ACCEPTANCE_REPORT.md:54`) ; `.gitignore` et `docs/adr/README.md` sans newline final. Aucun impact CI. |
| DEMO | **Identifiants de démonstration en clair** (`demo@vululu.local` / `vululu-demo`) | P3 | Uniquement comptes de démo locale/V0 (défauts E2E, CI dispatch, script `verify-v0`) ; aucun secret de production. Ne pas réutiliser hors démo. |
| SEC | **Aucun secret détecté** | — | Scan HEAD PASS (309 fichiers) ; scan historique PASS (39 révisions) ; seul `.env.example` suivi, `.env` local ignoré/non suivi. |

## 11. Verdict Phase C

- **Contenu de PR cohérent et publiable** : OUI. Aucune anomalie bloquante.
- **Pas de suppression destructive** : 0 fichier supprimé vs main ; migrations additives (0 `DROP TABLE`/`DELETE`/`TRUNCATE` ; un backfill `UPDATE` non destructif ; un index recréé).
- **Pas de secret, pas de binaire ajouté, pas de blob > 200 Ko, pas de fichier nécessaire non suivi.**
- **Cohérence du titre** : bonne ; compléter le corps de PR (V0 inclus, lots F/G, CI, preuves locales, NOT_RUN CI/E2E, dette P1).
- **Conditions avant push (ARRÊT OBLIGATOIRE)** :
  1. validation humaine/Lead du présent audit et du rapport Phase A ;
  2. exclure ou revoir les modifications non commitées apparues pendant l'audit (voir Phase A, section 2.1) ;
  3. push sans merge automatique : `git push -u origin v1-01-g-architecture-certification` (non exécuté par l'auditeur) ;
  4. exécution de la CI distante après push ; tant qu'elle n'a pas tourné : **CI = NOT_RUN**, jamais PASS ;
  5. E2E, infra Linux/Docker/Hatchet/S3 restent NOT_RUN et relèvent d'un lot ultérieur.
