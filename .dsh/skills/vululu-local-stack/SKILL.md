---
name: vululu-local-stack
description: Démarrer, vérifier et arrêter la pile locale Vululu AI — PostgreSQL portable 55432, API Fastify 3101, Web Next 3100, FFmpeg local, worker durable et S3 préprod optionnels — avec les variables réellement lues, les scripts exacts, les preuves attendues et les pièges Windows/WSL.
whenToUse: Avant de lancer une session de développement locale, rejouer le parcours Studio, exécuter des tests/E2E ou diagnostiquer un port, un processus ou une base PostgreSQL local de Vululu AI.
---

# Vululu AI — démarrer, vérifier et arrêter la pile locale

**But** : obtenir une pile locale reproductible (PostgreSQL portable, API Fastify, Web Next), la vérifier par des preuves observables, puis l'arrêter sans laisser de service ni de processus orphelin. Ne jamais afficher de secret (.env, token Hatchet, mots de passe).

## Quand l'utiliser

- Lancer ou redémarrer la pile de développement locale (`pnpm dev`).
- Rejouer le parcours Studio ou un E2E local après avoir migré/seedé la base.
- Diagnostiquer un port occupé, un health check en échec, un FFmpeg introuvable, une DLL Prisma verrouillée.
- Vérifier l'arrêt propre avant de rendre la machine ou de passer à une tâche de code.

## Quand ne pas l'utiliser

- **Staging / préproduction / déploiement** : voir `vululu-ops-readiness` ; ce skill est local uniquement et n'autorise aucune publication.
- **Choisir les tests, gates et critères de preuve** : voir `vululu-quality-gates`.
- **Modifier du code** : voir `vululu-architecture-change`.
- **E2E complet sans base migrée/seedée**, sans FFmpeg, ou avec un filtre/tests à inventer : rejouer ou déclarer NOT_RUN.
- Laisser des services allumés « au cas où » : la pile se démarre puis s'arrête explicitement.

## État vérifié (2026-11-04, HEAD `bb0bc3a`)

Collecte read-only par l'auteur du skill (PowerShell 7, racine du dépôt). `VÉRIFIÉ` = commande réellement exécutée le 2026-11-04 ; `DOCUMENTÉ` = seulement lu dans un runbook/rapport ; `NOT_RUN` = non exécuté.

| Élément | Constat | Statut |
|---|---|---|
| Node / pnpm | `v24.21.0` / `10.6.1` | VÉRIFIÉ |
| HEAD / branche | `bb0bc3a`, `main` | VÉRIFIÉ |
| PostgreSQL portable | `D:/pgportable/pgsql/bin/postgres.exe` = 17.2 ; cluster `.v0/pgdata` présent | VÉRIFIÉ |
| Cluster projet | arrêté : `pg_isready` exit 2 ; `scripts/dev-db.ps1 status` = `STOPPED` | VÉRIFIÉ |
| Cycle `dev-db.ps1` | `status -> start -> status` (`RUNNING`) `-> stop -> status` (`STOPPED`) rejoué ; cluster rendu arrêté | VÉRIFIÉ |
| Bases du cluster | `vululu_v0`, `vululu_v0_test`, `vululu_v1_00` (status `v1-db.ps1` OK), `vululu_v1_00_test` + bases d'acceptance/restore historiques | VÉRIFIÉ |
| `.env` | présent (gitignoré) ; `DATABASE_URL`/`DATABASE_URL_TEST` locales vers 127.0.0.1:55432 ; `API_PORT=3101` ; aucune valeur affichée | VÉRIFIÉ |
| FFmpeg | absent du `PATH` ; binaire local 9.0.2 `.v0/ffmpeg/ffmpeg-9.0.2-essentials_build/bin/ffmpeg.exe` ; `FFMPEG_PATH` du `.env` pointe ce binaire | VÉRIFIÉ |
| Playwright Chromium | dossier `%LOCALAPPDATA%\ms-playwright` présent | VÉRIFIÉ |
| Ports 3100/3101 | aucun serveur Vululu : HTTP refusé ; des listeners `wslrelay.exe` ont brièvement tenu `::1:3100/3101` puis ont disparu | VÉRIFIÉ |
| Ports 3000/3001/55432/9443 | libres au moment de la collecte | VÉRIFIÉ |
| Docker / WSL | Docker 29.8.1 installé, démon non joignable ; WSL `docker-desktop` Stopped, `Ubuntu-24.04` Running | VÉRIFIÉ |
| `pnpm dev`, migration, seed, tests, E2E | non exécutés (hors périmètre de la mission ; aucun résultat déclaré) | NOT_RUN |
| Runtime Hatchet complet, S3/TLS, backup/restore | exécutés partiellement dans l'historique du 2026-11-01 ; rien rejoué le 2026-11-04 | DOCUMENTÉ / NOT_RUN |

