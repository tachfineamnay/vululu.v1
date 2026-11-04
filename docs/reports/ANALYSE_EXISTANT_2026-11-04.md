# Vululu AI — Rapport sur l’existant

- Date : 2026-11-04.
- Périmètre : dépôt local, branche `main`, commit `bb0bc3a`.
- Méthode : lecture du corpus, inspection des points de composition et des fonctions principales, inventaire Git, contrôles locaux ciblés, confrontation aux rapports de recette.
- Nature : constat technique et produit ; aucune certification complète ni autorisation de déploiement.

## 1. Diagnostic

**Vululu AI dispose d’un socle applicatif V1 et d’un parcours de démonstration local complet autour de la vidéo déterministe. Le studio de production IA décrit par le PRD reste partiellement construit.**

L’existant permet de travailler sur des contextes, des projets, des briefs et des storyboards ; de produire des images de scènes et un master MP4 ; de corriger une scène ; de comparer des versions ; de contrôler techniquement le résultat ; puis d’approuver une version exacte et de simuler son transfert vers Postiz.

Les fondations de versionnement, d’isolation, d’administration et de traçabilité sont substantielles. Les limites principales concernent les fournisseurs IA réels, l’assistance conversationnelle réelle, les formats avancés, l’audio, les actifs de marque, les campagnes, MCP et la validation opérationnelle de l’infrastructure.

Le dernier rapport de recette présent dans le dépôt, daté du 2026-11-01, prononce un **GO technique local** et un **NO-GO staging**. La présente analyse ne remplace pas cette décision et n’a pas vérifié de service distant.

## 2. Structure et stack constatées

| Élément | Existant |
|---|---|
| Organisation | Monorepo pnpm, TypeScript, Node >= 24 |
| Interface | Next.js 16.4.2, React 19 ; Studio et administration dans `apps/web` |
| API | Fastify 5.12.7, validation Zod, sessions serveur |
| Domaine | `packages/domain` : identités, contextes, briefs, scènes, personnages, artefacts, approbations, transferts, capacités et états |
| Application | `packages/application` : ports, cas d’usage et erreurs applicatives |
| Persistance | PostgreSQL, Prisma 6.19.3, 12 répertoires de migrations |
| Contrats | `packages/contracts` |
| Média | `packages/media`, rendu Sharp et assemblage FFmpeg |
| Orchestration | Exécuteur local et chemin alternatif Hatchet avec worker/outbox |
| Stockage | Adaptateurs système de fichiers local et S3-compatible |
| Qualité | Vitest, Playwright, ESLint, TypeScript, scripts PowerShell, workflow GitHub Actions |
| Exploitation | Dockerfiles, Compose de préproduction/Coolify, sauvegarde, restauration et réconciliation |

L’inventaire Git compte **188 fichiers `.ts`/`.tsx`** et **26 fichiers de tests dans `tests` et `e2e`**. Ces volumes décrivent la structure, pas un taux de couverture.

## 3. Couverture fonctionnelle

« Présent » signifie identifié dans le code. Les validations historiques sont séparées des tests rejoués pendant cette analyse.

