# VULULU — BASELINE ARENA (Mission A00)

> **Bannière P00 (2026-11-20) — photo de sandbox historique.** Cette baseline date du 2026-11-19 (SHA `93e1360`) et ne décrit plus l'état courant. Depuis, C02–C13, F01–F07 et BETA01 ont été livrés ; l'état courant est `docs/implementation/VULULU_FEATURE_INVENTORY.md`. Le corps est conservé comme preuve datée.

- **Date d'exécution** : 2026-11-19
- **Dépôt** : `tachfineamnay/vululu.v1` (public, branche par défaut `main`)
- **Branche analysée** : `arena/c3982856-vululu-v1`
- **SHA analysé (HEAD avant mission)** : `93e13608d4d86ffaa4f43173f6faa1c6cfd2d0a5`
- **SHA de base (`main` = `origin/main`)** : `ccc1977a1131ef2243c0f52055307df91de75b08`
- **Avance** : 1 commit devant `main` (la baseline R00 : `93e1360`)
- **Nature de la mission** : constat et outillage. **Aucun code applicatif modifié.**

> Toutes les valeurs ci-dessous proviennent de commandes **réellement exécutées** dans la sandbox
> le 2026-11-19. Les commandes sont citées pour être rejouables. Aucun secret n'est affiché.

---

## 1. Capacités réelles du sandbox

Légende : **AVAILABLE** (présent et prouvé fonctionnel) · **MISSING** (absent) ·
**BLOCKED** (présent ou installable, mais inaccessible) · **NOT_TESTED** (non exercé).

### 1.1 Outils de base

| Outil | Constat | État | Preuve |
|---|---|---|---|
| `git` | 2.39.5, `/usr/bin/git` | **AVAILABLE** | `git --version` |
| `node` | v22.22.3 (dépôt exige `>=24`) | **AVAILABLE** (écart de version) | `node -v` |
| `npm` | 10.9.8 | **AVAILABLE** | `npm -v` |
| `pnpm` | 10.6.1 (conforme au `packageManager`) | **AVAILABLE** | `pnpm -v` |
| `corepack` | 0.34.6 | **AVAILABLE** | `corepack --version` |
| `python3` | 3.11.2 + `venv` + `pip` | **AVAILABLE** | `python3 -V` |
| `gh` | 2.23.0, authentifié (jeton masqué) | **AVAILABLE** | `gh auth status` |
| `sudo` | opérationnel (sans mot de passe) | **AVAILABLE** | `sudo -n true` |
| Répertoires `/tmp` | **réinitialisés entre deux appels d'outil** | ⚠ contrainte | constaté empiriquement |

### 1.2 Services, binaires et réseaux

| Élément | Constat | État | Détail |
|---|---|---|---|
| `docker` | introuvable | **MISSING** | aucun binaire, aucun démon |
| `postgres`/`psql` (système) | introuvable | **MISSING** | aucune installation système |
| `apt-get` | présent, dépôts **injoignables** | **BLOCKED** | `deb.debian.org` en HTTP : `Connection failed` |
| `ffmpeg`/`ffprobe` (système) | introuvables | **MISSING** | aucun paquet candidat |
| `pwsh` (PowerShell 7) | introuvable | **MISSING** | 9 gates `scripts/*.ps1` inexécutables |
| Navigateur (Chromium/Chrome) | introuvable | **MISSING** | `playwright install chromium` échoue |
| `registry.npmjs.org` | HTTP 200 | **AVAILABLE** | `curl -o /dev/null -w %{http_code}` |
| `pypi.org` | accessible, téléchargements OK | **AVAILABLE** | `pip download` |
| `github.com` / `api.github.com` | HTTP 200 | **AVAILABLE** | `curl` + `gh` |
| `codeload.github.com` | HTTP 301 | **AVAILABLE** | redirection |
| `binaries.prisma.sh` | TLS interrompu | **BLOCKED** | `SSL_ERROR_SYSCALL` |
| `objects.githubusercontent.com` | TLS interrompu | **BLOCKED** | releases GitHub inaccessibles |

### 1.3 Ce que ce profil réseau implique

La sandbox autorise **PyPI** et **npm** mais bloque **apt**, **Prisma** et les **artefacts de release GitHub**.
Conséquence majeure, découverte et exploitée pendant cette mission :