Les présences `.v1/hatchet-embedded`, `.v1/rclone-s3`, `infra/preprod/runtime/certs` et `.v1/hatchet-poc-pg` ont été constatées (VÉRIFIÉ : existence de répertoires, pas exécution de services).

## Prérequis machine (poste de référence)

- **Node 24+** et **pnpm 10.6.1** (`packageManager` du `package.json` racine) ; dépendances installées (`pnpm install --frozen-lockfile`) ou `node_modules` présent.
- **PostgreSQL 17.2 portable** dans `D:/pgportable/pgsql/bin` ; cluster propriétaire du dépôt `.v0/pgdata`, port **55432**, utilisateur `vululu` (auth trust). Ne jamais toucher aux clusters d'autres projets.
- **FFmpeg complet** (libx264/AAC) : *absent du PATH* sur le poste de référence → `FFMPEG_PATH` obligatoire dans `.env` (sinon `packages/media` lève une erreur `FFMPEG_PATH requis`).
- **Playwright Chromium** : `pnpm exec playwright install chromium` (déjà installé sur le poste de référence).
- **WSL Ubuntu-24.04** pour Hatchet embedded (optionnel) ; **Docker Desktop** pour le Compose préprod (optionnel ; arrêté sur le poste de référence, disque Docker historiquement read-only — ne pas le réparer sans accord explicite).
- **PowerShell 7** : les scripts portent `#requires -Version 7.0`. Environ 10 Go libres sur C: (documenté dans le runbook V0).

## Configuration `.env`

```powershell
Copy-Item .env.example .env   # puis renseigner localement ; .env est gitignoré
```

L'API charge le `.env` de la racine (`apps/api/src/env.ts`, `dotenv`, `override: false`), **sauf en mode production** (`APP_ENV=production`, ou `NODE_ENV=production` déjà présent dans l'environnement) où la plateforme injecte les variables et aucun `.env` local n'est lu. Conséquence : une variable déjà exportée dans le shell **prime** sur `.env` — `.env` n'écrase pas l'existant.

| Variable | Rôle réel / politique |
|---|---|
| `DATABASE_URL` | Obligatoire. Doit être **locale** (`127.0.0.1`, `localhost`, `::1`) sinon refus (`envPolicy.ts`), sauf `ALLOW_NON_LOCAL_DATABASE=1` **et** `APP_ENV=production` (déploiement uniquement). |
| `DATABASE_URL_TEST` | Utilisée seulement si `V0_TEST_DB=1` (tests) ; sinon ignorée. |
| `SESSION_SECRET` | `>= 32` caractères, sinon l'API refuse de démarrer. |
| `API_PORT` | **Réellement lue** ; défaut code `3001`. En local de référence : `3101`. |
| `V1_API_PORT` | Présente dans `.env.example` mais **NON lue** par le code (`API_PORT` fait foi). `V1_WEB_PORT` non lue non plus (web codé en dur `-p 3100`). |
| `ARTIFACT_DIR` | Racine des artefacts locaux, défaut `data/artifacts` (résolue depuis la racine). |
| `FFMPEG_PATH` | Chemin du binaire complet ; lu par `packages/media/src/index.ts`. |
| `V0_DEMO_EMAIL` / `V0_DEMO_PASSWORD` | Lus par les scripts E2E/verify (`e2e/*.spec.ts`, `scripts/verify-v0.ps1`, `scripts/v1-acceptance.ps1`), **pas** pour authentifier l'API : le mot de passe n'est jamais lu par `apps/api/src`. |
| `V1_BOOTSTRAP_EMAIL` / `V1_BOOTSTRAP_PASSWORD` | Lus par `pnpm db:seed` (upsert `super_admin`, sans valeur par défaut) ; à retirer hors bootstrap. |
| `APP_ENV` | `local`/`development`/`test`/`production` ; en production `APP_ORIGIN`/`WEB_ORIGIN` obligatoire. |
| `ALLOW_NON_LOCAL_DATABASE` | Exception opt-in réservée à `APP_ENV=production` ; ne jamais l'activer en local. |
| `ORCHESTRATOR_MODE` | `local` (défaut, exécution en process, **non durable**) ou `hatchet`. |
| `ARTIFACT_STORAGE_BACKEND` | `local` (défaut) ou `s3`. |

