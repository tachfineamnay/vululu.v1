# VULULU — BASELINE D'INGÉNIERIE (Mission R00)

- **Date de la mission** : 2026-11-19
- **Dépôt** : `tachfineamnay/vululu.v1`
- **Branche de travail** : `arena/c3982856-vululu-v1`
- **SHA de référence (HEAD, `main`, `origin/main`)** : `ccc1977a1131ef2243c0f52055307df91de75b08`
- **Sujet du HEAD** : `fix: inclure les tokens dans l image Web` — 2026-11-07 13:48:38 UTC
- **Nature** : constat factuel de l'existant. Aucune refonte, aucune fonctionnalité ajoutée.
- **Statut global** : **SOCLE LOCAL DÉMONSTRABLE / PRODUIT NON COMMERCIALISABLE**.

Ce document ne remplace pas `docs/certification/` ni `docs/reports/`. Il les confronte au code
tel qu'il est, avec des commandes rejouées le 2026-11-19 dans un environnement Linux neuf.

---

## 1. Périmètre du constat

| Élément | Constat |
|---|---|
| Dépôt local | arborescence propre (`git status --porcelain` vide) |
| Branches | `main`, `arena/c3982856-vululu-v1`, `origin/main` — toutes sur `ccc1977` |
| Worktrees | un seul (`git worktree list` → une entrée, HEAD `ccc1977`) |
| Fichiers suivis | 579 |
| Historique | **1 seul commit** (`git rev-list --count HEAD` → `1`) |
| Fichiers non commités | aucun |
| Sous-modules | aucun |
| CI | `.github/workflows/ci.yml` présent, **jamais exécuté** (déclaré NOT_RUN dans l'en-tête du workflow et dans `docs/review/V1_CI_WORKFLOW_REVIEW.md`) |

### 1.1 Conséquence du profil d'historique

L'historique local est **écrasé en un commit unique**. Les mentions de SHAs antérieurs dans
`docs/certification/` (`0e79c08`, `11e11e5`, `4fbce9d`) et de branches `v1-01-*` sont
**irrécupérables localement**. Toute revendication de traçabilité historique doit donc être
considérée comme **UNVERIFIED** dans ce dépôt : on ne peut prouver que l'état présent du code,
jamais le chemin qui y a mené. Ce point conditionne la stratégie Git de la §9.

### 1.2 Environnement de vérification (2026-11-19)

| Outil | Attendu par le dépôt | Constaté | Impact |
|---|---|---|---|
| Node | `>=24.0.0` (`package.json` engines) | `v22.22.3` | warning pnpm ; typecheck/lint/tests verts constatés malgré l'écart |
| pnpm | `10.6.1` | installé à la demande (`npm i -g pnpm@10.6.1`) | `pnpm install --frozen-lockfile` OK, **lockfile inchangé** |
| PostgreSQL | 17, port hôte `55432` | **absent** (aucun binaire, `apt-cache policy` → aucune candidate) | tout test à base de données est **NOT_RUN** |
| FFmpeg/FFprobe | binaire complet libx264/AAC | **absent**, non installable (voir §1.3) | master MP4 et sondes A/V **NOT_RUN** |
| Docker | 29 (poste de référence) | **absent** | recette Coolify/containers **NOT_RUN** |
| PowerShell 7 | requis par 9 scripts de gate | **absent** | gates `check-*.ps1` **NOT_RUN** |

### 1.3 Ce qui a bloqué, précisément

- `pnpm db:generate` → `Error: request to https://binaries.prisma.sh/.../schema-engine.gz.sha256 failed`.
  Le client Prisma n'est **pas généré** : `node_modules/.prisma/client` inexistant.
  Conséquence : `@prisma/client` n'exporte ni `User` ni `Invitation`.
- FFmpeg : absent du système, aucune candidate APT, téléchargement binaire impossible
  (image de base sans CA intermédiaire : `UNABLE_TO_VERIFY_LEAF_SIGNATURE`).
- PostgreSQL : aucun binaire, aucun conteneur possible.
- Répertoire `/tmp` : **effacé entre deux appels d'outil** dans cet environnement ; tout
  artefact de test doit rester sous la racine du dépôt (et donc dans une zone ignorée par Git).

**Ce que cela implique pour la lecture de ce document** : les **7 FAIL** de la §4 ne prouvent
pas une régression du code. Ce sont des **preuves impossibles à produire ici** (absence de
binaire), à rejouer sur un poste de référence. La distinction est tenue partout : `FAIL`
(assertion échouée sur du code exécuté) vs `NOT_RUN` (dépendance absente).

---

## 2. Cartographie du dépôt (état réel)

```
apps/api        Fastify 5 — 10 fichiers de routes, 1 composition root
apps/web        Next.js 15 — 18 pages, proxy /api runtime (host-aware)
packages/domain        39 modèles Prisma, 22 exports, 0 dépendance runtime (pureté testée)
packages/contracts     schémas Zod partagés API/Web
packages/application   20 fichiers de cas d'usage, 1 fichier de ports (1362 lignes)
packages/media         Sharp (PNG) + FFmpeg (master MP4) — 100 % déterministe
packages/db            schéma Prisma 640 lignes, 19 migrations, seed bootstrap
scripts                9 gates PowerShell + scripts TS (inventaire, migration artefacts, purge)
infra · poc · e2e · tests
```

Chiffres mesurés :

| Indicateur | Valeur |
|---|---|
| Modèles Prisma | 39 (`grep -c '^model '`) |
| Migrations | 19 dossiers (`packages/db/prisma/migrations/`) |
| Cas d'usage applicatifs | 20 fichiers dans `packages/application/src/use-cases/` |
| Fichiers de tests | 70 (53 unitaires/intégration + 16 specs E2E + helpers) |
| Tests unitaires domaine exécutés | **141 PASS / 141** |

---

## 3. Matrice des fonctionnalités (REAL / PARTIAL / MOCK / ABSENT / UNVERIFIED)

Règle de classement :
**REAL** = implémenté et vérifié sur du code réellement exécuté ;
**PARTIAL** = implémenté mais lacunaire sur un point nommé ;
**MOCK** = simulé explicitement (aucun appel externe) ;
**ABSENT** = inexistant ;
**UNVERIFIED** = présent dans le code, non exécutable ici.

### 3.1 Authentification, identité, RBAC

| Capacité | État | Preuves / fichiers |
|---|---|---|
| Login email + mot de passe (bcrypt), cookie de session serveur | REAL (code) / UNVERIFIED (exécution) | `apps/api/src/routes/auth.ts:40`, `apps/api/src/security/session.ts` — token + CSRF stockés **hachés** SHA-256, TTL 24 h, `revokedAt` |
| CSRF sur méthodes mutantes, origines autorisées | REAL (code) | `apps/api/src/server.ts` hook `onRequest`, `apps/api/src/security/origin.ts`, `CSRF_EXEMPT_PATHS` |
| Invitations + activation | UNVERIFIED | `apps/api/src/routes/auth.ts:120`, `routes/admin.ts:47` ; testés dans `tests/v1/admin-bootstrap.test.ts` (non exécutable : pas de DB) |
| RBAC `super_admin` / `user` | REAL (code) | `apps/api/src/application/container.ts:actorOf`, `app.requireSuperAdmin` |
| Isolation par propriétaire (IDOR) | REAL (code) | `findOwned`/`*Owned` systématiques : `sceneRepository.ts`, `assetRepository.ts`, `artifactAccess.ts` |
| Rate limiting distribué (PostgreSQL) | REAL (code) | `apps/api/src/infrastructure/security/rateLimiter.ts` — `INSERT ... ON CONFLICT` atomique |
| MFA | **ABSENT** | `apps/web/app/admin/reglages/page.tsx:12` → `NOT_CONNECTED` |
| Politique de mot de passe | PARTIAL | `demoCredentialPolicy.ts` ne couvre que les comptes de démonstration |

### 3.2 Contexte de marque, brief, storyboard

| Capacité | État | Preuves / fichiers |
|---|---|---|
| Contexte de marque versionné | REAL (code) | `packages/application/src/use-cases/contexts.ts`, `ContextRevision` |
| Analyse de contexte par IA | **MOCK** | `apps/api/src/infrastructure/providers/deterministicContextAnalyzer.ts` : `mode: 'MOCK'`, `websiteFetched: false`, aucune URL consultée |
| Brief versionné + confirmation d'une version exacte | REAL (code) | `use-cases/briefs.ts`, `briefConfirmations.ts`, contrôles `confirmedChecksum`/`confirmedBy` dans `storyboardStore.ts:110` |
| Storyboard 5 scènes (1 pour `Affiche`) | **PARTIAL — contenu figé** | `use-cases/storyboards.ts:21-33` : `templatesForBrief()` produit 5 textes **codés en dur** (`'Accroche'`, `'Pour vous'`, `'Notre projet'`, `'Invitation'`, `'Appel à action'`). Seule la `description` reprend le brief. **Aucune génération IA.** |
| Personnage unique | **PARTIAL — figé** | `storyboards.ts:35-37` : `CHARACTER_KEY = 'CHAR-001'`, `CHARACTER_NAME = 'Personnage A'` |
| Édition durée par scène, verrou pendant production | REAL (code) | `sceneRepository.ts:updateDuration` (`status: { not: 'producing' }`) |
| Révisions de brief / invalidation d'approbation | REAL (code) + testé | `tests/domain/artifact-approval.test.ts` (10 PASS) |

### 3.3 Campagnes, projets, assets

| Capacité | État | Preuves / fichiers |
|---|---|---|
| Campagnes (création, liste, détail) | REAL (code) | `use-cases/campaigns.ts`, `routes/campaigns.ts` ; `tests/domain/campaign.test.ts` 8 PASS |
| Projets, cycle de vie | REAL (code) | `use-cases/projects.ts`, `routes/projects.ts` |
| Upload d'assets avec inspection réelle des octets | **REAL** | `packages/media/src/assetInspection.ts` — détection MIME par contenu, refus SVG/HTML/ZIP, limite 16 Mpx ; **12 tests PASS / 3 NOT_RUN** (`tests/asset-inspection.test.ts`) |
| Versionnement immuable des assets + staging→ready | REAL (code) | `assetRepository.ts:reserve/finalize` (`SELECT ... FOR UPDATE`), `use-cases/assets.ts` |
| Licences d'usage (`organic`/`sponsored`) | REAL (code) + testé | `tests/domain/assets.test.ts` 15 PASS |
| Sélection d'assets par projet (`ProjectAssetSelection`) | REAL (code) | `assetRepository.ts:selectOwned`, `routes/assets.ts:48` |
| **Composition des assets dans les images** | **ABSENT** | **Preuve négative** : `grep -rn "assetSelection" packages/media apps/api/src/infrastructure/production packages/application/src/use-cases/durableProduction.ts` → **0 résultat**. Les assets sont **capturés dans le snapshot** (`productionRunRepository.ts:212`) et **validés** (licence, `ready`, propriétaire) mais **jamais rendus**. |

### 3.4 Studio, production, média, vidéo

| Capacité | État | Preuves / fichiers |
|---|---|---|
| Parcours Studio (brief → storyboard → production → correction → livraison) | REAL (code) | `apps/web/components/ProjectStudio.tsx` (591 lignes), `ProjectJourney.tsx`, `CreationDelivery.tsx` |
| Rendu d'images de scène | **MOCK visuel** | `packages/media/src/sceneComposition.ts` : dégradé SVG + 2 cercles + 4 blocs de texte. **Aucun modèle génératif.** Rendu réellement exécuté le 2026-11-19 → PNG 1080×1920 valide, libellé **`VULULU AI · DÉMO MOCK · v1` incrusté en dur** dans chaque image |
| Variation visuelle entre versions | PARTIAL — cosmétique | `sceneComposition.ts` : position du cercle dérivée d'un SHA-256 de `direction|instruction`. Change le décor, **pas le contenu** |
| « Corrections » de scène | PARTIAL — cosmétique | `localProductionExecutor.ts:runCorrection` / `durableProduction.ts:renderScenes` : nouvelle version **uniquement parce que `version + 1`**, avec décalage de cercle. Aucune prise en compte sémantique de l'instruction |
| Assemblage master MP4 (libx264 + AAC) | UNVERIFIED | `packages/media/src/index.ts:assembleMaster` — diaporama `concat` de PNG avec piste silencieuse `anullsrc` |
| **Audio** | **ABSENT (et correctement refusé)** | `productionRunRepository.ts` : `audio_not_qualified` si `voiceVersionId`/`musicVersionId` renseignés. Voix/musique/mixage inexistants |
| QA média (dimensions, durée, codecs, checksum) | REAL (code) / UNVERIFIED (exécution) | `packages/media/src/index.ts:runQa` — 4 contrôles par scène + 5 sur le master |
| Formats | PARTIAL | `productionRunRepository.ts` : `format_not_qualified` si `format !== 'Video'` → seul *Video* est produit. `Affiche`/`Carrousel` refusés en production |
| Corrections multi-scènes | PARTIAL | une scène cible par run (`targetSceneKey`) |
| Approbation d'une version exacte (version + checksum) | REAL (code) + testé | `domain/approval.ts`, `tests/domain/artifact-approval.test.ts` 10 PASS |
| Invalidation d'approbation par un nouveau master | REAL (code) + testé | `tests/domain/production-correction.test.ts` 10 PASS |

### 3.5 Orchestration, durabilité, jobs

| Capacité | État | Preuves / fichiers |
|---|---|---|
| Mode local (défaut) | **PARTIAL — non durable** | `ORCHESTRATOR_MODE` absent ⇒ `LocalProductionExecutor` (`apps/api/src/application/container.ts:84`) : rendu **in-process**, `start()` ne fait pas attendre, **aucune reprise après crash**, aucun retry |
| `LocalOrchestratorAdapter` | **PARTIAL — assumé, documenté** | `orchestrator/localOrchestratorAdapter.ts` : « EXPLICITEMENT IN-PROCESS ET NON DURABLE … ne doit pas être présenté comme une orchestration durable » |
| Mode Hatchet (worker + 6 tâches + approbation durable + transfert) | **UNVERIFIED** | `apps/api/src/worker/pipeline.ts` — workflow `vululu-production-pipeline` ; **jamais exécuté ici** (moteur absent) |
| Outbox + dispatcher + réconciliation | REAL (code) | `infrastructure/durable/outboxDispatcher.ts`, `operations/runtimeReconciliation.ts`, `routes/ops.ts` (`/api/ops/health`, `/metrics`, `/reconcile` en dry-run par défaut) |
| Heartbeat worker + détection de stale | REAL (code) | `apps/api/src/worker/main.ts` (upsert toutes les 10 s), `opsMetrics.ts` |
| Idempotence des étapes | REAL (code) | `DurableProductionUseCases` : sortie d'étape persistée et relue (`getStepOutput`) avant re-exécution |
| Panne du worker pendant une approbation | PARTIAL | `executionTimeout: '30m'` + `waitForEvent` 24 h ; comportement au redémarrage **NOT_RUN** |

### 3.6 Fournisseurs IA, coûts, Postiz, admin

| Capacité | État | Preuves / fichiers |
|---|---|---|
| **Appel à un fournisseur IA réel** | **ABSENT** | `grep -rnE "fetch\(|axios|openai|anthropic|generativelanguage|replicate" apps/api/src packages/*/src` → **0 résultat**. Aucun trafic sortant possible, y compris par accident |
| `MockCapabilityProvider` | MOCK | `mockCapabilityProvider.ts` — `mock: true`, coût 2 ¢ fictifs, injection de pannes/timeouts pilotable |
| `DeterministicProviderAdapter` | MOCK (contractuel) | `deterministicProviderAdapter.ts` — **non injecté hors tests** (`grep` : uniquement `infrastructure/index.ts` + `tests/v1/infrastructure.test.ts`) |
| Catalogue fournisseurs / modèles, licences, qualifications | REAL (code) | `PrismaProviderCatalogRepository`, `use-cases/provider-catalog.ts`, `admin/fournisseurs/page.tsx` |
| Routing + fallback + budget par run | REAL (logique) / MOCK (effets) | `durableRoutingService.ts`, `use-cases/routing.ts`, plafonds `maxMockCents` |
| **Coûts réels** | **ABSENT** | `routes/projects.ts` renvoie `costs: { mode: 'MOCK' }`; `projectBundleQuery.ts:223` agrège des `CostEvent` **simulés** ; `PrismaCostRepository` ne fait qu'écrire une ligne |
| Jetons de credentials fournisseurs | PARTIAL | `providerCredentialCipher.ts` (AES) + `AesProviderCredentialCipher` ; **aucun fournisseur ne les consomme** (rien à appeler) |
| Postiz | **MOCK** | `postiz/postizMockAdapter.ts` : zéro réseau, zéro publication ; statut `submitted` → `acknowledged` après 400 ms par `setTimeout` ; `externalId: null` |
| Facturation / abonnements / crédits / marketplace | **ABSENT** | explicitement hors périmètre V1/V2 (`README.md`, `AGENTS.md` §2). **Obstacle direct à la commercialisation** |
| Serveur MCP | **ABSENT** | `adminQuery.ts:111` et `apps/web/lib/studio.ts:46` : `NOT_CONNECTED — Aucun serveur MCP implémenté` |
| Admin (utilisateurs, invitations, audit, coûts, jobs, fournisseurs, réglages, agents) | REAL (code) | 8 pages `apps/web/app/admin/*`, 724 lignes `prisma/adminQuery.ts`, routes `admin*.ts` |
| Stockage local / S3-compatible | REAL (code) / S3 UNVERIFIED | `storageFactory.ts`, `localArtifactStorage.ts`, `s3ArtifactStorage.ts` (registre de lecture multi-backend) |
| Observabilité (traceId/requestId, logs JSON, Prometheus) | REAL (code) | `observability/logger.ts`, `routes/ops.ts` (`/api/ops/metrics`) |

### 3.7 Synthèse numérique

| État | Nb de capacités cartographiées |
|---|---|
| REAL (code vérifié) | 21 |
| PARTIAL | 11 |
| MOCK | 6 |
| ABSENT | 8 |
| UNVERIFIED (non exécutable ici) | 7 |

---

## 4. Défauts suspectés — verdicts étayés

### D-01 — « Scènes figées » → **CONFIRMÉ**

Le contenu de scène n'est pas produit, il est **templaté**. `packages/application/src/use-cases/storyboards.ts:21-33` :

```ts
return [
  { title: 'Accroche',   description: brief.objective },
  { title: 'Pour vous',  description: 'Pour ' + brief.audience + '.' },
  { title: 'Notre projet', description: brief.objective },
  { title: 'Invitation', description: invitation },
  { title: 'Appel à action', description: brief.cta }
];
```

Trois conséquences : (a) deux scènes partagent le **même** `description` (`brief.objective`) ;
(b) l'« implication IA » se limite à un `if/else` sur le ton du brief ; (c) `Character "Personnage A"` est
constant. Aucune sortie de modèle n'intervient nulle part.

### D-02 — « Assets non composés » → **CONFIRMÉ**

Chaîne complète traçée :

1. l'asset est **importé** (`use-cases/assets.ts`), **inspecté** (`assetInspection.ts`, réel), **versionné** ;
2. il est **sélectionnable** (`assetRepository.selectOwned`) et **contrôlé** au lancement
   (licence, `state === 'ready'`, propriétaire, contexte : `productionRunRepository.ts:174`) ;
3. il est **figé dans le snapshot** de run (`productionRunRepository.ts:212`) ;
4. **le rendu ne le lit jamais.** `composeScene()` (`sceneComposition.ts`) ne reçoit ni asset, ni chemin d'asset :
   ses seules entrées sont `brandName`, `title`, `description`, deux couleurs, `version`, `style`, `direction`.

**Preuve négative reproductible** : `grep -rn "assetSelection" packages/media apps/api/src/infrastructure/production packages/application/src/use-cases/durableProduction.ts` → *aucun résultat*.

**Preuve positive** : PNG rendu le 2026-11-19 hors base de données → poster typographique, aucun visuel de marque.
Le libellé `VULULU AI · DÉMO MOCK · v1` est gravé dans `sceneComposition.ts` et apparaît donc **dans chaque image livrable**.

### D-03 — « Images anciennes mal sélectionnées » → **NON CONFIRMÉ (logique) / RISQUE RÉSIDUEL**

La sélection est correcte par construction :

- `orderBy: { version: 'desc' }, take: 1` partout (`productionExecutionStore.ts:114`, `projectBundleQuery.ts:151`, `artifactAccess.ts:44,68`) ;
- en correction, seule la scène cible est re-rendue ; les autres réutilisent `latestVersion` (pas de re-rendu — voulu) ;
- `/latest` et `/master?version=n` exposent explicitement l'historique (`routes/production.ts:105`) ;
- l'UI épingle une version exacte (`ProjectStudio.tsx:332`) : `version` **et** `checksum` doivent correspondre.

**Mais deux risques réels subsistent** : (a) `durableProduction.ts:renderScenes` et
`localProductionExecutor.ts` réutilisent `latestVersion` **sans vérifier le contexte/brief** du run si
l'étape a déjà un output partiel — l'`orderBy` ne protège pas d'un snapshot périmé ;
(b) le `textLayout` des scènes **réutilisées** porte des `width: 0, height: 0`
(`durableProduction.ts`, bloc `reused`) ; `validTextLayout()` exige des dimensions exactes, donc la QA
d'une correction **devrait** échouer sur les scènes réutilisées — comportement à confirmer par exécution réelle,
car non couvert par les tests exécutables ici.

### D-04 — « Jobs non durables » → **CONFIRMÉ (mode par défaut)**

`ORCHESTRATOR_MODE` non défini ⇒ `ORCHESTRATOR_MODE || 'local'` (`apps/api/src/env.ts:58`) ⇒
`LocalProductionExecutor` en mémoire du process API. Rendu synchrone-ish, **aucune reprise**.
Le worker Hatchet existe (`worker/pipeline.ts`, 6 tâches, idempotency key `input.outboxId`) mais n'est
actif qu'avec `ORCHESTRATOR_MODE=hatchet` **et** un moteur joignable. **Mode par défaut = le moins durable.**

### D-05 — « Mocks présentés comme réels » → **NON CONFIRMÉ — le code est honnête**

Point notable, à la décharge du dépôt : les simulations sont **explicitement étiquetées**.

| Emplacement | Étiquette |
|---|---|
| `sceneComposition.ts` | texte incrusté `DÉMO MOCK` dans chaque PNG |
| `deterministicContextAnalyzer.ts` | `mode: 'MOCK'`, `websiteFetched: false` |
| `mockCapabilityProvider.ts` | `mock: true` |
| `postizMockAdapter.ts` | `POSTIZ_MOCK_PROVIDER`, `externalId: null`, commentaire « ce n'est pas un acquittement Postiz réel » |
| `routes/projects.ts` | `costs: { mode: 'MOCK' }` |
| `adminQuery.ts:111`, `studio.ts:46` | `MCP V1 — NOT_CONNECTED` |

Le risque n'est donc pas le mensonge du code, mais **la lecture du README** : celui-ci titre
« Studio de production créative agentique **multimodèle** » alors que **zéro modèle** est appelé.
Écart à traiter en priorité commerciale (voir `VULULU_DELIVERY_STATUS.md`, risque P0-02).

### D-06 — Défaut supplémentaire découvert (non suspecté au départ) — **P1**

**`pnpm typecheck` n'est PAS vert sur un environnement neuf.** 23 erreurs, dont 2 **indépendantes de Prisma** :

```
apps/api/src/infrastructure/prisma/projectBundleQuery.ts(159,67): error TS7006: Parameter 'character' implicitly has an 'any' type.
apps/api/src/infrastructure/prisma/projectBundleQuery.ts(223,41): error TS7006: Parameter 'step' implicitly has an 'any' type.
apps/api/src/infrastructure/security/rateLimiter.ts(41,24): error TS2347: Untyped function calls may not accept type arguments.
... (+ 20 erreurs)
```

Les 20 autres (`Prisma has no exported member 'InputJsonValue'`, `Module '@prisma/client' has no exported
member 'User' / 'Invitation'`, `Parameter 'tx' implicitly has an 'any' type`) sont une **conséquence dérivée**
du client Prisma non généré dans cet environnement : elles disparaîtraient après `pnpm db:generate`.
Les **3 premières** en revanche sont des **défauts de code réels** : `map()` non annoté et
`$queryRawUnsafe<...>` rejeté par TS 5.9 (`Untyped function calls may not accept type arguments`).
Elles ne peuvent pas être imputées à l'environnement.

`apps/web` en revanche : `tsc --noEmit` **sorti 0**.

---

## 5. Preuves — PASS / FAIL / NOT_RUN

Toutes les commandes ci-dessous ont été exécutées le **2026-11-19** à la racine du dépôt, sur le SHA `ccc1977`.

### 5.1 Installation

| # | Commande | Résultat | Détail |
|---|---|---|---|
| I-01 | `pnpm install --frozen-lockfile` | **PASS** | 20,6 s, lockfile inchangé (`git diff --exit-code -- pnpm-lock.yaml` OK), warning moteur Node 22 vs `>=24` |
| I-02 | `pnpm db:generate` | **FAIL (environnement)** | `binaries.prisma.sh` injoignable → `schema-engine` non téléchargé, client non généré |

### 5.2 Qualité statique

| # | Commande | Résultat | Détail |
|---|---|---|---|
| Q-01 | `pnpm lint` (`eslint .`) | **PASS** | 0 erreur, 0 warning, 16,3 s |
| Q-02 | `pnpm exec tsc --noEmit` dans `packages/domain` | **PASS** | exit 0 |
| Q-03 | idem `packages/media` | **PASS** | exit 0 |
| Q-04 | idem `packages/contracts` | **PASS** | exit 0 |
| Q-05 | idem `packages/application` | **PASS** | exit 0 (frontières Layer respectées) |
| Q-06 | idem `apps/web` | **PASS** | exit 0 |
| Q-07 | idem `apps/api` | **FAIL** | 23 erreurs — 3 réelles (§D-06), 20 dérivées du client Prisma absent |
| Q-08 | `pnpm -r typecheck` | **FAIL** | propage Q-07 |

### 5.3 Tests unitaires exécutables sans base ni binaire

| # | Périmètre | Résultat | Détail |
|---|---|---|---|
| T-01 | `vitest run tests/domain` | **PASS** | **16 fichiers, 141 tests, 141 PASS**, 6,8 s |
| T-02 | `vitest run tests/studio-draft.test.ts tests/project-journey.test.ts tests/project-presentation.test.ts tests/creation-delivery.test.ts` | **PASS** | 4 fichiers, **13 PASS** |
| T-03 | `vitest run tests/responsive-layout.test.ts` | **6 PASS / 1 FAIL** | FAIL = `verifie l audit lie au PNG…` → `FFMPEG_PATH requis` (master) |
| T-04 | `vitest run tests/asset-inspection.test.ts` | **12 PASS / 3 FAIL** | FAIL = sondes `wav`/`mp3`/`mp4` → `FFMPEG_PATH requis pour ce test reel` |
| T-05 | `vitest run tests/media.test.ts` | **0 PASS / 1 FAIL** | `renders five PNG scenes and a readable MP4 master` → FFmpeg absent |
| T-06 | `vitest run tests/production-profile-media.test.ts` | **1 PASS / 2 FAIL** | FAIL = production PNG+MP4 4:5 → FFmpeg absent |

**Total tests réellement exécutés et verts : 156.** Aucun de ces 7 FAIL n'est une assertion métier
contredite : tous portent sur FFmpeg, dépendance externe absente.

### 5.4 Tests nécessitant PostgreSQL — **NOT_RUN**

| # | Périmètre | Résultat | Cause |
|---|---|---|---|
| T-07 | `tests/api.test.ts` | **NOT_RUN** | `prisma migrate deploy` → binaire `schema-engine` indisponible ; 10 tests **skipped** |
| T-08 | `tests/v1/**` (sécurité, stockage, durabilité, hardening) | **NOT_RUN** | même cause |
| T-09 | `pnpm build` (`next build` + API) | **NOT_RUN** | dépend du client Prisma généré |
| T-10 | `pnpm test:e2e` (16 specs Playwright) | **NOT_RUN** | exige DB + FFmpeg + navigateur |

### 5.5 Gates non exécutables

| # | Commande | Résultat | Cause |
|---|---|---|---|
| G-01 | 9 scripts `scripts/check-*.ps1` | **NOT_RUN** | `pwsh` absent |
| G-02 | `scripts/check-secrets.ps1 -History` | **NOT_RUN** | idem ; **et** l'historique ne contient qu'un commit |
| G-03 | CI GitHub Actions (4 jobs) | **NOT_RUN** | jamais déclenchée (aucun push) — état confirmé dans l'en-tête de `ci.yml` |
| G-04 | Docker / Coolify / HTTPS | **NOT_RUN** | Docker absent |

### 5.6 Preuve positive produite manuellement (hors suite)

| # | Preuve | Résultat |
|---|---|---|
| P-01 | `renderScene()` appelé directement (`tsx`, sans DB) sur 1080×1920 | **PASS** — PNG 127 024 octets, checksum `185cb7d2eb26…`, `textLayout` 4 zones valide |
| P-02 | Inspection visuelle du PNG | **CONFIRMÉ** — poster typographique, dégradé + 2 cercles, libellé `VULULU AI · DÉMO MOCK · v1`, **aucun asset de marque** |

Artefact de P-01/P-02 supprimé après constat ; `git status --porcelain` est resté vide.

---

## 6. Composants QeyNox transposables

### 6.1 Constat préalable — **aucun code QeyNox dans ce dépôt**

`grep -rniI "qeynox"` → **7 occurrences, toutes documentaires** :
`docs/02_CAHIER_DES_CHARGES_V1.md:66`, `docs/INAUGURATION_REPORT.md:191,233,319,326`,
`docs/PROMPT_DEEPSEEK_HARNESS.md:9`, `docs/adr/0001-monolithe-modulaire-et-domain-core.md:32`,
`docs/backlog/P0_0_AUDIT_FONDATIONS.md:20,33`, `docs/foundations/01_TRACEABILITY_MATRIX.md:156`,
`docs/backlog/ROADMAP_V1.md:46`.

**Verdict documentaire unanime** : « aucune reprise de code sans compatibilité démontrée et ADR »
(`P0_0_AUDIT_FONDATIONS.md:33`) ; la réutilisation directe est **rejetée** pour la fondation
(`ADR-0001:32`) ; la décision est **OPEN** (`01_TRACEABILITY_MATRIX.md:156`, `X-17`).
Le dépôt QeyNox **n'est pas accessible** dans cet environnement : ni son code, ni ses contrats,
ni sa licence ne peuvent être vérifiés.

### 6.2 Transposition **par concept**, pas par copie

Le socle actuel possède déjà des équivalents natifs. La stratégie recommandée est donc
**« comparer les contrats, garder l'existant »**, jamais un portage de fichiers.

| Composant QeyNox visé | Équivalent présent à Vululu | Écart / à faire | Verdict |
|---|---|---|---|
| **ToolBroker** | `CapabilityProviderPort` + `RoutingUseCases` + `PrismaProviderCatalogRepository` + `DeterministicProviderAdapter` | Broker de **capacités** par agent, pas d'outils arbitraires ; pas de registre d'outils externes | **DÉJÀ COUVERT** — ne pas importer |
| **BudgetService** | `maxMockCents` + `captureRunPolicy` + `PrismaCostRepository` + `CostEvent` | Budget **mock** ; ni arrêt dur sur dépassement réel, ni facturation | **à renforcer localement** (P1) |
| **Recovery** | `outboxDispatcher` + `RuntimeReconciliationService` + `getStepOutput` idempotent + `workerHeartbeat` | Reprise **par étape** seulement, dépend de Hatchet | **DÉJÀ COUVERT (code)** — valider en exécution |
| **EnginePort** | `DurableOrchestratorPort` (`HatchetOrchestratorAdapter` / `LocalOrchestratorAdapter`) | Port **déjà** provider-agnostique et propre | **DÉJÀ COUVERT** — référence de conception |
| **Flow** | Workflow `vululu-production-pipeline` (`worker/pipeline.ts`) | DAG média figé à 6 tâches ; pas de DAG générique | **à ne pas génériciser** en R00 |

### 6.3 Conditions avant toute transposition (bloquantes)

1. **Licence** : le dépôt Vululu n'a **aucune licence** (`README.md` — « Tous droits réservés par défaut », décision ouverte **D-09**). On ne peut légalement ni importer ni exporter sans arbitrage écrit.
2. **Accès** : aucun accès réseau à QeyNox dans cet environnement ; contrats et licence **UNVERIFIED**.
3. **Gouvernance** : `AGENTS.md` §3 interdit la reprise de code sans ADR ; `ADR-0001` a déjà tranché contre.
4. **Traçabilité** : l'historique local étant écrasé (§1.1), une provenance de code importé serait **indémontrable**.

**Recommandation R00** : **ne rien importer**. Rédiger un ADR `0002-…` **après** vérification de licence
et de contrats, avec un tableau de correspondance §6.2 comme base — c'est exactement le livrable attendu de P0-0.

---

## 7. Risques priorisés

### P0 — bloquants pour un produit commercialisable

| ID | Risque | Preuve | Impact |
|---|---|---|---|
| **P0-01** | **Aucune génération IA réelle.** Tout visuel est un poster SVG/Sharp déterministe portant « DÉMO MOCK » | `sceneComposition.ts`, `grep` fournisseurs = 0, PNG P-02 | Le produit ne fait pas ce qu'il vend |
| **P0-02** | **Écart de discours** : README « agentique multimodèle » vs zéro modèle appelé | `README.md` vs §3.6 | Risque commercial et juridique (promesse non tenue) |
| **P0-03** | **Assets jamais composés** : upload/validation/versionnement/licence réels, puis ignorés au rendu | §D-02, preuve négative `grep` | La valeur « contexte de marque » ne se voit pas dans le livrable |
| **P0-04** | **Aucun monétisation** : ni abonnement, ni crédit, ni facturation ; coûts `mode: 'MOCK'` | `README.md` hors périmètre V2, `routes/projects.ts` | Impossible d'encaisser |
| **P0-05** | **Postiz MOCK** : aucun transfert réel, `externalId: null` | `postizMockAdapter.ts` | La livraison s'arrête au MP4 local |
| **P0-06** | **Aucune preuve d'exécution de bout en bout récente** : CI NOT_RUN, E2E NOT_RUN, DB NOT_RUN | §5.4, §5.5 | Aucun GO possible sur du déclaratif |
| **P0-07** | **Historique Git écrasé** (1 commit) | `git rev-list --count HEAD` = 1 | Traçabilité, rollback fin et audit impossibles |

### P1 — sérieux, à traiter avant pilote payant

| ID | Risque | Preuve |
|---|---|---|
| **P1-01** | Mode par défaut **non durable** (`ORCHESTRATOR_MODE` absent ⇒ in-process) | `env.ts:58`, `container.ts:84` |
| **P1-02** | Storyboard **templaté** : 5 titres figés, 2 scènes au même texte, personnage `CHAR-001` constant | `storyboards.ts:21-37` |
| **P1-03** | « Corrections » **cosmétiques** : nouveau checksum, contenu identique | `sceneComposition.ts` (offset de cercle) |
| **P1-04** | `pnpm typecheck` **rouge** : 3 erreurs réelles (TS7006 ×2, TS2347) | §D-06 |
| **P1-05** | Formats `Affiche`/`Carrousel` **refusés** en production | `format_not_qualified` |
| **P1-06** | Audio **absent** (voix, musique, mixage) | `audio_not_qualified` |
| **P1-07** | QA des scènes réutilisées : `width/height` à `0` ⇒ `validTextLayout` probablement **FAIL** en correction | `durableProduction.ts` bloc `reused` |
| **P1-08** | Serveur **MCP absent** alors qu'il est au périmètre V1 | `adminQuery.ts:111` |
| **P1-09** | **Aucune licence** dans le dépôt (D-09) : réutilisation et commercialisation juridiquement floues | `README.md` |
| **P1-10** | 9 gates de sécurité en **PowerShell** : non exécutables hors Windows/PowerShell 7 | `scripts/check-*.ps1` |

### P2 — dette maîtrisée

| ID | Risque |
|---|---|
| **P2-01** | Node 22 constaté vs `engines: >=24` : à aligner (le lockfile reste OK) |
| **P2-02** | `pnpm install` ignore les scripts de build `@hatchet-dev/typescript-sdk` et `protobufjs` |
| **P2-03** | `apps/web/AGENTS.md` est **ignoré par Git** (`.gitignore`) tout en étant référencé |
| **P2-04** | `apps/api/src/routes/admin.ts:2` importe `Invitation` depuis `@prisma/client` au lieu du type généré du schéma |
| **P2-05** | Profil de production figé `v1-demo-2026-11-04` en dur dans le domaine |
| **P2-06** | Coût mock `2 ¢` par invocation codé dans `mockCapabilityProvider.ts` |
| **P2-07** | `next.config.ts` : `allowedDevOrigins` limité à `127.0.0.1`/`localhost` — preview distante à vérifier |

---

## 8. Plan de corrections (sans refonte)

Séquence strictement croissante en preuve. **Aucune étape n'autorise un GO production.**

| Étape | Objet | Critère de sortie | Dépend de |
|---|---|---|---|
| **C0** | Rétablir une chaîne de preuve locale : `pwsh`, PostgreSQL 17, FFmpeg complet, `pnpm db:generate`, Node 24 | Q-07 PASS, T-07/T-08 verts, `pnpm build` PASS | — |
| **C1** | Corriger les 3 erreurs TS réelles (TS7006 ×2, TS2347) | `pnpm -r typecheck` à 0 erreur, hors dérivées Prisma | C0 |
| **C2** | Exécuter la CI en local depuis les scripts existants (`scripts/ci.ps1`), puis premier run distant **sur autorisation** | 4 jobs verts, artefacts conservés | C0, C1 |
| **C3** | Décider du mode d'orchestration par défaut et le rendre sûr (durable par défaut ou dégradation explicite) | ADR + test de reprise après crash | C0 |
| **C4** | Porter la QA sur les scènes réutilisées (dimensions réelles au lieu de `0`) | test de correction multi-scènes vert | C0 |
| **C5** | Trancher la licence du dépôt (D-09) et l'ADR QeyNox (§6) | ADR acceptés | — |
| **C6** | Vérifier puis, **si GO explicite**, brancher un premier fournisseur réel derrière `CapabilityProviderPort` | 1 appel réel tracé, coût mesuré, budget dur | C0, C5 |
| **C7** | Composer réellement les assets sélectionnés dans la scène (P0-03) | PNG livrable contenant l'asset, test de non-régression de licence | C6 |
| **C8** | Aligner le discours produit (README/UI) sur l'état réel | revue de cohérence, zéro promesse non tenue | C6 |

**Interdits tant que C0–C2 ne sont pas verts** : toute nouvelle fonctionnalité, tout import de code externe,
tout déploiement.

---

## 9. Procédure pour un `main` final propre, sans détruire les travaux préexistants

Contrainte de départ : **l'historique local ne contient qu'un commit**, et `main` = `origin/main` = `ccc1977`.
Il n'y a donc **rien à préserver au niveau de l'historique Git**, mais beaucoup à préserver au niveau
de l'arborescence et de la documentation.

### 9.1 Règles de non-destruction (absolues)

1. **Aucun `git push --force`, aucune réécriture d'historique distant, aucune suppression de branche distante** (`AGENTS.md` §3, §8).
2. **Aucune suppression de fichier** sans qu'un ADR ou ce document ne la motive explicitement et que le contenu soit d'abord archivé dans `docs/`.
3. Les documents **importés** (`docs/01_PRD_V1.md`, `02_CAHIER_DES_CHARGES_V1.md`, `03_ARCHITECTURE_V1.md`, `11_BACKLOG.md`, `PROMPT_DEEPSEEK_HARNESS.md`, `docs/v2/`, `docs/source/`) restent **verbatim** : jamais édités.
4. `docs/certification/`, `docs/reviews/`, `docs/reports/` sont des **preuves datées** : on n'y corrige rien, on ajoute un document qui les supersède.
5. Toute correction de contenu passe par un **nouveau document** dans `docs/delivery/` ou un **nouvel ADR**.

### 9.2 Le modèle de branches retenu

Le dépôt de référence est `main`, protégé en intention (D-10 ouvert). La règle proposée :

```
main                          ← toujours vérifiable : lint + typecheck + tests verts
 └── lot/<id>-<sujet>         ← une branche par lot, courte, réversible
     └── PR                   ← obligatoire, avec preuves (§5) attachées
```

- **Une seule branche de session** : `arena/c3982856-vululu-v1`. Tout le travail de cette mission y reste.
  Aucune création/switch vers une autre branche (contrainte de session Arena).
- Les lots suivants partiront de `main` **après** fusion de celle-ci.
- Pas de branche longue : un lot qui dépasse 5 jours ou 400 lignes doit être découpé.

### 9.3 Séquence pour un `main` propre (à exécuter lot par lot)

1. **Geler** : `git status --porcelain` doit être vide avant toute manipulation. Un arbre sale ne fusionne pas.
2. **Vérifier localement** : `pnpm install --frozen-lockfile`, `pnpm db:generate`, `pnpm lint`, `pnpm -r typecheck`, `pnpm exec vitest run tests/domain`, puis la suite complète dès que C0 est fait. Consigner les résultats (§5).
3. **Vérifier le diff** : `git diff --check` (espaces), aucun fichier généré, aucun secret (`scripts/check-secrets.ps1` dès que `pwsh` est disponible, sinon revue manuelle).
4. **Commit unique et réversible** : préfixe `docs:`/`fix:`/`feat:`/`adr:`, présent de l'indicatif, portée claire.
5. **PR vers `main`** avec : objet, SHA de base, preuves PASS/FAIL/NOT_RUN, risques résiduels, rollback décrit.
6. **Fusion** uniquement sur **GO explicite** du porteur du projet (§3 `VULULU_WORKING_RULES.md`).
7. **Post-fusion** : `main` doit rester vert. Si la CI n'a jamais tourné, le premier run distant devient la preuve — sinon l'état reste `NOT_RUN`.

### 9.4 Archivage avant tout ménage

Si un futur lot doit retirer du code ou de la doc obsolète :

```bash
# 1. capturer l'état complet, sans le versionner
git rev-parse HEAD > .delivery/archive/SHA-<date>.txt
git ls-files > .delivery/archive/files-<date>.txt
git archive --format=tar.gz -o .delivery/archive/source-<date>.tar.gz HEAD

# 2. seulement ensuite, proposer le retrait dans un ADR
```

`.delivery/` doit être ajouté au `.gitignore` **avant** usage (aucun binaire lourd dans Git :
`AGENTS.md` §8, `.gitignore`). Aucune suppression n'est autorisée sans cet archivage préalable.

### 9.5 Compteur d'état à tenir à jour

`docs/delivery/VULULU_DELIVERY_STATUS.md` porte la seule vérité d'avancement. Toute PR doit mettre à
jour son tableau **et** ses preuves. Un lot sans preuve repasse `NOT_RUN`, jamais `PASS` par défaut.

---

## 10. Commandes exécutées (journal brut)

```bash
git log --oneline -5 ; git branch -a ; git status --porcelain ; git worktree list ; git rev-parse HEAD
git rev-list --count HEAD                       # → 1
git ls-files | wc -l                            # → 579
npm i -g pnpm@10.6.1
pnpm install --frozen-lockfile                  # PASS, lockfile inchangé
pnpm db:generate                                # FAIL (binaries.prisma.sh injoignable)
(cd packages/{domain,media,contracts,application} && pnpm exec tsc --noEmit)   # PASS ×4
(cd apps/web && pnpm exec tsc --noEmit)                                        # PASS
(cd apps/api && pnpm exec tsc --noEmit)                                        # FAIL 23 erreurs
pnpm lint                                       # PASS 0/0
pnpm exec vitest run tests/domain               # 141 PASS
pnpm exec vitest run tests/{studio-draft,project-journey,project-presentation,creation-delivery}.test.ts  # 13 PASS
pnpm exec vitest run tests/responsive-layout.test.ts tests/asset-inspection.test.ts \
                    tests/media.test.ts tests/production-profile-media.test.ts   # 19 PASS / 7 FAIL (FFmpeg)
pnpm exec vitest run tests/api.test.ts          # NOT_RUN (prisma migrate deploy bloqué)
grep -rnE "fetch\(|axios|openai|anthropic|generativelanguage|replicate|fal\.ai" --include=*.ts apps/api/src packages/*/src   # 0
grep -rn "assetSelection" packages/media apps/api/src/infrastructure/production packages/application/src/use-cases/durableProduction.ts  # 0
grep -rniI "qeynox" .                           # 7 occurrences, documentaires uniquement
which ffmpeg ffprobe psql docker pwsh           # aucun
# preuve P-01/P-02 : renderScene() via tsx → PNG 1080×1920, checksum 185cb7d2eb26…, inspection visuelle
```

Nettoyage : fichiers de sonde et répertoire `.probe/` supprimés ; `git status --porcelain` reste vide
hormis les trois documents de `docs/delivery/`.

---

## 11. Verdict de baseline

- Le socle est **techniquement sérieux** : frontières respectées (`purity.test.ts`, 4 PASS), invariants métier
  couverts (141 tests domaine), étiquetage honnête des simulations, sécurité serveur réelle.
- Le socle **n'est pas un produit** : il produit un diaporama typographique de démonstration, sans IA,
  sans composition d'assets, sans audio, sans publication, sans facturation.
- **Aucun GO production n'est proposé.** Le seul GO défendable est un GO de **correction de la chaîne de
  preuve** (C0–C2), puis un GO de **décision produit** (licence, fournisseur, monétisation).

La suite opérationnelle est dans `VULULU_DELIVERY_STATUS.md` ; les règles de conduite sont dans
`VULULU_WORKING_RULES.md`.