| Fonction | État constaté | Références et limites |
|---|---|---|
| Invitations, activation, sessions, rôles | Présent ; preuves locales historiques | PRD-01, CDC-F-001/002/003 ; middleware serveur et tests de sécurité |
| Contextes de marque | Partiel | PRD-02, CDC-F-010/011/012 ; persistance et révisions présentes, analyse assistée et ingestion complète absentes |
| Projets et briefs | Présent, parcours simplifié | PRD-03, CDC-F-024 ; briefs révisés et checksummés |
| Réseaux et formats | Partiel | CDC-F-020 ; profils déclarés, contrôle complet des ratios et intention sponsorisée manquants selon la recette |
| Storyboard | Déterministe | PRD-06, CDC-F-030 ; cinq gabarits de scènes fixes et personnage par défaut |
| Conversation | Réponses programmées | Les réponses assistant dépendent de l’état du projet, sans appel LLM dans le cas d’usage inspecté |
| Production média | Rendu technique réel, génération IA simulée | Cinq scènes PNG 1080×1920 et assemblage MP4 ; adaptateur explicitement déterministe |
| Affiche, carrousel, motion, Reel dédié | Déclarés, non implémentés comme pipelines distincts | PRD-04 ; `FORMAT_CATALOG` distingue explicitement disponibilité et déclaration |
| Voix, musique, mix | Absents | PRD-05, CDC-F-021/022/023 ; piste silencieuse dans le parcours décrit |
| Correction ciblée et versions | Présent | PRD-08/09, CDC-F-040/041/042 ; identifiants stables, nouvelle version, conservation des versions précédentes |
| QA technique et approbation exacte | Présent | CDC-F-050/051 ; dimensions/codecs/durée/checksums et approbation liée à une version |
| QA de marque et licences réelles | Incomplet | PRD-14, CDC-N-009 ; ne pas assimiler QA technique à une qualification éditoriale et juridique |
| Agents et fournisseurs | Registre et configurations présents ; exécution MOCK | PRD-07/11, CDC-F-031/032/033 ; promotion, rollback, routage et fallback |
| Coûts | Simulation et règles applicatives | PRD-13, CDC-F-061 ; pas de facturation fournisseur réelle qualifiée |
| Administration | Interface et API présentes | Utilisateurs/invitations, agents, fournisseurs, jobs, audit, coûts, réglages |
| Actifs de marque | Écran de contrat sans backend | PRD-15, CDC-F-013 ; aucun upload ni bibliothèque utilisable dans l’écran inspecté |
| Campagnes | Absentes | PRD-16, CDC-F-013 ; pas de modèle Campaign dans le schéma inspecté |
| Postiz | MOCK | PRD-10, CDC-F-052 ; acquittement local simulé, aucun transfert externe réel |
| MCP | Absent | PRD-12, CDC-F-070/071 ; serveur, authentification/scopes et tests IDE/cloud à livrer |

**Attention au sens du mot “agentique” :** les registres et mécanismes de routage constituent une fondation réelle, mais le storyboard fixe et les réponses programmées ne démontrent pas encore une direction créative pilotée par LLM.

## 4. Architecture et intégrité

Les couches sont matérialisées : le conteneur applicatif compose des cas d’usage avec des adaptateurs Prisma, média, stockage, orchestration et Postiz. Le domaine est isolé des SDK fournisseurs et de l’infrastructure ; les tests de pureté du domaine font partie des 82 tests rejoués avec succès.

Le modèle de données comporte notamment ContextRevision, BriefRevision, SceneVersion, CharacterVersion, JobRun, StepRun, ArtifactVersion, Approval, Transfer, CostEvent et AuditEvent. Les composants durables ajoutent OrchestrationOutbox, RunStateEvent, RunRoutingSnapshot et WorkerHeartbeat.

Les invariants importants sont représentés dans le code et les tests : snapshots figés, checksums, versions nouvelles, approbation exacte et accès aux ressources par propriétaire. Leur présence constitue un bon point de départ ; elle ne remplace pas les campagnes d’intégration et de concurrence.

Deux chemins d’exécution coexistent :

- **Local par défaut** : `LocalProductionExecutor`, dans le processus applicatif. Ce mode ne doit pas être présenté comme une exécution durable après crash.
- **Hatchet sur configuration explicite** : orchestration via outbox et worker. Le pipeline définit validation du snapshot, résolution des capacités, rendu, assemblage, QA, finalisation, attente d’approbation et transfert MOCK.

Le chemin Hatchet est donc codé. Sa validation complète en environnement conteneurisé et après redémarrage moteur reste un point ouvert dans les derniers rapports.

Le stockage expose bien des adaptateurs local/S3 et un registre permettant de relire des versions historiques sur leur backend d’origine. Cela ne signifie pas que la bibliothèque d’actifs utilisateur soit implémentée : ce sont deux périmètres distincts.

## 5. Sécurité et exploitation