**Hygiène** : ne jamais afficher `.env` (`Get-Content .env`) ni un token. Pour contrôler, n'imprimer que présence/longueur (`$v.Length`) ou le nom de la base parsée depuis `DATABASE_URL`.

## Séquence de démarrage exacte

Depuis la racine du dépôt :

1. **Socle** : `pnpm install --frozen-lockfile` si `node_modules` absent, puis `pnpm db:generate` (génère le client Prisma ; les scripts racine ciblent déjà `postgresql://vululu@127.0.0.1:55432/vululu_v1_00?schema=public`).
2. **PostgreSQL (cluster V0 du dépôt)** :
   ```powershell
   pwsh -NoProfile -File scripts/dev-db.ps1 init    # 1re fois : initdb .v0/pgdata, user vululu, bases vululu_v0 + vululu_v0_test
   pwsh -NoProfile -File scripts/dev-db.ps1 start
   pwsh -NoProfile -File scripts/dev-db.ps1 status  # RUNNING
   ```
   **Nuance V0/V1** : `dev-db.ps1` ne crée que les bases **V0**. Le runbook `docs/execution/V0_RUNBOOK.md` décrit l'époque V0 (web 3000, API 3001, base `vululu_v0`) ; le dépôt est passé en V1 et `package.json` cible `vululu_v1_00` sur 55432, API 3101, Web 3100. Sur une machine neuve, créer la base V1 une fois (`CREATE DATABASE vululu_v1_00` via `psql`, puis `pnpm db:migrate`) et `vululu_v1_00_test` (les tests appliquent `prisma migrate deploy` de façon idempotente). `scripts/v1-db.ps1` (`pnpm db:status`) ne fait que **status** : vérifie `PG_READY`, `V1_DB` et le nombre de projets, il ne crée rien.
