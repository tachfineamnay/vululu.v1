---
name: vululu-architecture-change
description: Modifier le code Vululu AI (Domain, Application, Infrastructure, API, contrats, migrations) sans casser les frontières de couches ni les invariants métier — carte des dépendances autorisées, recettes de modification, contrôles et pièges.
whenToUse: Avant d'ajouter ou modifier un invariant/objet de domaine, un cas d'usage ou un port, un adaptateur Prisma/storage/média, une route Fastify, un contrat Zod ou une migration Prisma sur Vululu AI. Ne pas utiliser pour lancer la pile locale (vululu-local-stack), jouer la matrice de gates (vululu-quality-gates) ou préparer le staging (vululu-ops-readiness).
---

# Vululu AI — modifier l'architecture sans casser les frontières

**But** : changer le code du monolithe modulaire V1 (Domain → Application → Infrastructure → API) en respectant les dépendances autorisées, les invariants métier et les contrôles qui les prouvent.

## Quand l'utiliser

- Ajout/évolution d'un objet ou invariant de domaine, d'un cas d'usage, d'un port, d'un adaptateur.
- Nouvelle route Fastify, nouveau contrat Zod, nouvelle migration Prisma.
- Toute modification qui touche versions, snapshots, approbations, transfert Postiz, stockage, outbox ou sécurité d'accès.

**Ne pas l'utiliser pour** : démarrer la pile (`vululu-local-stack`), choisir/exécuter la matrice complète de tests (`vululu-quality-gates`), livrer un lot de bout en bout (`vululu-lot-delivery`), staging/déploiement (`vululu-ops-readiness`). AGENTS.md et les ADR restent prioritaires.

## État vérifié (2026-11-04, HEAD `bb0bc3a`, branche `main`)

| Preuve | Résultat |
|---|---|
| `pwsh -NoProfile -File scripts/check-architecture-boundaries.ps1` | **VÉRIFIÉ PASS** : DOMAIN_FILES=20, DOMAIN_IMPORTS=93, APPLICATION_FILES=17, APPLICATION_IMPORTS=56 |
| `pnpm exec vitest run tests/domain/purity.test.ts` | **VÉRIFIÉ PASS** : 4/4 |
| `pnpm exec vitest run tests/domain` | **VÉRIFIÉ PASS** : 82/82 tests, 11 fichiers |
| `pnpm typecheck` | **VÉRIFIÉ PASS** : 7 projets workspace, exit 0 |
| `pwsh -NoProfile -File scripts/check-migrations.ps1` | **VÉRIFIÉ PASS** : 12 migrations |
| `pnpm exec prisma validate --schema packages/db/prisma/schema.prisma` | **VÉRIFIÉ PASS** |
| Suite API/V1/média, E2E, build, lint strict | **NON REJOUÉS** ici ; recette historique 2026-11-01 : 188 PASS / 2 SKIP (HISTORIQUE, à rejouer) |
| CI GitHub distante, `verify-foundation-docs.ps1`, `check-tracked-files.ps1` | **NOT_RUN/FAIL connu** : les deux scripts échouent sur `infra/coolify/.env.coolify.example` (nommage, pas une fuite) ; la CI distante n'a jamais tourné |

## Carte des couches et dépendances autorisées

