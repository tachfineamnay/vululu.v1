# V0 FINAL AUDIT — VULULU AI

- **Date** : 2026-10-23
- **Auditeur** : Principal Engineer + QA Auditor (Lead)
- **Branche** : v0-fullstack-sprint
- **Commit de code audité** : de92e24, complété par 5d2042a
- **Base** : 0bb1bb610bf9b9b377ab70feca2450d10f890d70
- **main / origin-main** : 69c6549ec6d8dd69dbfa7c41c1f1b8a08edaec50
- **Périmètre** : prototype V0, 12 fonctions, sécurité, dette structurelle, préparation V1
- **Méthode** : lecture du corpus, inspection du code, tests réels, API réelle, PostgreSQL local, FFprobe, checksums, IDOR, redémarrage, scan de secrets

## 1. Verdict exécutif

**V0 fonctionnelle : PASS après corrections.** Les 12 fonctions demandées fonctionnent réellement sur la branche, avec des preuves reproductibles. Les défauts bloquants trouvés ont été corrigés et testés.

**Démarrage V1 : NO-GO pour une extension directe du code V0.** La V0 est une tranche verticale de démonstration, pas le socle V1. Un démarrage V1 est autorisé uniquement via un lot V1-00 de fondation, avec décisions et portes explicites. Voir V1_TECHNICAL_GAPS.md et V1_IMPLEMENTATION_BASELINE.md.

## 2. État réel vérifié

- Branche v0-fullstack-sprint, worktree propre avant les livrables de revue.
- 5 commits au-dessus de mission-01-foundations, dont de92e24 et 5d2042a.
- main et origin/main inchangés à 69c6549. Aucun push, merge ou déploiement.
- Services locaux : API 127.0.0.1:3001, web 127.0.0.1:3000, PostgreSQL 55432.
- Node 24.21.0, pnpm 10.6.1, PostgreSQL 17.2, FFmpeg/FFprobe 9.0.2, Playwright 1.64.1.
- Aucun secret versionné ; .env, data, .v0 et node_modules sont ignorés.

## 3. Sources documentaires lues

- AGENTS.md, README.md, docs/README.md.
- docs/01_PRD_V1.md, docs/02_CAHIER_DES_CHARGES_V1.md, docs/03_ARCHITECTURE_V1.md.
- ADR-0001 à ADR-0005 et docs/adr/README.md.
- docs/11_BACKLOG.md, docs/backlog/ROADMAP_V1.md.
- docs/10_ACCEPTANCE_TESTS.md, docs/execution/V0_24H_PROGRESS.md, docs/execution/V0_RUNBOOK.md.
- Code apps/api, apps/web, packages/contracts, packages/db, packages/media, tests, e2e, scripts.

## 4. Contradictions et écarts documentaires

| Constat | Impact | Traitement |
|---|---|---|
| AGENTS.md et ROADMAP_V1 interdisent du code métier avant P0-0 | La V0 a été une exception de prototype explicitement autorisée, pas une clôture P0-0 | Documenté dans la baseline V1 ; aucune revendication de gate P0-0 |
| README annonce encore « aucune application exécutable » | Documentation obsolète | README corrigé dans le commit de revue |
| docs/README dit que doc 10 reste à produire | doc 10 existe mais tous ses tests sont SPECIFIED/NOT_RUN | Précisé dans les revues ; doc 10 n'est pas une preuve V0 |
| PRD/CDC exigent BriefRevision, révisions de contexte, Hatchet, S3, providers, MCP, Postiz adapter | La V0 ne les fournit pas, sauf BriefRevision ajoutée pendant l'audit | Classé en gaps V1 bloquants |
| V0 se dit « brief versionné » | Avant audit : simple compteur version sur une ligne écrasée, sans historique | Corrigé : BriefRevision immuable + checksum + historique API |

## 5. Matrice fonctionnelle V0

| # | Fonction | Statut | Nature | Preuve |
|---|---|---|---|---|
| 1 | Authentification locale | PASS | REAL | Login/logout, 401 sans session, cookie HttpOnly, tests API/E2E |
| 2 | Contexte de marque persistant | PASS | REAL | Création, lecture, persistance après redémarrage API, isolation |
| 3 | Création de projet | PASS | REAL | API + UI E2E, propriétaire vérifié |
| 4 | Conversation Vululu | PASS | MOCK | Messages user/assistant persistés ; réponse scriptée, aucun LLM |
| 5 | Brief versionné | PASS | REAL | BriefRevision v1/v2, checksums distincts, contenu v1 conservé |
| 6 | Storyboard 5 scènes | PASS | REAL | SCENE-001 à SCENE-005, IDs stables |
| 7 | Production PNG | PASS | REAL | 5 PNG 1080x1920, hashes SHA256 vérifiés, FFprobe |
| 8 | Production MP4 | PASS | REAL | H.264 1080x1920 yuv420p + AAC, 9,97 s et 49,97 s, FFprobe |
| 9 | Correction SCENE-003 | PASS | REAL | SCENE-003 v2, autres scènes inchangées, IDs scène conservés |
| 10 | Conservation des versions | PASS | REAL | scène v1/v2, master v1/v2, fichiers et checksums conservés |
| 11 | QA et approbation exacte | PASS | REAL | 10 contrôles QA, checksum réel, refus mauvais checksum et version stale |
| 12 | Transfert Postiz simulé | PASS | MOCK | acknowledged, provider postiz-mock, aucun réseau, invalidation testée |

