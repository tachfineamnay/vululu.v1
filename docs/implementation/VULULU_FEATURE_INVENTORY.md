# VULULU AI — INVENTAIRE DES FONCTIONNALITÉS AU HEAD

- **Date** : 2026-11-20
- **Branche** : `campaign/vululu-completion` (HEAD `f5d515b`, vérifié par `git rev-parse`)
- **Méthode** : lecture du code uniquement, aucun test exécuté. Comptages obtenus par listage réel des fichiers/dossiers, pas par reprise de chiffres annoncés.
- **Statuts** : `IMPLEMENTED` (code présent, chemin complet), `PARTIAL` (incomplet ou limité), `MISSING` (aucun code), `PROVIDER_DEPENDENT` (ne fonctionne qu'avec un fournisseur/drapeau configuré ; appel réel NON VÉRIFIÉ), `MOCK` (déterministe/simulé), `NOT_VERIFIED` (non exécuté en P00).
- **AVERTISSEMENT** : aucun test, build, lint ni typecheck n'a tourné pendant P00. Aucun statut ci-dessous n'est une certification ; les mentions MOCK/PROVIDER_DEPENDENT décrivent le code, pas une exploitation réelle.

## 1. Métriques du dépôt (vérifiées le 2026-11-20)

| Élément | Mesure | Emplacement vérifié |
|---|---|---|
| Fichiers de routes API | **22** fichiers, **169** déclarations `app.get/post/patch/put/delete` | `apps/api/src/routes/*.ts` |
| Pages web | **32** pages (dont **9** pages admin) | `apps/web/app/**/page.tsx` |
| Composants web | **36** : 23 produit + 13 admin | `apps/web/components/**/*.tsx` |
| Modèles Prisma | **66** `model` | `packages/db/prisma/schema.prisma` |
| Migrations Prisma | **34** | `packages/db/prisma/migrations/*/migration.sql` |
| Tests Vitest | **85** fichiers `*.test.ts` | `tests/**` |
| Specs Playwright | **26** | `e2e/*.spec.ts` |
| Packages workspace | **5** (`application`, `contracts`, `db`, `domain`, `media`) + 2 apps | `packages/*/package.json`, `apps/*/package.json` |
| Modules de domaine / cas d'usage / contrats | 23 / 20 / 11 | `packages/domain/src`, `packages/application/src/use-cases`, `packages/contracts/src` |
| ADR | 34 (+ template, README) | `docs/adr/` |

> Écarts avec les chiffres annoncés dans la mission : pages **32** (annoncé 33), modèles **66** (annoncé 67), composants **36** (annoncé 23 — 23 correspond aux composants produit hors `admin/`). Ces écarts sont des constats de comptage, pas des corrections de code.

## 2. Parcours produit en 12 étapes (vision du 2026-11-20)

| # | Étape | Statut | Où c'est implémenté | Écart concret |
|---|---|---|---|---|
| 1 | OBJECTIVE | IMPLEMENTED | `apps/web/app/projects/new/page.tsx:87-91` (titre + objectif), `apps/api/src/routes/projects.ts:27` | Porté par `Project` ; `Campaign` n'a que nom/description (`packages/domain/src/campaign.ts:6-27`) |
| 2 | CHANNEL | PARTIAL | `packages/contracts/src/channels.ts:3`, `apps/web/app/projects/new/page.tsx` (P01 : cartes canal, formats filtrés), `apps/web/components/CampaignJourney.tsx` | 3 canaux projet (TikTok/Instagram/LinkedIn) ; publication en gère 5 (`provider.ts:3`) — Facebook/Google absents du projet |
| 3 | FORMAT | PARTIAL | `packages/contracts/src/productionFormats.ts:5-17`, choix canal→format de `apps/web/app/projects/new/page.tsx` (P01) | `Video` = `studio:null` (aucune composition éditable) ; `Motion` déclaré (`channels.ts:4`) sans `productionFormat` ni rendu |
| 4 | USER ASSETS | IMPLEMENTED (décision) / PARTIAL (sélection) | `apps/web/components/ProjectAssetsStep.tsx`, `apps/api/src/routes/assets.ts` (decision/confirm), `packages/application/src/assetDecisionPorts.ts`, migration `20261121100000_project_assets_confirmation` | Sélection **ou** absence de ressource explicitement confirmée ; gate serveur `assets_required`/`assets_confirmation_stale` avant assistant et plan marketing. Import/upload inchangés ; la composition des assets dans les scènes dépend encore des caps existants |
| 5 | AI BRAINSTORMING | PARTIAL | `apps/api/src/infrastructure/assistant/service.ts:49-65,125-151` (turns versionnés), `marketing/service.ts:45-92` | Moteur IA Vertex seulement si `ASSISTANT_VERTEX_ENABLED=1` ; repli hors-ligne déterministe ; **aucun asset utilisateur** dans le snapshot |
| 6 | ART DIRECTIONS | MISSING (entité) | Substituts : `ProjectStudio.tsx:496-499` « Direction artistique simulée » (champ libre déterministe), stratégie de `MarketingRevision` | Aucun modèle Prisma de propositions de DA, aucune comparaison/versionnement de DA alternatives |
| 7 | HUMAN SELECTION | PARTIAL | Approbation/refine : `routes/creative.ts:104`, `routes/marketing.ts:34`, `routes/assistant.ts:18-22` ; comparaison `RevisionCompare.tsx` | Pas de « rejeter/écarter » explicite d'une proposition ni de sélection multi-DA côte à côte |
| 8 | EDITABLE CREATION | PARTIAL | `apps/web/components/CreativeEditor.tsx`, `apps/api/src/application/creative.ts:67-88` (versions append-only) | Éditable pour image/carrousel/vidéo courte ; `Video` multiscène reste le pipeline historique démo (`ProjectStudio.tsx:76`, `releaseMode.ts:2-8`) |
| 9 | REVIEW | IMPLEMENTED | `CreativeReviewSurface.tsx`, `RevisionCompare.tsx`, `routes/creative.ts:191-251`, `renderJobs.ts` | Revue vidéo multiscène seulement via démo ; rendu réel NON VÉRIFIÉ |
| 10 | APPROVAL | IMPLEMENTED | `packages/domain/src/approval.ts:42-82`, `application/creative.ts:89-95` (checksum du manifest), `delivery.ts:37-77` | Approbation liée à version+checksum exacts ; attestation réglementée pour marketing |
| 11 | EXPORT / PUBLISH | PARTIAL | Export `routes/creative.ts:201-251` ; kit manuel `publishing/delivery.ts:110-130` ; Postiz direct `publishing/provider.ts:59-160` | Direct derrière `POSTIZ_PUBLISH_ENABLED=1` (jamais vérifié) ; TikTok et carrousel non programmables en direct (`provider.ts:5-11`) |
| 12 | RESULTS | PARTIAL | `infrastructure/results/store.ts:32-128`, `apps/web/app/results/page.tsx` | Usage/export/publication locaux réels ; analytics = Postiz si `POSTIZ_ANALYTICS_ENABLED=1` ; leads/ventes jamais disponibles |

## 3. Capacités par domaine

### 3.1 Identité, comptes, profils, offres

| Capacité | Statut | Preuve | Limite |
|---|---|---|---|
| Auth, sessions serveur, CSRF, origines | IMPLEMENTED | `routes/auth.ts:43-125`, `auth.ts:29-90`, `security/session.ts` | — |
| RBAC `super_admin`/`user` + isolation propriétaire | IMPLEMENTED | `auth.ts:36-76` (audit `rbac.denied`), `packages/application/src/errors.ts` (`assertOwned`) | Tests IDOR non exécutés |
| Invitations + activation | IMPLEMENTED | `routes/admin.ts:48-119`, `routes/auth.ts:125` | — |
| Vérification email / reset | PROVIDER_DEPENDENT | `routes/customerAccount.ts:55-85`, `email/accountMail.ts:6-24` (Resend) | Transport `null` si `ACCOUNT_EMAIL_RESEND_API_KEY`/`ACCOUNT_EMAIL_FROM` absents |
| Profil, mot de passe, révocation de sessions | IMPLEMENTED | `routes/customerAccount.ts:124-153`, `apps/web/app/account/security/page.tsx` | — |
| Export/effacement RGPD | IMPLEMENTED | `routes/billing.ts:118-145`, `billing/support.ts:80-100` | Effacement bloqué si données reliées (choix explicite) |
| MFA | MISSING | Aucun adaptateur/route ; `apps/web/app/admin/reglages/page.tsx:12` liste `mfa` en NOT_CONNECTED | — |
| Offres confirmées | PARTIAL | `calendarStore.ts:11-20` (`ConfirmedOffer` upsert par nom), `routes/calendar.ts:14-18` | Pas d'édition/suppression/tarification ; simple référentiel de nom |
| Contextes de marque + revue | IMPLEMENTED (analyse MOCK) | `routes/contexts.ts:8-16`, `infrastructure/providers/deterministicContextAnalyzer.ts` | L'analyse IA est déterministe, pas un provider |

### 3.2 Campagnes, calendrier, contenu, Studio, assistant

| Capacité | Statut | Preuve | Limite |
|---|---|---|---|
| Campagnes (CRUD, rattachement projets) | PARTIAL | `use-cases/campaigns.ts:19-47`, `routes/campaigns.ts:7-15` | Campagne = regroupement nom/description, sans objectif/canal/format |
| Calendrier éditorial + variantes + révisions | IMPLEMENTED | `infrastructure/prisma/calendarStore.ts:10-59`, `routes/calendar.ts:14-30` | Idempotence par `requestId`/digest, verrous propriétaire |
| Passage contenu → projet | IMPLEMENTED | `calendarStore.ts:41-58`, `routes/calendar.ts:26` | — |
| Brief (révisions + confirmation exacte) | IMPLEMENTED | `routes/projects.ts:16-45`, `use-cases/briefs.ts`, `use-cases/briefConfirmations.ts` | — |
| Plan de production prévisionnel | MOCK | `application/productionPlanning.ts`, `ProjectStudio.tsx:516` (« centimes MOCK ») | Coûts simulés |
| Assistant marketing/créatif | PARTIAL | `infrastructure/assistant/service.ts:125-151`, `assistant/vertex.ts:22-28` | Offline déterministe ; Vertex = PROVIDER_DEPENDENT, appel réel NON VÉRIFIÉ |
| Plans marketing (recette éditoriale, approbation) | IMPLEMENTED | `infrastructure/marketing/service.ts:45-92`, `routes/marketing.ts:24-35` | Génération par recette déterministe, pas de modèle IA |
| Chat de conversation | MOCK | `routes/projects.ts:45-52` (`requireDemo`), `application/deterministicConversation.ts` | Désactivé hors démo ; propositions déterministes |
| État/feed Studio, rendus, médias | IMPLEMENTED | `routes/studio.ts:110-140`, `routes/studio.ts:42-104` | Flux SSE ; dépend de PostgreSQL |
| Génération média (image/vidéo) | PROVIDER_DEPENDENT | `routes/mediaGeneration.ts:25-36`, `mediaGeneration/service.ts:63-90`, `providers.ts:207-211` | `MEDIA_GENERATION_ENABLED=1` + clé ; aucun adaptateur MOCK de repli |

### 3.3 Assets, composition, rendu, export

| Capacité | Statut | Preuve | Limite |
|---|---|---|---|
| Upload + inspection bornée | IMPLEMENTED (outil local requis) | `use-cases/assets.ts:27-53`, `packages/media/src/assetInspection.ts:14-66` | Audio/vidéo exigent `ffprobe` (`FFPROBE_PATH`/`FFMPEG_PATH`) ; sinon 503 |
| Versions immuables, SHA-256, licences | IMPLEMENTED | `packages/domain/src/assets.ts` (`createBrandAssetVersion`, `assertAssetUsage`), `assetRepository.ts` | — |
| Sélection par projet + contrôle de licence | IMPLEMENTED | `use-cases/assets.ts:64-78`, `routes/assets.ts:48-49` | — |
| Assets dans la composition | IMPLEMENTED (nouveau Studio) | `contracts/creative.ts:25-45`, `application/creative.ts:113-133`, `CreativeEditor.tsx:141-153` | Le pipeline vidéo historique ignore les assets (0 référence dans `mediaRendererAdapter.ts`) |
| Suppression/rétention d'assets | MISSING | `routes/assets.ts` n'expose que upload/list/get/content/sélection | — |
| Composition native (image, carrousel, vidéo courte) | IMPLEMENTED | `application/creative.ts:101-160,316`, `packages/media/{creativeFrame,sceneComposition,textLayout,motion}.ts` | — |
| Brouillons versionnés + restauration | IMPLEMENTED | `application/creative.ts:79-88`, `routes/creative.ts:86-103` | `expectedVersion` protège les conflits |
| Rendu natif + export PNG/MP4/ZIP | IMPLEMENTED | `routes/creative.ts:201-251`, `publishing/delivery.ts:110-130` | Exécution réelle NON VÉRIFIÉE |
| Rendu durable (file `StudioRender`) | IMPLEMENTED (code) | `infrastructure/creative/renderJobs.ts:18-100`, `apps/api/src/index.ts:11` | Bail/lease + heartbeat ; pump local ou worker |
| Vidéo multiscène éditable | MOCK / PARTIAL | `productionFormats.ts:10` (`Video: studio:null`), `ProjectStudio.tsx:76` (démo seulement) | Démo déterministe Sharp/FFmpeg, `requireDemo` la coupe en production |
| Motion | MISSING | `channels.ts:4` déclare `Motion` ; aucun rendu/format de production | — |

### 3.4 Revue, approbation, publication, résultats

| Capacité | Statut | Preuve | Limite |
|---|---|---|---|
| Surface de revue / comparaison avant-après | IMPLEMENTED | `CreativeReviewSurface.tsx`, `RevisionCompare.tsx`, `CreativeActionPanel.tsx` | Vidéo multiscène = démo |
| Approbation de version exacte (checksum) | IMPLEMENTED | `domain/approval.ts:42-82`, `application/creative.ts:89-95` | — |
| Invalidation d'approbation | IMPLEMENTED | `domain/approval.ts:13-21,70-82`, `postizMockAdapter.ts:47-49` | — |
| Approbation éditoriale + attestation réglementée | IMPLEMENTED | `routes/marketing.ts:34`, `MarketingAssistant.tsx:177-197` | — |
| Prévisualisation de publication liée à l'approbation | IMPLEMENTED | `publishing/delivery.ts:37-77` | Refus si révision/calendrier/version incompatibles |
| Kit de publication manuelle (ZIP + caption + manifest) | IMPLEMENTED | `publishing/delivery.ts:110-130`, `routes/publishing.ts:204-221` | Aucune publication réelle |
| Publication directe Postiz (planif/annul/réconciliation/webhook) | PROVIDER_DEPENDENT | `publishing/provider.ts:59-160`, `publishing/service.ts:10-69`, `routes/publishing.ts:74-75` | `POSTIZ_PUBLISH_ENABLED=1` + `PUBLISHING_ENCRYPTION_KEY` + outil d'exécution ; NON VÉRIFIÉ |
| Transfert Postiz historique | MOCK | `postiz/postizMockAdapter.ts:21-84`, `container.ts:129` | `externalId:null`, aucun réseau |
| Connexions sociales (admin + autorisation) | PROVIDER_DEPENDENT | `routes/publishing.ts:43-121`, `calendar/SocialConnections.tsx` | Dépend de Postiz |
| Limites directes par plateforme | PARTIAL | `provider.ts:5-11` : TikTok `scheduled:[]`, carrousel non planifiable | Seul le kit manuel couvre ces cas |
| Résultats locaux (usage, exports, publications, rappels) | IMPLEMENTED | `results/store.ts:32-128`, `routes/results.ts:23-43` | — |
| Analytics réseau | PROVIDER_DEPENDENT | `results/provider.ts:43-75`, `store.ts:99-116` | `POSTIZ_ANALYTICS_ENABLED=1`, source « Postiz · LinkedIn » uniquement |
| Leads / ventes / attribution | MISSING | `results/page.tsx:35-41` : `NOT_AVAILABLE`, « Aucun CRM connecté » | — |

### 3.5 Facturation, bêta, support, admin, ops

| Capacité | Statut | Preuve | Limite |
|---|---|---|---|
| Bêta gratuite (paiements gelés serveur) | IMPLEMENTED | `betaMode.ts:25-58`, `infrastructure/beta/freeze.ts:25-61`, `index.ts:8` | Défaut = bêta, irréversible par ce chemin |
| Facturation Stripe (produits, achats, reçus, crédits, réconciliation) | PROVIDER_DEPENDENT (gelée) | `billing/config.ts:10-33`, `billing/service.ts:151`, `routes/billing.ts:39-55,77-83` | Exige clés + phrase d'activation ; `VULULU_BETA_MODE` ferme la vente |
| Support / tickets / feedback bêta / effacement | IMPLEMENTED | `billing/support.ts:21-78`, `routes/billing.ts:84-118`, `app/support/page.tsx` | — |
| Admin (9 pages, utilisateurs, agents, fournisseurs, modèles, routing, audit, coûts, commerce) | IMPLEMENTED | `routes/admin*.ts`, `apps/web/app/admin/**`, `lib/admin.ts` | Secrets fournisseurs chiffrés (`providerCredentialCipher.ts`) |
| Ops : ready, santé, métriques Prometheus, snapshot, réconciliation | IMPLEMENTED | `routes/ops.ts:9-46`, `operations/opsMetrics.ts`, `operations/runtimeReconciliation.ts` | Résultats réels NON VÉRIFIÉS |
| Orchestration durable Hatchet + outbox | PROVIDER_DEPENDENT | `worker/pipeline.ts:50-68`, `durable/outboxDispatcher.ts:20-67`, `durable/hatchetOrchestratorAdapter.ts` | `ORCHESTRATOR_MODE=hatchet` + `HATCHET_CLIENT_*` ; défaut local |

## 4. Fournisseurs et adaptateurs (fichier + drapeau vérifiés)

| Fournisseur | Adaptateur | Drapeau / config | Statut P00 |
|---|---|---|---|
| Vertex AI (assistant) | `infrastructure/assistant/vertex.ts:22-28,71-116` | `ASSISTANT_VERTEX_ENABLED=1` + `ASSISTANT_VERTEX_{PROJECT,LOCATION,MODEL,INPUT_MICROUSD,OUTPUT_MICROUSD}` + outil `assistant.draft@1` actif + budget | PROVIDER_DEPENDENT ; appel réel NON VÉRIFIÉ ; repli hors-ligne déterministe présent |
| Replicate (image) | `infrastructure/mediaGeneration/providers.ts:112-155,207-211` | `MEDIA_GENERATION_ENABLED=1`, `MEDIA_IMAGE_ENABLED`, `REPLICATE_API_TOKEN` | PROVIDER_DEPENDENT ; aucun repli MOCK |
| Runway (vidéo) | `mediaGeneration/providers.ts:157-205` | `MEDIA_VIDEO_ENABLED`, `RUNWAYML_API_SECRET` | PROVIDER_DEPENDENT ; image de référence obligatoire, vidéo courte |
| Postiz direct | `infrastructure/publishing/provider.ts:59-160` | `POSTIZ_PUBLISH_ENABLED=1`, `PUBLISHING_ENCRYPTION_KEY` | PROVIDER_DEPENDENT ; NON VÉRIFIÉ |
| Postiz MOCK (transfert historique) | `infrastructure/postiz/postizMockAdapter.ts:21-84`, `container.ts:129` | aucun | MOCK (`externalId:null`, aucun réseau) |
| Stripe | `infrastructure/billing/config.ts:10-33`, `billing/service.ts:151` | `BILLING_STRIPE_MODE=test|live`, `STRIPE_*_SECRET_KEY`, webhook, phrase d'activation | PROVIDER_DEPENDENT ; gelé par la bêta |
| Email (Resend) | `infrastructure/email/accountMail.ts:6-24` | `ACCOUNT_EMAIL_RESEND_API_KEY`, `ACCOUNT_EMAIL_FROM`, `ACCOUNT_EMAIL_ORIGIN` | PROVIDER_DEPENDENT ; `null` si non configuré |
| S3-compatible | `infrastructure/storage/storageFactory.ts:8-48`, `s3ArtifactStorage.ts` | `ARTIFACT_STORAGE_BACKEND=s3` + `S3_*` | Adaptateur IMPLEMENTED ; S3 réel NON VÉRIFIÉ ; local par défaut |
| Hatchet | `durable/hatchetOrchestratorAdapter.ts`, `worker/pipeline.ts:50-68` | `ORCHESTRATOR_MODE=hatchet` + `HATCHET_CLIENT_*` | PROVIDER_DEPENDENT ; local par défaut |
| Google Auth (ADC) | `assistant/vertex.ts:70` (`GoogleAuth`) | credentials ADC, pas de clé en clair dans le code | PROVIDER_DEPENDENT |
| FFmpeg/FFprobe, Sharp | `packages/media/src/*`, `assetInspection.ts:50-55` | `FFMPEG_PATH`, `FFPROBE_PATH` ; Sharp = dépendance npm | Outils locaux ; exécution réelle NON VÉRIFIÉE en P00 |

## 5. Invariants transverses

| Invariant | Preuve | État |
|---|---|---|
| RBAC + isolation locataire sur lectures/écritures | `apps/api/src/auth.ts:36-76`, `packages/application/src/errors.ts` (`assertOwned`), filtres `userId` dans les routes/repositories | IMPLEMENTED (code) ; tests non exécutés |
| Broker d'exécution + budgets + approbations | `infrastructure/execution/broker.ts:31-100`, `execution/registry.ts:4-18` (`maxCents`, `WRITE/PUBLISH` exige version approuvée `broker.ts:66`) | IMPLEMENTED (code) |
| Artefacts immuables, checksums, audit | `domain/{artifact,versions,checksum,immutability,approval}.ts`, `infrastructure/audit/prismaAuditAdapter.ts`, manifest scellé `application/creative.ts` | IMPLEMENTED |
| Idempotence + outbox transactionnel | `ContentRevision` par `requestId`/digest, `AssistantTurn` par `requestId`, `submitKey/cancelKey` publication, `OrchestrationOutbox` + `outboxDispatcher.ts:20-67`, idempotency `outboxId` `worker/pipeline.ts:61-68` | IMPLEMENTED (code) |
| Stockage binaire (local/S3, vérification SHA-256, bornes 32 Mio) | `storage/storageFactory.ts`, `use-cases/assets.ts:43-51`, `storage/s3ArtifactStorage.ts` | IMPLEMENTED (code) ; S3 NON VÉRIFIÉ |
| Rendu Studio durable (bail, reprise, scellement) | `infrastructure/creative/renderJobs.ts:18-100`, `StudioRender`, `index.ts:11` | IMPLEMENTED (code) ; exécution NON VÉRIFIÉE |

## 6. Manques explicites et écarts de vision (vérifiés)

- **Serveur MCP : MISSING.** `infrastructure/prisma/adminQuery.ts:111` (« Aucun serveur MCP implemente »), `apps/web/lib/studio.ts:46`, `app/admin/reglages/page.tsx:12`.
- **TTS / voix / audio généré : MISSING.** Aucune occurrence de TTS/voice/elevenlabs dans `apps`/`packages` ; `adminQuery.ts:112` (« Piste AAC silencieuse seulement ») ; `productionRunRepository.ts:181` refuse une voix/musique non qualifiée. L'audio n'existe que comme asset importé, accepté seulement en vidéo courte (`contracts/creative.ts:18,74-81`).
- **Entité « propositions de directions artistiques » : MISSING.** Aucun modèle Prisma ; seuls un champ libre « Direction artistique simulée » (`ProjectStudio.tsx:496-499`) et la stratégie d'un plan marketing. Pas d'alternatives persistantes, comparables, versionnées.
- **Assets avant le brainstorming : non contraignant.** Le snapshot assistant ne contient que profil/contexte/offre (`assistant/service.ts:49-65`) ; le marketing ne lit que contexte+offre+semaine (`marketing/service.ts:45-92`) ; la création de projet ne sélectionne aucun asset (`projects/new/page.tsx:94` : « Aucun fichier de sa bibliothèque n'est sélectionné automatiquement »). Aucun gate serveur.
- **Vidéo multiscène éditable : absente du Studio.** `productionFormats.ts:10` (`Video: studio:null`) ; le pipeline historique est démo-only (`releaseMode.ts:2-8`, `ProjectStudio.tsx:76`) et n'utilise pas les assets (`mediaRendererAdapter.ts` : 0 référence).
- **Motion : déclaré sans production.** `channels.ts:4` inclut `Motion` ; aucun format de production ni chemin de rendu.
- **Campagne intentionnelle incomplète.** `Campaign` = `id/userId/name/description/createdAt` seulement (`domain/campaign.ts:6-27`) : objectif, canal et format vivent au niveau `Project`, pas de la campagne.
- **Suppression/rétention des assets : MISSING.** `routes/assets.ts` expose upload, list, get, contenu, sélection ; pas de suppression ni de politique de rétention.
- **MFA : MISSING.** Aucun adaptateur/route ; listé NOT_CONNECTED côté admin (`admin/reglages/page.tsx:12`).
- **Leads/ventes/attribution : MISSING.** `results/page.tsx:35-41` les expose en `NOT_AVAILABLE` (« Aucun CRM connecté », « Aucune source de vente connectée »).
- **Deux pipelines créatifs coexistent** : Studio natif versionné (`CreativeEditor.tsx`, `CreativeRevision`) et production historique déterministe (`ProjectStudio.tsx` + `worker/pipeline.ts` + `ProductionRun`). La coexistence est un risque de duplication et de parcours incohérent, pas une fonctionnalité.

## 7. Mise à jour P02 — décision de ressources et gate serveur (2026-11-20)

Implémenté depuis l'inventaire (commit P02, `BUILD_UNVERIFIED`, aucun test exécuté) :

- Migration additive `20261121100000_project_assets_confirmation` : `Project.assetsConfirmedAt`, `assetsConfirmationDigest`, `assetsConfirmation` (JSONB, snapshot stable).
- `packages/application/src/assetDecisionPorts.ts` : décision `assets` ou `none`, digest SHA-256 canonique (domaine), évaluation `confirmed/stale` (sélection modifiée, version indisponible, format incompatible, droits insuffisants), `AssetDecisionUseCases`.
- `apps/api/src/infrastructure/prisma/assetDecisionRepository.ts` : lecture partagée API/assistant (propriétaire + contexte vérifiés), confirmation transactionnelle (verrou projet, sélection exacte, versions `ready`).
- API : `GET /api/projects/:id/assets/decision` et `POST /api/projects/:id/assets/confirm` (`{ noAssets }`). La sauvegarde de sélection (`PUT /api/projects/:id/assets`) invalide désormais la confirmation.
- Gate serveur : l'assistant (`createTurn`) refuse en 409 `assets_required` / `assets_confirmation_stale` avant toute création de tour, et le plan marketing (`POST /api/projects/:id/marketing`) applique le même prérequis. Le snapshot du tour contient la décision confirmée (hash inclus dans la fraîcheur IA).
- Web : `apps/web/components/ProjectAssetsStep.tsx` (bibliothèque, prévisualisations, droits, usage, confirmations), carte du parcours (étape ressources = faite/à faire), brainstorming verrouillé tant que la décision n'est pas confirmée.

Limites P02 : les suites existantes qui appellent l'assistant/le plan marketing sans confirmer les ressources échoueront jusqu'au réalignement P12 ; aucune exécution réelle (tests, build, lint, typecheck) en P02 ; le client Prisma doit être régénéré avant toute vérification TypeScript.

## 8. Mise à jour P04 — directions artistiques versionnées (2026-11-20)

Implémenté depuis l'inventaire (commit P04, `BUILD_UNVERIFIED`, aucun test exécuté) :

- **ADR-0035** : une direction artistique est un brouillon `CreativeRevision` enrichi (`label`, `origin`, `provenance` JSONB) ; aucune entité parallèle, invariants append-only / concurrence optimiste / provenance exacte.
- Migration additive `20261121110000_creative_direction_metadata` (3 colonnes nullables).
- `apps/api/src/application/creativeDirections.ts` : génération depuis le dernier tour `brainstorm` et les ressources confirmées (`composeGuide` éditorial/immersif/contraste ; composition typographique honnête si aucune ressource), affinage (hiérarchie/plaques recalculées), alternatives, combinaison (structure + palette), idempotence par `requestId`, validation propriétaire/contexte/droits des versions utilisées.
- API : `GET/POST /api/projects/:id/creative/directions` (liste + création), `POST /api/projects/:id/creative/:version/direction` (retenue/écart provisoire auditée, en attendant le pointeur P05).
- UI `apps/web/components/ArtDirections.tsx` : cartes comparables, comparaison côte à côte, aperçu **réel** via la route `/creative/preview` (Sharp, première scène, étiqueté), retenir/écarter/affiner/combiner, reprise dans l'éditeur (`/:version/restore`), rechargement persistant.
- Journée campagne : étapes brainstorming/directions passent à « terminé » quand des directions existent.

Limites P04 : le choix autoritatif (`Project.selectedCreativeVersion`) et le refus/approbation définitifs arrivent en P05 ; les décisions retenue/écartées restent des événements d'audit provisoires ; aucun test/build/lint/typecheck exécuté.

## 9. Mise à jour P03 — brainstorming contextuel (2026-11-20)

Implémenté depuis l'inventaire (commit P03, `BUILD_UNVERIFIED`, aucun test exécuté) :

- `packages/contracts/src/assistant.ts` : type de tour `brainstorm` (`offerId` optionnel) et résultat structuré `brainstormOutput` — ack, questions utiles (≤5), pistes créatives `{ title, reasoning, premise, assets }` (≤4), décisions `{ fact, source: 'user' }` (≤8).
- `apps/api/src/infrastructure/assistant/service.ts` : snapshot du tour `brainstorm` = identité confirmée (objectif, canal, format, public, ton), offre retenue, décision de ressources ; repli local déterministe `brainstormResult` (étiqueté hors ligne, aucune affirmation inventée) ; fraîcheur liée au hash des sources (identité/offre/assets) ; résultats IA validés et nettoyés (`vettedBrainstorm` + filtrage des noms de ressources au jeu confirmé).
- `apps/api/src/infrastructure/assistant/vertex.ts` : `ModelInput` étendu (`brainstorm`), schéma de réponse JSON et consigne de partenariat créatif ; payload minimisé (noms/kind de ressources, jamais d'identifiants, d'URL ni de médias).
- `apps/web/components/BrainstormPanel.tsx` : conversation multi-tours persistée (historique serveur, reprise après rechargement, polling des générations en file), affiner/contester/rejeter/combiner, décisions utilisateur distinctes des suggestions, autorisation explicite du budget ToolBroker avant inférence.
- Gate P02 conservé : sans décision de ressources confirmée, le brainstorming est refusé côté serveur et verrouillé côté UI.

Limites P03 : l'inférence Vertex réelle reste `NOT_VERIFIED` (aucun fournisseur activé) ; les suites assistant existantes ne couvrent pas encore le type `brainstorm` (réalignement P12).

## 10. Mise à jour P01 — entrée de campagne (2026-11-20)

Implémenté depuis cet inventaire (commit P01, `BUILD_UNVERIFIED`, aucun test exécuté) :

- `apps/web/app/projects/new/page.tsx` : parcours **objectif → canal → format → identité → vérification**, objectif en langage naturel d'abord, canaux et formats filtrés par les contrats (`availableFormats`), aucune configuration fournisseur exposée.
- `apps/web/lib/projectPresentation.ts` : `ProjectDraft` étendu (`campaignId`), reprise de brouillon tolérante, dérivation d'états `campaignJourneyStates`.
- `apps/web/components/CampaignJourney.tsx` : carte des 12 étapes de la vision, états dérivés (fait / en cours / à venir), lien réel vers la bibliothèque de ressources, campagne réutilisée ; aucune étape future présentée comme faite.
- `apps/web/components/ProjectStudio.tsx` : la carte est montée avant l'éditeur ; elle lit la campagne et la sélection de ressources du projet (états de chargement/erreur inclus).
- `apps/web/app/campaigns/page.tsx` : entrée « Nouvelle création dans cette campagne » (`/projects/new?campaign=<id>`).
- La campagne choisie est rattachée après création via le contrat existant `PUT /api/projects/:id/campaign`, avec reprise explicite si le rattachement échoue.
- `apps/web/app/atelier-blue.css` : styles de la carte et des cartes de choix (tokens du design system uniquement).

Limites P01 : le rattachement des ressources au projet n'est pas encore bloquant (P02) ; les specs E2E `projects-start`/`project-journey` ne sont pas réalignées (P12) ; aucun test, build, lint ni typecheck exécuté (campagne P00–P11).

> **Rappel final** : inventaire établi par lecture seule au HEAD `f5d515b`, mis à jour par P01. Aucune commande de test, de build ou de fournisseur n'a été exécutée pour P01 ; tout statut est une lecture de code, jamais une certification.