| Couche | Emplacement | Autorisé | Interdit (vérifié) |
|---|---|---|---|
| Domain Core | `packages/domain/src` (20 fichiers) | imports relatifs uniquement ; zéro dépendance runtime | SDK, Prisma, Fastify, Next, Sharp, FFmpeg, Hatchet, Postiz, `node:*`, fs, réseau, horloge, aléa, env |
| Application | `packages/application/src` (17 fichiers : `ports.ts`, `use-cases/`) | imports relatifs confinés ; `@vululu/domain` (le script tolère aussi `@vululu/contracts`, non déclaré dans package.json) | apps/*, `@vululu/db`, Prisma, Fastify, Next, AWS, Hatchet, Postiz, sharp, tout package externe ; builtins I/O `node:fs/http/https/net/dgram/child_process/tls/dns/cluster/worker_threads/v8` ; `process.env` par doctrine |
| Infrastructure | `apps/api/src/infrastructure/**` | Prisma, FS/S3, Sharp/FFmpeg, Hatchet, Postiz MOCK, rate limiting ; adaptateurs derrière ports | logique métier dupliquée ; import depuis domain/application |
| API (composition + HTTP) | `apps/api/src/application/container.ts`, `server.ts`, `routes/*.ts`, `env.ts`, `worker/` | Fastify, infrastructure, application, contracts ; DB | logique métier dans les routes ; accès direct Prisma depuis un route handler |
| Web | `apps/web` (Next 16 / React 19) | UI, fetch API, contrats partagés | Prisma, Hatchet, S3, worker (pas couvert par le script : vérifier par grep/revue) |
| Contrats | `packages/contracts/src/index.ts` + `admin.ts` | Zod partagé API/Web | dépendances applicatives |
| DB / Média | `packages/db` (Prisma only), `packages/media` (Sharp/FFmpeg derrière port) | migrations, seed, rendu | import par domain/application |

Règle d'or : une dépendance va **vers l'intérieur** (API → Application → Domain) ; l'infrastructure n'est atteinte que via un port injecté depuis `container.ts`, seul composition root.

## Où mettre quoi — recettes

### (a) Ajouter un invariant / objet de domaine + test

1. Créer/éditer `packages/domain/src/<module>.ts` : aucune lecture d'horloge, d'aléa, d'env ou de FS ; ids, horodatages et checksums sont **reçus** en entrée (`Clock`/`IdGenerator` vivent côté Application). Utiliser `DomainError`, `deepFreeze`, `appendVersion`/`nextVersion`, `sha256Hex`.
2. Exporter dans `packages/domain/src/index.ts` (`export * from './<module>';`) — le test de pureté vérifie une liste de modules attendus.
3. Test unitaire pur dans `tests/domain/<sujet>.test.ts` (vitest, zéro DB) ; ajouter les cas limites (version, checksum, transition interdite).
4. Lancer `pnpm exec vitest run tests/domain` **et** `scripts/check-architecture-boundaries.ps1`. Jamais de « correction » d'une version/snapshot existant : nouvelle version.

### (b) Ajouter un cas d'usage et son port

1. Déclarer le port (`interface XxxRepository`, types `*Record`) dans `packages/application/src/ports.ts`, section du domaine concerné.
2. Écrire `packages/application/src/use-cases/<nom>.ts` : dépend uniquement des ports + `@vululu/domain` ; autorisation/ownership portée par le use case (`actor`, `findOwned`, `assertOwnedProject`) ; erreurs `ApplicationError` avec code/status ; idempotence et transitions dans le use case, pas dans la route.
3. Exporter dans `packages/application/src/index.ts`.
4. Implémenter l'adaptateur dans `apps/api/src/infrastructure/` (Prisma, storage, media…), l'exporter dans `apps/api/src/infrastructure/index.ts`.
5. Enregistrer l'instanciation et le use case dans `apps/api/src/application/container.ts` (composition root unique ; c'est ici que l'infrastructure peut être importée).
6. Tester : fake ports en mémoire (modèle `tests/v1/v1-01-application.test.ts`) et/ou route injectée. Aucun test ne dépend d'un fournisseur réel.

### (c) Implémenter un adaptateur (Prisma, storage, média)

- **Prisma** : `apps/api/src/infrastructure/prisma/<nom>Repository.ts` ; mapper les types Prisma vers les records Application (`mappers.ts`) ; encapsuler les écritures multi-tables dans `$transaction` ; idempotence métier en DB (contrainte unique / `idempotencyKey`) car l'exécution est at-least-once.
- **Storage** : implémenter `ArtifactStoragePort` (`apps/api/src/infrastructure/storage/`) ; enregistrer dans `createArtifactStorage` **et** `createArtifactStorageRegistry` (`storageFactory.ts`) ; clés opaques dérivées de project/scene/version/SHA-256, jamais d'un nom utilisateur ; le registre de lecture doit couvrir local et S3 selon `storageProvider` (`ARTIFACT_STORAGE_BACKEND=local|s3`).
- **Média** : `MediaRendererPort`/renderer via `packages/media` et `FFMPEG_PATH` ; pas d'import FFmpeg/Sharp dans l'Application ; timestamps/checksums calculés hors domaine.
- Config : `process.env` uniquement côté `apps/api/src/env.ts`/factory d'infrastructure ; secrets jamais loggés.

### (d) Exposer une route Fastify + contrat Zod + test API/IDOR

1. Schéma Zod dans `packages/contracts/src/index.ts` (ou `admin.ts`), exporté et réutilisé par le Web.
2. Route dans `apps/api/src/routes/<domaine>.ts` : `preHandler: [app.authenticate]` (+ `rateLimitPreHandler` pour les mutations sensibles), `schema.parse(request.body)`, `actorOf(request.currentUser)`, appel du use case importé de `container`, statut HTTP explicite (201/202/206/416…). Aucun Prisma, aucune règle métier dans le handler.
3. Enregistrer dans `apps/api/src/server.ts` (`await app.register(xxxRoutes)`). Le handler d'erreurs central y traduit `HttpError`/`ApplicationError`/`DomainError`/`ZodError` ; ne pas dupliquer.
4. Sécurité : filtrage propriétaire côté serveur, réponse 404 pour une ressource d'un autre utilisateur, CSRF (`x-csrf-token`) et contrôle d'origine sur les mutations (`isAllowedOrigin`), pas de champ interne dans la réponse (motif `toPublicContext`).
5. Tests : `tests/v1/auth-security.test.ts` (utilisateurs A/B, RBAC, CSRF) et `tests/api.test.ts` (`buildServer()` + `app.inject`) ; base isolée `127.0.0.1:55432/vululu_v1_00_test` migrée via `prisma migrate deploy`, jamais la base de démonstration.

### (e) Ajouter une migration Prisma additive (12 existantes)

1. Modifier `packages/db/prisma/schema.prisma` (source de vérité), puis `pnpm db:migrate` (DATABASE_URL de travail codée vers `127.0.0.1:55432/vululu_v1_00`). Le dossier généré doit respecter `^\d{14}_[a-z0-9_]+$` et contenir un `migration.sql` non vide.
2. SQL **additif** : `ADD COLUMN` nullable ou avec défaut, `CREATE TABLE/INDEX` ; jamais de `DROP`/renommage destructif sans décision explicite ; conserver la lecture des anciennes données (ex. fallback `imagePath`/`masterPath`).
3. `pnpm db:generate`, puis `pnpm exec prisma validate --schema packages/db/prisma/schema.prisma` et `pwsh -NoProfile -File scripts/check-migrations.ps1` (minimum 12, ne peut qu'augmenter ; le script est structurel, il ne valide pas le SQL).
4. Backfill idempotent, dry-run par défaut, jamais massif sans autorisation ; ne jamais éditer une migration déjà appliquée en staging/prod.
5. Vérifier l'application réelle sur base de test : `prisma migrate deploy` + `prisma migrate status`.

## Invariants à préserver (actionnable)

1. **Domain Core pur** : pas de SDK/Prisma/Hatchet/Postiz/fs/réseau ; ni `Date.now`, `new Date(`, `Math.random`, `process.env`, `fetch` ; entrées fournies par l'Application.
2. **Snapshots figés au lancement d'un run** : `context_revision_id`, `brief_revision_id`, configs agents, politique fournisseur, workflow, `schemaVersion`, `snapshotChecksum` — jamais réécrits ; une correction crée un nouveau run/step et de nouvelles versions.
3. **Identifiants stables** `project_id`, `scene_id`/`SCENE-NNN`, `character_id`/`CHAR-NNN` : la position est indépendante de l'identité ; les ids fournisseurs sont des bindings facultatifs.
4. **Artefacts immuables** : nouvelle version plutôt qu'écrasement, checksum SHA-256 + provenance (provider, modèle, storageKey/provider) ; versions historiques relisibles depuis leur backend d'origine.
5. **Approbation exacte** : version + checksum + QA PASS avant transfert ; invalidée par un nouveau master ; un transfert refuse une approbation absente/invalidée.
6. **Transfert Postiz idempotent** : `findTransfer` renvoie l'existant ; « **transféré ≠ publié** » ; MOCK explicite et audité.
7. **Filtrage propriétaire + RBAC serveur** : toute lecture/écriture filtrée par propriétaire ; `super_admin` explicite ; tests IDOR/CSRF obligatoires pour les routes concernées.
8. **Stockage interchangeable** : `ArtifactStoragePort`, registre de lecture local/S3 par `storageProvider`, clés opaques, Range 206/416, bucket et credentials jamais exposés.
9. **Outbox/durable** : JobRun + snapshot + outbox atomiques ; dispatcher idempotent (claim `pending→dispatching`, reprises, backoff, `recoverStaleClaims`, `reconcileApprovals`) ; **at-least-once assumé**, exactly-once non revendiqué.
10. **Journalisation** : `actor_id`, `project_id`, `run_id`, `scene_id`, `provider_id`, `trace_id`/`request_id`, versions, coûts, horodatage ; aucun secret ni token dans les logs/artefacts/erreurs.
11. **MOCK explicite et honnête** : un fournisseur simulé s'écrit MOCK, jamais PASS ; ne pas présenter une démo déterministe comme une intégration réelle.
12. **PostgreSQL source de vérité** ; binaires en stockage objet, pas de blobs lourds en base ; workers désactivables sans casser l'interface.

## Contrôles à exécuter après modification

| Commande | Quand | Statut 2026-11-04 |
|---|---|---|
| `pwsh -NoProfile -File scripts/check-architecture-boundaries.ps1` | après tout import/touche domain ou application | **VÉRIFIÉ PASS** (à rejouer) |
| `pnpm exec vitest run tests/domain` | après tout changement de domaine | **VÉRIFIÉ PASS** (82/82, à rejouer) |
| `pnpm typecheck` | après tout changement TS | **VÉRIFIÉ PASS** (à rejouer) |
| `pwsh -NoProfile -File scripts/check-migrations.ps1` | après toute migration | **VÉRIFIÉ PASS** (12, à rejouer) |
| `pnpm exec prisma validate --schema packages/db/prisma/schema.prisma` | après édition du schéma | **VÉRIFIÉ PASS** (à rejouer) |
| `pnpm exec vitest run tests/v1 tests/api.test.ts` | route/use case/adaptateur | à rejouer (PostgreSQL 55432 test + `SESSION_SECRET` ≥ 32 ; `prisma migrate deploy` d'abord) |
| `$env:LINT_STRICT='1'; pnpm lint` (PowerShell) / `LINT_STRICT=1 pnpm lint` (bash CI) ; `pnpm build` | avant de déclarer un lot livrable | documentés PASS le 2026-11-04, non rejoués ici |
| `pwsh -NoProfile -File scripts/check-secrets.ps1` | avant commit | documenté PASS ; à rejouer |
| `pwsh -NoProfile -File scripts/verify-foundation-docs.ps1` / `... scripts/check-tracked-files.ps1` | avant commit | **FAIL connu** sur `infra/coolify/.env.coolify.example` (nommage) — ne pas maquiller, documenter |

`pwsh -NoProfile -File scripts/ci.ps1 -TestSet domain` rejoue un sous-ensemble sans base ni FFmpeg ; la suite complète exige PostgreSQL 55432, `SESSION_SECRET`, FFmpeg. La CI GitHub distante est **NOT_RUN**.

## Décisions structurantes et documents

- Toute décision structurante ⇒ **nouvel ADR** `docs/adr/NNNN-slug.md` depuis `docs/adr/template.md` (statut, date ISO, sources PRD/CDC, décision vérifiable, conséquences, alternatives) + ligne dans l'index `docs/adr/README.md`. Prochain numéro libre : 0016 (0014/0015 existent mais manquent à l'index : écart documentaire connu, à traiter par un lot doc dédié, pas en silence).
- **Ne jamais modifier un ADR accepté** : en créer un qui le remplace et le référence.
- **Ne jamais modifier les documents importés VERBATIM** (empreintes `docs/source/SHA256SUMS.txt`) : PRD, CDC, `03_ARCHITECTURE_V1.md`, `11_BACKLOG.md`, prompt DSH, note V2 et les 3 `.docx`. Une évolution = nouveau document daté, ADR ou révision explicite.
- En cas de contradiction documentaire : **arrêter et signaler** (AGENTS.md §1), ne pas arbitrer silencieusement.

## Pièges spécifiques

- Importer Prisma/SDK/`@vululu/db`/FFmpeg dans `packages/application` ou `packages/domain` : le script échoue (APPLICATION_EXTERNAL_IMPORT / DOMAIN_EXTERNAL_IMPORT). `container.ts` est une exception **d'emplacement** : composition root, pas couche applicative.
- Contourner un port par un import direct d'adaptateur ou de `@prisma/client` depuis un use case : frontière violée même si le code « marche ».
- `tests/domain/purity.test.ts` est un **miroir plus strict** du script (horloge, aléa, env, fs, réseau) : faire passer l'un ne garantit pas l'autre ; lancer les deux.
- Le script analyse les imports par regex ligne à ligne et ignore les commentaires simples : un import glissé dans un bloc exotique ou une ligne commentée en fin de ligne peut tromper la lecture — relire le diff.
- **`CapabilityResult` impose `mock: true`** (`packages/application/src/ports.ts:723`, P1 documenté dans `V1_CAPABILITIES_MATRIX.md`) : ne pas élargir ce contrat pour un provider réel sans décision explicite (ADR, contrat, tests, budget, provenance) ; la valeur `mock` est aussi écrite dans les métadonnées d'audit et les tests.
- Migrations : jamais destructives, jamais éditées après application ; `check-migrations.ps1` ne valide pas la sémantique SQL ; minimum 12 ne peut que croître.
- Ne jamais modifier rétroactivement un snapshot ni un `artifactVersion` ; ne jamais changer un identifiant stable (`sceneKey`/`charKey`/`project.id`).
- `API_PORT` est la variable lue par `apps/api/src/env.ts` (défaut 3001) ; `V1_API_PORT` est documentée mais **non lue** — ne pas « corriger » cette convention sans décision.
- Les tests de contrat existants font partie du socle : ne pas casser les suites API/V1 en changeant un statut HTTP, un code d'erreur, un champ de réponse ou un schéma Zod.
- `apps/web` n'est pas couvert par `check-architecture-boundaries.ps1` : vérifier par grep qu'aucun import Prisma/Hatchet/S3/worker n'y entre avant de déclarer conforme.
- Ne pas commiter `.env*` (hors modèles), secrets, `data/`, artefacts générés ni modifier un fichier untracked du Lead (`.dsh/`, rapport d'analyse) hors de son périmètre.

## Checklist avant de déclarer un changement conforme

- [ ] Exigence PRD/CDC identifiée, périmètre V1 respecté, décision structurante couverte par un ADR (ou aucune décision nouvelle).
- [ ] Code placé dans la bonne couche ; Domain pur ; Application sans SDK/I/O ; infra derrière port ; route mince ; composition root `container.ts` mis à jour.
- [ ] Port + adaptateur + registre/factory + `infrastructure/index.ts` cohérents ; config lue côté serveur uniquement.
- [ ] Invariants impactés listés et testés ; tests domaine/application/API-IDOR ajoutés ou adaptés.
- [ ] Gates exécutés et datés : boundaries, purity, tests/domain, typecheck, tests ciblés, prisma validate, check-migrations, check-secrets ; FAIL connus notés sans masquage.
- [ ] Aucun document VERBATIM modifié ; ADR/index à jour ; rapport de preuve PASS/SKIP/MOCK/NOT_RUN fourni ; rollback décrit.
- [ ] Diff relu : aucun secret, aucun fichier généré, aucun identifiant/snapshot modifié par effet de bord.

## Références

- `AGENTS.md` §4 (invariants), §6 (tests et preuves), §7 (ADR/documentation), §9 (sécurité).
- `docs/03_ARCHITECTURE_V1.md` ; `docs/adr/template.md` ; ADR 0001, 0006, 0008, 0010, 0011, 0012 (`docs/adr/`).
- `docs/certification/V1_ARCHITECTURE_FINAL.md`, `docs/certification/V1_INVARIANTS_AND_EVIDENCE.md`, `docs/reports/ANALYSE_EXISTANT_2026-11-04.md`.
- Code : `apps/api/src/application/container.ts`, `apps/api/src/server.ts`, `apps/api/src/infrastructure/index.ts`, `apps/api/src/infrastructure/storage/storageFactory.ts`, `apps/api/src/infrastructure/durable/outboxDispatcher.ts`, `packages/application/src/ports.ts`, `packages/domain/src/index.ts`, `packages/contracts/src/index.ts`, `packages/db/prisma/schema.prisma`.
- Contrôles : `scripts/check-architecture-boundaries.ps1`, `scripts/check-migrations.ps1`, `scripts/ci.ps1`, `.github/workflows/ci.yml`, `tests/domain/purity.test.ts`, `tests/v1/auth-security.test.ts`.
- Skills liés : `vululu-project-orientation`, `vululu-lot-delivery`, `vululu-quality-gates`, `vululu-local-stack`, `vululu-ops-readiness`.