Les mécanismes inspectés comprennent sessions persistantes, contrôles de rôle serveur, protection CSRF sur les mutations, contrôle d’origine, filtrage par propriétaire dans les cas d’usage, audit, identifiants de trace et limitation de débit.

Les tests RBAC/IDOR et les E2E d’administration existent ; leurs résultats récents sont consignés dans la recette locale. Ils n’ont pas été rejoués pendant cette analyse. Aucun audit de pénétration ni contrôle exhaustif de toutes les routes n’est revendiqué.

Le packaging d’exploitation est fourni : Dockerfiles, Compose, runbooks, procédures de migrations, sauvegarde/restauration et rollback. Selon les preuves datées du 2026-11-01 :

- aucun staging Coolify n’était effectivement déployé et vérifiable ;
- les builds/runtime Docker étaient bloqués par un disque Docker Desktop en lecture seule ;
- des preuves locales de stockage S3/TLS et sauvegarde/restauration étaient disponibles ;
- le runtime Hatchet complet, le redémarrage des conteneurs et le rollback staging restaient non validés.

Ces constats sont historiques. L’état actuel de Docker, d’un éventuel VPS et de Coolify n’a pas été sondé pendant cette mission.

## 6. Vérifications du 2026-11-04

| Commande ou contrôle | Résultat |
|---|---|
| `git status --short` au départ | Arbre propre |
| `git branch --show-current` | `main` |
| `git log -5` | HEAD `bb0bc3a`, dernier commit daté du 2026-11-01 |
| `pnpm exec vitest run tests/domain` | **PASS : 82 tests, 11 fichiers** |
| `pnpm typecheck` | **PASS**, code de sortie 0 |
| `$env:LINT_STRICT='1'; pnpm lint` | **PASS**, code de sortie 0 |
| `pwsh -NoProfile -File scripts/check-architecture-boundaries.ps1` | **PASS** : 20 fichiers domaine, 17 fichiers application |
| `pwsh -NoProfile -File scripts/check-secrets.ps1` | **PASS : 382 fichiers scannés, aucune détection** avant ajout du rapport |
| `pwsh -NoProfile -File scripts/verify-foundation-docs.ps1` | **FAIL : 9 empreintes correctes ; fichier interdit signalé** |
| `git diff --check` avant et après rédaction | PASS ; rapport ajouté contrôlé séparément, aucune espace finale |
| Suite API/intégration/média, E2E, build | **NOT_RUN** pendant cette analyse ; hors campagne ciblée sans démarrage d’infrastructure |
| CI distante, charge, reprise Hatchet, validation staging | **NOT_RUN** pendant cette analyse |
| Scan de l’historique Git | **NOT_RUN** ; seul le scan courant a été exécuté |

Le contrôle documentaire refuse `infra/coolify/.env.coolify.example` avec `FORBIDDEN_TRACKED_SECRET`. Son prédicat accepte uniquement les noms terminant par `.env.example` ; le nom actuel du modèle Coolify est donc refusé. **Ce résultat porte sur une convention de nommage et ne prouve pas la présence d’un secret.** Le scan de contenu, distinct, passe. Aucun correctif n’a été appliqué dans cette mission d’analyse.

Le workflow GitHub Actions appelle ce contrôle documentaire : cet échec local identifie donc un blocage concret du contrôle correspondant, à résoudre avant d’annoncer une CI entièrement verte.

La recette historique du 2026-11-01 mentionne **188 tests PASS, 2 SKIP et 3 E2E PASS**. Ces nombres sont des résultats consignés dans le dépôt, pas des résultats obtenus à nouveau aujourd’hui.

## 7. Écarts et risques prioritaires

