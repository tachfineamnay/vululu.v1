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
| 3 | FORMAT | PARTIAL | `packages/contracts/src/productionFormats.ts:5-18`, choix canal→format de `apps/web/app/projects/new/page.tsx` (P01) | P09A : `Video` = `studio:'short'` (vidéo multiscène éditable, paysage 16:9 par preset de canal) ; `Motion` déclaré (`channels.ts:4`) sans `productionFormat` ni rendu |
| 4 | USER ASSETS | IMPLEMENTED (décision) / PARTIAL (sélection) | `apps/web/components/ProjectAssetsStep.tsx`, `apps/api/src/routes/assets.ts` (decision/confirm), `packages/application/src/assetDecisionPorts.ts`, migration `20261121100000_project_assets_confirmation` | Sélection **ou** absence de ressource explicitement confirmée ; gate serveur `assets_required`/`assets_confirmation_stale` avant assistant et plan marketing. Import/upload inchangés ; la composition des assets dans les scènes dépend encore des caps existants |
| 5 | AI BRAINSTORMING | PARTIAL | `apps/api/src/infrastructure/assistant/service.ts:49-65,125-151` (turns versionnés), `marketing/service.ts:45-92` | Moteur IA Vertex seulement si `ASSISTANT_VERTEX_ENABLED=1` ; repli hors-ligne déterministe ; **aucun asset utilisateur** dans le snapshot |
| 6 | ART DIRECTIONS | MISSING (entité) | Substituts : `ProjectStudio.tsx:496-499` « Direction artistique simulée » (champ libre déterministe), stratégie de `MarketingRevision` | Aucun modèle Prisma de propositions de DA, aucune comparaison/versionnement de DA alternatives |
| 7 | HUMAN SELECTION | PARTIAL | Approbation/refine : `routes/creative.ts:104`, `routes/marketing.ts:34`, `routes/assistant.ts:18-22` ; comparaison `RevisionCompare.tsx` | Pas de « rejeter/écarter » explicite d'une proposition ni de sélection multi-DA côte à côte |
| 8 | EDITABLE CREATION | PARTIAL | `apps/web/components/CreativeEditor.tsx`, `apps/api/src/application/creative.ts:267-430` (versions append-only) | P09A : éditable pour image/carrousel/vidéo courte **et vidéo multiscène** (timeline, durées, ordre, clips, transitions, recadrage, aperçu vidéo borné) ; le pipeline historique reste démo-only mais n'est plus le seul chemin vidéo |
| 9 | REVIEW | IMPLEMENTED | `CreativeReviewSurface.tsx`, `RevisionCompare.tsx`, `routes/creative.ts:229-280`, `renderJobs.ts` | P09A : rendu vidéo multiscène avec progression/annulation ; exécution réelle NON VÉRIFIÉE (P12) |
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
| Composition native (image, carrousel, vidéo courte et multiscène) | IMPLEMENTED (code) | `application/creative.ts:267-430`, `packages/media/{creativeFrame,sceneComposition,textLayout,motion}.ts` | P09A : vidéo paysage 1920×1080 additive ; exécution réelle NON VÉRIFIÉE |
| Brouillons versionnés + restauration | IMPLEMENTED | `application/creative.ts:79-88`, `routes/creative.ts:86-103` | `expectedVersion` protège les conflits |
| Rendu natif + export PNG/MP4/ZIP | IMPLEMENTED | `routes/creative.ts:201-251`, `publishing/delivery.ts:110-130` | Exécution réelle NON VÉRIFIÉE |
| Rendu durable (file `StudioRender`) | IMPLEMENTED (code) | `infrastructure/creative/renderJobs.ts:18-100`, `apps/api/src/index.ts:11` | Bail/lease + heartbeat ; pump local ou worker |
| Vidéo multiscène éditable | IMPLEMENTED (code) | P09A : `productionFormats.ts:11` (`Video: studio:'short'`), `contracts/creative.ts` (`landscape`, `clip.fit/focusY`), `CreativeEditor.tsx` + `StudioTimeline.tsx` | Rendu réel non exécuté (P12) ; le pipeline historique démo reste présent |
| Aperçu vidéo borné (20 s) | IMPLEMENTED (code) | `application/creative.ts:218-266` (`previewVideo`), `routes/creative.ts` (`POST /creative/preview/video`) | Même compositeur que le master ; jamais un artefact approuvable |
| Progression / annulation / reprise de rendu | IMPLEMENTED (code) | `StudioRender.progress`/`cancelRequested` (migration additive), `renderJobs.ts`, `studioEvents.ts` | Annulation coopérative en fin de scène ; bail/lease et reprise existants |
| Motion | MISSING | `channels.ts:4` déclare `Motion` ; aucun rendu/format de production | — |
| Pistes audio, volume, mixage | IMPLEMENTED (code) | P09B : `contracts/audio.ts`, `packages/media/src/audio.ts` (`mixTracks`, ducking), `application/creative.ts` | Rendu réel non joué en P12 ; FFmpeg requis |
| Sous-titres éditables, style, rendu | IMPLEMENTED (code) | `buildAssText`/`buildSrtText`, `motion.ts` (ass par scène), `StudioSubtitles` | Nécessite libass ; texte assaini par le contrat |
| Transcription et voix off | PROVIDER_DEPENDENT | `infrastructure/audio/{providers,vertex,service}.ts`, outils `audio.transcribe@1`/`audio.tts@1` | Vertex Gemini, `AUDIO_*_ENABLED=0` par défaut ; aucun appel réel, aucun credential |
| Analyse audio locale (WAV) | IMPLEMENTED (service Python requis) | `services/python-tools/app/audio.py`, outil `audio.analyze@1` | Service interne non démarré ici ; aucun modèle |

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
| Admin (9 pages, utilisateurs, agents, fournisseurs, modèles, routing, audit, coûts, commerce) | IMPLEMENTED | `routes/admin*.ts`, `apps/web/app/admin/**`, `lib/admin.ts` | P11-A : rôles/statut de compte et suspension ; P11-B : catalogue fermé des outils + disponibilité réelle + politique d'exécution par compte ; aucun test exécuté | Secrets fournisseurs chiffrés (`providerCredentialCipher.ts`) |
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
- **TTS / voix / audio généré : TRAITÉ EN P09B (fournisseur désactivé).** L'inventaire P00 constatait l'absence de TTS/transcription/sous-titres. Depuis P09B : pistes audio et sous-titres dans la composition (`contracts/audio.ts`), mixage FFmpeg local, sous-titres ASS/SRT, capacité Python locale `audio.analyze@1`, outils `audio.transcribe@1` et `audio.tts@1` (Vertex Gemini, drapeaux off par défaut, appels NON VÉRIFIÉS). Aucun clonage de voix.
- **Entité « propositions de directions artistiques » : MISSING.** Aucun modèle Prisma ; seuls un champ libre « Direction artistique simulée » (`ProjectStudio.tsx:496-499`) et la stratégie d'un plan marketing. Pas d'alternatives persistantes, comparables, versionnées.
- **Assets avant le brainstorming : non contraignant.** Le snapshot assistant ne contient que profil/contexte/offre (`assistant/service.ts:49-65`) ; le marketing ne lit que contexte+offre+semaine (`marketing/service.ts:45-92`) ; la création de projet ne sélectionne aucun asset (`projects/new/page.tsx:94` : « Aucun fichier de sa bibliothèque n'est sélectionné automatiquement »). Aucun gate serveur.
- **Vidéo multiscène éditable : traitée en P09A.** L'inventaire P00 constatait `productionFormats.ts:10` (`Video: studio:null`) et un pipeline démo-only. Depuis P09A, `Video` ouvre l'atelier (vertical par défaut, paysage 16:9 additif), avec timeline, aperçu borné et progression/annulation ; le pipeline historique démo reste présent mais n'est plus le seul chemin vidéo.
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

## 8. Mise à jour P07 — production et édition d’image IA (2026-11-20)

Implémenté depuis l’inventaire (commit P07, `BUILD_UNVERIFIED`, aucun test complet, aucun appel fournisseur réel) :

- Contrat additif `imageEditRequest` : opération (`generate`, `edit`, `replace-background`, `remove-object`, `variation`, `enhance`), source/masque par identifiants de versions, prompt borné, ratios sociaux, préservation du sujet, confirmation des droits. `imageEditApply` pour l’application à une composition.
- Outil `media.image.edit@1` : `scope: project`, GENERATE, approbation humaine, plafond 8 ¢, `agentProposable: false` ; réservation/claim/réconciliation via le broker P05.
- Adaptateur réel `GeminiImageProvider` (Vertex `gemini-2.5-flash-image`, ADC, `responseModalities: IMAGE`, source/masque en `inlineData`, extraction `inlineData.data`, retry unique sans `imageConfig` si 400) ; capacités déclarées sans sonde payante ; Replicate conservé `scene-flow-only`.
- Contrôles : source/masque limités au propriétaire et à la marque, formats PNG/JPEG/WebP, tailles bornées, droits connus ; sortie vérifiée (signature, inspection Sharp ≤ 4096 px, ≤ 12 Mio) ; échecs déterministes `FAILED` à coût nul ; issues ambiguës `UNKNOWN` jamais rejouées.
- Stockage : `AssetUseCases.upload` → nouvelle version immuable avec provenance fournisseur/modèle/opération/source/requête ; l’original n’est jamais modifié.
- API : `GET /api/image-editing/capabilities`, `POST/GET /api/projects/:id/image-edits`, `POST /api/projects/:id/image-edits/:operationId/apply` (nouvelle révision Studio via calque image).
- UI `ImageEditingPanel` : choix d’une image source/masque, opération, ratio, préservation du sujet, confirmation des droits, préparation puis autorisation du coût, suivi d’état, comparaison originale/éditée, application à la composition, erreurs et récupération.

Limites P07 : **aucun appel Gemini réel n’a été exécuté** (aucun credential, fournisseur désactivé par défaut) : `providerCallVerified: false` est annoncé dans les capacités ; l’édition par masque est guidée par prompt (pas de paramètre API formel) ; pas de tests/build/typecheck (P12).

## 9. Mise à jour P08 — atelier visuel professionnel (2026-11-20)

Implémenté depuis l'inventaire (commit P08, `BUILD_UNVERIFIED`, aucun test complet, **ADR-0039**) :

- **Contrats additifs** (`packages/contracts/src/creative.ts`) : calque image `crop` (zoom 1–4, `focusX`/`focusY` 0–1), calque texte `align` (gauche/centre/droite) et `spacing` (interligne 0–200), `creativeAssetApply` pour appliquer une ressource existante à un calque image. Aucun champ existant renommé/supprimé ; les specs stockées parsent et rendent à l'identique sans ces champs.
- **Rendu** (`packages/media/src/creativeFrame.ts`) : recadrage réel (source orientée EXIF extraite puis redimensionnée cover, `fit` ignoré quand `crop` est fourni), alignement du bloc texte dans sa boîte et interligne via les options Sharp ; sans nouveaux champs, trames et options strictement inchangées.
- **API** (`apps/api/src/application/creative.ts`, `routes/creative.ts`) : `CreativeStudio.applyAsset` valide la ressource (propriétaire/contexte/usage, image seulement) et le calque cible, remplace le calque héros/ciblé ou insère un nouveau calque, puis passe par `save` (revalidation contractuelle + concurrence `expectedVersion`). Route `POST /api/projects/:id/creative/asset` sous `authenticate`. Aucune migration, aucune table, aucun écrasement.
- **Canvas** (`apps/web/components/StudioCanvas.tsx`, `apps/web/lib/useStudioPreview.ts`) : aperçu exact produit par `POST /creative/preview` (même compositor Sharp que le rendu final), débouncé, dernier aperçu exact conservé pendant l'actualisation, statut d'erreur/invalidité explicite ; boîtes de sélection normalisées, sélection multiple Ctrl/Maj, déplacement groupé borné (texte = zone sûre, image = cadre), huit poignées de redimensionnement, flèches ±0,5 % (±2 % Maj), Suppr/Échap, repères zone sûre et zones d'interface de canal, zoom ajuster/50/75/100 %, aria et focus clavier.
- **Inspecteur contextuel** (`apps/web/components/StudioInspector.tsx`) : canvas (couleurs de marque, fond de scène, marge sûre, presets de canal compatibles), calques (ordre, monter/descendre, supprimer, sélection), texte (texte, police, corps, gras, couleur, cartouche, alignement, interligne, opacité, boîte), image (ressource, cadrage, ancrage, recadrage fin zoom/point de mire, opacité, boîte), ressources (licence, provenance réelle, badge Python/IA, insertion/remplacement), scène (durée, clip, début, transition courte).
- **Barre d'outils et composition** (`apps/web/components/CreativeEditor.tsx`) : canvas central + barre (annuler/rétablir, alignements/distribution, sauvegarde) + inspecteur ; historique local de specs immuables (`useStudioHistory`, un geste = un pas) ; copie locale de secours (`studioDraftStore`, `localStorage` borné, validé par `creativeSpec`, lié à la version de base, jamais approuvable et explicitement non serveur) ; brouillons serveur = révisions existantes ; outils avancés conservés (FormatGuide, MediaGenerationPanel, CreativeActionPanel, Timeline, calques numériques, prévisualisation historique) ; libellés e2e conservés.
- **Livraison et revue** (`apps/web/components/StudioDelivery.tsx`, `StudioCompare.tsx`) : rendu durable existant, approbation version + checksum exact (`approvalSha256 ?? master.sha256`), export PNG/MP4/ZIP du master approuvé, historique des révisions avec affichage/restauration en nouvelle révision, comparaison visuelle de deux révisions rendues par le même moteur serveur + résumé factuel des différences (scènes, calques, dimensions, palette, durée, ressources).
- **Styles** : `apps/web/app/atelier-blue.css`, valeurs sémantiques du design system uniquement, shell bleu.

Limites P08 : aucun test, build, lint ni typecheck **complet** exécuté (campagne P00–P11) ; E2E Playwright non rejoué (réalignement P12) ; rendu navigateur/responsive non vérifié ici ; la copie locale dépend du navigateur et n'est jamais une révision ; l'aperçu reste un appel serveur débouncé et, en mode commercial, conserve le filigrane et la réduction existants ; `crop` n'est pas un chemin destructif (la source reste immuable) ; aucun fournisseur payant activé, aucune publication, aucun déploiement.

## 9. Mise à jour P06 — boîte à outils Python interne (2026-11-20)

Implémenté depuis l'inventaire (commit P06, `BUILD_UNVERIFIED`, aucun test complet) :

- `services/python-tools/` : FastAPI + Pydantic typés, contrats stricts (aucune URL/chemin), registre explicite `image.analyze@1` et `image.segment@1`, `uv.lock` réel, Python 3.12 épinglé, Dockerfile non-root (UID 10001), README sécurité/limites, smoke local reproductible.
- Capacités réelles : analyse (dimensions, exposition, contraste, netteté, entropie, couleurs dominantes, pHash) et détourage GrabCut (cutout PNG transparent + masque alpha), sans modèle externe ni téléchargement.
- Intégration worker : `apps/api/src/infrastructure/python/{client,adapter}.ts` (jeton Bearer, délai borné, erreurs structurées) ; registre P05 étendu (`scope: assets`) ; `runtime.ts` dispatche ; sorties vérifiées SHA-256 puis stockées via `AssetUseCases.upload` (versions immuables, licence héritée, provenance).
- Compose Coolify : service `python-tools` interne (`expose: 8090`, aucun port publié), rootfs lecture seule, tmpfs, `no-new-privileges`, `cap_drop: ALL`, mémoire/CPU/PID bornés, healthcheck.
- Preuve locale exécutée : smoke Python **16/16 PASS** (healthz, 401 sans jeton, analyse réelle, 422 sur empreinte altérée, deux sorties PNG vérifiées par SHA-256 et dimensions). **NOT_RUN** : build/pull Docker, `docker compose config`, exécution Compose, tests/typecheck TS (campagne P00–P11).

Limites P06 : GrabCut est déterministe et moins précis qu'un modèle spécialisé ; le service n'est pas certifié en conteneur ; aucun appel depuis le worker réel n'a été joué (pas de base/postgres disponible dans cette session) ; P07 pourra ajouter un modèle embarqué via `PYTHON_TOOLS_MODELS_DIR` sans changer le broker.

## 9. Mise à jour P05 — exécution outillée agentique (2026-11-20)

Implémenté depuis l'inventaire (commit P05, `BUILD_UNVERIFIED`, aucun test exécuté) :

- **ADR-0036** : registre fermé et versionné, l'agent recommande et Vululu autorise, aucune exécution arbitraire, pas de nouveau moteur de workflow.
- Migration additive `20261121130000_agentic_tool_proposals` : `ExecutionOperation.params/result` (JSONB), `agentTurnId`, `step`.
- `registry.ts` v2 : chaque outil porte `action`, `scope` (`project`|`assets`|`revision`), `approval` (`auto`|`human`) et, si proposable, un schéma Zod ; nouveaux outils `project.summary@1`, `assets.list@1`, `assets.inspect@1`, `creative.direction@1` (aucun effet payant).
- `broker.ts` : périmètres exécutables avant toute révision créative (décision de ressources confirmée requise pour `assets`), digest des paramètres canoniques, stockage `params`/`agentTurnId`/`step`, résultat structuré plafonné (32 Kio), échec déterministe → `FAILED` à coût nul (distinct de l'issue incertaine `UNKNOWN`).
- Assistant : type de tour `agent` (`agentOutput` : réponse + ≤4 recommandations), filtrage aux outils proposables, plafond de 6 étapes consécutives, repli hors ligne sans recommandation ; Vertex étendu (schéma JSON + consigne « recommander, ne jamais exécuter »).
- API : `POST /api/projects/:id/execution/agent` (conversion recommandation → opération PROPOSED/QUEUED avec revalidation des paramètres), `GET /api/projects/:id/execution` (statut réel du projet), `GET /api/execution/tools` sérialisé (plus de schéma Zod exposé).
- UI `ProjectExecutionStatus` : autorisation humaine, annulation, résultat structuré, issue incertaine, rafraîchissement automatique.

Limites P05 : les outils Python de P06 s'enregistreront sur ce contrat (registre + un cas de dispatch) ; le choix humain de direction (ancien P05) reste à livrer ; aucun test/build/lint/typecheck exécuté.

## 9. Mise à jour P04 — directions artistiques versionnées (2026-11-20)

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

## 11. Mise à jour P09A — production vidéo multiscène (2026-11-21)

Implémenté depuis l'inventaire (commit P09A, `BUILD_UNVERIFIED`, aucun test complet, **ADR-0040**) :

- **Contrats additifs** : `outputKind` gagne `landscape` (1920×1080) et `outputSize` l'entrée correspondante ; `isVideoOutput(kind)` devient le prédicat unique (`short` | `landscape`) ; `scene.clip` accepte `fit` (`cover`|`contain`) et `focusY` (0–1) pour le recadrage ; `productionFormats.Video.studio` passe de `null` à `'short'` ; `studioExportExtension` renvoie `mp4` pour toute sortie vidéo. Les specs stockées sans ces champs parsent et rendent à l'identique.
- **Rendu** (`packages/media/src/motion.ts`, `index.ts`) : recadrage cover/contain avec point de mire vertical, preset d'encodage optionnel, sous-titres ASS par scène (résolution relative au dossier de travail, aucun échappement de chemin), sonde `ffprobe` vérifiant que la piste audio dure exactement la durée attendue (`media_audio_duration_mismatch` sinon).
- **API** : `CreativeStudio.previewVideo` (même compositeur, borné à 20 s, aucune révision/stockage) ; `render` accepte des `hooks` de progression et d'annulation coopérative ; `StudioRender.progress`/`cancelRequested` (migration additive) ; `cancelRender` + `POST /creative/:version/render/cancel` ; `GET /creative/:version/render` renvoie `progress` ; journal `StudioEvent` alimenté de façon atomique (le flux SSE existant devient réel) ; Runway vérifie l'orientation (1280:720 / 720:1280) au lieu du seul format court.
- **Web** (voir rapport P09A pour le détail) : timeline de scènes, aperçu vidéo borné, régénération ciblée par scène, barre de progression et annulation dans la livraison, contrôles de recadrage de clip, preset de canal paysage.

Limites P09A : aucun test, build, lint ni typecheck exécuté (campagne P00–P11) ; rendu/aperçu réels non joués ici (P12) ; client Prisma à régénérer avant typecheck (`progress`, `cancelRequested`) ; transitions prises en charge = `cut` et `dip` uniquement ; l'aperçu est plafonné à 20 s et consomme un slot de rendu ; l'annulation ne coupe pas une scène déjà en cours d'encodage ; Runway reste désactivé et `NOT_VERIFIED`.

## 12. Mise à jour P09B — audio, sous-titres et voix off (2026-11-21)

Implémenté depuis l'inventaire (commit P09B, `BUILD_UNVERIFIED`, aucun test complet, **ADR-0041**) :

- **Contrat additif** `packages/contracts/src/audio.ts` : jusqu'à 4 pistes (`voiceover`/`music`/`sfx`, version d'asset, début, gain, fondus, ducking), sous-titres (langue, ≤ 200 repères, style), demandes de transcription et de voix off avec attestation de droits. `CreativeSpec.audio` est optionnel ; audio et sous-titres exigent une sortie vidéo ; l'ancienne piste `delivery.audio` reste valide et devient une musique de la timeline.
- **Média local** `packages/media/src/audio.ts` : `mixTracks` (trim, gain, fondus, `adelay`, bus voix/musique, `sidechaincompress` pour le ducking, PCM 48 kHz stéréo), `buildAssText` (ASS par scène, temps local, style positionnel, marges de zone sûre), `buildSrtText`, extraction M4A sans réencodage, normalisation ASR 16 kHz mono. `assembleMaster` vérifie la durée réelle de la piste audio par `ffprobe`.
- **Rendu** : mixage et sous-titres appliqués au master vidéo ; manifeste enrichi (pistes, SHA-256, nombre de sous-titres) ; l'aperçu borné inclut audio et sous-titres.
- **API** : export `GET /creative/:version/audio` (M4A) et `:version/subtitles` (SRT), réservés à une révision approuvée ; `/api/audio/capabilities` (disponibilité et autorisation par compte), préparation transcription/voix off, historique des opérations, application à une nouvelle révision.
- **Fournisseurs** : adaptateurs Vertex Gemini (transcription JSON horodatée, TTS PCM→WAV), erreurs déterministes/incertaines, plafonds 8 ¢ et 12 ¢, approbation humaine obligatoire, non proposables par l'agent, aucun clonage de voix, drapeaux désactivés par défaut.
- **Outils** : registre étendu (`audio.analyze@1`, `audio.transcribe@1`, `audio.tts@1`) ; dispatch worker.
- **Python** : `audio.analyze@1` (WAV/PCM, stdlib wave + numpy) — durée, niveaux dBFS, écrêtage, silences ; borné à 300 s / 16 Mio, sans dépendance ni modèle.
- **Web** : `StudioAudioPanel` (pistes, volume, fondus, ducking, analyse, transcription, voix off avec états réels), `StudioSubtitles` (repères, style, SRT), pistes audio et repères dans la timeline, exports M4A/SRT dans la livraison.

Limites P09B : aucun test, build, lint ni typecheck exécuté ; fournisseurs audio désactivés et appels NON VÉRIFIÉS ; horodatages de transcription estimés (pas mot à mot) ; le rendu vidéo avec sous-titres exige un FFmpeg avec libass (échec explicite sinon) ; le service Python doit être démarré pour l'analyse ; aucun clonage de voix.

## 13. Mise à jour P10 — publication, calendrier et résultats marketing (2026-11-21)

Implémenté depuis l'inventaire (commit P10, `BUILD_UNVERIFIED`, aucun test complet) :

- **Hashtags éditables** : `calendar.variant.hashtags` (≤ 10, format `#tag`, unicité insensible à la casse, défaut `[]`) — additif, inclus dans le digest éditorial et dans la légende publiée. Les contenus existants parsent sans migration.
- **Publication** : la légende publiée inclut désormais légende + hashtags + CTA ; le paquet manuel hérite du même texte. Nouvelle route `GET /api/publishing/:id` : demande exacte, compte/plateforme (y compris expiré/révoqué), état, reçu réseau, horodatage, journal `PublicationEvent` et opérations de soumission/annulation pour la traçabilité. La validation existante (`preview`) reste l'autorité : révision approuvée + version de calendrier compatible + statut éditorial + longueur de légende + capacité directe de la plateforme.
- **Résultats** : `GET /api/results` expose en plus les contenus créés/approuvés/programmés/publiés (par état), les états de `PublicationRequest` (dont `publishedConfirmed` = `PUBLISHED` **avec reçu réseau**), les sources et l'instant d'observation, les campagnes agrégées, les créations approuvées réutilisables et des suggestions déterministes dérivées uniquement des données observées. Aucune mesure réseau inventée : les métriques restent `unavailable` sans `POSTIZ_ANALYTICS_ENABLED` et source.
- **Web** : édition des hashtags dans le calendrier, panneau de publication complété (validation, confirmation compte/contenu/heure, autorisation humaine, états, reçu, annulation, conseils de reconnexion, reprogrammation sûre) et rapport résultats observé (compteurs, campagnes, créations réutilisables, suggestions, états « non disponible »).

Limites P10 : aucun test/build/typecheck/E2E ; aucune publication réelle (`POSTIZ_PUBLISH_ENABLED` off, `direct_disabled`) ; TikTok/vidéos non programmables en direct (capacités existantes) → paquet manuel ; les métriques restent dépendantes de Postiz analytics ; la reprogrammation se fait par annulation + édition de l'heure (nouvelle version) + nouvelle préparation.

## 14. Mise à jour P11-A — administration des utilisateurs (2026-11-21)

Implémenté depuis l'inventaire (commit P11-A, `BUILD_UNVERIFIED`, **ADR-0042**) :

- **Migration additive** `20261122140000_user_administration` : `User.status` (`active` par défaut) + `User.suspendedAt` nullable + index `User_status_idx`. Aucune donnée modifiée.
- **Connexion** : le statut est vérifié après le mot de passe sous le verrou de compte ; un compte suspendu renvoie 403 `account_suspended` (journalisé `auth.login_suspended`) sans jamais révéler si le mot de passe était correct ; la résolution de session refuse tout compte suspendu en profondeur.
- **API admin** : `GET /api/admin/users` (recherche `q`, filtres `role`/`status`, pagination serveur), `GET /api/admin/users/:id` (compteurs bornés + 20 événements d'audit), `PATCH /api/admin/users/:id` (rôle/statut uniquement, auto-modification interdite, dernier `super_admin` actif préservé, audit `user.role_changed`/`user.suspended`/`user.reactivated`, révocation des sessions sur changement de rôle/suspension, verrou consultatif contre les mutations concurrentes).
- **Web** : recherche et filtres serveur, badges de statut, fiche utilisateur (compteurs, sessions, audit), changement de rôle et suspension/réactivation avec confirmation et états d'erreur, actions désactivées pour son propre compte, aucune donnée secrète affichée.

Limites P11-A : aucun test/build/E2E exécuté ; pas de suppression de compte (décision distincte) ; pas de notification au compte suspendu ; le typecheck complet reste NOT_RUN (seuls contrôles ciblés rapportés par l'agent).

## 15. Mise à jour P11-B — agents, outils et capacités (2026-11-21)

Implémenté depuis l'inventaire (commit P11-B, `BUILD_UNVERIFIED`, **ADR-0043**) :

- **Catalogue fermé des outils** : `GET /api/admin/tools` (super-admin) expose le registre existant avec action, portée, approbation, plafond, caractère proposable par l'agent, et **disponibilité réelle** calculée depuis la configuration (média, image, audio, Postiz, Vertex, Python). Aucun second registre, aucune définition arbitraire, aucun jeton.
- **Capacités Python incluses** : `image.analyze@1`, `image.segment@1`, `audio.analyze@1` figurent dans le même catalogue avec `python-tools@1` et une disponibilité liée à la configuration du service interne.
- **Politique d'exécution par compte** : `GET /api/admin/execution/accounts` et `/:account` (plafond, réservé, dépensé, état, outils) en lecture ; l'écriture reste le `PUT` existant, borné au registre fermé ; le broker conserve budget, approbation et `tool_disabled`.
- **Web** : panneau « Disponibilité réelle des capacités » (Fournisseurs) et sections « Outils et permissions » + « Politique d'exécution par compte » (Agents), avec confirmations et états d'erreur ; chaque contrôle appelle une route réelle.
- **Préservé** : activation/qualification fournisseur et modèle, credentials chiffrés, agents versionnés avec promotion/rollback, ToolBroker, Hatchet, autorisation super-admin.

Limites P11-B : aucun test/build/E2E ; la disponibilité décrit la configuration, jamais un appel vérifié ; l'admin ne crée ni agent ni outil ; les fournisseurs restent désactivés par défaut.

## 16. Mise à jour P11-C — observabilité des opérations (2026-11-21)

Implémenté depuis l'inventaire (commit P11-C, BUILD_UNVERIFIED, **ADR-0044**) :

- **Opérations outillées** : GET /api/admin/ops/execution (états, états de coût, 50 dernières, éligibilités) et GET /api/admin/ops/execution/:id (détail + audit par corrélation) ; annulation admin d'une opération PROPOSED/QUEUED via le broker (acteur audité) ; résolution d'incident UNKNOWN via la route existante.
- **Jobs** : durées et blocages calculés (ageMs, sinceUpdateMs, stalled à 300 s, durationMs terminal) affichés dans la table des runs ; heartbeats workers existants.
- **Python** : GET /api/admin/ops/python (readyz + capabilities, timeout court, sans jeton ni URL interne).
- **Audit** : filtre traceId sur GET /api/admin/audit, pré-remplissage ?traceId=, lien depuis chaque opération.
- **UI** : sections opérations/détail/audit/Python dans Jobs, actions confirmées, états d'erreur explicites ; aucune relance aveugle payante.

Limites P11-C : aucun test/build/E2E ; vérification Python à la demande seulement ; annulation limitée aux opérations non envoyées ; pas de relance admin d'une opération terminée ; durée d'opération outillée non stockée.

## 17. Mise à jour P11-D — coûts et budgets d'exécution (2026-11-21)

Implémenté depuis l'inventaire (commit P11-D, BUILD_UNVERIFIED, **ADR-0045**) :

- **Budgets** : GET /api/admin/costs/execution — plafond, réservé, consommé, restant, utilisation, alertes (incertain/épuisé/critique/vigilance), cumuls, par compte d'exécution.
- **Coûts** : agrégats par outil et fournisseur (plafond cumulé, confirmé, incertain), distinction estimation/réservation/confirmé/incertain/libéré, opérations à coût incertain avec lien audit et résolution existante (coût constaté + preuve).
- **Fournisseurs** : disponibilité calculée réutilisée (module partagé) et plafonds d'outils ; jamais de sonde payante.
- **Commercial** : bêta gratuite, gel des paiements, contrôle commercial, Stripe live/checkout exposés en lecture ; aucune activation ni modification d'offre.
- **UI** : page Couts enrichie (budgets, coûts par outil/fournisseur, incertains, mode commercial) ; journal CostEvent conservé et clairement étiqueté MOCK.

Limites P11-D : aucun test/build/E2E ; agrégation bornée ; aucun écriture financière ; résolution d'incident manuelle ; CostEvent = routage MOCK.

> **Rappel final** : inventaire établi par lecture seule au HEAD f5d515b, mis à jour par P01 puis P02–P11D. Aucune commande de test, de build ou de fournisseur n'a été exécutée pour P09A/P09B/P10/P11A ; tout statut est une lecture de code, jamais une certification.