> **PostgreSQL, FFmpeg et FFprobe sont obtenables par PyPI/npm**, malgré `apt` bloqué et Docker absent.

C'est ce qui fait basculer cette baseline de « presque tout NOT_RUN » à **une couverture réelle de 222 tests**.

### 1.4 Ports et prévisualisation

| Élément | Constat | État |
|---|---|---|
| Ports libres `3000`, `3001`, `3100`, `3101`, `55432` | bind `0.0.0.0` réussi | **AVAILABLE** |
| Serveur Web Next sur `3100` | démarre, 20 routes, HTTP 200 | **AVAILABLE** |
| En-têtes anti-framing | aucun `X-Frame-Options` / `frame-ancestors` bloquant | **compatible iframe** |
| Requête avec `Host: 3100-abc123.e2b.app` | HTTP 200 | **AVAILABLE** (proxy de préview OK) |
| Serveur API Fastify | **ne démarre pas** | **BLOCKED** (client Prisma, cf. §3.1) |

### 1.5 Installation des dépendances

| Étape | Résultat | État |
|---|---|---|
| `pnpm install --frozen-lockfile` | OK, `pnpm-lock.yaml` **inchangé** | **AVAILABLE** |
| Arborescence `node_modules` | présente (784 Mo) | **AVAILABLE** |
| `pnpm db:generate` (Prisma) | échoue sur `binaries.prisma.sh` | **BLOCKED** |
| Modules natifs (`sharp`) | opérationnels (rendu PNG réel) | **AVAILABLE** |
| Scripts de build `protobufjs` / `@hatchet-dev/typescript-sdk` | ignorés par pnpm 10 | ⚠ partiel |

### 1.6 Contournements mis en place (hors dépôt, reproductibles)

Deux scripts **additifs** ont été ajoutés, aucun fichier existant n'a été modifié :

| Script | Rôle | Preuve de fonctionnement |
|---|---|---|
| `scripts/arena/bootstrap-media-tools.sh` | FFmpeg + FFprobe statiques via PyPI (`imageio-ffmpeg`) et npm (`@ffprobe-installer/linux-x64`) | encode réels h264+AAC, smoke test intégré |
| `scripts/arena/pg16-local.sh` | PostgreSQL 16.2 portable via PyPI (`pgserver`), cluster `127.0.0.1:55432` | `initdb` + 19 migrations + 39 tables |

Binaires installés dans `$HOME/.local/bin` et `$HOME/.local/pgdata` : **rien dans le dépôt**,
conformément à AGENTS.md §17.4.

Versions obtenues : **FFmpeg n9.0.2** (`--enable-gpl --enable-libx264`, `aac` présent) et
**PostgreSQL 16.2**.

---

## 2. Tableau des modules existants

État par module, établi sur le code lu **et** les preuves exécutées. `REAL` = implémenté et
prouvé par exécution · `PARTIAL` = implémenté avec lacune nommée · `MOCK` = simulé explicitement ·
`ABSENT` = inexistant · `UNVERIFIED` = présent, non exécutable dans cette sandbox.