| Priorité | Constat | Conséquence |
|---|---|---|
| Haute | README et roadmap décrivent un état ancien ; la roadmap affirme encore l’absence d’application | Mauvaise lecture de l’avancement, risque de recommencer des travaux existants |
| Haute | Fournisseurs IA, dialogue et coûts réels non qualifiés | Le parcours démontre une chaîne logicielle, pas encore la valeur créative attendue du studio IA |
| Haute | Postiz réel et MCP absents | Deux engagements V1 restent à livrer et à tester |
| Haute | Durabilité complète et staging non validés dans les dernières preuves | Pas de base suffisante pour déclarer le système exploitable en production |
| Haute | Audio, droits, bibliothèque et campagnes manquants | Plusieurs exigences P0 du CDC ne sont pas satisfaites |
| Moyenne | Contrat `CapabilityResult` impose encore `mock: true` | L’intégration réelle exige une évolution explicite du contrat et de ses tests |
| Moyenne | Contrôle documentaire en échec sur le modèle Coolify | Gate qualité reproductiblement bloquée |
| Moyenne | Index ADR arrêté à 0013 alors que 0014/0015 existent | Décisions récentes difficiles à retrouver et statuts à réconcilier |

Les classements P1/P2 du registre de dette technique concernent sa certification locale. Ils ne changent pas la priorité **P0** attribuée par le CDC à MCP, l’audio ou aux autres exigences produit. Une absence acceptée dans un lot ne vaut pas retrait du périmètre V1.

Conformément à AGENTS.md, les contradictions documentaires sont signalées ici sans arbitrage silencieux. Aucun document fondateur, ADR accepté, statut de roadmap ou contrat n’est modifié.

## 8. Suite recommandée, sans exécution dans cette mission

1. **Réconcilier le statut documentaire** par un état de référence daté et une décision explicite : avancement réel, correspondance lots historiques/P0, index ADR, exigences encore ouvertes. Préserver les imports verbatim.
2. **Rétablir les contrôles qualité** : convention du modèle Coolify, contrôle documentaire, puis campagne locale complète et CI distante sur autorisation adaptée.
3. **Choisir le prochain objectif** : valeur créative réelle ou validation du socle staging. Ce choix doit tenir compte du budget et des critères de recette ; le présent rapport ne donne aucun GO de déploiement.
4. **Pour le premier fournisseur réel** : faire évoluer le contrat MOCK explicitement, mesurer usage/coût/latence, appliquer les plafonds, conserver provenance, erreurs et idempotence, puis démontrer un résultat utile de bout en bout.
5. **Clore les exigences V1 restantes par lots** : formats/audio/droits, actifs/campagnes, Postiz réel et MCP. Chaque clôture doit reposer sur des preuves liées aux IDs PRD/CDC.

Le besoin immédiat est de transformer les fondations présentes en capacités métier réelles et en preuves d’exploitation, tout en conservant les invariants déjà construits.

## 9. Sources principales et limites

Sources du dépôt :

- `README.md`, `docs/README.md`, PRD V1.2, CDC V1.2, architecture, backlog, roadmap et rapport d’inauguration.
- ADR-0001 à ADR-0015 et documents de certification.
- `docs/reports/VULULU_STAGING_ACCEPTANCE.md`, `COOLIFY_STAGING_REPORT.md` et rapports de préproduction.
- `apps/api/src/application/container.ts`, `server.ts`, `auth.ts`, `worker/pipeline.ts`.
- Cas d’usage storyboard/messages/production, ports, adaptateurs déterministes et Postiz MOCK.
- `apps/web/lib/studio.ts`, écran actifs, schéma Prisma, tests et scripts de contrôle.

L’analyse porte sur le checkout local, sans synchronisation distante. Elle ne certifie ni l’état de GitHub ni la visibilité du dépôt, les dépendances vis-à-vis de vulnérabilités connues, la qualité visuelle du Studio ou la sécurité exhaustive de l’application. Aucun graphe Graphify préexistant n’était disponible ; aucune génération de graphe n’a été ajoutée au dépôt.

Seul ce nouveau rapport est ajouté. Aucun code métier, spécification ou infrastructure n’est modifié ; aucun commit, push, déploiement, compte externe ou appel payant n’est effectué. Aucune migration n’est requise. Le retrait de ce rapport constitue le rollback documentaire, à réaliser uniquement sur demande.