## 6. Défauts bloquants corrigés pendant l'audit

| ID | Défaut | Preuve avant | Correction | Preuve après |
|---|---|---|---|---|
| A-01 | Logout 500 et session non effacée | POST logout avec Content-Type JSON vide renvoyait 500 | Parseur JSON tolérant au corps vide, client sans Content-Type sans body, gestion 4xx | Logout 200, cookie session= vide, /me 401, tests |
| A-02 | JSON malformé renvoyait 500 | POST avec corps invalide -> 500 internal_error | Gestionnaire d'erreurs Fastify 4xx -> 400 | Test API 400 |
| A-03 | Brief non versionné réellement | v2 écrasait v1 ; aucune trace de v1 | Table BriefRevision, checksum SHA256, transaction, backfill 10 briefs | v1 Objectif A et v2 Objectif B conservés, checksums distincts |
| A-04 | QA de correction aveugle | largeur/hauteur 1080x1920 codées en dur | Lecture Sharp réelle + hash de chaque PNG + checksum master | QA 10 contrôles ; test de falsification FAIL |
| A-05 | Secret de session par défaut connu | fallback dev-only si SESSION_SECRET absent | SESSION_SECRET obligatoire, 32 caractères minimum | Démarrage sans secret refusé |
| A-06 | Garde base locale contournable | includes(localhost) acceptait un hostname trompeur | URL parsée, hostname exact 127.0.0.1, localhost ou ::1 | Garde stricte dans env.ts |
| A-07 | Fallback FFmpeg Playwright minimal | binaire sans PNG/libx264 utilisé silencieusement | FFMPEG_PATH obligatoire, binaire complet requis | Tests média passent avec FFmpeg 9.0.2 complet |
| A-08 | Exposition userId dans contexts/projects | listContexts et listProjects renvoyaient userId | Sélecteurs et mapping public | Réponses sans userId |
| A-09 | Code mort et dépendance inutilisée | getContext, artifactRelative, contrats web, ffmpeg-static allowlist | Suppression | Typecheck et build passent |
| A-10 | Checksums non contrôlés par verify-v0 | vérifiait l'existence, pas le hash | SHA256 comparé pour chaque PNG et master | 24 contrôles PASS |

## 7. Défauts ouverts — bloquants V1

| ID | Sévérité | Constat | Conséquence V1 |
|---|---|---|---|
| G-01 | Haute | Sessions stateless : un ancien cookie reste valide après logout | Pas de révocation ; vol de cookie = accès jusqu'à expiration |
| G-02 | Haute | Pas d'invitations, pas de RBAC admin, rôle user non appliqué | PRD-01, PRD-11, CDC-F-001/003 non satisfaits |
| G-03 | Haute | Pas de séparation Domain/Application/Infrastructure ni de ports | ADR-0001 non satisfait ; couplage Prisma/FFmpeg/Postiz |
| G-04 | Haute | Vululu scripté, aucun registre provider, routeur, fallback, budget | PRD-06/07/13 et CDC-F-030 à 033 non satisfaits |
| G-05 | Haute | Jobs in-process sans reprise, step, retry, idempotence | ADR-0003 et CDC-F-043/CDC-N-004 non satisfaits |
| G-06 | Haute | Stockage local, pas de S3, pas d'URL signées | ADR-0002 et CDC-N-006 non satisfaits |
| G-07 | Haute | Pas de MCP | ADR-0004 et PRD-12/CDC-F-070 non satisfaits |
| G-08 | Haute | Postiz mock dans le service, pas d'adaptateur idempotent | ADR-0005 et CDC-F-051/052 partiellement satisfaits |
| G-09 | Haute | Contexte non révisé/snapshoté, Character sans version, pas de campagne/asset | PRD-02/15/16, CDC-F-010/013/040 non satisfaits |
| G-10 | Haute | Pas d'AuditEvent, CostEvent, JobRun/StepRun, trace_id | CDC-N-005/012, PRD-13 non satisfaits |
| G-11 | Haute | Tous les tests de docs/10 sont NOT_RUN ; pas de CI | CDC-N-007 et recette V1 non satisfaits |
| G-12 | Moyenne | Cookie Secure seulement si APP_ENV=production, HTTP local, pas de CSRF, pas de rate limit | CDC-N-003 non satisfait hors local |
| G-13 | Moyenne | Re-production régénère toutes les scènes et crée des versions en double | Idempotence et coûts V1 |
| G-14 | Moyenne | Polling UI 1,5 s permanent, payload projet complet, pas de pagination | Performance et charge V1 |
| G-15 | Moyenne | Image de scène toujours dernière version, pas de preview par version de scène | PRD-09 comparaison de versions incomplète |
| G-16 | Basse | db:migrate nomme toujours init, next-env.d.ts généré change selon dev/build | Reproductibilité CI |
| G-17 | Basse | getQa exposé mais non utilisé par l'UI ; E2E crée des données persistantes | Dette de test/UX |