| Module | Fichiers clés | État | Preuve / limite |
|---|---|---|---|
| **Auth** (sessions serveur, CSRF, origines) | `apps/api/src/routes/auth.ts`, `security/session.ts`, `security/origin.ts` | **REAL (code)** / **UNVERIFIED (exécution)** | jeton + CSRF stockés hachés SHA-256, TTL 24 h ; test `auth-security.test.ts` bloqué par Prisma |
| **RBAC + isolation propriétaire** | `application/container.ts::actorOf`, `*Owned` | **REAL (code)** | filtrage en base, pas en mémoire |
| **Invitations / activation** | `routes/auth.ts`, `routes/admin.ts` | **UNVERIFIED** | dépend du client Prisma |
| **Projets** | `use-cases/projects.ts`, `routes/projects.ts` | **REAL (code)** | cycle de vie, verrous `producing` |
| **Studio** (parcours) | `apps/web/components/ProjectStudio.tsx` (591 l.) | **REAL (code)** / **AVAILABLE (UI servie)** | 20 routes Next servies en HTTP 200 |
| **Campagnes** | `use-cases/campaigns.ts` | **REAL (code)** | 8 tests domaine PASS |
| **Assets** (upload, inspection, versions, licences) | `use-cases/assets.ts`, `media/src/assetInspection.ts` | **REAL** | **15/15 tests** `asset-inspection.test.ts` PASS (inspection par octets) |
| **Composition des assets dans les images** | — | **ABSENT** | `grep assetSelection` sur le rendu ⇒ **0 résultat**; assets snapshottés puis jamais rendus |
| **Storyboards** | `use-cases/storyboards.ts` | **PARTIAL** | 5 titres **codés en dur** (`Accroche`, `Pour vous`, `Notre projet`, `Invitation`, `Appel à action`) ; personnage `CHAR-001` constant |
| **Sharp (PNG)** | `packages/media/src/sceneComposition.ts`, `textLayout.ts` | **REAL (déterministe)** / **MOCK (visuel)** | PNG 1080×1920 réellement produit ; poster typographique avec libellé `DÉMO MOCK` incrusté |
| **FFmpeg (master MP4)** | `packages/media/src/index.ts::assembleMaster` | **REAL** | **prouvé** : h264 + aac, master produit — voir §5.3 |
| **QA média** | `packages/media/src/index.ts::runQa` | **REAL** | 7 contrôles ; PASS en exécution isolée |
| **Versions / immuabilité** | `domain/versions.ts`, `artifact.ts`, `approval.ts` | **REAL** | 26 tests artifact/approval/versions PASS |
| **Stockage local** | `storage/localArtifactStorage.ts` | **REAL (code)** | registre de lecture multi-backend |
| **Stockage S3** | `storage/s3ArtifactStorage.ts` | **UNVERIFIED** | aucun endpoint S3 dans la sandbox |
| **Hatchet (orchestration durable)** | `worker/pipeline.ts`, `durable/outboxDispatcher.ts` | **UNVERIFIED** | moteur absent ; mode par défaut = `local` (in-process, non durable) |
| **IA / fournisseurs** | `providers/mockCapabilityProvider.ts` | **MOCK** | **0 appel sortant** vers un fournisseur : les 4 `fetch` du dépôt sont tous internes (web → API) |
| **Postiz** | `postiz/postizMockAdapter.ts` | **MOCK** | `externalId: null`, statut `acknowledged` local après 400 ms, aucun réseau |
| **Coûts / budgets** | `costRepository.ts`, `captureRunPolicy` | **MOCK** | `costs.mode = 'MOCK'`, budget `maxMockCents` |
| **Monétisation** | — | **ABSENT** | hors périmètre V1/V2 |
| **Administration** | `apps/web/app/admin/*` (8 pages), `prisma/adminQuery.ts` (724 l.) | **REAL (code)** | pages servies HTTP 200 |
| **MCP** | — | **ABSENT** | `MCP V1 — NOT_CONNECTED` affiché dans l'UI admin |
| **Migrations PostgreSQL** | 19 dossiers `packages/db/prisma/migrations/` | **REAL** | **19/19 appliquées** sur PostgreSQL 16.2, 39 tables, **0 dérive** vs schéma |

---

## 3. Anomalies reproduites

### 3.1 A-01 — Blocage racine : client Prisma non généré (P0, environnement)

**Constat** : `pnpm db:generate` échoue ; `@prisma/client` est en état « non initialisé ».

```
Error: request to https://binaries.prisma.sh/all_commits/c2990dca.../schema-engine.gz.sha256 failed,
reason: Client network socket disconnected before secure TLS connection was established
```

À l'exécution :
```
Error: @prisma/client did not initialize yet. Please run "prisma generate" and try to import it again.
 ❯ new PrismaClient .../.prisma/client/default.js:43:11
 ❯ packages/db/src/client.ts:4:23
```

**Impact** : **toute** la couche API est inopérante — le serveur Fastify ne démarre pas, et
**tous** les tests touchant `@vululu/db` échouent au chargement.

**Cause** : `binaries.prisma.sh` et `objects.githubusercontent.com` sont hors liste d'autorisation ;
le cache d'engines (`~/.cache/prisma/master/<hash>/debian-openssl-3.0.x/`) est **vide**.
`prisma-client-js` ne supporte pas d'engine WASM en 6.19.3 pour un usage PostgreSQL complet.

**Ce qui a été fait à la place** : la base **a bien été montée** et les **19 migrations ont été
appliquées avec succès** (§5.2). Le blocage est donc **uniquement** la couche client JS, pas
PostgreSQL. Aucun substitut SQLite n'a été introduit.

