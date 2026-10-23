# V1 IMPLEMENTATION BASELINE — VULULU AI

- **Date** : 2026-10-23
- **Statut** : proposition de base de travail, non un GO de production
- **Baseline auditée** : v0-fullstack-sprint, code de92e24 + 5d2042a
- **Référence cible** : PRD V1.2, CDC V1.2, architecture V1, ADR-0001 à ADR-0005
- **Décision** : la V1 ne doit pas être construite en prolongeant directement les services V0. Elle démarre par V1-00.

## 1. Principe de départ

La V0 est un prototype vertical de référence. Elle est conservée pour :

- les invariants métier déjà prouvés ;
- les preuves médias et la QA ;
- les scripts de vérification et le runbook ;
- une démonstration locale reproductible.

La V1 est construite comme un nouveau socle, en réutilisant les décisions et les scénarios, pas en empilant des fonctionnalités sur les services couplés de la V0.

## 2. Stratégie de branches

- Ne pas merger v0-fullstack-sprint dans main sans décision humaine.
- Conserver la branche V0 et ses commits comme référence/tag de prototype.
- Créer une branche V1 à partir de la référence documentaire main ou mission-01-foundations, selon décision.
- Ne pas réécrire l'historique, ne pas force push.
- Chaque lot V1 est un commit ou une courte série réversible.
- Les artefacts locaux et .env ne sont jamais versionnés.

Décision ouverte : brancher V1 depuis main (corpus seul) ou depuis v0 avec extraction progressive. Recommandation : partir du corpus main, recréer les couches propres, puis réutiliser sélectivement les patterns V0.

## 3. Ce qui est gelé et doit être préservé

| Invariant | Décision |
|---|---|
| scene_id stable | Un Scene.id ne change jamais après création |
| version séparée de l'identité | SceneVersion et ArtifactVersion sont immuables |
| character_id stable | Character.id distinct des bindings provider |
| checksums | Chaque artefact versionné porte un SHA256 |
| approbation exacte | approval liée à artifact_version_id + checksum |
| invalidation | un nouveau master invalide les approbations antérieures |
| transfert | aucun transfert sans approbation valide |
| isolation | filtrage propriétaire sur toutes les lectures/écritures |
| mocks honnêtes | MOCK, REAL, NOT_RUN explicites |
| Postiz | transféré ne signifie pas publié |
| rendu déterministe | le renderer V0 reste un mock de contrat, pas une IA |

## 4. Architecture cible à matérialiser

### Couches

- Domain : modèles purs Context, BriefRevision, Project, Scene, Character, ArtifactVersion, Approval, TransferRecord, invariants et transitions.
- Application : cas d'usage, RBAC, transactions, idempotence, composition, snapshots.
- Infrastructure : Prisma/PostgreSQL, S3, Hatchet, FFmpeg, providers, Postiz, MCP, observabilité.

### Modules V1

identity, contexts, projects, campaigns, workflow, briefs, agents, capabilities, providers, media, scenes, characters, artifacts, approvals, handoff, audit, costs, mcp.

### Ports à définir avant tout provider

| Port | Responsabilité | Adaptateur V0 réutilisable |
|---|---|---|
| IdentityPort | invitations, sessions, RBAC | auth locale à remplacer |
| ContextRepository | contextes et révisions | Prisma existant à extraire |
| BriefRepository | BriefRevision immuable | BriefRevision V0 |
| ProviderRegistry | capacités, modèles, santé, coûts | mock scripté |
| ProviderAdapter | génération normalisée | renderer déterministe |
| OrchestratorPort | JobRun/StepRun, retries, reprise | in-process à remplacer |
| ArtifactStore | binaires, checksums, URLs | local à doubler S3 |
| MediaRenderer | image/vidéo/audio | Sharp/FFmpeg V0 |
| QaPort | contrôles techniques et droits | QA V0 à étendre |
| PostizPort | transfert idempotent | mock V0 |
| AuditCostPort | AuditEvent/CostEvent | absent |
| ClockIdPort | horloge et IDs | implicite |

## 5. Modèle de données minimal à ajouter

- Invitation : token hashé, expiration, statut, rôle, created_by.
- ContextRevision : contexte figé, checksum, provenance.
- CharacterVersion : fiche de référence versionnée.
- JobSpec, JobRun, StepRun : run, étapes, retries, checkpoints, coûts.
- Provider, Model, Capability : registre versionné.
- Campaign, Asset : regroupement et bibliothèque.
- AuditEvent : actor, project, run, scene, provider, trace, timestamp.
- CostEvent : provider, modèle, unités, coût normalisé.
- McpToken/Scope : auth MCP.
- Approval et TransferRecord : conserver les invariants V0.

La migration doit être additive et réversible. Aucun blob lourd en base.

## 6. Contrats API V1

- Erreurs stables : code, message, request_id, status.
- Pagination et filtres sur les listes.
- Idempotency-Key sur les créations coûteuses, corrections, approbations et transferts.
- Snapshot exposé au lancement d'un run.
- Endpoints de comparaison de versions et de previews.
- Aucun secret dans les réponses ; pas de userId/tenant_id superflu.
- Validation Zod partagée entre web et serveur, source unique.