## 8. Audit structurel par thème

### Code mort et fonctionnalités fictives
- getContext et artifactRelative supprimés.
- Brief « versionné » était fictif ; corrigé.
- Vululu, Postiz et l'audio restent MOCK, explicitement étiquetés.
- getQa reste une API valide mais sans consommateur UI.

### Frontend/backend
- Types web dupliqués au lieu d'importer les contrats partagés ; dépendance web inutile supprimée.
- Bundle projet unique pour dashboard/studio, sans pagination.
- Aucune divergence d'ID constatée ; E2E vérifie les IDs scène et personnage.

### Sessions et permissions
- RBAC réel : filtrage par propriétaire sur projets, contextes, médias, QA, approbation et transfert.
- Tests IDOR : projet, image, master, QA, transfert renvoient 404 ; contexte étranger refusé.
- Aucun rôle admin/invitation ; aucune révocation de session ; logout ne révoque pas un cookie déjà émis.
- Rejeu d'un ancien cookie après logout : 200, utilisateur demo. Risque documenté G-01.

### Couplage aux mocks
- Le service projects contient buildVululuReply.
- Le service production contient Postiz mock et l'assemblage média direct.
- Aucune interface provider, orchestrateur, stockage ou handoff.
- Les mocks sont honnêtes, mais non remplaçables sans refactor.

### Dépendances
- Suppression de @vululu/contracts côté web et de ffmpeg-static de l'allowlist.
- Les dépendances restantes sont utilisées.
- sharp, Prisma, Fastify, Next, Zod, bcryptjs, Playwright, Vitest sont cohérents avec V0.

### Erreurs
- 4xx Fastify et JSON malformé corrigés.
- Les erreurs métier utilisent HttpError.
- Pas de codes d'erreur versionnés, pas de correlation id, pas de logs structurés.
- Les erreurs média exposent un message FFmpeg tronqué dans le job.

### Performance
- Production 50 s : environ 34 s pour le test média complet, acceptable en local.
- Polling permanent et chargement complet du projet à chaque tick.
- Pas de pagination, pas de cache, pas de file de jobs.
- PostgreSQL local sans index secondaires sur messages/versions au-delà des clés.

### Secrets
- Scan de 93 fichiers versionnables : 0 secret.
- .env, artefacts et données locales ignorés.
- SESSION_SECRET obligatoire, aucune valeur par défaut.
- Aucun secret affiché dans les réponses d'erreur.

### Obstacles aux providers IA réels
- Pas de contrat provider, registre, capacité, coût, latence, santé, fallback.
- Pas de capture de provenance provider/modèle/version.
- Pas de stockage objet pour les binaires.
- Pas de snapshots de contexte/brief/agent/provider au lancement.
- Pas de budget ni de suivi de coût.
- Pas de QA sur texte/droits/audio.
- Ces obstacles sont détaillés dans V1_TECHNICAL_GAPS.md.

## 9. Corrections et tests

- Commit de correction : de92e24.
- Commit de test d'invariants : 5d2042a.
- Tests unitaires/intégration : 11 PASS (10 API + 1 média).
- E2E : 1 PASS, 47,4 s, projet cmvkrhp730007habgpols3mq5.
- verify-v0 : 24 contrôles PASS sur le smoke et sur la cible 50 s.
- typecheck : PASS, 5 projets.
- build : PASS, API + Next production.
- scan secrets : PASS, 93 fichiers.
- fondation documentaire : PASS, 9 hashes.
- Redémarrage API : projet conservé (transferred, 5 scènes, master v2), 12 contextes et 15 projets persistants.

## 10. Risques résiduels

- La V0 n'est pas déployable en production : sessions stateless, HTTP local, pas de CSRF/rate limit/HTTPS.
- Les mocks ne prouvent pas les providers réels ni Postiz réel.
- Les tests de recette V1 ne sont pas exécutés.
- Aucun backup/restauration/retention.
- Les artefacts locaux ne sont pas durables ni partageables entre workers.
- Les données de démonstration persistent dans la base locale ; l'E2E n'isole pas une base dédiée.

## 11. Décision

- **V0** : acceptée comme prototype fonctionnel de référence, avec corrections.
- **V1** : ne pas démarrer les fonctionnalités V1 en prolongeant directement ce code.
- **Prochaine étape autorisée** : lot V1-00 de fondation et durcissement, sous décisions explicites (voir V1_IMPLEMENTATION_BASELINE.md).
- Aucun merge dans main, push ou déploiement.

## 12. Reproductibilité minimale

    pnpm typecheck
    pnpm test
    pnpm build
    pnpm exec playwright test e2e/v0.spec.ts
    pwsh -NoProfile -File scripts/verify-v0.ps1 -ProjectId cmvkrhp730007habgpols3mq5
    pwsh -NoProfile -File scripts/check-secrets.ps1
    pwsh -NoProfile -File scripts/verify-foundation-docs.ps1