### 3.2 A-02 — `assembleMaster` ignore la durée des 1re et 2e scènes (P1, défaut de code RÉEL)

**Reproduit de façon déterministe**, avec un FFmpeg réel :

| Scènes | Durée demandée | Master obtenu | Écart | Tolérance QA (±0,75 s) |
|---|---|---|---|---|
| 1 | 2 s | **1,00 s** | 1,00 s | **dépassée** |
| 1 | 3 s | **1,00 s** | 2,00 s | **dépassée** |
| 2 | 2 s chacune (4 s) | **2,03 s** | 1,97 s | **dépassée** |
| 3 | 2 s chacune (6 s) | 5,97 s | 0,03 s | conforme |
| 4 | 2 s chacune (8 s) | 7,97 s | 0,03 s | conforme |
| 5 | 2 s chacune (10 s) | 9,97 s | 0,03 s | conforme |

**Cause** : `concat` FFmpeg ignore la durée de l'avant-dernière entrée, et le `-shortest` combiné à
la piste silencieuse `anullsrc` (de durée infinie) tronque la sortie. Le dernier `duration` d'un
fichier concat n'est pas honoré, et pour 1-2 scènes la durée de la première l'est non plus.

**Impact commercial** : une vidéo « 10 s » à 5 scènes est correcte, mais toute vidéo courte
(1 ou 2 scènes, ou scènes de durée hétérogène) est **silencieusement plus courte que demandée**.
C'est un défaut de production, pas un défaut d'environnement : il se produirait en production.

**Effet secondaire observé** : `tests/production-profile-media.test.ts` est **intermittent**
(passe seul, échoue en combinaison) car le test utilise **1 scène × 0,5 s** et se situe exactement
sur la frontière de la tolérance.

**Statut** : signalé, **non corrigé** — la mission A00 interdit les corrections fonctionnelles.

### 3.3 A-03 — `typecheck` de l'API : 126 erreurs, toutes dérivées de A-01 (P1)

| Code TS | Nombre | Nature |
|---|---|---|
| `TS7006` | 84 | paramètres implicites `any` — dérivé du client non typé |
| `TS2694` | 22 | `Prisma.<X>GetPayload`, `JsonValue`… absents |
| `TS2305` | 11 | `User`, `Invitation`, `Approval`… non exportés |
| `TS2339` | 6 | `Prisma.DbNull`, `TransactionIsolationLevel`… |
| `TS7031` | 1 | binding implicite `any` |
| `TS2347` | 1 | `$queryRawUnsafe<...>` sur client non typé |
| `TS18047` | 1 | valeur possiblement nulle |

**Correction d'une affirmation antérieure** : la baseline R00 annonçait **23 erreurs dont 3
indépendantes de Prisma**. En capturant la sortie **complète** (et non les 20 dernières lignes),
le décompte réel est **126**, et **aucune** ne peut être prouvée indépendante de A-01 : les
types `PrismaClient` et `Prisma` sont réduits à `any`, ce qui dégrade `project.characters`,
`latestRun.steps` et `$queryRawUnsafe<T>` **par propagation**. Les 3 « erreurs réelles
supposées » sont requalifiées **`UNVERIFIED`** : elles disparaîtront probablement après
`prisma generate`, elles ne peuvent pas être déclarées réelles sans cette vérification.

`apps/web` : `tsc --noEmit` → **exit 0**. Le Web n'importe ni Prisma ni `@vululu/db`.

### 3.4 A-04 — Tests dépendants de la base : 20 fichiers bloqués au chargement (P1)

Cause unique, identique à A-01 : `packages/db/src/client.ts:4` instancie `PrismaClient` à
l'import. Aucun de ces tests n'a pu s'exécuter.

### 3.5 A-05 — Playwright impossible (P2, environnement)

`pnpm exec playwright install chromium` échoue :
```
Failed to download Chrome for Testing ... Download failure, code=1
```
Les **16 specs E2E** restent donc `NOT_RUN`.

### 3.6 A-06 — Gates de sécurité non exécutables (P2, environnement)

