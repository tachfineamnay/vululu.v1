# VULULU V1 — Baseline exécutable et préparation du chantier COOLIFY + ADMIN + STUDIO

- **Date** : 2026-11-01
- **Dépôt** : tachfineamnay/vululu.v1
- **Branche** : main
- **SHA de départ** : d07a02e9a91cb89b796655eb72ede5478caa2479
- **SHA de fin** : commit docs de cette mission (voir git log ; non auto-référencé pour éviter la récursion de hash)
- **Auteur** : Lead engineer / audit local DeepSeek Harness
- **Statut** : baseline locale factuelle — aucun push, aucun déploiement, aucune publication
- **Portée** : Mission 01. Les Missions 03 (Admin) et 05 (orchestration/S3 préprod) font l'objet de phases ultérieures ; la préparation Coolify reste conditionnée à une autorisation séparée.

## 0. Verdict

**BASELINE_ÉTABLIE_LOCALEMENT — GO CONDITIONNEL POUR LE CHANTIER ADMIN/STUDIO.**

Le dépôt main est propre, aligné sur origin/main, sans secret suivi, avec un socle V1 réel (Domain/Application/Infrastructure, PostgreSQL, outbox, Hatchet codé, stockage local/S3, sécurité serveur). Les campagnes locales de la présente mission confirment les gates déjà documentés en V1-01-H. En revanche, l'état réel est très en retrait des documents de certification sur trois points structurants :

1. **Admin** : les API existent (invitations, agents, providers, modèles, routage, ops) mais il n'existe **aucune UI d'administration** ; plusieurs lectures manquent (utilisateurs, projets, runs, audit, coûts, overview).
2. **Orchestration** : le mode par défaut est **local, in-process, non durable** ; Hatchet n'est pas activé faute de token/engine. Le rapport de certification G décrit pourtant l'orchestration durable comme capacite PASS local.
3. **Stockage** : l'adaptateur S3 est réel et testé, mais uniquement contre **rclone serve s3** ; MinIO n'avait pas été installé, les tests S3 sont SKIP sans E_S3_TEST=1, et TLS/IAM/SSE/restauration binaire restent NOT_RUN.

Le chantier « COOLIFY + ADMIN + STUDIO » ne peut donc pas être présenté comme une simple mise en forme d'un existant complet : c'est un chantier de complétion borné, dont les prérequis et le plan sont fixés en section 9.

## 1. État Git

| Contrôle | Résultat |
|---|---|
| Branche | main |
| HEAD | d07a02e9a91cb89b796655eb72ede5478caa2479 |
| Arbre de travail | propre au début de la mission (git status --porcelain vide) |
| origin/main | d07a02e9a91cb89b796655eb72ede5478caa2479 (git ls-remote) |
| Divergence | aucune : HEAD = origin/main |
| Branches locales | main uniquement |
| Worktrees | un seul, C:/Users/hp/Desktop/vululu Ai |
| Reflog | fast-forward de 69c6549 vers d07a02e, puis HEAD stable |
| Tags | aucun |
| .env | ignoré par Git, non suivi |
| Secrets suivis | aucun (scan dédié exécuté dans la campagne) |
| Historique récent | d07a02e docs(review) ; 49ffc68 fix(e2e) ; 4bd921b fix(test) ; 33afe89 fix(ci) ; c0358fa docs(review) ; 49ea97d fix(ci) |

Aucune divergence, aucun travail en cours dans le dépôt cible. La sauvegarde locale du 2026-10-25 (hors dépôt) et le pack documentaire V1.3 externe n'ont pas été modifiés ; ils ne font pas partie de l'autorité documentaire du dépôt.

## 2. Environnement constaté

| Élément | Valeur |
|---|---|
| OS | Windows 11, build 26100, AMD64 |
| Node.js | v24.21.0 (engines >=24) |
| pnpm | 10.6.1 (packageManager, lockfile figé) |
| Git | 2.48.1.windows.1 |
| PostgreSQL | 17.2 portable, D:/pgportable/pgsql/bin, cluster .v0/pgdata, port 55432 |
| Bases présentes | vululu_v1_00 (démo), vululu_v1_00_test (test, 12 migrations), vululu_v0, vululu_v0_test, vululu_hatchet_poc, vululu_g_restore |
| FFmpeg | 9.0.2-essentials_build (chemin fourni par .env, jamais affiché) |
| Playwright | @playwright/test 1.64.1, Chromium |
| Docker | Docker 29.8.1, moteur Linux actif, 4 CPU logiques, 6,0 Go alloués, ~35 Go libres |
| Python | non requis par le gate local actuel ; validation YAML CI traitée séparément |
| Ports | 3001, 3100, 3101 libres au début de la mission |
| .env | DATABASE_URL → vululu_v1_00 ; DATABASE_URL_TEST → vululu_v1_00_test ; ni S3, ni Hatchet, ni Postiz, ni ORCHESTRATOR_MODE |