## 7. Sécurité minimale avant V1-01

1. Sessions serveur révocables (table Session ou fournisseur), expiration et révocation.
2. HTTPS et cookie Secure en préproduction/production.
3. CSRF token ou stratégie SameSite + origine vérifiée.
4. Rate limiting login et endpoints coûteux.
5. Rotation de session après login.
6. Invitations à token hashé, expiration, usage unique.
7. RBAC serveur, filtrage propriétaire, tests IDOR systématiques.
8. Validation des URLs (SSRF), uploads, MIME et taille.
9. Secrets via variables serveur/secret store, jamais dans les logs.
10. Journalisation corrélée sans secret.

## 8. Baseline de tests

| Niveau | Contenu | Gate |
|---|---|---|
| Unitaire | Domain invariants, transitions, checksums, approval invalidation | obligatoire par PR |
| Contrat | ProviderAdapter, OrchestratorPort, ArtifactStore, PostizPort, MCP | obligatoire avant provider réel |
| Intégration | PostgreSQL, sessions, migrations, jobs, S3 local | obligatoire |
| Sécurité | IDOR, CSRF, rate limit, session replay, uploads, SSRF | bloquant V1-01 |
| E2E | verticale V0 rejouée via ports, puis verticale V1 | bloquant V1-00 |
| Acceptance | docs/10 exécuté progressivement | gate V1-05 |

- Base de test isolée, pas la base de démonstration.
- CI obligatoire avant merge.
- Aucun test non exécuté marqué PASS.
- Mocks contractuels explicites et versionnés.

## 9. Plan de migration V0 vers V1-00

1. Figer la V0 : tag local, rapport d'audit, preuves, runbook.
2. Décider branche V1 et ADR stack/exception V0.
3. Créer les couches Domain/Application/Infrastructure vides et les ports.
4. Extraire les invariants V0 en modules de domaine testés.
5. Brancher un adaptateur Prisma derrière les repositories.
6. Brancher un adaptateur local derrière ArtifactStore.
7. Brancher le renderer déterministe derrière ProviderAdapter.
8. Brancher Postiz mock derrière PostizPort.
9. Brancher les jobs in-process derrière OrchestratorPort (étape intermédiaire).
10. Rejouer le parcours V0 par les ports, sans régression.
11. Ajouter tests de contrat, CI, base isolée.
12. Décision GO V1-01.

## 10. Dix premiers tickets proposés

| ID | Titre | Sortie |
|---|---|---|
| V1-00-01 | ADR exception V0 et stratégie de branche | décision écrite |
| V1-00-02 | Squelette Domain/Application/Infrastructure | dossiers et types |
| V1-00-03 | Ports et contrats initiaux | interfaces + tests de contrat vides |
| V1-00-04 | Repositories Prisma et migrations additivement sûres | tests intégration |
| V1-00-05 | ArtifactStore local + checksums | tests unitaires |
| V1-00-06 | ProviderAdapter déterministe + contrat | tests contrat |
| V1-00-07 | OrchestratorPort in-process + JobRun/StepRun | tests reprise minimale |
| V1-00-08 | PostizPort mock + idempotence | tests contrat |
| V1-00-09 | Sessions serveur, CSRF, rate limit | tests sécurité |
| V1-00-10 | CI + base de test isolée + rejeu V0 | pipeline vert |

## 11. Definition of Done V1-00

- Les invariants V0 sont présents dans le Domain et testés.
- Le parcours V0 est rejoué via les ports, sans régression fonctionnelle.
- Aucun service applicatif n'importe directement Prisma, FFmpeg ou le mock Postiz.
- Sessions révocables et tests de rejeu.
- CI verte sur typecheck, tests, build, E2E, secrets.
- Aucun secret versionné.
- Documentation et ADR à jour.
- Rollback : retour possible à la V0 taguée sans perte de données.

## 12. Décisions à trancher avant le premier ticket

- Branche V1 depuis main ou v0.
- Session store (PostgreSQL, Redis ou fournisseur).
- Stratégie MCP auth (OAuth 2.1 ou token signé).
- Fournisseur S3 local/preprod.
- Premier provider réel ou mock contractuel.
- API Postiz réelle ou limitation acceptée.
- Politique de rétention et backups.
- Protection de main et PR.

## 13. Rollback et sécurité des données

- La V0 reste sur sa branche et un tag local.
- Aucune migration destructive.
- Aucun fichier local supprimé.
- Aucun push, merge, déploiement ou publication sans autorisation.
- Les données de démonstration restent locales et identifiées.

## 14. Décision finale

- **V0** : référence fonctionnelle conservée.
- **V1** : GO conditionnel pour V1-00 uniquement.
- **Interdit** : empiler des features V1 sur les services V0, merger la V0 dans main, déployer, publier, appeler un provider payant ou Postiz réel sans autorisation explicite.