9 scripts `scripts/*.ps1` (`check-secrets`, `check-architecture-boundaries`, `check-migrations`,
`verify-foundation-docs`, `check-tracked-files`, `ci`, …) exigent **PowerShell 7**, absent.
`scripts/v1-db.ps1` code en dur `D:/pgportable/pgsql/bin` : **non portable Linux** par conception.

### 3.7 A-07 — Conflit de consigne : branche demandée ≠ branche de session (gouvernance)

La mission demande la branche `arena/vululu-a00-baseline`. La session Arena est liée à
`arena/c3982856-vululu-v1` et **le changement de branche est interdit** (il détacherait le travail
de la session). Traitement retenu en §7.

---

## 4. Commandes et résultats

Environnement des exécutions :
```bash
export PATH="$HOME/.local/bin:$PATH"
export FFMPEG_PATH="$HOME/.local/bin/ffmpeg"
export FFPROBE_PATH="$HOME/.local/bin/ffprobe"
export DATABASE_URL="postgresql://vululu@127.0.0.1:55432/vululu_v1_00_test?schema=public"
export DATABASE_URL_TEST="$DATABASE_URL"
export SESSION_SECRET="<généré aléatoirement, non affiché>"
export APP_ENV=local
```

### 4.1 PASS (13 contrôles)

| # | Commande | Résultat |
|---|---|---|
| P-01 | `git rev-parse HEAD` | `93e1360…` ; arbre propre en début de mission |
| P-02 | `pnpm install --frozen-lockfile` | PASS, **lockfile inchangé** (`git diff` vide) |
| P-03 | `pnpm lint` | **PASS** — 0 erreur / 0 warning |
| P-04 | `tsc --noEmit` → `apps/web` | **PASS** — exit 0 |
| P-05 | `next build` → `apps/web` | **PASS** — 20 routes compilées |
| P-06 | `next start -p 3100` puis `curl /`, `/login`, `/admin` | **PASS** — HTTP 200 (7363 / 6915 / 7243 octets), titre `Vululu AI — Studio` |
| P-07 | `curl -H "Host: 3100-abc123.e2b.app" /login` | **PASS** — HTTP 200, iframe non bloquée |
| P-08 | `vitest run tests/domain` | **PASS — 141 / 141** (16 fichiers) |
| P-09 | `vitest run tests/{asset-inspection,media,production-profile-media,responsive-layout}` | **PASS — 26 / 26** *(avec FFmpeg réel)* |
| P-10 | `./scripts/arena/pg16-local.sh migrate` sur base neuve | **PASS — 19 migrations, 39 tables** |
| P-11 | Cohérence schéma ↔ base | **PASS — 39 modèles ↔ 39 tables, 0 dérive** |
| P-12 | `vitest run` (suite complète) | **222 PASS** / 46 skipped |
| P-13 | `./scripts/arena/bootstrap-media-tools.sh` (2ᵉ exécution) | **PASS** — idempotent, codecs `h264,aac` |

### 4.2 FAIL (réels — 1)

| # | Commande | Résultat |
|---|---|---|
| F-01 | `vitest run` sur les 4 fichiers média (1ʳᵉ combinaison) | **1 FAIL** — `produit un vrai PNG et MP4 4:5…` : `expected 'FAIL' to be 'PASS'`. **Anomalie A-02**. Non reproductible de façon stable ⇒ **test intermittent** provoqué par un défaut réel. |

Aucun autre `FAIL` imputable au code n'a été observé.

### 4.3 FAIL d'origine environnementale — requalifiés NOT_RUN (23)

| # | Périmètre | Cause vérifiée |
|---|---|---|
| N-01 | `pnpm db:generate` | `binaries.prisma.sh` bloqué |
| N-02 | `pnpm typecheck` (API, 126 erreurs) | dérivé de N-01 |
| N-03 | `pnpm build` (API) | dérivé de N-01 |
| N-04 | Démarrage du serveur Fastify | `@prisma/client did not initialize yet` |
| N-05 | 20 fichiers de tests `@vululu/db` (`api.test.ts`, `v1/*`) | idem, échec au chargement |
| N-06 | 16 specs E2E Playwright | Chromium non téléchargeable |
| N-07 | 9 gates `scripts/*.ps1` | `pwsh` absent |
| N-08 | CI GitHub Actions (4 jobs) | jamais déclenchée, aucun push |
| N-09 | Stockage S3 réel | aucun endpoint accessible |
| N-10 | Orchestration Hatchet réelle | moteur absent |
| N-11 | Docker / Coolify / HTTPS | Docker absent |
| N-12 | `pnpm db:seed`, `scripts/coolify/seed-demo.ts` | dérivé de N-01 |
| N-13 | Migrations via `prisma migrate deploy` | binaire `schema-engine` indisponible ; **contourné avec succès en SQL direct** (§5.2) |