Conséquence : le runtime observé est le mode local (ORCHESTRATOR_MODE absent → local), providers MOCK, Postiz MOCK, artefacts sur filesystem. Docker est désormais disponible, ce qui rend la Mission 05 exécutable localement.

## 3. Documents lus et écarts documentaires

Documents lus : README, AGENTS, docs/README, PRD V1.2, CDC V1.2, architecture V1, backlog, roadmap, P0-0, ADR-0001 à 0013, rapports d'inauguration, rapports d'exécution V1-00 à V1-01-G, rapport docs/review V1-01-H (Git, sécurité, diff, CI, vérification locale, push readiness), matrice des capacités, registre de dette, rapports de certification, rapport de déploiement, matrice de traçabilité des fondations, catalogue d'acceptation, runbook V0.

Écarts constatés (aucun document verbatim modifié) :

| Écart | Constat | Traitement |
|---|---|---|
| README obsolète | « État du dépôt » annonce P0-0 non clôturé et P0-A…F non démarrés ; main contient V1-00, V1-01-A à H, 12 migrations et 175 tests | signalé ; mise à jour README proposée hors de ce rapport |
| README V0 | le prototype V0 est décrit comme non mergé ; main contient désormais le socle V1 et les preuves V0 | signalé |
| ROADMAP obsolète | « Le dépôt ne contient encore aucune application » | signalé |
| Certification G | V1_FINAL_CERTIFICATION et V1_GIT_REVIEW_HANDOFF décrivent le commit G 0e79c08 et main 69c6549 ; main est en H (d07a02e) | signalé ; les rapports H (docs/review) ne sont pas consolidés dans la certification |
| Matrice capacités | « Ordonnancement durable PASS local », « S3 PASS local expérimental », « Production 10/50 s PASS local » sont vrais pour les campagnes D/E, mais ne décrivent pas le mode par défaut actuel (local non durable, S3 rclone, providers mock) | surdéclaration corrigée dans la matrice de ce rapport |
| Index documentaire | docs/README ne référence ni docs/certification, ni docs/review, ni docs/reports | signalé ; ajout d'une ligne docs/reports dans ce commit |
| Rapports | docs/reports/ n'existait pas | créé par ce rapport |
| docs/10 | catalogue d'acceptation SPECIFIED/NOT_RUN, jamais exécuté en recette complète | signalé ; non revendiqué PASS |

## 4. Cartographie réelle des composants

### 4.1 Monorepo