3. **API + Web** : `pnpm dev` (concurrently `tsx watch src/index.ts` + `next dev -p 3100`, arrêt groupé avec `-k`). L'API refuse de démarrer sans `DATABASE_URL` locale et `SESSION_SECRET >= 32`. Ports effectifs en local de référence : **API 3101**, **Web 3100** (API lue depuis `API_PORT` ; Web codé en dur `-p 3100`). Variantes : `pnpm dev:api`, `pnpm dev:web`.
4. **Health** : `Invoke-RestMethod http://127.0.0.1:3101/api/health` doit répondre `{"status":"ok","service":"vululu-api","version":"v1"}` (route `apps/api/src/server.ts`). Le proxy web `apps/web/app/api/[...path]/route.ts` vise `http://127.0.0.1:3101` en dev, donc `http://127.0.0.1:3100/api/health` peut servir de smoke une fois les deux lancés.
5. **Seed + login démo** : `pnpm db:seed` (exige `V1_BOOTSTRAP_EMAIL`/`V1_BOOTSTRAP_PASSWORD`) puis `http://127.0.0.1:3100/login`. L'API authentifie par `POST /api/auth/login` sur un utilisateur **présent en base** : après seed, c'est le compte `V1_BOOTSTRAP_*` ; ne jamais afficher ces valeurs. `V0_DEMO_PASSWORD` n'est pas lu par l'API.
6. **Preuves ciblées** : `pnpm db:status` ; `pwsh -NoProfile -File scripts/verify-v0.ps1 -ApiBase http://127.0.0.1:3101` (attention : `pnpm verify` utilise le défaut `3001`, périmé). E2E : `pnpm test:e2e` (Playwright démarre lui-même API 3101 + Web 3100, `reuseExistingServer: true`) — prérequis et procédure documentés dans `docs/review/V1_LOCAL_VERIFICATION.md` §7 ; NON REJOUÉ le 2026-11-04. `scripts/ci.ps1` exige PostgreSQL 55432, `SESSION_SECRET >= 32` et FFmpeg selon `-TestSet` (`-TestSet domain` seul n'en a pas besoin) — voir `vululu-quality-gates`.

## Mode durable / Hatchet et S3 local — DOCUMENTÉ, NON REJOUÉ le 2026-11-04

- **API + worker séparés** : `ORCHESTRATOR_MODE=hatchet` ; l'API démarre en plus l'outbox dispatcher (`apps/api/src/index.ts`) ; worker : `pnpm --filter @vululu/api worker` (`src/worker/main.ts`, heartbeat `WorkerHeartbeat` toutes les 10 s, slots 2, arrêt SIGTERM/SIGINT).
- **Client Hatchet** (`apps/api/src/worker/pipeline.ts`) : `HATCHET_CLIENT_TOKEN` (issu du handshake, jamais affiché/commité), `HATCHET_CLIENT_HOST_PORT` (défaut code `127.0.0.1:7077`), `HATCHET_CLIENT_API_URL` (défaut `http://127.0.0.1:28243`), `HATCHET_CLIENT_TLS_STRATEGY`. La topologie préprod documentée utilise **gRPC 17077 / API 18243** : ces valeurs doivent être passées explicitement (le runbook `docs/preprod/RUNBOOK.md` §6 les surcharge).
- **S3 local TLS** : `pwsh -NoProfile -File scripts/preprod/gen-certs.ps1` puis `scripts/preprod/start-s3.ps1` (rclone 1.75.2, `127.0.0.1:9443`, bucket `vululu-artifacts`, TLS interne) ; `NODE_EXTRA_CA_CERTS=<ca.crt>` côté Node ; `ARTIFACT_STORAGE_BACKEND=s3` + `S3_*`, `S3_REQUIRE_TLS=1` exige un endpoint `https://`.
- **Statut honnête** : S3/backup/restore PASS historiques (2026-11-01) ; topologie Hatchet complète / reprise après crash **BLOCKED** par le disque Docker read-only ; Docker non joignable le 2026-11-04. Ne jamais présenter ce mode comme durable validé. Ne jamais exécuter `docker compose down -v`.

## Arrêt propre

```powershell
# 1. API + Web : Ctrl+C dans le terminal de pnpm dev (concurrently -k arrête les deux)
# 2. PostgreSQL du projet
pwsh -NoProfile -File scripts/dev-db.ps1 stop
pwsh -NoProfile -File scripts/dev-db.ps1 status   # STOPPED
# 3. Contrôle final
Get-NetTCPConnection -State Listen -LocalPort 3100,3101,55432,9443 -ErrorAction SilentlyContinue
```

- Si un serveur est orphelin : identifier le PID via `Get-NetTCPConnection -State Listen -LocalPort 3100`, vérifier `(Get-Process -Id <pid>).Path` = Node/tsx, puis `Stop-Process -Id <pid>`. **Ne pas tuer `wslrelay`** : ce n'est pas Vululu.
- Worker : Ctrl+C (le handler écrit `stopped` puis `worker.stop()`). S3 rclone : Ctrl+C (pas de script stop fourni).
- Ne pas supprimer `.v0/pgdata`, `.v1/hatchet-poc-pg`, ni aucune base historique : ce sont des preuves locales.

## Pièges connus

1. **WSL relay stale sur 3100/3101** : des entrées `Listen` sur `::1:3100/3101` peuvent appartenir à `wslrelay.exe` (relay de ports WSL), pas à Vululu — HTTP est alors refusé. Vérifier le propriétaire du port avant de conclure à un serveur zombie ; ne pas tuer `wslrelay` à l'aveugle.
2. **FFmpeg hors PATH** → `packages/media` échoue ; renseigner `FFMPEG_PATH` et vérifier `Test-Path $ffmpegPath`.
3. **DLL Prisma verrouillée sur Windows** : `pnpm db:generate` peut échouer `EPERM ... query_engine-windows.dll.node` si un serveur de dev tourne ; arrêter `pnpm dev`/l'API orpheline et relancer. `scripts/ci.ps1` ne réutilise un client existant que s'il est plus récent que `schema.prisma`, sinon FAIL (pas de faux vert).
4. **`DATABASE_URL` non locale refusée** : seuls 127.0.0.1/localhost/::1 passent ; `ALLOW_NON_LOCAL_DATABASE=1` exige `APP_ENV=production`. Ne pas contourner pour viser une base distante.
5. **Variables de shell gagnantes** : `dotenv override:false` — un `$env:DATABASE_URL`/`$env:API_PORT` exporté avant le lancement n'est **pas** remplacé par `.env` ; ouvrir un shell neuf ou `Remove-Item Env:DATABASE_URL`.
6. **Ne jamais lancer Prisma sans `DATABASE_URL` locale explicite** : les scripts racine l'embarquent ; pour une commande ad hoc, la fixer soi-même (`$env:DATABASE_URL='postgresql://vululu@127.0.0.1:55432/vululu_v1_00?schema=public'`).
7. **Ports 3000/3001 périmés** : le runbook V0 les cite ; le code V1 démarre Web 3100, API 3101 (sauf `.env` absent → défaut API 3001). `pnpm verify` pointe encore 3001 : passer `-ApiBase`.
8. **Playwright réutilise un serveur existant** (`reuseExistingServer: true`) : un serveur stale/ancien code sur 3100/3101 fausse l'E2E ; libérer puis contrôler les PID.
9. **E2E ne charge pas `.env`** : les specs lisent `process.env.V0_DEMO_*` avec fallbacks publics ; exporter les variables (procédure `V1_LOCAL_VERIFICATION.md` §7) et garder le mot de passe cohérent avec le compte seedé (`V1_BOOTSTRAP_*`), sinon login refusé.
10. **Base de test** : tests API/V1 forcent `V0_TEST_DB=1` + `vululu_v1_00_test` et y appliquent les migrations ; ne pas les faire écrire dans `vululu_v1_00` (base de démonstration du poste de référence).
11. **Docker/WSL** : démon Docker arrêté, `docker-desktop` stoppé, disque historiquement read-only ; ne pas réparer/formater le disque WSL sans accord (risque pour les autres projets).
12. **Secrets** : jamais de `Get-Content .env`, jamais de token/handshake à l'écran, jamais `.env` commité (gitignoré).

## Checklist finale

- [ ] `node --version` >= 24 et `pnpm --version` = 10.6.1 ; `git status --short` connu.
- [ ] `pwsh scripts/dev-db.ps1 status` = `RUNNING` avant usage, `STOPPED` après arrêt.
- [ ] Base correcte : `pnpm db:status` (`V1_DB=vululu_v1_00`) ou nom de base de `DATABASE_URL` vérifié sans afficher l'URL complète.
- [ ] Ports 3100/3101 : propriétaire identifié (Node/tsx = Vululu ; wslrelay = pas Vululu).
- [ ] `GET http://127.0.0.1:3101/api/health` = 200 avec `status: ok`.
- [ ] Login démo via `/login` avec le compte seedé ; aucune valeur de mot de passe affichée.
- [ ] `FFMPEG_PATH` pointe un binaire existant ; Chromium Playwright présent si E2E.
- [ ] Arrêt : `pnpm dev` stoppé, worker stoppé, S3 stoppé, `dev-db.ps1 stop` puis `status` = `STOPPED`, aucun listener 3100/3101/55432/9443.
- [ ] Aucun autre cluster/base d'un autre projet modifié ; aucune suppression de `.v0/`/`.v1/` ; aucun secret dans les sorties.

## Références

- `package.json` (scripts `dev`, `db:generate|migrate|seed|status`, `verify`), `apps/api/package.json` (`dev`, `worker`), `apps/web/package.json` (`next dev -p 3100`), `playwright.config.ts` (API 3101 / Web 3100, `reuseExistingServer`), `.env.example`.
- `apps/api/src/env.ts` (dotenv `override:false`, `API_PORT`, `SESSION_SECRET`, `ORCHESTRATOR_MODE`), `apps/api/src/envPolicy.ts` (politique base locale), `apps/api/src/index.ts`, `apps/api/src/server.ts` (`/api/health`), `apps/api/src/worker/main.ts`.
- `packages/media/src/index.ts` (`FFMPEG_PATH`), `packages/db/prisma/seed.ts` (`V1_BOOTSTRAP_*`).
- `scripts/dev-db.ps1`, `scripts/v1-db.ps1`, `scripts/verify-v0.ps1`, `scripts/ci.ps1` (préflight, DB 55432, FFmpeg, DLL Prisma).
- `scripts/preprod/gen-certs.ps1`, `scripts/preprod/start-s3.ps1`, `scripts/preprod/fetch-hatchet.ps1`, `scripts/preprod/backup.ps1`, `scripts/preprod/restore-test.ps1`, `scripts/preprod/seed-restore-proof.ps1`.
- `docs/execution/V0_RUNBOOK.md` §1–4, §8 (V0 historique, ports 3000/3001). `docs/execution/V1_00_ACCEPTANCE_REPORT.md` §1 (API 3101, Web 3100, base `vululu_v1_00`). `docs/execution/V1_00_PROGRESS.md` §6, §8 (limites/MOCK). `docs/execution/V1_01_C_OPERATIONS.md` §4–6 (Hatchet embedded WSL, handshake, worker).
- `docs/preprod/RUNBOOK.md` §1 (topologie), §4 (S3/TLS 9443), §5 (Hatchet 17077/18243), §6 (API + worker), §9 (backup/restore).
- `docs/studio/STUDIO_V1_WALKTHROUGH.md` §2 (prérequis du parcours). `docs/review/V1_LOCAL_VERIFICATION.md` §7 (procédure E2E réelle), §8 (incident DLL Prisma).
- `docs/reports/VULULU_STAGING_ACCEPTANCE.md` §1 (baseline), §2 (preuves locales, pas staging), §10 (commandes). `docs/reports/ANALYSE_EXISTANT_2026-11-04.md` §4 (deux chemins d'exécution).