### 4.4 NOT_TESTED

Recette Coolify, charge multi-workers, redémarrage du moteur Hatchet, sauvegarde/restauration,
TLS/IAM/SSE S3, prévisualisation navigateur réelle (aucun navigateur disponible).

---

## 5. Détail des preuves les plus significatives

### 5.1 PostgreSQL : 19 migrations appliquées sur un cluster réel

```
OK   20261022184734_init                      OK   20261104214500_v1_demo_brief_profiles
OK   20261023082309_scene_durations…          OK   20261104221500_v1_demo_storyboard_binding
OK   20261023085719_brief_revisions            OK   20261105094500_v1_demo_conversation_proposals
OK   20261023124017_v1_00_foundation           OK   20261105101500_v1_demo_scene_duration_origin
OK   20261023160509_v1_01_a_snapshot_versioning OK  20261105113000_mvp_provider_credentials
OK   20261023170000_v1_01_a1_active_run_index
OK   20261023173000_v1_01_a1_run_integrity     === RESULTAT : FAIL=0 ===
OK   20261023183000_v1_01_b_agentic_capabilities
OK   20261024180000_v1_01_d_durable_orchestration
OK   20261024190000_v1_01_d_active_run_scope
OK   20261025100000_v1_01_e_artifact_storage
OK   20261025120000_v1_01_f_hardening
OK   20261104174000_v1_demo_campaigns
OK   20261104190000_v1_demo_assets
```

**Conclusion forte** : le jeu de migrations est **sain et additif-compatible**. C'est la première
preuve réelle que le schéma s'applique intégralement — les certifications antérieures
l'affirmaient sans exécution reproductible dans cet environnement.

### 5.2 Web servi réellement

```
GET /        → HTTP 200  7 363 octets
GET /login   → HTTP 200  6 915 octets   <title>Vululu AI — Studio</title>
GET /admin   → HTTP 200  7 243 octets
GET /api/health (API arrêtée) → HTTP 502 {"error":"api_unreachable"}
```

Le proxy `/api` se comporte correctement : il **signale** l'indisponibilité de l'API au lieu de
retourner un faux succès.

### 5.3 Média réellement rendu puis vérifié

- PNG 1080×1920 produit par Sharp, checksum SHA-256 calculé, `textLayout` à 4 zones valide.
- Master MP4 produit par FFmpeg 9.0.2 : `h264,1080,1920` + `aac` confirmés par `ffprobe`.
- **Défaut A-02 mis en évidence par la mesure**, pas par lecture de code.

### 5.4 Absence d'appel IA confirmée

```
grep -rnE "fetch\(|axios|openai|anthropic|generativelanguage|replicate|fal\.ai" apps packages
→ 4 résultats, tous internes :
   apps/web/app/admin/layout.tsx:32        (web → API /auth/me)
   apps/web/app/api/[...path]/route.ts:68  (proxy Next → API)
   apps/web/components/CreationDelivery.tsx:61 (téléchargement média)
   apps/web/lib/api.ts:212                 (client API)
```

**Aucun trafic vers un fournisseur d'IA.** Serveur MCP : **0 occurrence** de `McpServer` /
`@modelcontextprotocol`.

---

## 6. Limitations

1. **La couche API n'est pas exécutable** ici (A-01). 20 fichiers de tests et 16 specs E2E restent
   `NOT_RUN` ; c'est la limite la plus lourde de cette baseline.
2. **Aucune vérification de navigateur** : Chromium indisponible, donc pas de recette visuelle
   réelle ni de test E2E.
3. **Les gates de sécurité PowerShell n'ont pas tourné** : l'absence de secret est vérifiée
   manuellement (§8) mais **pas** par `check-secrets.ps1`.
4. **S3, Hatchet, Coolify** : aucun service disponible ⇒ `UNVERIFIED`, pas `PASS`.
5. **Node 22 au lieu de 24** : le dépôt déclare `engines >= 24`. Lint, typecheck Web et tests
   passent, mais un écart de runtime sur un projet de production n'est pas neutre.