| Zone | Contenu réel |
|---|---|
| packages/domain | Domain Core pur : context, brief, project, scene, character, artifact, approval, transfer, productionState, agentic, versions, checksum, identity, immutability |
| packages/application | Use cases : contexts, projects, briefs, storyboards, messages, scenes, production, durableProduction, artifacts, agents, provider-catalog, routing ; ports ; erreurs |
| packages/contracts | Schémas Zod d'entrée (login, context, project, brief, message, correction, durée, approbation) + SessionUser |
| packages/db | Schéma Prisma (34 modèles), 12 migrations, seed bootstrap super_admin |
| packages/media | Renderer déterministe Sharp/PNG + FFmpeg MP4 + QA technique (pas d'IA générative) |
| apps/api | Fastify : 8 modules de routes, auth/session/CSRF/RBAC, Prisma, outbox, Hatchet, S3/local, Postiz mock, ops, worker |
| apps/web | Next 16.4.2 : 5 pages + ProjectStudio (parcours V0) ; aucune page admin |
| poc/hatchet | POC Hatchet v0.110.5 : sidecar embedded, scripts WSL, compose non exécuté |
| scripts | v0/v1 DB, vérifications docs/secrets/frontières/migrations, CI locale, inventaire/migration artefacts, purge sessions, réconciliation |
| tests / e2e | 21 fichiers Vitest + 1 spec Playwright V0 |
| .github/workflows | CI 4 jobs (quality, unit-integration, e2e, security-architecture) — jamais exécutée à distance |

### 4.2 API réelle (routes montées)

| Domaine | Routes | Fichier |
|---|---|---|
| Auth | POST /api/auth/login, /logout, /logout-all, /activate ; GET /me | apps/api/src/routes/auth.ts |
| Invitations/sessions admin | POST/GET /api/admin/invitations, DELETE /api/admin/invitations/:id, POST /api/admin/users/:id/sessions/revoke, POST /api/admin/sessions/purge | apps/api/src/routes/admin.ts |
| Agents/providers/modèles/routage | 15 routes /api/admin/agents, /providers, /models, /routing | apps/api/src/routes/adminAgents.ts |
| Contextes | GET/POST /api/contexts | apps/api/src/routes/contexts.ts |
| Projets/brief/storyboard/messages/scènes | GET/POST /api/projects, GET /api/projects/:id, PATCH brief, POST messages, POST storyboard, PATCH scène | apps/api/src/routes/projects.ts |
| Production | POST produce, GET status, POST correct, GET image/master, POST approve/transfer, GET evidence/qa | apps/api/src/routes/production.ts |
| Ops | GET /api/ops/health, /metrics, /snapshot ; POST /api/ops/reconcile | apps/api/src/routes/ops.ts |
| Santé | GET /api/health | apps/api/src/server.ts |

### 4.3 Web réelle

| Page | Fonction |
|---|---|
| / | Dashboard : contextes, créations récentes, reprise |
| /login | Connexion locale |
| /contexts/new | Création d'un contexte simple (nom, site, description, audience, ton, couleurs) |
| /projects/new | Création projet : contexte, titre, plateforme TikTok/Instagram/LinkedIn, format Affiche/Carrousel/Video/Reel/Motion, objectif, durée de scène 2 s ou 10 s |
| /projects/[id] | ProjectStudio : chat déterministe, brief 4 champs, storyboard 5 scènes, production, correction SCENE-003, durée, approbation, transfert, logout |

Aucune route /admin, aucun écran d'activation d'invitation, aucune gestion d'utilisateurs, aucun écran de comparaison de versions, aucun commentaire par scène.

### 4.4 Worker et pipeline

- Worker séparé : apps/api/src/worker/main.ts ; enregistre le workflow Hatchet vululu-production-pipeline et un heartbeat WorkerHeartbeat.
- Pipeline : validate-snapshot, resolve-capabilities, render-scenes, assemble-master, qa, finalize, approval, transfer mock (apps/api/src/worker/pipeline.ts).
- Mode local par défaut : LocalProductionExecutor exécute le pipeline en process, sans reprise ni retry ; ce n'est pas Hatchet.
- Outbox : OrchestrationOutbox (start_run, approval_signal), clé d'idempotence start:<jobRunId>, backoff, réconciliation au démarrage API, reconcileApprovals.

### 4.5 Données et migrations

34 modèles Prisma, 12 migrations additives : init, scène/durées/approbation, brief revisions, fondation V1-00, snapshot/versioning, index run actif, intégrité run, capacités agentiques, orchestration durable, portée run actif, stockage artefacts, durcissement F. Aucune migration destructive.

## 5. Matrice exigences → composants → tests → statut

Légende : CODÉ (implémenté et testé localement), PARTIEL (sous-ensemble fonctionnel), MOCK (contrat réel mais fournisseur/effet simulé), ABSENT, NON VALIDÉ (code présent mais preuve d'exploitation manquante).

### 5.1 Exigences PRD

| Exigence | Composants réels | Tests | Statut | Limite principale |
|---|---|---|---|---|
| PRD-01 Accès privé | auth.ts, security/session.ts, routes/auth.ts, routes/admin.ts, domain/identity.ts | auth-security.test.ts, identity.test.ts | PARTIEL | API complète ; UI admin et UI d'activation absentes ; rôles non éditables |
| PRD-02 Contextes | routes/contexts.ts, use-cases/contexts.ts, domain/context.ts, ContextRevision | context-brief.test.ts, infrastructure.test.ts, api.test.ts | PARTIEL | Création/lecture simple ; pas d'agent d'analyse, pas de logos/assets/social, pas de validation de faits, pas d'UI révisions |
| PRD-03 Workflow guidé | routes/projects.ts, use-cases/projects.ts, web/projects/new | api.test.ts, v1-01-application.test.ts | PARTIEL | Plateforme/format/objectif/durée seulement ; pas de ratio, sponsorisé, DA, voix/musique, estimation |
| PRD-04 Sorties créatives | use-cases/production.ts, durableProduction.ts, packages/media | media.test.ts, v1-01-d-durable.test.ts, e2e/v0.spec.ts | PARTIEL | 5 PNG + 1 MP4 déterministe ; les formats ne changent pas le rendu ; pas de carrousel/motion/image dédiée |
| PRD-05 Audio | media (piste AAC silencieuse), QA codec | media.test.ts | ABSENT | Pas de TTS, voix, musique, mix, ducking, licences |
| PRD-06 Creative director | use-cases/agents.ts, storyboards.ts, routing.ts, domain/agents.ts | agentic.test.ts, v1-01-b-agentic.test.ts | MOCK | Storyboard figé 5 scènes ; routeur déterministe vers providers mock ; pas de DAG planificateur |
| PRD-07 Multimodèle | provider-catalog.ts, routing.ts, infrastructure/providers/* | agentic.test.ts, v1-01-b-agentic.test.ts | MOCK | Registre/routeur/fallback réels, providers mock uniquement ; pas de clé, usage, coût réel |
| PRD-08 Édition ciblée | routes/production.ts, use-cases/production.ts, domain/scene.ts, SceneVersion | production-correction.test.ts, v1-01-d-durable.test.ts | PARTIEL | IDs stables et correction API réels ; UI limitée à SCENE-003 ; pas de graphe de dépendances fines |
| PRD-09 Boucle humaine | artifact/approval/transfer domain, ProjectStudio | artifact-approval.test.ts, transfer.test.ts, api.test.ts | PARTIEL | Approbation exacte + invalidation réelles ; pas de commentaire par scène, pas de diff visuel, pas de rejet structuré |
| PRD-10 Diffusion Postiz | postizMockAdapter.ts, domain/transfer.ts | transfer.test.ts, v1-01-d-durable.test.ts | MOCK | Idempotence et états locaux ; aucun réseau, aucun payload/mapping Postiz réel |
| PRD-11 Administration | routes/admin.ts, routes/adminAgents.ts, routes/ops.ts | auth-security.test.ts, v1-01-b-agentic.test.ts | PARTIEL | 20 routes API ; aucune UI ; pas de listing users/projets/runs/audit/coûts ; invitations en Prisma direct |
| PRD-12 MCP | aucun serveur MCP | aucun | ABSENT | Aucun transport, scope, outil, test client |
| PRD-13 Coûts/résilience/traçabilité | outbox, durable pipeline, CostEvent, AuditEvent, traceId | v1-01-d-durable.test.ts, v1-01-f-hardening.test.ts | PARTIEL | Outbox réel ; Hatchet non actif par défaut ; coûts mock ; reprise moteur NOT_RUN |
| PRD-14 Qualité/droits | packages/media QA, checksums, QA report | media.test.ts, artifact-approval.test.ts | PARTIEL | QA technique réelle (dimensions/codecs/durée/checksum) ; droits/licences/textes/identité absents |
| PRD-15 Bibliothèque créative | aucun modèle Asset/Campaign | aucun | ABSENT | Pas de bibliothèque, licence, réutilisation |
| PRD-16 Campagne | aucun modèle Campaign | aucun | ABSENT | Le projet est l'unité ; le mot campagne n'est qu'un libellé UI |

### 5.2 Exigences CDC non fonctionnelles

| Exigence | Composants | Tests | Statut | Limite |
|---|---|---|---|---|
| CDC-N-001 RBAC/isolation | auth.ts, use cases, repositories owned | auth-security.test.ts (IDOR), api.test.ts | CODÉ | Couverture admin partielle avant Mission 03 |
| CDC-N-002 Secrets serveur | logger redaction, .env ignoré, check-secrets | scripts/check-secrets.ps1 | CODÉ | Pas de coffre de secrets ; rotation manuelle |
| CDC-N-003 HTTPS/CSRF/SSRF/uploads | session.ts, origin.ts, CSRF double-submit | auth-security.test.ts | PARTIEL | Pas de HTTPS local ; pas d'uploads donc SSRF/uploads non couverts |
| CDC-N-004 Reprise/idempotence | outbox, durable store, worker | v1-01-d-durable.test.ts | PARTIEL | At-least-once documenté ; reprise moteur Hatchet NOT_RUN |
| CDC-N-005 Audit corrélé | AuditEvent, traceId/requestId | v1-01-f-hardening.test.ts | PARTIEL | provider_id/version prompt/coût réel incomplets |
| CDC-N-006 S3 et checksums | ArtifactStoragePort, S3Compatible, ArtifactObject | v1-01-e-storage.test.ts (2 SKIP sans E_S3_TEST) | PARTIEL | Validé sur rclone uniquement ; TLS/IAM/SSE non certifiés |
| CDC-N-007 Tests reproductibles | Vitest, Playwright, CI locale, workflow CI | campagnes H, présente campagne | PARTIEL | CI distante NOT_RUN ; Docker/Linux non exécuté avant Mission 05 |
| CDC-N-008 Accessibilité | aucune | aucun | ABSENT | Pas d'audit clavier/contrastes |
| CDC-N-009 Licences/provenance | guardrails agents, manifest artefacts | aucun test dédié | ABSENT | Pas de droits médias/voix/musique |
| CDC-N-010 Prompts/rollback | agents.ts, AgentConfigVersion | v1-01-b-agentic.test.ts | CODÉ | Audit et gel présents |
| CDC-N-011 Backup/rétention | backups PostgreSQL métadonnées (H), purge sessions | preuve manuelle H | PARTIEL | Restauration binaire S3 NOT_RUN ; rétention non fixée |
| CDC-N-012 Monitoring/alertes | opsMetrics, /api/ops/* | v1-01-f-hardening.test.ts | PARTIEL | Pas d'alerting, pas d'export OpenTelemetry |
| CDC-F-080 P1 | aucun | aucun | ABSENT | Différé |

### 5.3 Tests disponibles

| Suite | Contenu | Statut au gate H |
|---|---|---|
| tests/domain (11 fichiers) | invariants : identités, versions, checksums, approbation exacte, transfert, production, correction, agentique, pureté, contexte/brief, scènes/personnages | PASS |
| tests/api.test.ts | parcours API V0, health, auth, contexte, projet, brief, storyboard, durée, isolation | PASS |
| tests/v1/auth-security.test.ts | sessions, CSRF, cookies, invitations, RBAC, IDOR | PASS |
| tests/v1/infrastructure.test.ts | repositories, storage local, renderer, QA, orchestrateur local | PASS |
| tests/v1/v1-01-*.test.ts | application, agentique, durable, storage, hardening, certification G | PASS (2 SKIP S3) |
| tests/media.test.ts | 5 PNG + MP4 FFmpeg + QA réels | PASS |
| e2e/v0.spec.ts | verticale V0 complète : login → contexte → projet → brief → storyboard → production → approbation → correction → transfert mock → IDOR → logout | PASS ×2 (H) |

Référence : 173 PASS / 2 SKIP / 0 FAIL sur 21 fichiers au gate H (49ffc68), E2E 2 runs consécutifs PASS. La présente mission rejoue la campagne (section 6).

## 6. Vérifications exécutées dans cette mission

Section complétée par la campagne rejouée sur HEAD d07a02e (base de test uniquement, base démo préservée). Les résultats détaillés, commandes, codes de sortie et durées sont consignés ci-dessous.

Campagne exécutée le 2026-11-01 de 15:35:36 à 15:52:03 (Africa/Casablanca) par un vérificateur indépendant sur HEAD d07a02e9, base de test isolée vululu_v1_00_test en écriture, base vululu_v1_00 en SELECT COUNT read-only uniquement. Aucun secret affiché, aucun fichier du dépôt modifié par la campagne.

| # | Commande | Exit | Durée | Statut | Preuve / chiffres clés |
|---|---|---|---|---|---|
| 1 | pnpm install --frozen-lockfile | 0 | 10,5 s | PASS | lockfile figé ; warning pnpm build scripts ignorés (@hatchet-dev/typescript-sdk, protobufjs) |
| 2 | pnpm db:generate | 0 | 28,9 s | PASS | Prisma Client 6.19.3 généré |
| 3 | pnpm typecheck | 0 | 53,2 s | PASS | 7 workspaces, tous Done |
| 4 | LINT_STRICT=1 pnpm lint | 0 | 67,2 s | PASS | 0 erreur, strict actif (eslint.config.mjs:25) |
| 5 | pnpm build | 0 | 155,3 s | PASS | API tsc OK ; Next 16.4.2, 6 routes, 6/6 pages statiques |
| 6 | vitest run tests/domain | 0 | 19,0 s | PASS | 11 fichiers / 82 tests |
| 7 | vitest run tests/api.test.ts tests/v1 | 0 | 200,1 s | PASS | 9 fichiers / 90 passés + 2 skip |
| 8 | vitest run tests/media.test.ts | 0 | 75,9 s | PASS | 1 fichier / 1 test, FFmpeg réel, FFMPEG_PATH chargé sans affichage |
| 9 | prisma migrate status (base test) | 0 | 7,1 s | PASS | 12 migrations, Database schema is up to date |
| 10 | verify-foundation-docs.ps1 | 0 | 2,4 s | PASS | HASHES_OK=9 |
| 11 | check-secrets.ps1 | 0 | 15,9 s | PASS | 316 fichiers, aucun secret (arbre) |
| 12 | check-secrets.ps1 -History | 0 | 12,9 s | PASS | 316 fichiers + HISTORY_SCAN_REVS=45 |
| 13 | check-architecture-boundaries.ps1 | 0 | 2,5 s | PASS | Domain 20 fichiers/93 imports ; Application 16/53 |
| 14 | check-migrations.ps1 | 0 | 1,4 s | PASS | MIGRATIONS=12 |
| 15 | check-tracked-files.ps1 | 0 | 2,0 s | PASS | TRACKED_FILES=318, contenus=212 |
| 16a | seed base test | 0 | 3,5 s | PASS | bootstrap demo@vululu.local, mot de passe généré non affiché |
| 16b | Playwright e2e/v0.spec.ts | 0 | 150,0 s | PASS | 1/1 verticale V0 complète, 0 retry, PROJECT_ID cmvy0bqyc0008hakw66ihqmt8 |

Totaux : 21/21 fichiers Vitest PASS ; 173 tests PASS, 2 SKIP, 0 FAIL sur 175 ; E2E 1/1 PASS ; 12/12 migrations ; secrets arbre + historique PASS ; docs, frontières, migrations et fichiers suivis PASS.

Les 2 SKIP sont tests/v1/v1-01-e-storage.test.ts (describe.skipIf E_S3_TEST != 1) : aucun endpoint S3 n'est configuré. Ce ne sont ni des PASS ni des FAIL.

Isolation de la démo — comptages SELECT COUNT avant/après, identiques :

| Table | Avant | Après |
|---|---|---|
| User | 3 | 3 |
| BrandContext | 28 | 28 |
| Project | 36 | 36 |
| Scene | 160 | 160 |
| SceneVersion | 249 | 249 |
| Transfer | 44 | 44 |
| ProductionJob | 71 | 71 |
| JobRun | 64 | 64 |
| StepRun | 240 | 240 |
| AuditEvent | 285 | 285 |

La base de test a augmenté (User=176, BrandContext=95, Project=91, Scene=455, SceneVersion=53, Transfer=8, ProductionJob=17, JobRun=17, StepRun=68, AuditEvent=1512, migrations=12), ce qui confirme que les écritures ont bien atterri sur vululu_v1_00_test.

Ports et processus : 3001/3100/3101 sans listener à la fin ; aucun processus Node/API/Web/Playwright résiduel ; PostgreSQL portable 55432 et GUI DSH 3080 intacts ; listeners 5432/3002 préexistants hors campagne.

Git : HEAD et main inchangés (d07a02e9), aucun commit par le vérificateur. apps/web/next-env.d.ts a été modifié transitoirement par pnpm build puis réécrit à l'identique par le next dev du E2E (diff final vide), signalé et non restauré par le vérificateur.

Limitations et NOT_RUN : 2 tests S3 SKIP ; warning pnpm sur build scripts ignorés ; GitHub Actions distante NOT_RUN (aucun push) ; Docker/Linux non utilisé dans cette phase ; tests de charge NOT_RUN ; Hatchet réel NOT_RUN (pas de token/engine). Aucun succès fictif.

## 7. Commandes reproductibles

### 7.1 Prérequis

    Node.js >= 24, pnpm 10.6.1, PostgreSQL 17 sur 127.0.0.1:55432, FFmpeg, Playwright Chromium.
    Copier .env.example vers .env et renseigner localement (jamais commité).
    Bases : vululu_v1_00 (démo) et vululu_v1_00_test (tests). Ne jamais écrire dans la démo.

### 7.2 Installation, génération, qualité

    pnpm install --frozen-lockfile
    pnpm db:generate
    pnpm typecheck
    $env:LINT_STRICT='1'; pnpm lint
    pnpm build

### 7.3 Base de données

    pwsh -NoProfile -File scripts/dev-db.ps1 start     # démarre le cluster portable
    pwsh -NoProfile -File scripts/dev-db.ps1 status
    pwsh -NoProfile -File scripts/v1-db.ps1 status     # vérifie vululu_v1_00 sans écriture
    $env:DATABASE_URL='postgresql://vululu@127.0.0.1:55432/vululu_v1_00_test?schema=public'
    pnpm exec prisma migrate deploy --schema packages/db/prisma/schema.prisma
    pnpm exec prisma migrate status --schema packages/db/prisma/schema.prisma
    pnpm exec tsx packages/db/prisma/seed.ts            # exige V1_BOOTSTRAP_EMAIL/PASSWORD

### 7.4 Tests

    pnpm exec vitest run tests/domain
    pnpm exec vitest run tests/api.test.ts tests/v1
    pnpm exec vitest run tests/media.test.ts
    pnpm exec playwright test e2e/v0.spec.ts --reporter=list

### 7.5 API, worker, Web

    pnpm dev:api        # tsx watch apps/api/src/index.ts, port API_PORT (3001 par défaut)
    pnpm dev:web        # next dev -p 3100
    pnpm dev            # concurrently API + Web
    pnpm --filter @vululu/api worker   # worker Hatchet (exige ORCHESTRATOR_MODE=hatchet, token, engine)

### 7.6 Vérifications de gouvernance

    pwsh -NoProfile -File scripts/verify-foundation-docs.ps1
    pwsh -NoProfile -File scripts/check-secrets.ps1
    pwsh -NoProfile -File scripts/check-secrets.ps1 -History
    pwsh -NoProfile -File scripts/check-architecture-boundaries.ps1
    pwsh -NoProfile -File scripts/check-migrations.ps1
    pwsh -NoProfile -File scripts/check-tracked-files.ps1
    pwsh -NoProfile -File scripts/ci.ps1                # gate local miroir CI, options -TestSet/-Skip*

### 7.7 Notes d'exécution

- Le mode Hatchet exige ORCHESTRATOR_MODE=hatchet, HATCHET_CLIENT_TOKEN, HATCHET_CLIENT_HOST_PORT/API_URL et un engine v0.110.5 ; sans eux, le worker échoue et l'API reste en mode local.
- Le backend S3 exige ARTIFACT_STORAGE_BACKEND=s3, S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY ; S3_REQUIRE_TLS=1 impose https.
- Le code refuse actuellement toute base dont l'hôte n'est pas local (127.0.0.1/localhost/::1) : c'est un blocage volontaire pour le déploiement conteneurisé, à traiter par exception opt-in en Mission 05, pas par affaiblissement silencieux.
- APP_ENV=production exige APP_ORIGIN ou WEB_ORIGIN ; SESSION_SECRET >= 32 caractères.

## 8. Blocages, risques et préservation des données

| Élément | Statut | Conséquence |
|---|---|---|
| Base non locale refusée par env.ts | BLOQUANT DÉPLOIEMENT | Coolify/Docker ne peut pas démarrer l'API avec PostgreSQL conteneurisé sans exception explicite (Mission 05) |
| API écoute 127.0.0.1 en dur | BLOQUANT CONTENEUR | Non joignable depuis un autre conteneur (Mission 05) |
| Hatchet non actif par défaut | NON VALIDÉ | Le mode durable n'est pas le mode courant ; le mode local ne reprend pas après crash |
| S3 non certifié MinIO/TLS/IAM | NON VALIDÉ | Preuves limitées à rclone ; Mission 05 doit installer MinIO et rejouer les tests |
| Providers/Postiz mock | MOCK | Aucune génération IA réelle, aucune publication ; ne jamais présenter comme réel |
| Admin UI absente | ABSENT | Mission 03 |
| MCP absent | ABSENT | Hors périmètre immédiat |
| CI distante | NOT_RUN | Aucun push ; le workflow est prêt mais jamais exécuté |
| Docker/Linux runtime | DISPONIBLE MAINTENANT | Les campagnes H l'avaient NOT_RUN ; Mission 05 doit l'exploiter |
| Restauration binaire S3 | NOT_RUN | Mission 05 |
| Tests de charge | NOT_RUN | Mission 05, mesures de base seulement |
| V1.3 pack externe | NON INTÉGRÉ | Hors autorité documentaire ; décision séparée |
| Repo public éventuel | DÉCISION OUVERTE | Docs internes, .docx sources, e-mail personnel (audit H) |

Préservation des données : la base vululu_v1_00 n'a reçu aucune écriture ; les comptages read-only avant/après campagne sont consignés en section 6. Aucune migration destructive, aucune suppression, aucun reset.

## 9. Plan de changements borné COOLIFY + ADMIN + STUDIO

### 9.1 Mission 03 — Admin (préalable à Coolify)

Décision : routes /admin dans apps/web (ADR-0014), pas d'app séparée en V1 ; bascule apps/admin seulement si domaine/VPN distinct, release indépendante ou séparation réseau imposée. API additive : overview, users, projects, runs, run detail, audit, costs, routing decisions, runtime ; réutilisation stricte des routes existantes ; UI responsive avec shell, tables paginées, filtres, états, confirmations, badges MOCK/NOT_CONNECTED ; garde serveur super_admin ; tests Vitest RBAC/API + Playwright admin/V0.

### 9.2 Mission 05 — Orchestration et stockage préprod

- API_HOST configurable et exception opt-in ALLOW_NON_LOCAL_DATABASE=1 (APP_ENV=production) pour le conteneur.
- Dockerfiles API/Web, compose préprod : PostgreSQL 17, MinIO (HTTPS interne, bucket privé, user restreint), Hatchet sidecar embedded v0.110.5 (repli hatchet-lite), API, worker, web/admin ; healthchecks et volumes persistants.
- Crash tests : worker tué à 4 checkpoints, reprise, aucun doublon master/transfert ; outbox rejouée.
- Backup/restore PostgreSQL + objets S3, stack isolée, RPO 24 h / RTO 2 h staging.
- Admin : santé DB/stockage/workers/outbox/erreurs, logs trace_id/job_id/provider/model + mock, mesures de charge.
- Preuves PASS/FAIL/BLOCKED et runbook.

### 9.3 Coolify — planification seulement dans cette passe

Statut BLOCKED_PENDING_AUTHORIZATION. Prérequis : VPS + accès + version Coolify + ressources/services/volumes ; DNS de test réellement fourni ; autorisation distante séparée ; secrets injectés par Coolify (noms seulement, jamais dans le chat). Livrable : docs/reports/COOLIFY_STAGING_REPORT.md avec inventaire, ordre de déploiement, healthchecks, smoke tests, preuves, rollback et corrections exactes. Aucun déploiement public production.

### 9.4 STUDIO (UI) — différé

Le studio Next existant couvre la verticale V0. L'enrichissement UI (comparaison de versions, commentaires par scène, audio, campagnes, bibliothèque) dépend des Missions 02/04 non demandées ici. La baseline fixe les écarts ; aucune implémentation Studio dans cette passe.

## 10. Décisions attendues

| ID | Décision | Défaut proposé |
|---|---|---|
| D-01 | Valider l'ordre M01 → M03 → M05 → Coolify | oui |
| D-02 | Admin /admin dans apps/web vs apps/admin séparée | /admin dans apps/web (ADR-0014) |
| D-03 | S3 préprod = MinIO + TLS interne | oui |
| D-04 | Hatchet préprod = sidecar embedded v0.110.5 | oui, repli hatchet-lite |
| D-05 | RPO 24 h / RTO 2 h staging | oui |
| D-06 | Exception ALLOW_NON_LOCAL_DATABASE opt-in | oui |
| D-07 | VPS/Coolify : accès, DNS, autorisation séparée | à fournir avant Mission 05/Coolify |
| D-08 | Pack V1.3 externe | hors périmètre immédiat |
| D-09 | Push/merge/CI distante | interdits jusqu'à autorisation explicite |
| D-10 | Visibilité dépôt/docs/.docx | décision humaine existante |
| D-11 | Provider S3 de production | ultérieur |
| D-12 | Réaligner README/ROADMAP/certification sur main | lot docs dédié après Mission 05 |

## 11. Annexes

### 11.1 SHA de référence

| Référence | SHA |
|---|---|
| HEAD de départ | d07a02e9a91cb89b796655eb72ede5478caa2479 |
| origin/main au moment de l'audit | d07a02e9a91cb89b796655eb72ede5478caa2479 |
| Base certifiée G (docs) | 0e79c08 |
| Campagne H (code) | 49ffc68 |
| HEAD de fin de cette mission | commit docs de cette mission (git log) |

### 11.2 Inventaire des migrations

20261022184734_init ; 20261023082309_scene_durations_approval_invalidation ; 20261023085719_brief_revisions ; 20261023124017_v1_00_foundation ; 20261023160509_v1_01_a_snapshot_versioning ; 20261023170000_v1_01_a1_active_run_index ; 20261023173000_v1_01_a1_run_integrity ; 20261023183000_v1_01_b_agentic_capabilities ; 20261024180000_v1_01_d_durable_orchestration ; 20261024190000_v1_01_d_active_run_scope ; 20261025100000_v1_01_e_artifact_storage ; 20261025120000_v1_01_f_hardening.

### 11.3 Inventaire des tests

Deux tests S3 conditionnels (describe.skipIf(E_S3_TEST != 1)) ne sont ni PASS ni FAIL : SKIP tant qu'aucun endpoint S3 n'est configuré. Toute affirmation de stockage S3 certifié est donc interdite avant la Mission 05.

### 11.4 Références

- docs/01_PRD_V1.md, docs/02_CAHIER_DES_CHARGES_V1.md, docs/03_ARCHITECTURE_V1.md, docs/11_BACKLOG.md
- docs/backlog/ROADMAP_V1.md, docs/backlog/P0_0_AUDIT_FONDATIONS.md
- docs/certification/V1_FINAL_CERTIFICATION.md, V1_CAPABILITIES_MATRIX.md, V1_TECHNICAL_DEBT_REGISTER.md, V1_DEPLOYMENT_READINESS.md, V1_GIT_REVIEW_HANDOFF.md
- docs/review/V1_LOCAL_VERIFICATION.md, V1_PUSH_READINESS.md, V1_GIT_HISTORY_AUDIT.md, V1_PRE_PUSH_SECURITY_AUDIT.md, V1_DIFF_REVIEW.md, V1_CI_WORKFLOW_REVIEW.md
- docs/foundations/01_TRACEABILITY_MATRIX.md, docs/10_ACCEPTANCE_TESTS.md
- docs/execution/V1_01_D_OUTBOX_RECOVERY.md, V1_01_E_HATCHET_INTEGRATION.md, V1_01_E_STORAGE_ARCHITECTURE.md, V1_01_E_FINALIZATION_RECOVERY.md, V1_01_E_TEST_EVIDENCE.md, V1_01_C_OPERATIONS.md