6. **Le défaut A-02 n'est pas corrigé** (hors périmètre A00). Il affecte la production réelle.
7. **`/tmp` est volatil** entre appels : les scripts écrivent dans `$HOME` par construction.
8. Les migrations ont été appliquées en **SQL direct**, sans la table `_prisma_migrations`.
   L'état est donc fonctionnel mais `prisma migrate status` restera `NOT_RUN` jusqu'à A-01 résolu.

---

## 7. Le point de gouvernance : branche demandée vs branche de session

**Demandé** : créer `arena/vululu-a00-baseline`, committer, pousser, ouvrir une PR.
**Contrainte** : la session Arena est liée à **`arena/c3982856-vululu-v1`** ; changer de branche
détacherait tout le travail de la session et rendrait la livraison invisible.

**Arbitrage retenu** (le plus conservateur, conforme à `AGENTS.md` §15.2 et §23) :
1. le travail reste **sur la branche de session** ;
2. il y est **commité et poussé** (push autorisé vers la branche de session uniquement) ;
3. **une seule PR** est ouverte **depuis la branche de session** vers `main` ;
4. le nom de branche demandé est documenté ici comme **non utilisé**, avec sa raison.

Aucune branche parallèle n'a été créée, aucun push sur `main`, aucun merge, aucun déploiement.
La PR est ouverte **en brouillon** et **non fusionnée** : la fusion exige un GO explicite.

---

## 8. Contrôle de sécurité de cette mission (manuel, faute de `pwsh`)

| Contrôle | Résultat |
|---|---|
| Fichiers `.env*` créés dans le dépôt | **aucun** (`git status` vide sur ce point) |
| Binaires committés | **aucun** — outils installés dans `$HOME` uniquement |
| Secrets dans les fichiers ajoutés | **aucun** : les scripts génèrent tout à l'exécution ; `SESSION_SECRET` n'est jamais écrit |
| `.env.example` | **inchangé**, placeholders d'origine |
| Valeur secrète affichée dans ce rapport | **aucune** ; le jeton `gh` est masqué par l'outil |
| Connexion à une base de production | **aucune** ; bind `127.0.0.1`, base `vululu_v1_00_test` |
| Substitution SQLite | **aucune** ; `provider = "postgresql"` conservé |
| Modification du `pnpm-lock.yaml` | **aucune** |

---

## 9. Prochain lot prioritaire

**LOT A01 — Débloquer la chaîne Prisma et prouver l'API de bout en bout.**

C'est le **seul** lot qui débloque tout le reste : tant que le client Prisma n'est pas généré,
20 fichiers de tests, l'API entière et les gates de sécurité restent hors de portée.

Périmètre (aucune fonctionnalité nouvelle) :
1. fournir les engines Prisma **hors dépôt** (miroir local, cache amorcé, ou `PRISMA_ENGINES_MIRROR`
   pointant une source accessible) ;
2. vérifier qu'après `db:generate` les 126 erreurs de typecheck disparaissent — **ou** identifier
   celles qui subsistent réellement (A-03 est `UNVERIFIED`, pas résolu) ;
3. démarrer l'API sur `3101`, rejouer les 20 fichiers `@vululu/db` et les gates de sécurité ;
4. consigner `prisma migrate status` sur la base migrée.

Critère de sortie : `pnpm typecheck` global vert **ou** liste exacte des erreurs résiduelles ;
`vitest run` sans `NOT_RUN` d'origine Prisma ; API répondant `200` sur `/api/health`.

**Lots suivants, par ordre de valeur :**

| Lot | Objet | Justification |
|---|---|---|
| **A02** | Corriger A-02 (`assembleMaster`, durée des scènes) | défaut de production **réel**, mesuré, silencieux |
| **A03** | Aligner le discours produit (README/UI) sur l'état réel | risque commercial immédiat, coût quasi nul |
| **A04** | Porter les gates de sécurité en Node/shell portable | supprime la dépendance à `pwsh` (A-06) |
| **A05** | Décision de périmètre : IA réelle, composition d'assets, monétisation | ADR requis, aucun code avant |

**Rappel** : aucun de ces lots n'autorise un appel IA payant, une publication ou un déploiement
sans autorisation écrite.
